import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  units,
  userHospitalRoles,
  users,
  clinicServices,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// Bypass real Google auth. We inject req.user via a buildApp() middleware so
// the downstream requirePlatformAdmin middleware runs for real against the DB.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import adminGroupsRouter from "../server/routes/adminGroups";

/**
 * We create three users up-front:
 *   - PLATFORM_USER_ID  → is_platform_admin = true   (happy-path)
 *   - PLAIN_USER_ID     → is_platform_admin = false  (403 sanity)
 *   - ASPIRANT_USER_ID  → hospital-role exists at memberA (promote target)
 *
 * Plus two hospitals (memberA, memberB) and one stray (outsider) so we can
 * exercise membership and refuse-delete branches.
 */

const uniq = () => randomUUID().slice(0, 8);

let PLATFORM_USER_ID: string;
let PLAIN_USER_ID: string;
let ASPIRANT_USER_ID: string;
let memberA: string;
let memberB: string;
let outsider: string;
let memberAUnit: string;
let aspirantRoleId: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];
const createdServiceIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(adminGroupsRouter);
  return app;
}

async function freshGroup(hospitalIds: string[] = []) {
  const app = buildApp(PLATFORM_USER_ID);
  const res = await request(app)
    .post("/api/admin/groups")
    .send({ name: `grp-${uniq()}`, hospitalIds });
  expect(res.status).toBe(201);
  createdGroupIds.push(res.body.id);
  return res.body as {
    id: string;
    name: string;
    bookingToken: string | null;
  };
}

beforeAll(async () => {
  // Platform admin user
  const [pu] = await db
    .insert(users)
    .values({
      id: `plat-${uniq()}`,
      email: `plat-${uniq()}@test.invalid`,
      firstName: "Plat",
      lastName: "Admin",
      isPlatformAdmin: true,
    } as any)
    .returning();
  PLATFORM_USER_ID = pu.id;
  createdUserIds.push(PLATFORM_USER_ID);

  // Plain user (no platform admin)
  const [plain] = await db
    .insert(users)
    .values({
      id: `plain-${uniq()}`,
      email: `plain-${uniq()}@test.invalid`,
      firstName: "Plain",
      lastName: "User",
      isPlatformAdmin: false,
    } as any)
    .returning();
  PLAIN_USER_ID = plain.id;
  createdUserIds.push(PLAIN_USER_ID);

  // Aspirant (will be promoted to group_admin)
  const [asp] = await db
    .insert(users)
    .values({
      id: `asp-${uniq()}`,
      email: `asp-${uniq()}@test.invalid`,
      firstName: "Aspi",
      lastName: "Rant",
      isPlatformAdmin: false,
    } as any)
    .returning();
  ASPIRANT_USER_ID = asp.id;
  createdUserIds.push(ASPIRANT_USER_ID);

  // Three hospitals
  const [a] = await db
    .insert(hospitals)
    .values({ name: `TEST_A_${uniq()}` } as any)
    .returning();
  memberA = a.id;
  createdHospitalIds.push(memberA);

  const [b] = await db
    .insert(hospitals)
    .values({ name: `TEST_B_${uniq()}` } as any)
    .returning();
  memberB = b.id;
  createdHospitalIds.push(memberB);

  const [c] = await db
    .insert(hospitals)
    .values({ name: `TEST_C_${uniq()}` } as any)
    .returning();
  outsider = c.id;
  createdHospitalIds.push(outsider);

  // One unit per hospital (promote flow borrows a unitId from an existing
  // role row; unit_id is NOT NULL in user_hospital_roles).
  const [unitA] = await db
    .insert(units)
    .values({ hospitalId: memberA, name: "Clinic A", type: "clinic" } as any)
    .returning();
  memberAUnit = unitA.id;
  createdUnitIds.push(memberAUnit);

  const [unitB] = await db
    .insert(units)
    .values({ hospitalId: memberB, name: "Clinic B", type: "clinic" } as any)
    .returning();
  createdUnitIds.push(unitB.id);

  const [unitC] = await db
    .insert(units)
    .values({
      hospitalId: outsider,
      name: "Clinic C",
      type: "clinic",
    } as any)
    .returning();
  createdUnitIds.push(unitC.id);

  // Give ASPIRANT a hospital-role at memberA so promoteGroupAdmin can find a
  // unitId to borrow. Role itself is "admin" (arbitrary non-group_admin).
  const [role] = await db
    .insert(userHospitalRoles)
    .values({
      userId: ASPIRANT_USER_ID,
      hospitalId: memberA,
      unitId: memberAUnit,
      role: "admin",
    } as any)
    .returning();
  aspirantRoleId = role.id;
  createdRoleIds.push(aspirantRoleId);
});

