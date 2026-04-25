import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, hospitalGroups, units, users, userHospitalRoles } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import { chainRouter } from "../server/routes/chain";

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { if (userId) req.user = { id: userId }; next(); });
  app.use(chainRouter);
  return app;
}

const uniq = () => randomUUID().slice(0, 8);

let groupId: string, hosp1: string, hosp2: string, unit1: string, unit2: string;
let chainAdminId: string, staffAId: string, staffBId: string;

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({ name: `Test-${uniq()}` } as any).returning();
  groupId = g.id;
  const [h1] = await db.insert(hospitals).values({ name: `H1-${uniq()}`, groupId } as any).returning();
  hosp1 = h1.id;
  const [h2] = await db.insert(hospitals).values({ name: `H2-${uniq()}`, groupId } as any).returning();
  hosp2 = h2.id;
  const [u1] = await db.insert(units).values({ hospitalId: hosp1, name: "Clinic", type: "clinic" } as any).returning();
  unit1 = u1.id;
  const [u2] = await db.insert(units).values({ hospitalId: hosp2, name: "Clinic", type: "clinic" } as any).returning();
  unit2 = u2.id;

  const [ca] = await db.insert(users).values({ email: `ca-${uniq()}@test.test`, firstName: "Chain", lastName: "Admin" } as any).returning();
  chainAdminId = ca.id;
  await db.insert(userHospitalRoles).values({ userId: chainAdminId, hospitalId: hosp1, unitId: unit1, role: "group_admin" } as any);

  const [sa] = await db.insert(users).values({ email: `sa-${uniq()}@test.test`, firstName: "Staff", lastName: "A" } as any).returning();
  staffAId = sa.id;
  await db.insert(userHospitalRoles).values({ userId: staffAId, hospitalId: hosp1, unitId: unit1, role: "admin" } as any);

  const [sb] = await db.insert(users).values({ email: `sb-${uniq()}@test.test`, firstName: "Staff", lastName: "B" } as any).returning();
  staffBId = sb.id;
  await db.insert(userHospitalRoles).values({ userId: staffBId, hospitalId: hosp2, unitId: unit2, role: "doctor" } as any);
});

afterAll(async () => {
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [chainAdminId, staffAId, staffBId]));
  await db.delete(users).where(inArray(users.id, [chainAdminId, staffAId, staffBId]));
  await db.delete(units).where(inArray(units.id, [unit1, unit2]));
  await db.update(hospitals).set({ groupId: null }).where(inArray(hospitals.id, [hosp1, hosp2]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hosp1, hosp2]));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

describe("GET /api/chain/:groupId/team", () => {
  it("returns admins + staff for chain admin", async () => {
    const res = await request(buildApp(chainAdminId)).get(`/api/chain/${groupId}/team`);
    expect(res.status).toBe(200);
    expect(res.body.admins).toBeDefined();
    expect(res.body.staff).toBeDefined();
    expect(Array.isArray(res.body.admins)).toBe(true);
    expect(Array.isArray(res.body.staff)).toBe(true);

    expect(res.body.admins.some((a: any) => a.userId === chainAdminId)).toBe(true);
    expect(res.body.staff.some((s: any) => s.userId === staffAId && s.role === "admin")).toBe(true);
    expect(res.body.staff.some((s: any) => s.userId === staffBId && s.role === "doctor")).toBe(true);

    // Verify shape includes hospital + user details
    const sa = res.body.staff.find((s: any) => s.userId === staffAId);
    expect(sa.hospitalName).toBeTruthy();
    expect(sa.email).toContain("@test.test");
    expect(sa.firstName).toBe("Staff");
  });

  it("rejects non-chain-admin with 403", async () => {
    const res = await request(buildApp(staffAId)).get(`/api/chain/${groupId}/team`);
    expect(res.status).toBe(403);
  });
});
