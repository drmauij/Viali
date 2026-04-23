import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import {
  hospitals,
  patients,
  units,
  patientDocuments,
  patientHospitals,
  clinicAppointments,
  users,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";
import {
  createPatient,
  updatePatient,
} from "../server/storage/anesthesia";
import { createClinicAppointment } from "../server/storage/clinic";
import { createPatientDocument } from "../server/storage/questionnaires";

/**
 * Task 4: patient_hospitals auto-populate helper.
 *
 * Unit tests exercise the helper directly; the integration tests drive the
 * real storage functions to prove the wiring stays attached end-to-end.
 */

const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdUserIds: string[] = [];
const createdPatientIds: string[] = [];
const createdAppointmentIds: string[] = [];
const createdDocumentIds: string[] = [];

afterAll(async () => {
  if (createdDocumentIds.length) {
    await db
      .delete(patientDocuments)
      .where(inArray(patientDocuments.id, createdDocumentIds))
      .catch(() => {});
  }
  if (createdAppointmentIds.length) {
    await db
      .delete(clinicAppointments)
      .where(inArray(clinicAppointments.id, createdAppointmentIds))
      .catch(() => {});
  }
  if (createdPatientIds.length) {
    // patient_hospitals cascades on patient delete.
    await db
      .delete(patients)
      .where(inArray(patients.id, createdPatientIds))
      .catch(() => {});
  }
  if (createdUnitIds.length) {
    await db
      .delete(units)
      .where(inArray(units.id, createdUnitIds))
      .catch(() => {});
  }
  if (createdUserIds.length) {
    await db
      .delete(users)
      .where(inArray(users.id, createdUserIds))
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

async function mkHospital() {
  const [h] = await db
    .insert(hospitals)
    .values({ name: "phl-" + randomUUID().slice(0, 6) } as any)
    .returning();
  createdHospitalIds.push(h.id);
  return h;
}

async function mkUnit(hospitalId: string) {
  const [u] = await db
    .insert(units)
    .values({ hospitalId, name: "u-" + randomUUID().slice(0, 6), type: "clinic" } as any)
    .returning();
  createdUnitIds.push(u.id);
  return u;
}

async function mkUser() {
  const [u] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      email: "phl-" + randomUUID().slice(0, 6) + "@test.local",
      firstName: "Test",
      lastName: "User",
    } as any)
    .returning();
  createdUserIds.push(u.id);
  return u;
}

async function mkPatient(hospitalId: string, createdBy?: string | null) {
  // We create patients archived so they don't pollute the
  // "every non-archived patient has a patient_hospitals row" backfill
  // invariant asserted by tests/groups-schema.test.ts while running in
  // parallel. The storage functions under test don't read the archived flag,
  // so this is invisible to the wiring assertions below.
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId,
      patientNumber: "PHL-" + randomUUID().slice(0, 6),
      surname: "Doe",
      firstName: "Jane",
      birthday: "1990-01-01",
      sex: "F",
      createdBy: createdBy ?? null,
      isArchived: true,
    } as any)
    .returning();
  createdPatientIds.push(p.id);
  return p;
}

async function rosterRows(patientId: string, hospitalId?: string) {
  const conds = hospitalId
    ? and(
        eq(patientHospitals.patientId, patientId),
        eq(patientHospitals.hospitalId, hospitalId),
      )
    : eq(patientHospitals.patientId, patientId);
  return await db.select().from(patientHospitals).where(conds);
}

describe("ensurePatientHospitalLink (helper)", () => {
  it("creates a row on first call", async () => {
    const h = await mkHospital();
    const p = await mkPatient(h.id);
    // mkPatient bypasses storage.createPatient so nothing enrolled yet.
    const before = await rosterRows(p.id, h.id);
    expect(before).toHaveLength(0);

    await ensurePatientHospitalLink(p.id, h.id);
    const after = await rosterRows(p.id, h.id);
    expect(after).toHaveLength(1);
    expect(after[0].addedBy).toBeNull();
  });

  it("is idempotent on a second call", async () => {
    const h = await mkHospital();
    const p = await mkPatient(h.id);
    await ensurePatientHospitalLink(p.id, h.id);
    await ensurePatientHospitalLink(p.id, h.id);
    await ensurePatientHospitalLink(p.id, h.id);
    const rows = await rosterRows(p.id);
    expect(rows).toHaveLength(1);
  });

  it("records addedBy when provided", async () => {
    const h = await mkHospital();
    const p = await mkPatient(h.id);
    const user = await mkUser();
    await ensurePatientHospitalLink(p.id, h.id, user.id);
    const [row] = await rosterRows(p.id, h.id);
    expect(row.addedBy).toBe(user.id);
  });

  it("short-circuits on missing ids without throwing", async () => {
    await expect(
      ensurePatientHospitalLink("" as any, "" as any),
    ).resolves.toBeUndefined();
  });
});

