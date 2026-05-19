import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, units, users, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Mock portal verification so the public /api/worklog/:token routes pass through
// without needing a real OTP session cookie.
vi.mock("../server/auth/portalAuth", () => ({
  requirePortalVerification: () => (_req: any, _res: any, next: any) => next(),
  maskEmail: (email: string) => email,
  maskPhone: (phone: string) => phone,
}));

const hospitalId = `test-hosp-exp-${randomUUID()}`;
const unitId = `test-unit-exp-${randomUUID()}`;
const userId = `test-u-exp-${randomUUID()}`;
let expiredToken = randomUUID();
let validToken = randomUUID();
let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({ id: hospitalId, name: "Exp" } as any);
  await db.insert(units).values({ id: unitId, hospitalId, name: "Unit", type: "OR" } as any);
  await db.insert(users).values({ id: userId, email: "exp@example.com" } as any);
  await db.insert(externalWorklogLinks).values([
    {
      id: randomUUID(), userId, hospitalId, unitId, email: "exp@example.com",
      token: expiredToken, isActive: true, personalDataOnly: true,
      tokenExpiresAt: new Date(Date.now() - 1000),
    },
    {
      id: randomUUID(), userId, hospitalId, unitId, email: "exp2@example.com",
      token: validToken, isActive: true, personalDataOnly: true,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60),
    },
  ] as any);

  const worklogRouter = (await import("../server/routes/worklog")).default;
  app = express();
  app.use(express.json());
  app.use(worklogRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(units).where(eq(units.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("token expiry", () => {
  it("GET /api/worklog/:token returns 410 for expired tokens", async () => {
    const res = await request(app).get(`/api/worklog/${expiredToken}`);
    expect(res.status).toBe(410);
  });
  it("GET /api/worklog/:token still works for unexpired tokens", async () => {
    const res = await request(app).get(`/api/worklog/${validToken}`);
    expect(res.status).toBe(200);
  });
});
