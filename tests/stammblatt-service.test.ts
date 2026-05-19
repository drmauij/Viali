import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, units, users, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  ensureStammblattLink,
  rotateStammblattToken,
  markSubmittedIfComplete,
  checkStammblattCompleteness,
  isValidStaffEmail,
} from "../server/services/stammblatt";

const hospitalId = `test-hosp-${randomUUID()}`;
const userId = `test-user-${randomUUID()}`;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId,
    name: "Test Hospital",
    addonPersonalstammblatt: true,
  } as any);
  await db.insert(users).values({
    id: userId,
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Doe",
  } as any);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("isValidStaffEmail", () => {
  it("rejects empty, null, and @staff.local placeholders", () => {
    expect(isValidStaffEmail(null)).toBe(false);
    expect(isValidStaffEmail("")).toBe(false);
    expect(isValidStaffEmail("foo.bar.abc123@staff.local")).toBe(false);
    expect(isValidStaffEmail("not-an-email")).toBe(false);
  });
  it("accepts well-formed emails", () => {
    expect(isValidStaffEmail("alice@example.com")).toBe(true);
  });
});

describe("ensureStammblattLink", () => {
  it("creates a personal_data_only link with a 30-day expiry", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    expect(link.userId).toBe(userId);
    expect(link.hospitalId).toBe(hospitalId);
    expect(link.personalDataOnly).toBe(true);
    expect(link.unitId).toBeNull();
    expect(link.token).toBeTruthy();
    const days = (link.tokenExpiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("returns the same link on subsequent calls (idempotent)", async () => {
    const first = await ensureStammblattLink(userId, hospitalId);
    const second = await ensureStammblattLink(userId, hospitalId);
    expect(second.id).toBe(first.id);
  });
});

describe("rotateStammblattToken", () => {
  it("issues a new token and refreshes the expiry", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    const oldToken = link.token;
    const rotated = await rotateStammblattToken(link.id);
    expect(rotated.token).not.toBe(oldToken);
    expect(rotated.tokenExpiresAt!.getTime()).toBeGreaterThan(link.tokenExpiresAt!.getTime() - 1000);
  });
});

/** Full set of fields required when hasChildBenefits=false and hasResidencePermit=false */
const ALL_REQUIRED_BASE = {
  firstName: "Alice",
  lastName: "Doe",
  profession: "Anesthesia Nurse",
  address: "Main 1",
  city: "Zurich",
  zip: "8001",
  dateOfBirth: "1990-01-01",
  maritalStatus: "single",
  nationality: "CH",
  religion: "none",
  mobile: "+41 79 000 00 00",
  ahvNumber: "756.1234.5678.90",
  bankName: "UBS AG",
  bankAddress: "Bahnhofstr 1, Zurich",
  bankAccount: "CH00 1234",
  hasChildBenefits: false,
  hasResidencePermit: false,
  hasOwnVehicle: false,
};

describe("checkStammblattCompleteness (pure logic)", () => {
  it("reports complete when all base fields filled and booleans false", () => {
    const result = checkStammblattCompleteness(ALL_REQUIRED_BASE as any);
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("reports missing fields for empty data", () => {
    const result = checkStammblattCompleteness({});
    expect(result.complete).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.missing).toContain("firstName");
    expect(result.missing).toContain("hasChildBenefits");
  });

  it("treats boolean null as missing", () => {
    const data = { ...ALL_REQUIRED_BASE, hasOwnVehicle: null };
    const result = checkStammblattCompleteness(data as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("hasOwnVehicle");
  });

  it("requires child sub-fields when hasChildBenefits=true", () => {
    const data = { ...ALL_REQUIRED_BASE, hasChildBenefits: true };
    const result = checkStammblattCompleteness(data as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("numberOfChildren");
    expect(result.missing).toContain("childBenefitsRecipient");
    expect(result.missing).toContain("childBenefitsRegistration");
  });

  it("is complete when hasChildBenefits=true and all sub-fields filled", () => {
    const data = {
      ...ALL_REQUIRED_BASE,
      hasChildBenefits: true,
      numberOfChildren: 2,
      childBenefitsRecipient: "Alice",
      childBenefitsRegistration: "Ausgleichskasse ZH",
    };
    const result = checkStammblattCompleteness(data as any);
    expect(result.complete).toBe(true);
  });

  it("requires permit sub-fields when hasResidencePermit=true", () => {
    const data = { ...ALL_REQUIRED_BASE, hasResidencePermit: true };
    const result = checkStammblattCompleteness(data as any);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("residencePermitType");
    expect(result.missing).toContain("residencePermitValidUntil");
    expect(result.missing).toContain("residencePermitFrontImage");
    expect(result.missing).toContain("residencePermitBackImage");
  });
});

describe("markSubmittedIfComplete", () => {
  it("does not set submitted_at when required minimums are missing", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({ firstName: "Alice", lastName: "Doe", submittedAt: null })
      .where(eq(externalWorklogLinks.id, link.id));
    const after = await markSubmittedIfComplete(link.id);
    expect(after.submittedAt).toBeNull();
  });

  it("sets submitted_at exactly once when all required fields are present", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({
        ...ALL_REQUIRED_BASE,
        submittedAt: null,
      } as any)
      .where(eq(externalWorklogLinks.id, link.id));
    const first = await markSubmittedIfComplete(link.id);
    expect(first.submittedAt).toBeInstanceOf(Date);
    const firstStamp = first.submittedAt;

    const second = await markSubmittedIfComplete(link.id);
    expect(second.submittedAt).toEqual(firstStamp); // does not reset
  });

  it("does not set submitted_at when hasChildBenefits=true but child sub-fields missing", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({
        ...ALL_REQUIRED_BASE,
        hasChildBenefits: true,
        numberOfChildren: null,
        childBenefitsRecipient: null,
        childBenefitsRegistration: null,
        submittedAt: null,
      } as any)
      .where(eq(externalWorklogLinks.id, link.id));
    const after = await markSubmittedIfComplete(link.id);
    expect(after.submittedAt).toBeNull();
  });

  it("sets submitted_at when hasChildBenefits=false (no sub-fields required)", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({
        ...ALL_REQUIRED_BASE,
        hasChildBenefits: false,
        submittedAt: null,
      } as any)
      .where(eq(externalWorklogLinks.id, link.id));
    const after = await markSubmittedIfComplete(link.id);
    expect(after.submittedAt).toBeInstanceOf(Date);
  });

  it("does not set submitted_at when hasResidencePermit=true but permit sub-fields missing", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({
        ...ALL_REQUIRED_BASE,
        hasResidencePermit: true,
        residencePermitType: null,
        residencePermitValidUntil: null,
        residencePermitFrontImage: null,
        residencePermitBackImage: null,
        submittedAt: null,
      } as any)
      .where(eq(externalWorklogLinks.id, link.id));
    const after = await markSubmittedIfComplete(link.id);
    expect(after.submittedAt).toBeNull();
  });

  it("does not set submitted_at when boolean flags are null", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({
        ...ALL_REQUIRED_BASE,
        hasChildBenefits: null,
        hasResidencePermit: null,
        hasOwnVehicle: null,
        submittedAt: null,
      } as any)
      .where(eq(externalWorklogLinks.id, link.id));
    const after = await markSubmittedIfComplete(link.id);
    expect(after.submittedAt).toBeNull();
  });
});
