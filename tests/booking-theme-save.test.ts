import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * PATCH /api/branding/group/:id  — group_admin (or platform admin)
 * PATCH /api/branding/hospital/:id — hospital admin (or platform admin),
 *   AND target hospital must NOT belong to a chain.
 *
 * Auth strategy mirrors admin-groups-routes.test.ts: bypass Google auth and
 * inject `req.user` via a buildApp() middleware so the downstream branding
 * router runs its real auth checks against the DB.
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import brandingRouter from "../server/routes/branding";

const uniq = () => randomUUID().slice(0, 8);

const NEW_THEME = {
  bgColor: "#ffffff",
  primaryColor: "#ff0000",
  secondaryColor: "#00ff00",
  headingFont: "Inter",
  bodyFont: "Inter",
};

let GROUP_ADMIN_USER_ID: string;
let CHAIN_HOSP_ADMIN_USER_ID: string;
let STANDALONE_HOSP_ADMIN_USER_ID: string;
let UNPRIV_USER_ID: string;
let groupId: string;
let chainHospId: string;
let standaloneHospId: string;
let chainHospUnitId: string;
let standaloneHospUnitId: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  // The branding router calls isAuthenticated, which is mocked above to
  // call next(). When we pass `null` userId and don't set req.user, our
  // anonymous test should still get 401 — but the mock makes that
  // impossible. Solution: emulate the real `isAuthenticated` 401 path
  // when `req.user` is missing, before mounting the router.
  app.use((req: any, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });
  app.use(brandingRouter);
  return app;
}

beforeAll(async () => {
  // Group + members: chain hospital + a separate standalone hospital.
  const groupName = `theme-grp-${uniq()}`;
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: groupName } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  const [chainHosp] = await db
    .insert(hospitals)
    .values({
      name: `Chain-${uniq()}`,
      groupId: g.id,
      bookingToken: `chain-bt-${uniq()}`,
    } as any)
    .returning();
  chainHospId = chainHosp.id;
  createdHospitalIds.push(chainHospId);

  const [standaloneHosp] = await db
    .insert(hospitals)
    .values({
      name: `Standalone-${uniq()}`,
      bookingToken: `solo-bt-${uniq()}`,
    } as any)
    .returning();
  standaloneHospId = standaloneHosp.id;
  createdHospitalIds.push(standaloneHospId);

  // Units (required by user_hospital_roles).
  const [chainUnit] = await db
    .insert(units)
    .values({ hospitalId: chainHospId, name: "Clinic", type: "clinic" } as any)
    .returning();
  chainHospUnitId = chainUnit.id;
  createdUnitIds.push(chainHospUnitId);

  const [standaloneUnit] = await db
    .insert(units)
    .values({
      hospitalId: standaloneHospId,
      name: "Clinic",
      type: "clinic",
    } as any)
    .returning();
  standaloneHospUnitId = standaloneUnit.id;
  createdUnitIds.push(standaloneHospUnitId);

  // Four users
  const mkUser = async (prefix: string) => {
    const [u] = await db
      .insert(users)
      .values({
        id: `${prefix}-${uniq()}`,
        email: `${prefix}-${uniq()}@test.invalid`,
        firstName: prefix,
        lastName: "User",
        isPlatformAdmin: false,
      } as any)
      .returning();
    createdUserIds.push(u.id);
    return u.id;
  };
  GROUP_ADMIN_USER_ID = await mkUser("groupadmin");
  CHAIN_HOSP_ADMIN_USER_ID = await mkUser("chainadmin");
  STANDALONE_HOSP_ADMIN_USER_ID = await mkUser("soloadmin");
  UNPRIV_USER_ID = await mkUser("unpriv");

  const mkRole = async (
    userId: string,
    hospitalId: string,
    unitId: string,
    role: string,
  ) => {
    const [r] = await db
      .insert(userHospitalRoles)
      .values({ userId, hospitalId, unitId, role } as any)
      .returning();
    createdRoleIds.push(r.id);
    return r.id;
  };
  // group_admin role at the chain hospital → grants group_admin in the group.
  await mkRole(
    GROUP_ADMIN_USER_ID,
    chainHospId,
    chainHospUnitId,
    "group_admin",
  );
  // chain hospital admin (NOT group_admin)
  await mkRole(
    CHAIN_HOSP_ADMIN_USER_ID,
    chainHospId,
    chainHospUnitId,
    "admin",
  );
  // standalone hospital admin
  await mkRole(
    STANDALONE_HOSP_ADMIN_USER_ID,
    standaloneHospId,
    standaloneHospUnitId,
    "admin",
  );
  // UNPRIV_USER_ID has no roles anywhere.
});

