import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  units,
  userHospitalRoles,
  users,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// Bypass Google auth; inject req.user via a buildApp() middleware so the
// downstream `requireGroupAdmin` middleware runs for real against the DB.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import businessGroupsRouter from "../server/routes/businessGroups";

/**
 * Seed layout:
 *
 *   Group G
 *   ├── memberA  ← group_admin user lives here + aspirant has `admin` role
 *   └── memberB  ← plain user has `admin` role (so they're a member but not g_a)
 *   outsider     ← un-grouped hospital, so a user who only sits there is
 *                  "active hospital un-grouped"
 *
 *   Users:
 *     GROUP_ADMIN_USER_ID   → `group_admin` at memberA + `admin` at memberA
 *     PLAIN_USER_ID         → `admin` at memberB (regular user in group, NOT group_admin)
 *     OUTSIDER_USER_ID      → `admin` at outsider only (no group)
 *     ASPIRANT_USER_ID      → `admin` at memberB (promote target)
 */

const uniq = () => randomUUID().slice(0, 8);

let GROUP_ADMIN_USER_ID: string;
let PLAIN_USER_ID: string;
let OUTSIDER_USER_ID: string;
let ASPIRANT_USER_ID: string;
let memberA: string;
let memberB: string;
let outsider: string;
let memberAUnit: string;
let memberBUnit: string;
let outsiderUnit: string;
let groupId: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];

function buildApp(userId: string | null, activeHospitalId?: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    if (activeHospitalId) req.headers["x-active-hospital-id"] = activeHospitalId;
    next();
  });
  app.use(businessGroupsRouter);
  return app;
}

beforeAll(async () => {
  // Three hospitals: memberA, memberB, outsider
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

  // Group G with memberA + memberB
  const [grp] = await db
    .insert(hospitalGroups)
    .values({ name: `bg-grp-${uniq()}` } as any)
    .returning();
  groupId = grp.id;
  createdGroupIds.push(groupId);
  await db
    .update(hospitals)
    .set({ groupId })
    .where(inArray(hospitals.id, [memberA, memberB]));

  // Units per hospital (unit_id is NOT NULL on user_hospital_roles)
  const [ua] = await db
    .insert(units)
    .values({ hospitalId: memberA, name: "A-clinic", type: "clinic" } as any)
    .returning();
  memberAUnit = ua.id;
  createdUnitIds.push(memberAUnit);
  const [ub] = await db
    .insert(units)
    .values({ hospitalId: memberB, name: "B-clinic", type: "clinic" } as any)
    .returning();
  memberBUnit = ub.id;
  createdUnitIds.push(memberBUnit);
  const [uc] = await db
    .insert(units)
    .values({ hospitalId: outsider, name: "C-clinic", type: "clinic" } as any)
    .returning();
  outsiderUnit = uc.id;
  createdUnitIds.push(outsiderUnit);

  // Users
  const [ga] = await db
    .insert(users)
    .values({
      id: `ga-${uniq()}`,
      email: `ga-${uniq()}@test.invalid`,
      firstName: "Group",
      lastName: "Admin",
      isPlatformAdmin: false,
    } as any)
    .returning();
  GROUP_ADMIN_USER_ID = ga.id;
  createdUserIds.push(GROUP_ADMIN_USER_ID);

  const [plain] = await db
    .insert(users)
    .values({
      id: `pl-${uniq()}`,
      email: `pl-${uniq()}@test.invalid`,
      firstName: "Plain",
      lastName: "User",
      isPlatformAdmin: false,
    } as any)
    .returning();
  PLAIN_USER_ID = plain.id;
  createdUserIds.push(PLAIN_USER_ID);

  const [outs] = await db
    .insert(users)
    .values({
      id: `out-${uniq()}`,
      email: `out-${uniq()}@test.invalid`,
      firstName: "Out",
      lastName: "Sider",
      isPlatformAdmin: false,
    } as any)
    .returning();
  OUTSIDER_USER_ID = outs.id;
  createdUserIds.push(OUTSIDER_USER_ID);

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

  // Roles:
  // GROUP_ADMIN_USER_ID: admin + group_admin at memberA
  const [gaAdmin] = await db
    .insert(userHospitalRoles)
    .values({
      userId: GROUP_ADMIN_USER_ID,
      hospitalId: memberA,
      unitId: memberAUnit,
      role: "admin",
    } as any)
    .returning();
  createdRoleIds.push(gaAdmin.id);
  const [gaGroup] = await db
    .insert(userHospitalRoles)
    .values({
      userId: GROUP_ADMIN_USER_ID,
      hospitalId: memberA,
      unitId: memberAUnit,
      role: "group_admin",
    } as any)
    .returning();
  createdRoleIds.push(gaGroup.id);

  // PLAIN_USER_ID: plain admin at memberB
  const [plainRole] = await db
    .insert(userHospitalRoles)
    .values({
      userId: PLAIN_USER_ID,
      hospitalId: memberB,
      unitId: memberBUnit,
      role: "admin",
    } as any)
    .returning();
  createdRoleIds.push(plainRole.id);

  // OUTSIDER_USER_ID: admin at outsider (un-grouped)
  const [outsRole] = await db
    .insert(userHospitalRoles)
    .values({
      userId: OUTSIDER_USER_ID,
      hospitalId: outsider,
      unitId: outsiderUnit,
      role: "admin",
    } as any)
    .returning();
  createdRoleIds.push(outsRole.id);

  // ASPIRANT_USER_ID: plain admin at memberB (promote target)
  const [aspRole] = await db
    .insert(userHospitalRoles)
    .values({
      userId: ASPIRANT_USER_ID,
      hospitalId: memberB,
      unitId: memberBUnit,
      role: "admin",
    } as any)
    .returning();
  createdRoleIds.push(aspRole.id);
});

