import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import {
  hospitals,
  patients,
  patientHospitals,
  referralEvents,
  leads,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";
import { listReferralEvents } from "../server/lib/referralAnalytics";

/**
 * Direct unit tests for listReferralEvents covering the new filter params
 * (from/to/campaign) and richer return shape ({ rows, total, campaigns }).
 *
 * Route-level scope behavior stays in referral-stats-scope.test.ts.
 */

const uniq = () => randomUUID().slice(0, 8);

let hospId: string;
let patientWithEmail: string;
let patientNoEmail: string;
let leadWithEmail: string;
let leadNoEmail: string;

const createdReferralIds: string[] = [];
const createdPatientIds: string[] = [];
const createdLeadIds: string[] = [];
const createdHospitalIds: string[] = [];

async function mkRef(
  hospitalId: string,
  patientId: string,
  opts: {
    createdAt?: Date;
    campaignName?: string | null;
    utmCampaign?: string | null;
    leadId?: string | null;
  } = {},
) {
  const [r] = await db
    .insert(referralEvents)
    .values({
      hospitalId,
      patientId,
      source: "social",
      captureMethod: "manual",
      campaignName: opts.campaignName ?? null,
      utmCampaign: opts.utmCampaign ?? null,
      leadId: opts.leadId ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    } as any)
    .returning();
  createdReferralIds.push(r.id);
  return r.id;
}

beforeAll(async () => {
  const [h] = await db
    .insert(hospitals)
    .values({ name: `REF_FILT_${uniq()}` } as any)
    .returning();
  hospId = h.id;
  createdHospitalIds.push(hospId);

  const [p1] = await db
    .insert(patients)
    .values({
      hospitalId: hospId,
      patientNumber: `RF-${uniq()}`,
      surname: "Smith",
      firstName: "Anna",
      birthday: "1990-01-01",
      sex: "F",
      email: "anna.smith@example.test",
      isArchived: false,
    } as any)
    .returning();
  patientWithEmail = p1.id;
  createdPatientIds.push(patientWithEmail);
  await ensurePatientHospitalLink(patientWithEmail, hospId, null);

  const [p2] = await db
    .insert(patients)
    .values({
      hospitalId: hospId,
      patientNumber: `RF-${uniq()}`,
      surname: "Jones",
      firstName: "Bob",
      birthday: "1985-05-05",
      sex: "M",
      email: null,
      isArchived: false,
    } as any)
    .returning();
  patientNoEmail = p2.id;
  createdPatientIds.push(patientNoEmail);
  await ensurePatientHospitalLink(patientNoEmail, hospId, null);

  const [l1] = await db
    .insert(leads)
    .values({
      hospitalId: hospId,
      firstName: "Bob",
      lastName: "Jones",
      email: "bob.fromlead@example.test",
      source: "website",
      status: "new",
    } as any)
    .returning();
  leadWithEmail = l1.id;
  createdLeadIds.push(leadWithEmail);

  const [l2] = await db
    .insert(leads)
    .values({
      hospitalId: hospId,
      firstName: "Bob",
      lastName: "Jones",
      email: null,
      source: "website",
      status: "new",
    } as any)
    .returning();
  leadNoEmail = l2.id;
  createdLeadIds.push(leadNoEmail);
});

afterAll(async () => {
  if (createdReferralIds.length) {
    await db.delete(referralEvents).where(inArray(referralEvents.id, createdReferralIds)).catch(() => {});
  }
  if (createdLeadIds.length) {
    await db.delete(leads).where(inArray(leads.id, createdLeadIds)).catch(() => {});
  }
  if (createdPatientIds.length) {
    await db.delete(patientHospitals).where(inArray(patientHospitals.patientId, createdPatientIds)).catch(() => {});
    await db.delete(patients).where(inArray(patients.id, createdPatientIds)).catch(() => {});
  }
  if (createdHospitalIds.length) {
    await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds)).catch(() => {});
  }
  await pool.end();
});

describe("listReferralEvents — email coalesce", () => {
  it("returns patients.email when present", async () => {
    const refId = await mkRef(hospId, patientWithEmail);
    const { rows } = await listReferralEvents([hospId], { limit: 200 });
    const row = rows.find((r: any) => r.id === refId);
    expect(row?.email).toBe("anna.smith@example.test");
  });

  it("falls back to leads.email when patient email is null but lead is set", async () => {
    const refId = await mkRef(hospId, patientNoEmail, { leadId: leadWithEmail });
    const { rows } = await listReferralEvents([hospId], { limit: 200 });
    const row = rows.find((r: any) => r.id === refId);
    expect(row?.email).toBe("bob.fromlead@example.test");
  });

  it("returns null when neither patient nor lead has an email", async () => {
    const refId = await mkRef(hospId, patientNoEmail, { leadId: leadNoEmail });
    const { rows } = await listReferralEvents([hospId], { limit: 200 });
    const row = rows.find((r: any) => r.id === refId);
    expect(row?.email).toBeNull();
  });

  it("returns null when patient email is null and no lead is attached", async () => {
    const refId = await mkRef(hospId, patientNoEmail);
    const { rows } = await listReferralEvents([hospId], { limit: 200 });
    const row = rows.find((r: any) => r.id === refId);
    expect(row?.email).toBeNull();
  });
});

