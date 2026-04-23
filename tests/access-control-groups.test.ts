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
  patients,
  items,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

import {
  canAccessHospitalInGroup,
  userIsGroupAdminForHospital,
  userHasGroupAwareHospitalAccess,
  requireWriteAccess,
  requireStrictWriteAccess,
  requireHospitalAccess,
} from "../server/utils/accessControl";

/**
 * Task 3: group-aware access control.
 *
 * Test matrix (unit + integration) for the multi-location groups feature.
 * The unit tests exercise `canAccessHospitalInGroup` directly with in-memory
 * role arrays, but require real hospital + group rows so the storage helpers
 * can resolve `groupId`. The integration test boots an express app with the
 * patient routes and exercises a real cross-location GET.
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

// Import routes AFTER the mock so they pick up the bypassed auth.
import patientsRouter from "../server/routes/anesthesia/patients";
import itemsRouter from "../server/routes/items";

const uniq = () => randomUUID().slice(0, 8);

let groupA: string;
let groupB: string;
let hospA1: string; // in groupA
let hospA2: string; // in groupA
let hospB1: string; // in groupB
let hospSolo: string; // ungrouped
let hospSolo2: string; // ungrouped

let unitA1: string;
let unitA2: string;
let unitB1: string;
let unitSolo: string;
let unitSolo2: string;

// Users
let userInA1: string; // role at hospA1, no group_admin
let userInB1: string; // role at hospB1, no group_admin
let userGroupAdminA: string; // group_admin at hospA1 (group A)
let userSolo: string; // role at hospSolo (no group)
let userPlatform: string; // is_platform_admin = true
let userNoRoles: string; // authenticated but no roles at all

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdGroupIds: string[] = [];
const createdPatientIds: string[] = [];

async function mkHospital(name: string, groupId?: string | null) {
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId: groupId ?? null } as any)
    .returning();
  createdHospitalIds.push(h.id);
  return h.id;
}
async function mkUnit(hospitalId: string, name: string) {
  const [u] = await db
    .insert(units)
    .values({ hospitalId, name, type: "clinic" } as any)
    .returning();
  createdUnitIds.push(u.id);
  return u.id;
}
async function mkUser(
  prefix: string,
  opts: { isPlatformAdmin?: boolean } = {},
) {
  const [u] = await db
    .insert(users)
    .values({
      id: `${prefix}-${uniq()}`,
      email: `${prefix}-${uniq()}@test.invalid`,
      firstName: prefix,
      lastName: "User",
      isPlatformAdmin: opts.isPlatformAdmin ?? false,
    } as any)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}
async function mkRole(
  userId: string,
  hospitalId: string,
  unitId: string,
  role: string,
) {
  const [r] = await db
    .insert(userHospitalRoles)
    .values({ userId, hospitalId, unitId, role } as any)
    .returning();
  createdRoleIds.push(r.id);
  return r.id;
}

beforeAll(async () => {
  // Groups
  const [gA] = await db
    .insert(hospitalGroups)
    .values({ name: `ac-group-A-${uniq()}` } as any)
    .returning();
  groupA = gA.id;
  createdGroupIds.push(groupA);

  const [gB] = await db
    .insert(hospitalGroups)
    .values({ name: `ac-group-B-${uniq()}` } as any)
    .returning();
  groupB = gB.id;
  createdGroupIds.push(groupB);

  // Hospitals (two in A, one in B, two ungrouped)
  hospA1 = await mkHospital(`AC_A1_${uniq()}`, groupA);
  hospA2 = await mkHospital(`AC_A2_${uniq()}`, groupA);
  hospB1 = await mkHospital(`AC_B1_${uniq()}`, groupB);
  hospSolo = await mkHospital(`AC_SOLO_${uniq()}`);
  hospSolo2 = await mkHospital(`AC_SOLO2_${uniq()}`);

  unitA1 = await mkUnit(hospA1, "Clinic A1");
  unitA2 = await mkUnit(hospA2, "Clinic A2");
  unitB1 = await mkUnit(hospB1, "Clinic B1");
  unitSolo = await mkUnit(hospSolo, "Clinic Solo");
  unitSolo2 = await mkUnit(hospSolo2, "Clinic Solo2");

  // Users
  userInA1 = await mkUser("ac-inA1");
  userInB1 = await mkUser("ac-inB1");
  userGroupAdminA = await mkUser("ac-gaA");
  userSolo = await mkUser("ac-solo");
  userPlatform = await mkUser("ac-plat", { isPlatformAdmin: true });
  userNoRoles = await mkUser("ac-none");

  await mkRole(userInA1, hospA1, unitA1, "admin");
  await mkRole(userInB1, hospB1, unitB1, "admin");
  await mkRole(userGroupAdminA, hospA1, unitA1, "group_admin");
  await mkRole(userSolo, hospSolo, unitSolo, "admin");
});

afterAll(async () => {
  if (createdPatientIds.length) {
    await db
      .delete(patients)
      .where(inArray(patients.id, createdPatientIds))
      .catch(() => {});
  }
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

// ---------------------------------------------------------------------------
// canAccessHospitalInGroup — unit matrix
// ---------------------------------------------------------------------------
describe("canAccessHospitalInGroup — unit matrix", () => {
  it("same hospital: allows regardless of group", async () => {
    const ok = await canAccessHospitalInGroup(
      hospA1,
      hospA1,
      [{ hospitalId: hospA1, role: "admin" }],
      false,
    );
    expect(ok).toBe(true);
  });

  it("same hospital, ungrouped: still allows", async () => {
    const ok = await canAccessHospitalInGroup(
      hospSolo,
      hospSolo,
      [{ hospitalId: hospSolo, role: "admin" }],
      false,
    );
    expect(ok).toBe(true);
  });

  it("different hospitals, same group, user has role at active: allows", async () => {
    // User is active at hospA1 (group A), resource lives at hospA2 (group A).
    const ok = await canAccessHospitalInGroup(
      hospA1,
      hospA2,
      [{ hospitalId: hospA1, role: "admin" }],
      false,
    );
    expect(ok).toBe(true);
  });

  it("different hospitals, both ungrouped: denies", async () => {
    const denied = await canAccessHospitalInGroup(
      hospSolo,
      hospSolo2,
      [{ hospitalId: hospSolo, role: "admin" }],
      false,
    );
    expect(denied).toBe(false);
  });

  it("different hospitals, one grouped one not: denies", async () => {
    const denied = await canAccessHospitalInGroup(
      hospSolo,
      hospA1,
      [{ hospitalId: hospSolo, role: "admin" }],
      false,
    );
    expect(denied).toBe(false);

    // Also the reverse: active in group, resource ungrouped.
    const denied2 = await canAccessHospitalInGroup(
      hospA1,
      hospSolo,
      [{ hospitalId: hospA1, role: "admin" }],
      false,
    );
    expect(denied2).toBe(false);
  });

  it("different hospitals in different groups: denies", async () => {
    const denied = await canAccessHospitalInGroup(
      hospA1,
      hospB1,
      [{ hospitalId: hospA1, role: "admin" }],
      false,
    );
    expect(denied).toBe(false);
  });

  it("group_admin role at another hospital in resource's group: allows (no role at resource)", async () => {
    // Active at hospSolo (ungrouped, unrelated), but user has group_admin at
    // hospA1 (group A) and resource is at hospA2 (group A).
    const ok = await canAccessHospitalInGroup(
      hospSolo,
      hospA2,
      [{ hospitalId: hospA1, role: "group_admin" }],
      false,
    );
    expect(ok).toBe(true);
  });

  it("group_admin role at hospital in a DIFFERENT group: denies (group-specific)", async () => {
    // User has group_admin at hospA1 (group A). Resource lives at hospB1 (group B).
    const denied = await canAccessHospitalInGroup(
      hospA1,
      hospB1,
      [{ hospitalId: hospA1, role: "group_admin" }],
      false,
    );
    expect(denied).toBe(false);
  });

  it("group_admin is group-specific: does NOT leak across groups", async () => {
    // group_admin at hospB1 (group B) should not help reach hospA1 (group A).
    const denied = await canAccessHospitalInGroup(
      hospSolo,
      hospA1,
      [{ hospitalId: hospB1, role: "group_admin" }],
      false,
    );
    expect(denied).toBe(false);
  });

  it("platform admin: allows any request", async () => {
    // Platform admin bypass, regardless of active/resource mix.
    const a = await canAccessHospitalInGroup(hospSolo, hospA1, [], true);
    expect(a).toBe(true);
    const b = await canAccessHospitalInGroup(hospA1, hospB1, [], true);
    expect(b).toBe(true);
    const c = await canAccessHospitalInGroup(hospSolo, hospSolo2, [], true);
    expect(c).toBe(true);
  });

  it("no active hospital, user has group_admin in resource's group: allows", async () => {
    const ok = await canAccessHospitalInGroup(
      null,
      hospA2,
      [{ hospitalId: hospA1, role: "group_admin" }],
      false,
    );
    expect(ok).toBe(true);
  });

  it("no active hospital, only non-group-admin roles, different-hospital resource: denies", async () => {
    // Without an active hospital, same-group implicit access can't fire (the
    // spec ties that path to the currently-active hospital).
    const denied = await canAccessHospitalInGroup(
      null,
      hospA2,
      [{ hospitalId: hospA1, role: "admin" }],
      false,
    );
    expect(denied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// userIsGroupAdminForHospital — lookup helper for Task 13 wiring
// ---------------------------------------------------------------------------
describe("userIsGroupAdminForHospital", () => {
  it("returns true when user has group_admin at a hospital sharing the target's group", async () => {
    const ok = await userIsGroupAdminForHospital(userGroupAdminA, hospA2);
    expect(ok).toBe(true);
  });

  it("returns true when user has group_admin at the target hospital itself", async () => {
    const ok = await userIsGroupAdminForHospital(userGroupAdminA, hospA1);
    expect(ok).toBe(true);
  });

  it("returns false when target hospital is ungrouped (no group to admin)", async () => {
    const out = await userIsGroupAdminForHospital(userGroupAdminA, hospSolo);
    expect(out).toBe(false);
  });

  it("returns false when user holds group_admin only in a different group", async () => {
    const out = await userIsGroupAdminForHospital(userGroupAdminA, hospB1);
    expect(out).toBe(false);
  });

  it("returns false when user has no group_admin role anywhere", async () => {
    const out = await userIsGroupAdminForHospital(userInA1, hospA2);
    expect(out).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// userHasGroupAwareHospitalAccess — middleware-layer check
// ---------------------------------------------------------------------------
describe("userHasGroupAwareHospitalAccess", () => {
  it("direct-role match at resource: allowed (ungrouped fast path)", async () => {
    const ok = await userHasGroupAwareHospitalAccess(userSolo, hospSolo);
    expect(ok).toBe(true);
  });

  it("user in same group, active hospital header present: allowed", async () => {
    const req = { headers: { "x-active-hospital-id": hospA1 } };
    const ok = await userHasGroupAwareHospitalAccess(userInA1, hospA2, req);
    expect(ok).toBe(true);
  });

  it("user in same group, no active header: denied (spec: same-group requires active context)", async () => {
    // Plain in-A1 user, no active header, trying to reach A2. With only a
    // regular role (not group_admin), this should fall through to denied.
    const out = await userHasGroupAwareHospitalAccess(userInA1, hospA2, {});
    expect(out).toBe(false);
  });

  it("group_admin: allowed regardless of active hospital", async () => {
    // No active header. group_admin at hospA1 reaching hospA2 still allowed.
    const ok = await userHasGroupAwareHospitalAccess(
      userGroupAdminA,
      hospA2,
      {},
    );
    expect(ok).toBe(true);
  });

  it("different group entirely: denied", async () => {
    const req = { headers: { "x-active-hospital-id": hospA1 } };
    const out = await userHasGroupAwareHospitalAccess(userInA1, hospB1, req);
    expect(out).toBe(false);
  });

  it("user with no roles, not platform admin: denied", async () => {
    const req = { headers: { "x-active-hospital-id": hospA1 } };
    const out = await userHasGroupAwareHospitalAccess(userNoRoles, hospA1, req);
    expect(out).toBe(false);
  });

  it("platform admin: allowed everywhere", async () => {
    const out = await userHasGroupAwareHospitalAccess(userPlatform, hospB1, {});
    expect(out).toBe(true);
  });

  it("memo reuses cached groupId within the same request", async () => {
    // First call populates cache; second call should read from memo. We can't
    // easily assert DB-hit counts without deeper instrumentation, so instead
    // we just confirm the cache survives between two helper invocations that
    // share a req object (smoke-test).
    const req: any = { headers: { "x-active-hospital-id": hospA1 } };
    await userHasGroupAwareHospitalAccess(userInA1, hospA2, req);
    expect(req._groupCache).toBeDefined();
    expect(req._groupCache.hospitalToGroup.get(hospA2)).toBe(groupA);
    expect(req._groupCache.hospitalToGroup.get(hospA1)).toBe(groupA);
    // Second call shouldn't crash and should stay allowed.
    const ok2 = await userHasGroupAwareHospitalAccess(userInA1, hospA2, req);
    expect(ok2).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: GET /api/items/:itemId/codes under group-aware access.
//
// Why items? `requireResourceAccess('itemId')` resolves the hospital from the
// resource itself (ignores `X-Active-Hospital-Id`) and then runs the
// group-aware access check. That's the cleanest cross-location path: an item
// lives at exactly one hospital, so crossing a group boundary is a real test
// of the middleware.
//
// (GET /api/patients/:id has its own inline access check that task 7 rewires,
// so we don't exercise it here.)
// ---------------------------------------------------------------------------
describe("integration: requireResourceAccess (GET /api/items/:itemId/codes) — group-aware", () => {
  let itemInA2: string;
  let itemInSolo: string;

  beforeAll(async () => {
    // Item at hospA2 (group A) — cross-location target.
    const [i1] = await db
      .insert(items)
      .values({
        hospitalId: hospA2,
        unitId: unitA2,
        name: "ac-test-item-A2",
        unit: "Pack",
      } as any)
      .returning();
    itemInA2 = i1.id;

    // Item at hospSolo — ungrouped sanity check.
    const [i2] = await db
      .insert(items)
      .values({
        hospitalId: hospSolo,
        unitId: unitSolo,
        name: "ac-test-item-SOLO",
        unit: "Pack",
      } as any)
      .returning();
    itemInSolo = i2.id;
  });

  afterAll(async () => {
    if (itemInA2 || itemInSolo) {
      await db
        .delete(items)
        .where(inArray(items.id, [itemInA2, itemInSolo]))
        .catch(() => {});
    }
  });

  function buildApp(userId: string) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: userId };
      next();
    });
    app.use(itemsRouter);
    return app;
  }

  it("direct role at the item's hospital: 200 (no regression for ungrouped)", async () => {
    const app = buildApp(userSolo);
    const res = await request(app).get(`/api/items/${itemInSolo}/codes`);
    expect(res.status).toBe(200);
  });

  it("same-group cross-location: user at hospA1 reaches item at hospA2 when active header is A1 — 200", async () => {
    const app = buildApp(userInA1);
    const res = await request(app)
      .get(`/api/items/${itemInA2}/codes`)
      .set("x-active-hospital-id", hospA1);
    expect(res.status).toBe(200);
  });

  it("different group: user at hospB1 cannot reach item at hospA2 — 403", async () => {
    const app = buildApp(userInB1);
    const res = await request(app)
      .get(`/api/items/${itemInA2}/codes`)
      .set("x-active-hospital-id", hospB1);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("RESOURCE_ACCESS_DENIED");
  });

  it("ungrouped user cannot reach item in a group: 403", async () => {
    const app = buildApp(userSolo);
    const res = await request(app)
      .get(`/api/items/${itemInA2}/codes`)
      .set("x-active-hospital-id", hospSolo);
    expect(res.status).toBe(403);
  });

  it("group_admin user reaches an item at another hospital in the group even without a direct role there — 200", async () => {
    // userGroupAdminA has role at hospA1 (group_admin). Item lives at hospA2
    // (same group). Expect 200 via the group_admin escalation path.
    const app = buildApp(userGroupAdminA);
    const res = await request(app)
      .get(`/api/items/${itemInA2}/codes`)
      .set("x-active-hospital-id", hospA1);
    expect(res.status).toBe(200);
  });

  it("platform admin: 200 everywhere", async () => {
    const app = buildApp(userPlatform);
    const res = await request(app).get(`/api/items/${itemInA2}/codes`);
    expect(res.status).toBe(200);
  });
});

// Smoke integration check for the patient list route — same-hospital only, no
// cross-location scope here (task 5 handles list scope). This guards against
// the group-aware refactor accidentally breaking single-hospital reads.
describe("integration: GET /api/patients (same-hospital regression)", () => {
  function buildApp(userId: string) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: userId };
      next();
    });
    app.use(patientsRouter);
    return app;
  }

  it("ungrouped user querying own hospital still works: 200", async () => {
    const app = buildApp(userSolo);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospSolo}`)
      .set("x-active-hospital-id", hospSolo);
    expect(res.status).toBe(200);
  });

  it("user at hospA1 querying own hospital: 200", async () => {
    const app = buildApp(userInA1);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA1}`)
      .set("x-active-hospital-id", hospA1);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Important Fix 1: `requireWriteAccess` / `requireStrictWriteAccess` must be
// group-aware. A group_admin at hospital A in group G should be able to write
// to resources at hospital B (also in G) even without a direct role there.
// Regression: previously `requireWriteAccess` called `userHasHospitalAccess`
// (direct-role only), making reads and writes asymmetric.
// ---------------------------------------------------------------------------
describe("requireWriteAccess — group-aware", () => {
  function buildWriteApp(userId: string) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: userId };
      next();
    });
    // POST handler guarded by requireWriteAccess — we just echo OK.
    app.post(
      "/write/:hospitalId",
      requireWriteAccess,
      (req: any, res: any) => {
        res.json({
          ok: true,
          resolvedHospitalId: req.resolvedHospitalId,
          resolvedRole: req.resolvedRole,
        });
      },
    );
    return app;
  }

  function buildStrictWriteApp(userId: string) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: userId };
      next();
    });
    app.post(
      "/strict-write/:hospitalId",
      requireStrictWriteAccess,
      (req: any, res: any) => {
        res.json({
          ok: true,
          resolvedHospitalId: req.resolvedHospitalId,
          resolvedRole: req.resolvedRole,
        });
      },
    );
    // Route without :hospitalId param and no body — tests the "strict fails
    // when hospitalId cannot be resolved" branch.
    app.post(
      "/strict-write-no-hospital",
      requireStrictWriteAccess,
      (_req: any, res: any) => {
        res.json({ ok: true });
      },
    );
    return app;
  }

  // Important: `resolveHospitalIdFromRequest` honors the `X-Active-Hospital-Id`
  // header FIRST (once validated), then falls through to `:hospitalId` param
  // or resource lookup. To test cross-hospital writes (where the resolver
  // lands on a hospital different from the user's active one), we must either
  // omit the header or send it pointing at the same hospital as the target.
  // That mimics the real-world case: an internal route like
  // `PATCH /api/items/:itemId` sits behind `requireStrictHospitalAccess` +
  // write middleware, where the resolver finds the hospital via the item
  // resource — NOT the active header.

  it("group_admin at A in group G can POST to resource at B (same group) — 200", async () => {
    // userGroupAdminA has role "group_admin" at hospA1 (group A). NO direct
    // role at hospA2. We deliberately omit `x-active-hospital-id` so the
    // resolver lands on the :hospitalId param (hospA2). Previously this
    // returned 403 because requireWriteAccess called `userHasHospitalAccess`
    // (direct-role only). Now must return 200 via group-aware path.
    const app = buildWriteApp(userGroupAdminA);
    const res = await request(app).post(`/write/${hospA2}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.resolvedHospitalId).toBe(hospA2);
    expect(res.body.resolvedRole).toBe("group_admin");
  });

  it("group_admin strict-write at B (same group, no direct role) — 200", async () => {
    const app = buildStrictWriteApp(userGroupAdminA);
    const res = await request(app).post(`/strict-write/${hospA2}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.resolvedHospitalId).toBe(hospA2);
    expect(res.body.resolvedRole).toBe("group_admin");
  });

  it("ungrouped tenants: admin at Solo writing to Solo2 still denied", async () => {
    // userSolo has admin at hospSolo (ungrouped). hospSolo2 is a separate
    // ungrouped tenant. Cross-tenant writes must stay denied — the group
    // rewrite should not inadvertently leak access across unrelated tenants.
    // Omit the active header so the resolver lands on :hospitalId (hospSolo2).
    const app = buildWriteApp(userSolo);
    const res = await request(app).post(`/write/${hospSolo2}`).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("HOSPITAL_ACCESS_DENIED");
  });

  it("ungrouped tenants (strict): admin at Solo writing Solo2 still denied", async () => {
    const app = buildStrictWriteApp(userSolo);
    const res = await request(app).post(`/strict-write/${hospSolo2}`).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("HOSPITAL_ACCESS_DENIED");
  });

  it("regression: direct-role user writing to own hospital still works", async () => {
    // userInA1 has "admin" at hospA1. Writing to hospA1 should continue to
    // resolve role via getActiveRoleFromRequest and succeed.
    const app = buildWriteApp(userInA1);
    const res = await request(app)
      .post(`/write/${hospA1}`)
      .set("x-active-hospital-id", hospA1)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.resolvedRole).toBe("admin");
  });

  it("cross-group write: user at hospA1 cannot POST to hospB1 — 403", async () => {
    // Omit the active header so the resolver lands on :hospitalId (hospB1).
    // userInA1 has admin at hospA1 but no role at hospB1 and no shared group.
    const app = buildWriteApp(userInA1);
    const res = await request(app).post(`/write/${hospB1}`).send({});
    expect(res.status).toBe(403);
  });

  it("strict write: missing hospitalId → 400", async () => {
    const app = buildStrictWriteApp(userInA1);
    const res = await request(app).post(`/strict-write-no-hospital`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("HOSPITAL_ID_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// Important Fix 2: `X-Active-Hospital-Id` header validation. A forged header
// pointing at a hospital the user doesn't have a direct role at (but that
// shares a group with one they do) must NOT be treated as the caller's
// resolved hospital. Instead, `resolveHospitalIdFromRequest` must fall
// through to the body/params/resource lookup.
// ---------------------------------------------------------------------------
describe("resolveHospitalIdFromRequest — forged-header fall-through", () => {
  function buildApp(userId: string) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: userId };
      next();
    });
    app.get(
      "/read/:hospitalId",
      requireHospitalAccess,
      (req: any, res: any) => {
        res.json({
          ok: true,
          resolvedHospitalId: req.resolvedHospitalId,
        });
      },
    );
    return app;
  }

  it("forged header pointing at a hospital user has no role at: resolvedHospitalId falls through to :hospitalId param", async () => {
    // userGroupAdminA has ONE row: group_admin at hospA1 (group A). They have
    // NO direct role at hospA2, even though A1 and A2 share the group.
    //
    // If they forge the header to X-Active-Hospital-Id=hospA2 while reading
    // a resource at hospA1, we must NOT trust the header as the caller's
    // "home" hospital — they have no role at hospA2. Instead the resolver
    // must fall through to :hospitalId (the route param) = hospA1, which is
    // where they do have a role.
    //
    // Access should still succeed (they have group_admin at hospA1, which is
    // the :hospitalId param and also where the resource is).
    const app = buildApp(userGroupAdminA);
    const res = await request(app)
      .get(`/read/${hospA1}`)
      .set("x-active-hospital-id", hospA2); // forged
    expect(res.status).toBe(200);
    // Critical: resolvedHospitalId is the real resource hospital (hospA1),
    // not the forged header value (hospA2). Downstream handlers that stamp
    // `createdByHospitalId = req.resolvedHospitalId` won't be tricked.
    expect(res.body.resolvedHospitalId).toBe(hospA1);
  });

  it("valid header (user has role there): resolvedHospitalId honors header", async () => {
    // userGroupAdminA does have a role at hospA1 — header is not forged.
    const app = buildApp(userGroupAdminA);
    const res = await request(app)
      .get(`/read/${hospA2}`) // resource at hospA2, valid read via group
      .set("x-active-hospital-id", hospA1); // legit active hospital
    expect(res.status).toBe(200);
    // No :hospitalId ambiguity here — the route param matches resource, and
    // the header is trusted because user has a role at hospA1.
    //
    // The order of the resolver is: (1) trusted header → (2) params/body.
    // Since header is trusted, resolvedHospitalId === hospA1 (the header).
    expect(res.body.resolvedHospitalId).toBe(hospA1);
  });
});
