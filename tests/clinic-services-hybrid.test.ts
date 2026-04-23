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
  clinicServices,
} from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Task 8 — hybrid service catalog (group or hospital scope).
 *
 * Covers:
 *   - Storage helpers (`getClinicServicesForHospital`, `getClinicServicesForGroupScope`)
 *     return the correct union / intersection.
 *   - Route-level write permission splits:
 *       * `scope=hospital` POST unchanged, usable by hospital admin.
 *       * `scope=group` POST gated by group_admin + active hospital has group.
 *       * PATCH on a group service requires group_admin.
 *       * PATCH rejects any scope-change attempt (hospitalId -> groupId or vice versa).
 *       * DELETE on a group service requires group_admin.
 *   - XOR check constraint spot-check (raw insert of both hospital_id and group_id).
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import clinicRouter from "../server/routes/clinic";
import {
  getClinicServicesForHospital,
  getClinicServicesForGroupScope,
} from "../server/storage/clinic";

const uniq = () => randomUUID().slice(0, 8);

let groupG: string;
let hospA: string;
let hospB: string;
let hospSolo: string;
let unitA: string;
let unitB: string;
let unitSolo: string;

// Users
let userHospitalAdminA: string; // admin at hospA (no group_admin)
let userGroupAdminG: string; // group_admin at hospA (in group G)
let userSoloAdmin: string; // admin at hospSolo (no group)

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];
const createdServiceIds: string[] = [];

/**
 * Build a mini express app that injects a fixed user-id header and mounts the
 * clinic router. The `X-Active-Hospital-Id` header drives
 * `requireStrictHospitalAccess`, matching how the real client attaches the
 * active-hospital context.
 */
function buildApp(userId: string, activeHospitalId: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: userId };
    // resolveHospitalIdFromRequest reads `x-active-hospital-id` first; inject
    // the header lower-case since Node lowercases all headers anyway.
    req.headers["x-active-hospital-id"] = activeHospitalId;
    next();
  });
  app.use(clinicRouter);
  return app;
}

async function mkHospital(name: string, groupId: string | null) {
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId } as any)
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

async function mkUser(prefix: string) {
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

async function insertHospitalService(hospitalId: string, unitId: string, name: string) {
  const [s] = await db
    .insert(clinicServices)
    .values({ hospitalId, unitId, name } as any)
    .returning();
  createdServiceIds.push(s.id);
  return s;
}

async function insertGroupService(groupId: string, name: string) {
  const [s] = await db
    .insert(clinicServices)
    .values({ groupId, hospitalId: null, unitId: null, name } as any)
    .returning();
  createdServiceIds.push(s.id);
  return s;
}

beforeAll(async () => {
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: `svc-g-${uniq()}` } as any)
    .returning();
  groupG = g.id;
  createdGroupIds.push(groupG);

  hospA = await mkHospital(`SVC_A_${uniq()}`, groupG);
  hospB = await mkHospital(`SVC_B_${uniq()}`, groupG);
  hospSolo = await mkHospital(`SVC_SOLO_${uniq()}`, null);

  unitA = await mkUnit(hospA, "Clinic A");
  unitB = await mkUnit(hospB, "Clinic B");
  unitSolo = await mkUnit(hospSolo, "Clinic Solo");

  userHospitalAdminA = await mkUser("svc-hadmin");
  userGroupAdminG = await mkUser("svc-gadmin");
  userSoloAdmin = await mkUser("svc-solo");

  await mkRole(userHospitalAdminA, hospA, unitA, "admin");
  // group_admin role is scoped via the role row at a hospital in the group.
  await mkRole(userGroupAdminG, hospA, unitA, "group_admin");
  await mkRole(userSoloAdmin, hospSolo, unitSolo, "admin");
});