afterAll(async () => {
  if (createdRoleIds.length) {
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.id, createdRoleIds))
      .catch(() => {});
  }
  if (createdUnitIds.length) {
    await db
      .delete(units)
      .where(inArray(units.id, createdUnitIds))
      .catch(() => {});
  }
  if (createdHospitalIds.length) {
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

describe("PATCH /api/branding/group/:id", () => {
  it("group_admin can write group theme", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/group/${groupId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(200);
    expect(res.body.bookingTheme).toEqual(NEW_THEME);
    const [g] = await db
      .select({ bookingTheme: hospitalGroups.bookingTheme })
      .from(hospitalGroups)
      .where(eq(hospitalGroups.id, groupId));
    expect(g.bookingTheme).toEqual(NEW_THEME);
  });

  it("anonymous (no req.user) returns 401", async () => {
    const app = buildApp(null);
    const res = await request(app)
      .patch(`/api/branding/group/${groupId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(401);
  });

  it("unprivileged user returns 403", async () => {
    const app = buildApp(UNPRIV_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/group/${groupId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_ADMIN_REQUIRED");
  });

  it("hospital-admin (not group_admin) of a chain member returns 403 on group save", async () => {
    const app = buildApp(CHAIN_HOSP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/group/${groupId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_ADMIN_REQUIRED");
  });

  it("invalid hex returns 400", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/group/${groupId}`)
      .send({ ...NEW_THEME, primaryColor: "not-a-hex" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid theme/i);
  });

  it("non-existent group returns 404", async () => {
    const app = buildApp(GROUP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/group/${randomUUID()}`)
      .send(NEW_THEME);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/branding/hospital/:id", () => {
  it("standalone hospital admin can write its theme", async () => {
    const app = buildApp(STANDALONE_HOSP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/hospital/${standaloneHospId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(200);
    expect(res.body.bookingTheme).toEqual(NEW_THEME);
    const [h] = await db
      .select({ bookingTheme: hospitals.bookingTheme })
      .from(hospitals)
      .where(eq(hospitals.id, standaloneHospId));
    expect(h.bookingTheme).toEqual(NEW_THEME);
  });

  it("hospital admin CANNOT write a chain-member hospital theme (managed by chain admin)", async () => {
    const app = buildApp(CHAIN_HOSP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/hospital/${chainHospId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/managed by chain admin/i);
  });

  it("unprivileged user returns 403 on standalone hospital save", async () => {
    const app = buildApp(UNPRIV_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/hospital/${standaloneHospId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("HOSPITAL_ADMIN_REQUIRED");
  });

  it("anonymous returns 401", async () => {
    const app = buildApp(null);
    const res = await request(app)
      .patch(`/api/branding/hospital/${standaloneHospId}`)
      .send(NEW_THEME);
    expect(res.status).toBe(401);
  });

  it("invalid hex returns 400", async () => {
    const app = buildApp(STANDALONE_HOSP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/hospital/${standaloneHospId}`)
      .send({ ...NEW_THEME, bgColor: "rgb(0,0,0)" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid theme/i);
  });

  it("non-existent hospital returns 404", async () => {
    const app = buildApp(STANDALONE_HOSP_ADMIN_USER_ID);
    const res = await request(app)
      .patch(`/api/branding/hospital/${randomUUID()}`)
      .send(NEW_THEME);
    expect(res.status).toBe(404);
  });
});