beforeEach(async () => {
  // Isolate each test: reset our test hospitals to ungrouped. This matters
  // because nearly every test creates a fresh group and puts one or more of
  // our hospitals in it — without reset, earlier tests leak state into later
  // ones (a hospital already-in-a-group fails new "add-to-group" scenarios).
  await db
    .update(hospitals)
    .set({ groupId: null })
    .where(inArray(hospitals.id, [memberA, memberB, outsider]));
  // Also clear any lingering group_admin rows for ASPIRANT so the revoke test
  // doesn't see left-overs.
  await db
    .delete(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, ASPIRANT_USER_ID),
        eq(userHospitalRoles.role, "group_admin"),
      ),
    );
});

afterAll(async () => {
  // Clean up in dependency order: services, roles, units, hospitals, groups, users.
  if (createdServiceIds.length) {
    await db
      .delete(clinicServices)
      .where(inArray(clinicServices.id, createdServiceIds))
      .catch(() => {});
  }
  if (createdRoleIds.length) {
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.id, createdRoleIds))
      .catch(() => {});
  }
  // Also scrub any group_admin rows created by the promote test.
  await db
    .delete(userHospitalRoles)
    .where(inArray(userHospitalRoles.userId, createdUserIds))
    .catch(() => {});

  if (createdUnitIds.length) {
    await db
      .delete(units)
      .where(inArray(units.id, createdUnitIds))
      .catch(() => {});
  }
  if (createdHospitalIds.length) {
    // Clear any lingering group_id FKs first so hospital deletes don't trip
    // on a half-torn-down world when a test fails mid-way.
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
    await db
      .delete(hospitals)
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
  }
  if (createdGroupIds.length) {
    await db
      .delete(hospitalGroups)
      .where(inArray(hospitalGroups.id, createdGroupIds))
      .catch(() => {});
  }
  if (createdUserIds.length) {
    await db
      .delete(users)
      .where(inArray(users.id, createdUserIds))
      .catch(() => {});
  }
  await pool.end();
});

