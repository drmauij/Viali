import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { patients, surgeries, patientQuestionnaireLinks, hospitals } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  getRecentSubmittedQuestionnaireLink,
  createQuestionnaireLink,
} from "../server/storage/questionnaires";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
let OTHER_HOSPITAL_ID = "";

const createdHospitalIds: string[] = [];
const createdPatientIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdLinkIds: string[] = [];

async function ensureOtherHospital() {
  if (OTHER_HOSPITAL_ID) return OTHER_HOSPITAL_ID;
  const [h] = await db
    .insert(hospitals)
    .values({
      name: "Other Test Hospital",
      timezone: "Europe/Zurich",
    })
    .returning();
  OTHER_HOSPITAL_ID = h.id;
  createdHospitalIds.push(h.id);
  return h.id;
}

async function makePatient(hospitalId = TEST_HOSPITAL_ID) {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId,
      patientNumber: `TEST-LR-${nanoid(8)}`,
      surname: "ReuseTest",
      firstName: "Patient",
      birthday: "1990-01-01",
      sex: "F",
    })
    .returning();
  createdPatientIds.push(p.id);
  return p;
}

async function makeSurgery(patientId: string, hospitalId = TEST_HOSPITAL_ID) {
  const [s] = await db
    .insert(surgeries)
    .values({
      hospitalId,
      patientId,
      plannedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      plannedSurgery: "Test Surgery",
    })
    .returning();
  createdSurgeryIds.push(s.id);
  return s;
}

async function makeLink(opts: {
  hospitalId?: string;
  patientId: string;
  surgeryId?: string | null;
  status: "pending" | "started" | "submitted" | "reviewed" | "expired";
  submittedAt?: Date | null;
  expiresAt?: Date;
  createdAt?: Date;
}) {
  const link = await createQuestionnaireLink({
    hospitalId: opts.hospitalId ?? TEST_HOSPITAL_ID,
    patientId: opts.patientId,
    surgeryId: opts.surgeryId ?? null,
    token: nanoid(32),
    status: opts.status,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    submittedAt: opts.submittedAt ?? null,
    language: "de",
  } as any);
  createdLinkIds.push(link.id);
  return link;
}

afterAll(async () => {
  if (createdLinkIds.length) {
    await db
      .delete(patientQuestionnaireLinks)
      .where(inArray(patientQuestionnaireLinks.id, createdLinkIds))
      .catch(() => {});
  }
  if (createdSurgeryIds.length) {
    await db
      .delete(surgeries)
      .where(inArray(surgeries.id, createdSurgeryIds))
      .catch(() => {});
  }
  if (createdPatientIds.length) {
    await db
      .delete(patients)
      .where(inArray(patients.id, createdPatientIds))
      .catch(() => {});
  }
  if (createdHospitalIds.length) {
    await db
      .delete(hospitals)
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
  }
  await pool.end();
});

describe("getRecentSubmittedQuestionnaireLink", () => {
  it("returns undefined when patient has zero links", async () => {
    const p = await makePatient();
    const got = await getRecentSubmittedQuestionnaireLink(TEST_HOSPITAL_ID, p.id, 90);
    expect(got).toBeUndefined();
  });

  it("ignores pending and expired links", async () => {
    const p = await makePatient();
    await makeLink({ patientId: p.id, status: "pending" });
    await makeLink({ patientId: p.id, status: "expired" });
    const got = await getRecentSubmittedQuestionnaireLink(TEST_HOSPITAL_ID, p.id, 90);
    expect(got).toBeUndefined();
  });

  it("returns a submitted link from 26 days ago", async () => {
    const p = await makePatient();
    const submittedAt = new Date(Date.now() - 26 * 24 * 60 * 60 * 1000);
    const link = await makeLink({ patientId: p.id, status: "submitted", submittedAt });
    const got = await getRecentSubmittedQuestionnaireLink(TEST_HOSPITAL_ID, p.id, 90);
    expect(got?.id).toBe(link.id);
  });

  it("returns the most recent of multiple submitted links", async () => {
    const p = await makePatient();
    await makeLink({
      patientId: p.id,
      status: "submitted",
      submittedAt: new Date(Date.now() - 26 * 24 * 60 * 60 * 1000),
    });
    const newer = await makeLink({
      patientId: p.id,
      status: "submitted",
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
    const got = await getRecentSubmittedQuestionnaireLink(TEST_HOSPITAL_ID, p.id, 90);
    expect(got?.id).toBe(newer.id);
  });

  it("returns undefined when the only submitted link is older than the validity window", async () => {
    const p = await makePatient();
    await makeLink({
      patientId: p.id,
      status: "submitted",
      submittedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
    });
    const got = await getRecentSubmittedQuestionnaireLink(TEST_HOSPITAL_ID, p.id, 90);
    expect(got).toBeUndefined();
  });

  it("treats reviewed links the same as submitted", async () => {
    const p = await makePatient();
    const link = await makeLink({
      patientId: p.id,
      status: "reviewed",
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    const got = await getRecentSubmittedQuestionnaireLink(TEST_HOSPITAL_ID, p.id, 90);
    expect(got?.id).toBe(link.id);
  });

  it("does not match a link from a different hospital", async () => {
    const p = await makePatient();
    const otherHospId = await ensureOtherHospital();
    await makeLink({
      hospitalId: otherHospId,
      patientId: p.id,
      status: "submitted",
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    const got = await getRecentSubmittedQuestionnaireLink(TEST_HOSPITAL_ID, p.id, 90);
    expect(got).toBeUndefined();
  });
});
