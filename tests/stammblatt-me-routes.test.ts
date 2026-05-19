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
  it("saves fields and sets submittedAt when required minimums met", async () => {
    const res = await request(app)
      .patch("/api/me/stammblatt")
      .set("x-active-hospital-id", hospitalId)
      .send({
        firstName: "Me",
        lastName: "Self",
        dateOfBirth: "1980-01-01",
        address: "Bahnhofstr 1",
        city: "Zurich",
        zip: "8001",
        ahvNumber: "756.1111.1111.11",
        bankAccount: "CH00 9999",
      });
    expect(res.status).toBe(200);
    expect(res.body.submittedAt).toBeTruthy();
  });
});