beforeEach(async () => {
  // Clear any group_admin rows left over from previous tests for ASPIRANT so
  // the promote/revoke flow starts clean. Keep the GROUP_ADMIN_USER_ID's
  // group_admin row intact (it's needed for access).
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
  if (createdRoleIds.length) {
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.id, createdRoleIds))
      .catch(() => {});
  }
  // Scrub any group_admin rows created during tests.
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

describe("business group routes — access gate", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const app = buildApp(null, memberA);
    const res = await request(app).get("/api/business/group/overview");
    expect(res.status).toBe(401);
  });

  it("returns 400 when X-Active-Hospital-Id is missing", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID, null);
    const res = await request(app).get("/api/business/group/overview");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ACTIVE_HOSPITAL_REQUIRED");
  });

  it("returns 403 for a regular (non-group-admin) user inside the group", async () => {
    const app = buildApp(PLAIN_USER_ID, memberB);
    const res = await request(app).get("/api/business/group/overview");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_ADMIN_REQUIRED");
  });

  it("returns 400 when the active hospital is not in any group", async () => {
    // OUTSIDER_USER_ID only exists at `outsider` (un-grouped).
    const app = buildApp(OUTSIDER_USER_ID, outsider);
    const res = await request(app).get("/api/business/group/overview");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_GROUP");
  });

  it("returns 403 when X-Active-Hospital-Id is forged (user has no role there)", async () => {
    // PLAIN_USER_ID has no role at memberA.
    const app = buildApp(PLAIN_USER_ID, memberA);
    const res = await request(app).get("/api/business/group/overview");
    expect(res.status).toBe(403);
  });
});

describe("business group routes — overview", () => {
  it("returns 200 with group info + members + counts for a group admin", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID, memberA);
    const res = await request(app).get("/api/business/group/overview");
    expect(res.status).toBe(200);
    expect(res.body.group.id).toBe(groupId);
    expect(res.body.group.name).toMatch(/bg-grp-/);
    const memberIds = res.body.members.map((m: any) => m.id).sort();
    expect(memberIds).toEqual([memberA, memberB].sort());
    expect(typeof res.body.counts.patientCount).toBe("number");
    expect(typeof res.body.counts.treatmentsThisMonth).toBe("number");
    expect(typeof res.body.counts.bookingsThisWeek).toBe("number");
  });
});

describe("business group routes — admins list", () => {
  it("returns 200 with the current group admins", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID, memberA);
    const res = await request(app).get("/api/business/group/admins");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // At minimum the seeded GROUP_ADMIN_USER_ID should appear.
    const ids = res.body.map((a: any) => a.userId);
    expect(ids).toContain(GROUP_ADMIN_USER_ID);
  });
});

describe("business group routes — promote", () => {
  it("POST /admins promotes another user at a group hospital (204)", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID, memberA);
    const res = await request(app)
      .post("/api/business/group/admins")
      .send({ userId: ASPIRANT_USER_ID, hospitalId: memberB });
    expect(res.status).toBe(204);

    const rows = await db
      .select()
      .from(userHospitalRoles)
      .where(eq(userHospitalRoles.userId, ASPIRANT_USER_ID));
    expect(
      rows.some(
        (r) => r.role === "group_admin" && r.hospitalId === memberB,
      ),
    ).toBe(true);
  });

  it("POST /admins returns 403 when the target hospitalId is not in the caller's group", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID, memberA);
    const res = await request(app)
      .post("/api/business/group/admins")
      .send({ userId: OUTSIDER_USER_ID, hospitalId: outsider });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("HOSPITAL_NOT_IN_GROUP");
  });

  it("POST /admins rejects a user who has no role at the target hospital (400)", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID, memberA);
    // PLAIN_USER_ID has no role at memberA — promoteGroupAdmin will refuse.
    const res = await request(app)
      .post("/api/business/group/admins")
      .send({ userId: PLAIN_USER_ID, hospitalId: memberA });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no role/i);
  });
});

describe("business group routes — revoke", () => {
  it("DELETE /admins/:userId/:hospitalId revokes, leaves non-group-admin roles intact", async () => {
    // Pre-create a group_admin row on ASPIRANT at memberB.
    await db.insert(userHospitalRoles).values({
      userId: ASPIRANT_USER_ID,
      hospitalId: memberB,
      unitId: memberBUnit,
      role: "group_admin",
    } as any);

    const app = buildApp(GROUP_ADMIN_USER_ID, memberA);
    const res = await request(app).delete(
      `/api/business/group/admins/${ASPIRANT_USER_ID}/${memberB}`,
    );
    expect(res.status).toBe(204);

    const rows = await db
      .select()
      .from(userHospitalRoles)
      .where(eq(userHospitalRoles.userId, ASPIRANT_USER_ID));
    expect(
      rows.some(
        (r) => r.role === "group_admin" && r.hospitalId === memberB,
      ),
    ).toBe(false);
    // Non-destructive: the pre-existing `admin` row at memberB survives.
    expect(
      rows.some((r) => r.role === "admin" && r.hospitalId === memberB),
    ).toBe(true);
  });

  it("DELETE /admins/:userId/:hospitalId returns 403 when the target hospital is outside the caller's group", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID, memberA);
    const res = await request(app).delete(
      `/api/business/group/admins/${OUTSIDER_USER_ID}/${outsider}`,
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("HOSPITAL_NOT_IN_GROUP");
  });
});