describe("admin groups routes — platform admin gate", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const app = buildApp(null);
    const res = await request(app).get("/api/admin/groups");
    expect(res.status).toBe(401);
  });

  it("returns 403 for authenticated non-platform-admin users", async () => {
    const app = buildApp(PLAIN_USER_ID);
    const res = await request(app).get("/api/admin/groups");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PLATFORM_ADMIN_REQUIRED");
  });

  it("allows platform admins through", async () => {
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app).get("/api/admin/groups");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("admin groups routes — CRUD", () => {
  it("creates a group with initial hospitals and returns it in list with memberCount", async () => {
    const app = buildApp(PLATFORM_USER_ID);
    const createRes = await request(app)
      .post("/api/admin/groups")
      .send({ name: `init-${uniq()}`, hospitalIds: [memberA, memberB] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();
    createdGroupIds.push(createRes.body.id);

    // Confirm the DB side effect.
    const members = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.groupId, createRes.body.id));
    expect(members.map((h) => h.id).sort()).toEqual(
      [memberA, memberB].sort(),
    );

    // And the list endpoint surfaces memberCount.
    const listRes = await request(app).get("/api/admin/groups");
    expect(listRes.status).toBe(200);
    const found = listRes.body.find((g: any) => g.id === createRes.body.id);
    expect(found).toBeDefined();
    expect(found.memberCount).toBe(2);
    expect(typeof found.patientCount).toBe("number");
  });

  it("refuses to create a group with no name", async () => {
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app)
      .post("/api/admin/groups")
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("skips hospitals that are already in another group when adding initial members", async () => {
    // First, put memberA into group1.
    const group1 = await freshGroup([memberA]);
    // Try to sweep memberA into a brand-new group — should NOT reassign.
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app)
      .post("/api/admin/groups")
      .send({ name: `dup-${uniq()}`, hospitalIds: [memberA, memberB] });
    expect(res.status).toBe(201);
    createdGroupIds.push(res.body.id);

    // The response body should surface the skipped ID so the admin isn't
    // left guessing why the assignment "failed" silently.
    expect(Array.isArray(res.body.skippedHospitalIds)).toBe(true);
    expect(res.body.skippedHospitalIds).toEqual([memberA]);

    const rows = await db
      .select()
      .from(hospitals)
      .where(inArray(hospitals.id, [memberA, memberB]));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[memberA].groupId).toBe(group1.id); // unchanged
    expect(byId[memberB].groupId).toBe(res.body.id); // freshly assigned

    // Clean memberships to avoid cross-test bleed.
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(inArray(hospitals.id, [memberA, memberB]));
  });

  it("create response returns skippedHospitalIds as an empty array when nothing is skipped", async () => {
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app)
      .post("/api/admin/groups")
      .send({ name: `clean-${uniq()}`, hospitalIds: [memberA] });
    expect(res.status).toBe(201);
    createdGroupIds.push(res.body.id);
    expect(res.body.skippedHospitalIds).toEqual([]);
  });

  it("GET :id returns group + members + admins", async () => {
    const g = await freshGroup([memberA]);
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app).get(`/api/admin/groups/${g.id}`);
    expect(res.status).toBe(200);
    expect(res.body.group.id).toBe(g.id);
    expect(res.body.members.map((m: any) => m.id)).toEqual([memberA]);
    expect(Array.isArray(res.body.admins)).toBe(true);

    // Clean membership.
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(eq(hospitals.id, memberA));
  });

  it("PATCH :id renames a group", async () => {
    const g = await freshGroup();
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app)
      .patch(`/api/admin/groups/${g.id}`)
      .send({ name: "renamed-group" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("renamed-group");
  });

  it("DELETE returns 409 when members exist, then 204 after emptied", async () => {
    const g = await freshGroup([memberA]);
    const app = buildApp(PLATFORM_USER_ID);
    const blocked = await request(app).delete(`/api/admin/groups/${g.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/member hospitals/i);

    // Remove the member and try again.
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(eq(hospitals.id, memberA));
    const ok = await request(app).delete(`/api/admin/groups/${g.id}`);
    expect(ok.status).toBe(204);
    // No longer tracked — the afterAll cleanup doesn't need it.
    const idx = createdGroupIds.indexOf(g.id);
    if (idx >= 0) createdGroupIds.splice(idx, 1);
  });

  it("DELETE returns 409 when the group still owns services", async () => {
    const g = await freshGroup();
    const [svc] = await db
      .insert(clinicServices)
      .values({ groupId: g.id, name: `svc-${uniq()}` } as any)
      .returning();
    createdServiceIds.push(svc.id);

    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app).delete(`/api/admin/groups/${g.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/services/i);
  });
});

describe("admin groups routes — membership", () => {
  it("POST /:id/members adds a hospital", async () => {
    const g = await freshGroup();
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app)
      .post(`/api/admin/groups/${g.id}/members`)
      .send({ hospitalId: memberB });
    expect(res.status).toBe(204);

    const [row] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, memberB));
    expect(row.groupId).toBe(g.id);

    // Clean up.
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(eq(hospitals.id, memberB));
  });

  it("POST /:id/members refuses when hospital is already in another group", async () => {
    const g1 = await freshGroup([memberA]);
    const g2 = await freshGroup();
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app)
      .post(`/api/admin/groups/${g2.id}/members`)
      .send({ hospitalId: memberA });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/another group/i);

    // beforeEach() already resets groupId on our test hospitals before the
    // next test — no inline cleanup needed here. Keep refs for afterAll.
    void g1;
    void g2;
  });

  it("DELETE /:id/members/:hospitalId removes and returns 204 when no home patients", async () => {
    const g = await freshGroup([outsider]);
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app).delete(
      `/api/admin/groups/${g.id}/members/${outsider}`,
    );
    // outsider hospital has no patients → status should be 204.
    expect(res.status).toBe(204);

    const [row] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, outsider));
    expect(row.groupId).toBeNull();
  });

  it("DELETE /:id/members/:hospitalId returns 404 when the hospital belongs to a different group (no silent orphaning)", async () => {
    const g1 = await freshGroup([memberA]); // memberA lives in g1
    const g2 = await freshGroup(); // g2 is empty
    const app = buildApp(PLATFORM_USER_ID);

    // Try to remove memberA via g2 — it should NOT succeed, and memberA
    // must still be attached to g1 afterwards.
    const res = await request(app).delete(
      `/api/admin/groups/${g2.id}/members/${memberA}`,
    );
    expect(res.status).toBe(404);

    const [row] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, memberA));
    expect(row.groupId).toBe(g1.id);
  });
});