describe("storage wiring", () => {
  it("createPatient enrols at the home hospital", async () => {
    const h = await mkHospital();
    const user = await mkUser();
    const created = await createPatient({
      hospitalId: h.id,
      patientNumber: "PHL-" + randomUUID().slice(0, 6),
      surname: "Wired",
      firstName: "CreatePatient",
      birthday: "1990-01-01",
      sex: "F",
      createdBy: user.id,
    } as any);
    createdPatientIds.push(created.id);

    const rows = await rosterRows(created.id, h.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].addedBy).toBe(user.id);

    // Storage created the patient un-archived — which is the real
    // production path. The enrolment matches the backfill invariant
    // (every non-archived patient has a roster row at their home hospital),
    // so nothing to fix.
  });

  it("createClinicAppointment enrols the patient at the appointment hospital", async () => {
    const home = await mkHospital();
    const other = await mkHospital();
    const otherUnit = await mkUnit(other.id);
    const provider = await mkUser();
    const creator = await mkUser();
    // Seed patient directly (not via createPatient) so only the appointment
    // path can enrol them at `other`.
    const p = await mkPatient(home.id);

    const appt = await createClinicAppointment({
      hospitalId: other.id,
      unitId: otherUnit.id,
      patientId: p.id,
      providerId: provider.id,
      appointmentDate: "2026-05-01",
      startTime: "09:00",
      endTime: "09:30",
      durationMinutes: 30,
      status: "confirmed",
      appointmentType: "external",
      createdBy: creator.id,
    } as any);
    createdAppointmentIds.push(appt.id);

    const rows = await rosterRows(p.id, other.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].addedBy).toBe(creator.id);
  });

  it("createClinicAppointment skips enrol when patientId is null (internal appt)", async () => {
    const h = await mkHospital();
    const u = await mkUnit(h.id);
    const provider = await mkUser();
    const colleague = await mkUser();
    const appt = await createClinicAppointment({
      hospitalId: h.id,
      unitId: u.id,
      patientId: null,
      providerId: provider.id,
      internalColleagueId: colleague.id,
      internalSubject: "sync",
      appointmentType: "internal",
      appointmentDate: "2026-05-02",
      startTime: "10:00",
      endTime: "10:30",
      durationMinutes: 30,
      status: "confirmed",
    } as any);
    createdAppointmentIds.push(appt.id);
    // Just asserting it didn't throw — no patient to assert a roster row for.
    expect(appt.id).toBeDefined();
  });

  it("createPatientDocument enrols the patient at the upload hospital", async () => {
    const home = await mkHospital();
    const other = await mkHospital();
    const uploader = await mkUser();
    const p = await mkPatient(home.id);

    const doc = await createPatientDocument({
      hospitalId: other.id,
      patientId: p.id,
      category: "other",
      fileName: "chart.pdf",
      fileUrl: "https://example.com/chart.pdf",
      uploadedBy: uploader.id,
    } as any);
    createdDocumentIds.push(doc.id);

    const rows = await rosterRows(p.id, other.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].addedBy).toBe(uploader.id);
  });

  it("updatePatient enrols when clinical fields change", async () => {
    const h = await mkHospital();
    const p = await mkPatient(h.id);
    // Clean slate — ensure no roster row exists yet.
    await db
      .delete(patientHospitals)
      .where(eq(patientHospitals.patientId, p.id));

    await updatePatient(p.id, { allergies: ["latex"] });
    const rows = await rosterRows(p.id, h.id);
    expect(rows).toHaveLength(1);
  });

  it("updatePatient does NOT enrol for non-clinical (contact) edits", async () => {
    const h = await mkHospital();
    const p = await mkPatient(h.id);
    await db
      .delete(patientHospitals)
      .where(eq(patientHospitals.patientId, p.id));

    await updatePatient(p.id, { phone: "+41 79 000 00 00" });
    const rows = await rosterRows(p.id, h.id);
    expect(rows).toHaveLength(0);
  });
});