afterAll(async () => {
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
// Storage-level union queries
// ---------------------------------------------------------------------------
describe("getClinicServicesForHospital / getClinicServicesForGroupScope", () => {
  it("returns local + group services at a grouped hospital", async () => {
    const s1 = await insertHospitalService(hospA, unitA, `Local-A-${uniq()}`);
    const s2 = await insertGroupService(groupG, `Group-Service-${uniq()}`);

    const atA = await getClinicServicesForHospital(hospA);
    const ids = atA.map((s) => s.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
  });

  it("returns only group services at a sister hospital with no local rows", async () => {
    const gs = await insertGroupService(groupG, `GroupOnly-${uniq()}`);

    const atB = await getClinicServicesForHospital(hospB);
    const ids = atB.map((s) => s.id);
    expect(ids).toContain(gs.id);
    // hospB has no hospital_id rows of its own in this test setup, so any row
    // present in the result must carry groupId.
    for (const row of atB) {
      expect(row.groupId).toBe(groupG);
      expect(row.hospitalId).toBeNull();
    }
  });

  it("ungrouped hospital only sees its own local services (no regression)", async () => {
    const localSolo = await insertHospitalService(hospSolo, unitSolo, `Solo-${uniq()}`);

    const atSolo = await getClinicServicesForHospital(hospSolo);
    const ids = atSolo.map((s) => s.id);
    expect(ids).toContain(localSolo.id);
    // A solo hospital must NOT pick up group services even when they exist —
    // the second branch of the OR resolves to false when groupId is null.
    for (const row of atSolo) {
      expect(row.hospitalId).toBe(hospSolo);
      expect(row.groupId).toBeNull();
    }
  });

  it("group-scope query returns only rows with that groupId", async () => {
    const gs = await insertGroupService(groupG, `GroupOnlyList-${uniq()}`);
    const rows = await getClinicServicesForGroupScope(groupG);
    const ids = rows.map((s) => s.id);
    expect(ids).toContain(gs.id);
    for (const r of rows) {
      expect(r.groupId).toBe(groupG);
      expect(r.hospitalId).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/clinic/:hospitalId/services — scope gating
// ---------------------------------------------------------------------------
describe("POST /api/clinic/:hospitalId/services", () => {
  it("scope=hospital (default): hospital admin creates a local service", async () => {
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app)
      .post(`/api/clinic/${hospA}/services`)
      .send({
        name: `Hosp-Srv-${uniq()}`,
        unitId: unitA,
        price: "10.00",
        durationMinutes: 15,
      });
    expect(res.status).toBe(201);
    expect(res.body.hospitalId).toBe(hospA);
    expect(res.body.groupId).toBeNull();
    createdServiceIds.push(res.body.id);
  });

  it("scope=group by non-group-admin: 403", async () => {
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app)
      .post(`/api/clinic/${hospA}/services`)
      .send({
        scope: "group",
        name: `Should-Fail-${uniq()}`,
        price: "20.00",
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_ADMIN_REQUIRED");
  });

  it("scope=group by group-admin: 201, inserted with groupId and null hospitalId/unitId", async () => {
    const app = buildApp(userGroupAdminG, hospA);
    const res = await request(app)
      .post(`/api/clinic/${hospA}/services`)
      .send({
        scope: "group",
        name: `Grp-Srv-${uniq()}`,
        price: "30.00",
        durationMinutes: 20,
        // Attempt to sneak in a hospitalId — server must strip it.
        hospitalId: hospA,
        unitId: unitA,
      });
    expect(res.status).toBe(201);
    expect(res.body.groupId).toBe(groupG);
    expect(res.body.hospitalId).toBeNull();
    expect(res.body.unitId).toBeNull();
    createdServiceIds.push(res.body.id);
  });

  it("scope=group by group-admin at an un-grouped hospital: 400", async () => {
    // Grant the group-admin user a temporary role at an ungrouped hospital so
    // the access middleware lets them through; the route itself must reject.
    const roleId = await mkRole(userGroupAdminG, hospSolo, unitSolo, "admin");
    try {
      const app = buildApp(userGroupAdminG, hospSolo);
      const res = await request(app)
        .post(`/api/clinic/${hospSolo}/services`)
        .send({
          scope: "group",
          name: `Should-Fail-Ungrouped-${uniq()}`,
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("HOSPITAL_HAS_NO_GROUP");
    } finally {
      await db.delete(userHospitalRoles).where(eq(userHospitalRoles.id, roleId));
    }
  });

  it("scope=hospital with stray groupId in body is stripped (defensive, not 400)", async () => {
    // Hospital-scope creates explicitly null out groupId. The body's stray
    // groupId must not survive to the DB (XOR constraint would otherwise fire).
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app)
      .post(`/api/clinic/${hospA}/services`)
      .send({
        name: `Hosp-Srv-Stray-${uniq()}`,
        unitId: unitA,
        groupId: groupG, // should be ignored
      });
    expect(res.status).toBe(201);
    expect(res.body.hospitalId).toBe(hospA);
    expect(res.body.groupId).toBeNull();
    createdServiceIds.push(res.body.id);
  });
});

// ---------------------------------------------------------------------------
// PATCH — write permission split + scope immutability
// ---------------------------------------------------------------------------
describe("PATCH /api/clinic/:hospitalId/services/:serviceId", () => {
  it("hospital admin CAN edit a hospital service", async () => {
    const svc = await insertHospitalService(hospA, unitA, `Edit-Local-${uniq()}`);
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app)
      .patch(`/api/clinic/${hospA}/services/${svc.id}`)
      .send({ price: "99.00" });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe("99.00");
  });

  it("hospital admin CANNOT edit a group service (403)", async () => {
    const gs = await insertGroupService(groupG, `Edit-Grp-${uniq()}`);
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app)
      .patch(`/api/clinic/${hospA}/services/${gs.id}`)
      .send({ price: "42.00" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_ADMIN_REQUIRED");
  });

  it("group_admin CAN edit a group service", async () => {
    const gs = await insertGroupService(groupG, `Edit-Grp-Ok-${uniq()}`);
    const app = buildApp(userGroupAdminG, hospA);
    const res = await request(app)
      .patch(`/api/clinic/${hospA}/services/${gs.id}`)
      .send({ price: "55.00" });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe("55.00");
  });

  it("rejects scope change via explicit groupId on a hospital service (400)", async () => {
    const svc = await insertHospitalService(hospA, unitA, `Scope-Lock-${uniq()}`);
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app)
      .patch(`/api/clinic/${hospA}/services/${svc.id}`)
      .send({ groupId: groupG });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SCOPE_IMMUTABLE");
  });

  it("rejects scope change via explicit hospitalId on a group service (400)", async () => {
    const gs = await insertGroupService(groupG, `Scope-Lock-G-${uniq()}`);
    const app = buildApp(userGroupAdminG, hospA);
    const res = await request(app)
      .patch(`/api/clinic/${hospA}/services/${gs.id}`)
      .send({ hospitalId: hospA });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SCOPE_IMMUTABLE");
  });

  it("rejects `scope` field mismatch (400)", async () => {
    const svc = await insertHospitalService(hospA, unitA, `Scope-Field-${uniq()}`);
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app)
      .patch(`/api/clinic/${hospA}/services/${svc.id}`)
      .send({ scope: "group" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SCOPE_IMMUTABLE");
  });
});

// ---------------------------------------------------------------------------
// DELETE — write permission split
// ---------------------------------------------------------------------------
describe("DELETE /api/clinic/:hospitalId/services/:serviceId", () => {
  it("group_admin CAN delete a group service (204)", async () => {
    const gs = await insertGroupService(groupG, `Del-Grp-${uniq()}`);
    const app = buildApp(userGroupAdminG, hospA);
    const res = await request(app).delete(`/api/clinic/${hospA}/services/${gs.id}`);
    expect(res.status).toBe(204);
    // Remove from our cleanup list — row is gone.
    const idx = createdServiceIds.indexOf(gs.id);
    if (idx >= 0) createdServiceIds.splice(idx, 1);
  });

  it("hospital admin CANNOT delete a group service (403)", async () => {
    const gs = await insertGroupService(groupG, `Del-Grp-Block-${uniq()}`);
    const app = buildApp(userHospitalAdminA, hospA);
    const res = await request(app).delete(`/api/clinic/${hospA}/services/${gs.id}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_ADMIN_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// XOR check constraint — spot-check
// ---------------------------------------------------------------------------
describe("clinic_services XOR check constraint", () => {
  it("raw insert with both hospital_id AND group_id is rejected", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO clinic_services (hospital_id, group_id, name)
            VALUES (${hospA}, ${groupG}, ${`XOR-Fail-${uniq()}`})`,
      ),
    ).rejects.toThrow();
  });
});