describe("admin groups routes — group admin promote", () => {
  it("POST /:id/admins promotes a user who already has a role at the hospital", async () => {
    const g = await freshGroup([memberA]);
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app)
      .post(`/api/admin/groups/${g.id}/admins`)
      .send({ userId: ASPIRANT_USER_ID, hospitalId: memberA });
    expect(res.status).toBe(204);

    // Verify a new user_hospital_roles row with role=group_admin now exists.
    const rows = await db
      .select()
      .from(userHospitalRoles)
      .where(
        eq(userHospitalRoles.userId, ASPIRANT_USER_ID),
      );
    const groupAdminRow = rows.find(
      (r) => r.hospitalId === memberA && r.role === "group_admin",
    );
    expect(groupAdminRow).toBeDefined();

    // The GET /:id response should include this admin.
    const detailRes = await request(app).get(`/api/admin/groups/${g.id}`);
    expect(detailRes.status).toBe(200);
    const adminUserIds = detailRes.body.admins.map((a: any) => a.userId);
    expect(adminUserIds).toContain(ASPIRANT_USER_ID);

    // Clean the membership and admin role.
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(eq(hospitals.id, memberA));
  });

  it("POST /:id/admins rejects users without a role at the target hospital", async () => {
    const g = await freshGroup([memberB]);
    const app = buildApp(PLATFORM_USER_ID);
    // ASPIRANT has no role at memberB.
    const res = await request(app)
      .post(`/api/admin/groups/${g.id}/admins`)
      .send({ userId: ASPIRANT_USER_ID, hospitalId: memberB });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no role/i);

    // Clean up.
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(eq(hospitals.id, memberB));
  });

  it("DELETE /:id/admins/:userId/:hospitalId revokes the group_admin row", async () => {
    const g = await freshGroup([memberA]);
    const app = buildApp(PLATFORM_USER_ID);
    await request(app)
      .post(`/api/admin/groups/${g.id}/admins`)
      .send({ userId: ASPIRANT_USER_ID, hospitalId: memberA })
      .expect(204);

    const revokeRes = await request(app).delete(
      `/api/admin/groups/${g.id}/admins/${ASPIRANT_USER_ID}/${memberA}`,
    );
    expect(revokeRes.status).toBe(204);

    const rows = await db
      .select()
      .from(userHospitalRoles)
      .where(eq(userHospitalRoles.userId, ASPIRANT_USER_ID));
    expect(
      rows.some(
        (r) => r.role === "group_admin" && r.hospitalId === memberA,
      ),
    ).toBe(false);

    // The original non-group_admin role row is still there.
    expect(rows.some((r) => r.role === "admin")).toBe(true);

    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(eq(hospitals.id, memberA));
  });
});

describe("admin groups routes — booking token", () => {
  it("POST /:id/booking-token generates a token and persists it", async () => {
    const g = await freshGroup();
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app).post(
      `/api/admin/groups/${g.id}/booking-token`,
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.bookingToken).toBe("string");
    expect(res.body.bookingToken.length).toBeGreaterThanOrEqual(16);

    const [row] = await db
      .select()
      .from(hospitalGroups)
      .where(eq(hospitalGroups.id, g.id));
    expect(row.bookingToken).toBe(res.body.bookingToken);
  });

  it("regenerates a new token on subsequent calls (idempotent in the sense that old token is invalidated)", async () => {
    const g = await freshGroup();
    const app = buildApp(PLATFORM_USER_ID);
    const first = await request(app).post(
      `/api/admin/groups/${g.id}/booking-token`,
    );
    const second = await request(app).post(
      `/api/admin/groups/${g.id}/booking-token`,
    );
    expect(first.body.bookingToken).not.toBe(second.body.bookingToken);
  });
});

describe("admin groups routes — hospitals picker", () => {
  it("GET /api/admin/hospitals returns id+name+groupId for every hospital", async () => {
    const app = buildApp(PLATFORM_USER_ID);
    const res = await request(app).get("/api/admin/hospitals");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((h: any) => h.id);
    expect(ids).toContain(memberA);
    expect(ids).toContain(memberB);
    // Shape check.
    const sample = res.body.find((h: any) => h.id === memberA);
    expect(sample).toHaveProperty("name");
    expect(sample).toHaveProperty("groupId");
  });
});