describe("listReferralEvents — from/to date filters", () => {
  it("from is inclusive on created_at", async () => {
    const oldRef = await mkRef(hospId, patientWithEmail, {
      createdAt: new Date("2024-01-01T12:00:00Z"),
    });
    const newRef = await mkRef(hospId, patientWithEmail, {
      createdAt: new Date("2025-06-15T12:00:00Z"),
    });
    const { rows } = await listReferralEvents([hospId], {
      limit: 200,
      from: "2025-01-01",
    });
    const ids = rows.map((r: any) => r.id);
    expect(ids).toContain(newRef);
    expect(ids).not.toContain(oldRef);
  });

  it("to is inclusive on created_at (UTC-midnight semantics, matches getReferralStats)", async () => {
    const beforeRef = await mkRef(hospId, patientWithEmail, {
      createdAt: new Date("2024-06-01T12:00:00Z"),
    });
    const afterRef = await mkRef(hospId, patientWithEmail, {
      createdAt: new Date("2024-12-31T23:00:00Z"),
    });
    const { rows } = await listReferralEvents([hospId], {
      limit: 200,
      to: "2024-12-31",
    });
    const ids = rows.map((r: any) => r.id);
    expect(ids).toContain(beforeRef);
    expect(ids).not.toContain(afterRef);
  });
});

describe("listReferralEvents — campaign filter", () => {
  it("matches campaign_name exactly", async () => {
    const matchId = await mkRef(hospId, patientWithEmail, { campaignName: "Spring Promo" });
    const otherId = await mkRef(hospId, patientWithEmail, { campaignName: "Winter Promo" });
    const { rows } = await listReferralEvents([hospId], {
      limit: 200,
      campaign: "Spring Promo",
    });
    const ids = rows.map((r: any) => r.id);
    expect(ids).toContain(matchId);
    expect(ids).not.toContain(otherId);
  });

  it("falls through to utm_campaign when campaign_name is null", async () => {
    const matchId = await mkRef(hospId, patientWithEmail, { utmCampaign: "Summer UTM" });
    const { rows } = await listReferralEvents([hospId], {
      limit: 200,
      campaign: "Summer UTM",
    });
    expect(rows.map((r: any) => r.id)).toContain(matchId);
  });

  it("__none__ matches rows with both campaign_name and utm_campaign null/empty", async () => {
    const nullId = await mkRef(hospId, patientWithEmail);
    const emptyId = await mkRef(hospId, patientWithEmail, { campaignName: "", utmCampaign: "" });
    const labeledId = await mkRef(hospId, patientWithEmail, { campaignName: "Has Label" });
    const { rows } = await listReferralEvents([hospId], {
      limit: 200,
      campaign: "__none__",
    });
    const ids = rows.map((r: any) => r.id);
    expect(ids).toContain(nullId);
    expect(ids).toContain(emptyId);
    expect(ids).not.toContain(labeledId);
  });
});

describe("listReferralEvents — total and campaigns", () => {
  it("total reflects filtered universe, not page size", async () => {
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      created.push(await mkRef(hospId, patientWithEmail, { campaignName: "TotalCheck" }));
    }
    const { rows, total } = await listReferralEvents([hospId], {
      limit: 2,
      campaign: "TotalCheck",
    });
    expect(rows.length).toBe(2);
    expect(total).toBe(5);
  });

  it("campaigns list includes distinct campaign values in scope/date range", async () => {
    await mkRef(hospId, patientWithEmail, { campaignName: "DistinctA" });
    await mkRef(hospId, patientWithEmail, { campaignName: "DistinctA" });
    await mkRef(hospId, patientWithEmail, { campaignName: "DistinctB" });
    const { campaigns } = await listReferralEvents([hospId], { limit: 200 });
    expect(campaigns).toEqual(expect.arrayContaining(["DistinctA", "DistinctB"]));
    const a = campaigns.filter((c: string) => c === "DistinctA").length;
    expect(a).toBe(1);
  });

  it("campaigns list surfaces __none__ when at least one row has no campaign", async () => {
    await mkRef(hospId, patientWithEmail);
    const { campaigns } = await listReferralEvents([hospId], { limit: 200 });
    expect(campaigns).toContain("__none__");
  });

  it("campaigns list is not narrowed by the active campaign filter", async () => {
    await mkRef(hospId, patientWithEmail, { campaignName: "Keep1" });
    await mkRef(hospId, patientWithEmail, { campaignName: "Keep2" });
    const { campaigns } = await listReferralEvents([hospId], {
      limit: 200,
      campaign: "Keep1",
    });
    expect(campaigns).toEqual(expect.arrayContaining(["Keep1", "Keep2"]));
  });
});
