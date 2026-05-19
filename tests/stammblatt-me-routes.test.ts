import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals, units, users, userHospitalRoles, externalWorklogLinks,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Hoist mocks — vi.mock is hoisted by Vitest so it runs before module resolution.
vi.mock("../server/auth/google", () => ({
  // isAuthenticated just calls next(); req.user is injected by the test app middleware.
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

const userId = `test-me-${randomUUID()}`;
const hospitalId = `test-hosp-me-${randomUUID()}`;
const unitId = `test-unit-me-${randomUUID()}`;

let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId, name: "MeHosp", addonPersonalstammblatt: true,
  } as any);
  await db.insert(units).values({
    id: unitId, hospitalId, name: "U", type: "OR",
  } as any);
  await db.insert(users).values({
    id: userId, email: "me@example.com", firstName: "Me", lastName: "Self",
  } as any);
  await db.insert(userHospitalRoles).values({
    userId, hospitalId, unitId, role: "surgeon",
  } as any);

  const meRouter = (await import("../server/routes/me-stammblatt")).default;
  app = express();
  app.use(express.json());
  // Inject authenticated user via middleware (isAuthenticated is mocked to just call next())
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: userId };
    next();
  });
  app.use(meRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(units).where(eq(units.id, unitId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("GET /api/me/stammblatt", () => {
  it("returns 403 when addon is off", async () => {
    await db.update(hospitals).set({ addonPersonalstammblatt: false }).where(eq(hospitals.id, hospitalId));
    const res = await request(app)
      .get("/api/me/stammblatt")
      .set("x-active-hospital-id", hospitalId);
    expect(res.status).toBe(403);
    await db.update(hospitals).set({ addonPersonalstammblatt: true }).where(eq(hospitals.id, hospitalId));
  });

  it("creates a link on first call and returns it", async () => {
    const res = await request(app)
      .get("/api/me/stammblatt")
      .set("x-active-hospital-id", hospitalId);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body.personalDataOnly).toBe(true);
    expect(res.body.submittedAt).toBeNull();
  });
});

describe("PATCH /api/me/stammblatt", () => {
  it("saves fields and sets submittedAt when all required fields are present", async () => {
    const res = await request(app)
      .patch("/api/me/stammblatt")
      .set("x-active-hospital-id", hospitalId)
      .send({
        firstName: "Me",
        lastName: "Self",
        profession: "Anesthesia Nurse",
        dateOfBirth: "1980-01-01",
        address: "Bahnhofstr 1",
        city: "Zurich",
        zip: "8001",
        maritalStatus: "single",
        nationality: "CH",
        religion: "none",
        mobile: "+41 79 000 00 00",
        ahvNumber: "756.1111.1111.11",
        bankName: "UBS AG",
        bankAddress: "Bahnhofstrasse 1, Zurich",
        bankAccount: "CH00 9999",
        hasChildBenefits: false,
        hasResidencePermit: false,
        hasOwnVehicle: false,
      });
    expect(res.status).toBe(200);
    expect(res.body.submittedAt).toBeTruthy();
    expect(res.body.completeness).toBeDefined();
    expect(res.body.completeness.complete).toBe(true);
    expect(res.body.completeness.missing).toHaveLength(0);
  });

  it("does not set submittedAt when fields are partial, and completeness reports missing", async () => {
    // Reset the link to a clean partial state
    const getLinkRes = await request(app)
      .get("/api/me/stammblatt")
      .set("x-active-hospital-id", hospitalId);
    const linkId = getLinkRes.body.id;
    const { db: testDb } = await import("../server/db");
    const { externalWorklogLinks: ewl } = await import("@shared/schema");
    const { eq: eqFn } = await import("drizzle-orm");
    // Clear all personal fields and submittedAt so the PATCH starts from scratch
    await testDb.update(ewl).set({
      firstName: null, lastName: null, profession: null,
      address: null, city: null, zip: null, dateOfBirth: null,
      maritalStatus: null, nationality: null, religion: null,
      mobile: null, ahvNumber: null,
      bankName: null, bankAddress: null, bankAccount: null,
      hasChildBenefits: null, hasResidencePermit: null, hasOwnVehicle: null,
      submittedAt: null,
    } as any).where(eqFn(ewl.id, linkId));

    const res = await request(app)
      .patch("/api/me/stammblatt")
      .set("x-active-hospital-id", hospitalId)
      .send({
        firstName: "Me",
        lastName: "Self",
        // Missing profession, maritalStatus, nationality, religion, mobile, bankName, bankAddress, booleans...
      });
    expect(res.status).toBe(200);
    expect(res.body.submittedAt).toBeFalsy();
    expect(res.body.completeness.complete).toBe(false);
    expect(res.body.completeness.missing.length).toBeGreaterThan(0);
  });
});
