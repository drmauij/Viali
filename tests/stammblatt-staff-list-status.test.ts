import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, units, users, userHospitalRoles, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const adminId = `t-st-admin-${randomUUID()}`;
const missingId = `t-st-miss-${randomUUID()}`;
const invitedId = `t-st-inv-${randomUUID()}`;
const submittedId = `t-st-sub-${randomUUID()}`;
const inProgressId = `t-st-inp-${randomUUID()}`;
const hospitalId = `t-st-hosp-${randomUUID()}`;
const unitId = `t-st-unit-${randomUUID()}`;
let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId, name: "T", addonPersonalstammblatt: true,
  } as any);
  await db.insert(units).values({
    id: unitId, hospitalId, name: "U", type: "OR",
  } as any);
  await db.insert(users).values([
    { id: adminId, email: "a@x.com" },
    { id: missingId, email: "m@x.com", firstName: "Miss", lastName: "Ing" },
    { id: invitedId, email: "i@x.com", firstName: "Inv", lastName: "Ited" },
    { id: submittedId, email: "s@x.com", firstName: "Sub", lastName: "Mit" },
    { id: inProgressId, email: "p@x.com", firstName: "Pro", lastName: "Gress" },
  ] as any);
  await db.insert(userHospitalRoles).values([
    { userId: adminId, hospitalId, unitId, role: "admin" },
    { userId: missingId, hospitalId, unitId, role: "surgeon" },
    { userId: invitedId, hospitalId, unitId, role: "surgeon" },
    { userId: submittedId, hospitalId, unitId, role: "surgeon" },
    { userId: inProgressId, hospitalId, unitId, role: "surgeon" },
  ] as any);
  await db.insert(externalWorklogLinks).values([
    {
      id: randomUUID(), userId: invitedId, hospitalId, email: "i@x.com",
      token: randomUUID(), personalDataOnly: true, isActive: true,
      inviteCount: 1, lastInvitedAt: new Date(),
    },
    {
      id: randomUUID(), userId: submittedId, hospitalId, email: "s@x.com",
      token: randomUUID(), personalDataOnly: true, isActive: true,
      inviteCount: 1, submittedAt: new Date(),
    },
    {
      id: randomUUID(), userId: inProgressId, hospitalId, email: "p@x.com",
      token: randomUUID(), personalDataOnly: true, isActive: true,
      inviteCount: 1, lastInvitedAt: new Date(), lastAccessedAt: new Date(),
    },
  ] as any);

  vi.mock("../server/auth/google", async () => {
    const actual: any = await vi.importActual("../server/auth/google");
    return {
      ...actual,
      isAuthenticated: (req: any, _res: any, next: any) => {
        req.user = { id: adminId };
        next();
      },
    };
  });
  const businessRouter = (await import("../server/routes/business")).default;
  app = express();
  app.use(express.json());
  app.use(businessRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hospitalId));
  await db.delete(units).where(eq(units.hospitalId, hospitalId));
  for (const id of [adminId, missingId, invitedId, submittedId, inProgressId]) {
    await db.delete(users).where(eq(users.id, id));
  }
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("GET /api/business/:hospitalId/staff stammblatt status", () => {
  it("returns missing/invited/submitted per user", async () => {
    const res = await request(app).get(`/api/business/${hospitalId}/staff`);
    expect(res.status).toBe(200);
    const byId: Record<string, any> = Object.fromEntries(res.body.map((r: any) => [r.id, r]));
    expect(byId[missingId].stammblatt.status).toBe("missing");
    expect(byId[invitedId].stammblatt.status).toBe("invited");
    expect(byId[invitedId].stammblatt.inviteCount).toBe(1);
    expect(byId[submittedId].stammblatt.status).toBe("submitted");
  });

  it("returns in_progress when lastAccessedAt is set and submittedAt is null", async () => {
    const res = await request(app).get(`/api/business/${hospitalId}/staff`);
    expect(res.status).toBe(200);
    const byId: Record<string, any> = Object.fromEntries(res.body.map((r: any) => [r.id, r]));
    expect(byId[inProgressId].stammblatt.status).toBe("in_progress");
  });
});
