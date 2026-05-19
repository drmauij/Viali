import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals, users, userHospitalRoles, externalWorklogLinks, units,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Hoist mocks — vi.mock is hoisted by Vitest so it runs before module resolution.
const mockSendStammblattInviteEmail = vi.fn().mockResolvedValue(true);
vi.mock("../server/email", async () => {
  const actual: any = await vi.importActual("../server/email");
  return { ...actual, sendStammblattInviteEmail: mockSendStammblattInviteEmail };
});

vi.mock("../server/auth/google", () => ({
  // isAuthenticated just calls next(); req.user is injected by the test app middleware.
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

const adminId = `test-admin-${randomUUID()}`;
const staffId = `test-staff-${randomUUID()}`;
const hospitalId = `test-hosp-${randomUUID()}`;
const unitId = `test-unit-${randomUUID()}`;

let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId, name: "Test", addonPersonalstammblatt: true,
  } as any);
  await db.insert(units).values({
    id: unitId, hospitalId, name: "Test Unit",
  } as any);
  await db.insert(users).values([
    { id: adminId, email: "admin@example.com", firstName: "A", lastName: "Admin" },
    { id: staffId, email: "staff@example.com", firstName: "S", lastName: "Staff" },
  ] as any);
  await db.insert(userHospitalRoles).values([
    { userId: adminId, hospitalId, unitId, role: "admin" },
    { userId: staffId, hospitalId, unitId, role: "surgeon" },
  ] as any);

  const businessRouter = (await import("../server/routes/business")).default;
  app = express();
  app.use(express.json());
  // Inject the test admin as the authenticated user
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: adminId };
    next();
  });
  app.use(businessRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, adminId));
  await db.delete(users).where(eq(users.id, staffId));
  await db.delete(units).where(eq(units.id, unitId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("POST /api/business/:hospitalId/staff/:userId/stammblatt-invite", () => {
  it("returns 403 when addon is off", async () => {
    await db.update(hospitals).set({ addonPersonalstammblatt: false }).where(eq(hospitals.id, hospitalId));
    const res = await request(app).post(`/api/business/${hospitalId}/staff/${staffId}/stammblatt-invite`);
    expect(res.status).toBe(403);
    await db.update(hospitals).set({ addonPersonalstammblatt: true }).where(eq(hospitals.id, hospitalId));
  });

  it("creates a link, sends email, increments counter on first call", async () => {
    const res = await request(app).post(`/api/business/${hospitalId}/staff/${staffId}/stammblatt-invite`);
    expect(res.status).toBe(200);
    expect(res.body.inviteCount).toBe(1);

    const [link] = await db.select().from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.userId, staffId)).limit(1);
    expect(link.personalDataOnly).toBe(true);
    expect(link.lastInvitedAt).toBeInstanceOf(Date);
  });

  it("rotates the token and increments counter on resend", async () => {
    const [before] = await db.select().from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.userId, staffId)).limit(1);
    const res = await request(app).post(`/api/business/${hospitalId}/staff/${staffId}/stammblatt-invite`);
    expect(res.status).toBe(200);
    expect(res.body.inviteCount).toBe(2);
    const [after] = await db.select().from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.userId, staffId)).limit(1);
    expect(after.token).not.toBe(before.token);
  });

  it("skips users with invalid email in bulk endpoint", async () => {
    const placeholderId = `test-staff-placeholder-${randomUUID()}`;
    await db.insert(users).values({
      id: placeholderId, email: "foo.bar.abc123@staff.local", firstName: "P", lastName: "L",
    } as any);
    await db.insert(userHospitalRoles).values({
      userId: placeholderId, hospitalId, unitId, role: "surgeon",
    } as any);
    const res = await request(app).post(`/api/business/${hospitalId}/staff/stammblatt-invite/bulk`)
      .send({ scope: "all_incomplete" });
    expect(res.status).toBe(200);
    expect(res.body.skipped.find((s: any) => s.userId === placeholderId)).toBeTruthy();
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, placeholderId));
    await db.delete(users).where(eq(users.id, placeholderId));
  });

  it("returns 502 and does NOT increment inviteCount when email send fails", async () => {
    // Create a fresh user so we know the starting inviteCount is 0.
    const failUserId = `test-staff-fail-${randomUUID()}`;
    await db.insert(users).values({
      id: failUserId, email: "failuser@example.com", firstName: "F", lastName: "Ail",
    } as any);
    await db.insert(userHospitalRoles).values({
      userId: failUserId, hospitalId, unitId, role: "surgeon",
    } as any);

    // Make the mock fail for this one call.
    mockSendStammblattInviteEmail.mockResolvedValueOnce(false);

    const res = await request(app).post(`/api/business/${hospitalId}/staff/${failUserId}/stammblatt-invite`);
    expect(res.status).toBe(502);

    // The link may or may not have been created (ensureStammblattLink runs), but
    // inviteCount must not have been incremented.
    const links = await db.select().from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.userId, failUserId));
    for (const l of links) {
      expect(l.inviteCount).toBe(0);
    }

    // Cleanup
    await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.userId, failUserId));
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, failUserId));
    await db.delete(users).where(eq(users.id, failUserId));
  });
});
