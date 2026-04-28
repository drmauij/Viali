import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../../server/db";
import {
  contractTemplates,
  hospitals,
  hospitalGroups,
  units,
  users,
  userHospitalRoles,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// Bypass real Google session auth — same pattern used in chain-locations-crud,
// admin-groups-routes, treatments-routes, etc.
vi.mock("../../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import contractTemplatesRouter from "../../server/routes/contractTemplates";

// ---------------------------------------------------------------------------
// App factory — injects req.user so downstream middlewares can read req.user.id
// ---------------------------------------------------------------------------
function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(contractTemplatesRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const uniq = () => randomUUID().slice(0, 8);

let groupId: string;
let hospId: string;
let unitId: string;
let managerUserId: string;
let plainUserId: string;
let chainAdminUserId: string;

// Cross-tenant fixtures — a second, completely separate hospital+chain
let otherGroupId: string;
let otherHospId: string;
let otherUnitId: string;
let otherManagerUserId: string;
/** A template owned by the other hospital (different chain) */
let foreignHospitalTemplateId: string;
/** A template owned by the other chain */
let foreignChainTemplateId: string;
/** Separate cleanup list for foreign-tenant templates (not mixed into createdTemplateIds) */
const foreignTemplateCleanupIds: string[] = [];

const createdTemplateIds: string[] = [];
const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];

beforeAll(async () => {
  // Create a hospital group (chain)
  const [g] = await db
    .insert(hospitalGroups)
    .values({
      name: `TestChain-${uniq()}`,
      defaultLicenseType: "test",
      defaultPricePerRecord: "5.00",
    } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  // Create a hospital in that group
  const [h] = await db
    .insert(hospitals)
    .values({ name: `TestHosp-${uniq()}`, groupId } as any)
    .returning();
  hospId = h.id;
  createdHospitalIds.push(hospId);

  // Unit required for role rows
  const [u] = await db
    .insert(units)
    .values({ hospitalId: hospId, name: "Default", type: "clinic" } as any)
    .returning();
  unitId = u.id;
  createdUnitIds.push(unitId);

  // Manager user (has 'manager' role at the hospital)
  const [mu] = await db
    .insert(users)
    .values({ email: `mgr-${uniq()}@test.test` } as any)
    .returning();
  managerUserId = mu.id;
  createdUserIds.push(managerUserId);
  const [mr] = await db
    .insert(userHospitalRoles)
    .values({ userId: managerUserId, hospitalId: hospId, unitId, role: "manager" } as any)
    .returning();
  createdRoleIds.push(mr.id);

  // Plain user (no role at the hospital — used for 403 assertions)
  const [pu] = await db
    .insert(users)
    .values({ email: `plain-${uniq()}@test.test` } as any)
    .returning();
  plainUserId = pu.id;
  createdUserIds.push(plainUserId);

  // Chain admin user (group_admin role at the hospital belonging to the group)
  const [cu] = await db
    .insert(users)
    .values({ email: `cadmin-${uniq()}@test.test` } as any)
    .returning();
  chainAdminUserId = cu.id;
  createdUserIds.push(chainAdminUserId);
  const [cr] = await db
    .insert(userHospitalRoles)
    .values({ userId: chainAdminUserId, hospitalId: hospId, unitId, role: "group_admin" } as any)
    .returning();
  createdRoleIds.push(cr.id);

  // ── Cross-tenant setup: a totally separate chain + hospital ──────────────

  const [og] = await db
    .insert(hospitalGroups)
    .values({
      name: `OtherChain-${uniq()}`,
      defaultLicenseType: "test",
      defaultPricePerRecord: "5.00",
    } as any)
    .returning();
  otherGroupId = og.id;
  createdGroupIds.push(otherGroupId);

  const [oh] = await db
    .insert(hospitals)
    .values({ name: `OtherHosp-${uniq()}`, groupId: otherGroupId } as any)
    .returning();
  otherHospId = oh.id;
  createdHospitalIds.push(otherHospId);

  const [ou] = await db
    .insert(units)
    .values({ hospitalId: otherHospId, name: "Default", type: "clinic" } as any)
    .returning();
  otherUnitId = ou.id;
  createdUnitIds.push(otherUnitId);

  const [omu] = await db
    .insert(users)
    .values({ email: `othermgr-${uniq()}@test.test` } as any)
    .returning();
  otherManagerUserId = omu.id;
  createdUserIds.push(otherManagerUserId);
  const [omr] = await db
    .insert(userHospitalRoles)
    .values({ userId: otherManagerUserId, hospitalId: otherHospId, unitId: otherUnitId, role: "manager" } as any)
    .returning();
  createdRoleIds.push(omr.id);

  // Create a template owned by the other hospital (foreign to hospId)
  const [ft] = await db
    .insert(contractTemplates)
    .values({
      ownerHospitalId: otherHospId,
      ownerChainId: null,
      name: `ForeignHospTemplate-${uniq()}`,
      language: "de",
      status: "active",
      blocks: [],
      variables: { simple: [], selectableLists: [] },
    } as any)
    .returning();
  foreignHospitalTemplateId = ft.id;
  // NOTE: do NOT push to createdTemplateIds — these are foreign-tenant rows,
  // tracked separately to avoid poisoning the shared cleanup array.
  foreignTemplateCleanupIds.push(foreignHospitalTemplateId);

  // Create a template owned by the other chain (foreign to groupId)
  const [fct] = await db
    .insert(contractTemplates)
    .values({
      ownerChainId: otherGroupId,
      ownerHospitalId: null,
      name: `ForeignChainTemplate-${uniq()}`,
      language: "de",
      status: "active",
      blocks: [],
      variables: { simple: [], selectableLists: [] },
    } as any)
    .returning();
  foreignChainTemplateId = fct.id;
  foreignTemplateCleanupIds.push(foreignChainTemplateId);
});

afterAll(async () => {
  if (createdTemplateIds.length) {
    await db
      .delete(contractTemplates)
      .where(inArray(contractTemplates.id, createdTemplateIds));
  }
  if (foreignTemplateCleanupIds.length) {
    await db
      .delete(contractTemplates)
      .where(inArray(contractTemplates.id, foreignTemplateCleanupIds));
  }
  if (createdRoleIds.length) {
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.id, createdRoleIds));
  }
  if (createdUserIds.length) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  if (createdUnitIds.length) {
    await db.delete(units).where(inArray(units.id, createdUnitIds));
  }
  if (createdHospitalIds.length) {
    await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds));
  }
  if (createdGroupIds.length) {
    await db
      .delete(hospitalGroups)
      .where(inArray(hospitalGroups.id, createdGroupIds));
  }
  await pool.end();
});

// ---------------------------------------------------------------------------
// Hospital-scoped CRUD
// ---------------------------------------------------------------------------

describe("POST /api/business/:hospitalId/contract-templates — create", () => {
  it("returns 403 when user has no role at hospital", async () => {
    const res = await request(buildApp(plainUserId))
      .post(`/api/business/${hospId}/contract-templates`)
      .send({ name: "Blocked Template" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates`)
      .send({ description: "no name" });
    expect(res.status).toBe(400);
  });

  it("creates a template and returns 201", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates`)
      .send({ name: "Employment Agreement", language: "de" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("Employment Agreement");
    expect(res.body.ownerHospitalId).toBe(hospId);
    expect(res.body.ownerChainId).toBeNull();
    expect(res.body.status).toBe("draft");
    createdTemplateIds.push(res.body.id);
  });
});

describe("GET /api/business/:hospitalId/contract-templates — list", () => {
  it("returns 403 for user without access", async () => {
    const res = await request(buildApp(plainUserId)).get(
      `/api/business/${hospId}/contract-templates`,
    );
    expect(res.status).toBe(403);
  });

  it("returns an array including newly created template", async () => {
    const res = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((t: any) => t.id);
    expect(ids).toContain(createdTemplateIds[0]);
  });
});

describe("GET /api/business/:hospitalId/contract-templates/:id — single", () => {
  it("returns 404 for non-existent id", async () => {
    const res = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates/${randomUUID()}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns the template by id", async () => {
    const tmplId = createdTemplateIds[0];
    const res = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates/${tmplId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tmplId);
  });
});

describe("PATCH /api/business/:hospitalId/contract-templates/:id — update", () => {
  it("returns 400 for invalid field value", async () => {
    const tmplId = createdTemplateIds[0];
    const res = await request(buildApp(managerUserId))
      .patch(`/api/business/${hospId}/contract-templates/${tmplId}`)
      .send({ language: "xx" }); // not a valid enum value
    expect(res.status).toBe(400);
  });

  it("patches the name and status", async () => {
    const tmplId = createdTemplateIds[0];
    const res = await request(buildApp(managerUserId))
      .patch(`/api/business/${hospId}/contract-templates/${tmplId}`)
      .send({ name: "Updated Agreement", status: "active" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Agreement");
    expect(res.body.status).toBe("active");
  });
});

describe("POST /api/business/:hospitalId/contract-templates/:id/clone — clone", () => {
  it("returns 404 when source template does not exist", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates/${randomUUID()}/clone`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("clones a template with a custom name", async () => {
    const tmplId = createdTemplateIds[0];
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates/${tmplId}/clone`)
      .send({ name: "Agreement Clone" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Agreement Clone");
    expect(res.body.ownerHospitalId).toBe(hospId);
    expect(res.body.status).toBe("draft"); // clones always start as draft
    createdTemplateIds.push(res.body.id);
  });

  it("clones a template with a default generated name when name is omitted", async () => {
    const tmplId = createdTemplateIds[0];
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates/${tmplId}/clone`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.name).toMatch(/\(copy\)$/);
    createdTemplateIds.push(res.body.id);
  });
});

describe("POST /api/business/:hospitalId/contract-templates/:id/archive — archive", () => {
  it("archives a template and returns 204", async () => {
    // Create a fresh template to archive so it doesn't break other tests
    const createRes = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates`)
      .send({ name: "To Archive" });
    expect(createRes.status).toBe(201);
    const tmplId = createRes.body.id;
    createdTemplateIds.push(tmplId);

    const archiveRes = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates/${tmplId}/archive`)
      .send();
    expect(archiveRes.status).toBe(204);

    // Archived template should no longer appear in the list
    const listRes = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates`,
    );
    const ids = listRes.body.map((t: any) => t.id);
    expect(ids).not.toContain(tmplId);
  });
});

// ---------------------------------------------------------------------------
// Chain-scoped routes
// ---------------------------------------------------------------------------

describe("Chain-scoped CRUD (/api/chain/:groupId/contract-templates)", () => {
  let chainTemplateId: string;

  it("returns 403 when user is not chain admin", async () => {
    const res = await request(buildApp(plainUserId)).get(
      `/api/chain/${groupId}/contract-templates`,
    );
    expect(res.status).toBe(403);
  });

  it("creates a chain-owned template", async () => {
    const res = await request(buildApp(chainAdminUserId))
      .post(`/api/chain/${groupId}/contract-templates`)
      .send({ name: "Chain Standard Agreement", language: "en" });
    expect(res.status).toBe(201);
    expect(res.body.ownerChainId).toBe(groupId);
    expect(res.body.ownerHospitalId).toBeNull();
    chainTemplateId = res.body.id;
    createdTemplateIds.push(chainTemplateId);
  });

  it("lists chain templates", async () => {
    const res = await request(buildApp(chainAdminUserId)).get(
      `/api/chain/${groupId}/contract-templates`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((t: any) => t.id);
    expect(ids).toContain(chainTemplateId);
  });

  it("fetches a single chain template by id", async () => {
    const res = await request(buildApp(chainAdminUserId)).get(
      `/api/chain/${groupId}/contract-templates/${chainTemplateId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(chainTemplateId);
  });

  it("patches a chain template", async () => {
    const res = await request(buildApp(chainAdminUserId))
      .patch(`/api/chain/${groupId}/contract-templates/${chainTemplateId}`)
      .send({ name: "Chain Standard Agreement v2" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Chain Standard Agreement v2");
  });

  it("clones a chain template into chain scope", async () => {
    const res = await request(buildApp(chainAdminUserId))
      .post(`/api/chain/${groupId}/contract-templates/${chainTemplateId}/clone`)
      .send({ name: "Chain Clone" });
    expect(res.status).toBe(201);
    expect(res.body.ownerChainId).toBe(groupId);
    createdTemplateIds.push(res.body.id);
  });

  it("archives a chain template and returns 204", async () => {
    // Create a disposable chain template
    const createRes = await request(buildApp(chainAdminUserId))
      .post(`/api/chain/${groupId}/contract-templates`)
      .send({ name: "Chain To Archive" });
    expect(createRes.status).toBe(201);
    const tmplId = createRes.body.id;
    createdTemplateIds.push(tmplId);

    const archiveRes = await request(buildApp(chainAdminUserId))
      .post(`/api/chain/${groupId}/contract-templates/${tmplId}/archive`)
      .send();
    expect(archiveRes.status).toBe(204);
  });

  it("hospital-scoped list includes chain templates visible to the hospital", async () => {
    // The hospital belongs to the group, so chain-owned templates should show up
    const res = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates`,
    );
    expect(res.status).toBe(200);
    const ids = res.body.map((t: any) => t.id);
    expect(ids).toContain(chainTemplateId);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant authorization
// ---------------------------------------------------------------------------

describe("Cross-tenant: hospital-scoped routes reject foreign templates", () => {
  it("GET single — Hospital A manager cannot fetch a template owned by Hospital B (returns 403)", async () => {
    const res = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates/${foreignHospitalTemplateId}`,
    );
    expect(res.status).toBe(403);
  });

  it("PATCH — Hospital A manager cannot update a template owned by Hospital B (returns 403)", async () => {
    const res = await request(buildApp(managerUserId))
      .patch(`/api/business/${hospId}/contract-templates/${foreignHospitalTemplateId}`)
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("Clone — Hospital A manager cannot clone a template owned by Hospital B (returns 403)", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates/${foreignHospitalTemplateId}/clone`)
      .send({ name: "Stolen Clone" });
    expect(res.status).toBe(403);
  });

  it("Archive — Hospital A manager cannot archive a template owned by Hospital B (returns 403)", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates/${foreignHospitalTemplateId}/archive`)
      .send();
    expect(res.status).toBe(403);
  });

  it("GET single — Hospital A manager cannot fetch a template owned by a foreign chain (returns 403)", async () => {
    const res = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates/${foreignChainTemplateId}`,
    );
    expect(res.status).toBe(403);
  });

  it("PATCH — Hospital A manager cannot update a template owned by a foreign chain (returns 403)", async () => {
    const res = await request(buildApp(managerUserId))
      .patch(`/api/business/${hospId}/contract-templates/${foreignChainTemplateId}`)
      .send({ name: "Hacked Chain Template" });
    expect(res.status).toBe(403);
  });
});

describe("Cross-tenant: chain-scoped routes reject templates not owned by that chain", () => {
  it("GET single — Chain A admin cannot fetch a template owned by Chain B (returns 403)", async () => {
    const res = await request(buildApp(chainAdminUserId)).get(
      `/api/chain/${groupId}/contract-templates/${foreignChainTemplateId}`,
    );
    expect(res.status).toBe(403);
  });

  it("PATCH — Chain A admin cannot update a template owned by Chain B (returns 403)", async () => {
    const res = await request(buildApp(chainAdminUserId))
      .patch(`/api/chain/${groupId}/contract-templates/${foreignChainTemplateId}`)
      .send({ name: "Chain Hacked" });
    expect(res.status).toBe(403);
  });
});

describe("Cross-tenant: hospital-scoped access to own chain templates is allowed", () => {
  let ownChainTemplateId: string;

  beforeAll(async () => {
    // Create a chain-owned template for the hospital's own chain
    const [t] = await db
      .insert(contractTemplates)
      .values({
        ownerChainId: groupId,
        ownerHospitalId: null,
        name: `OwnChainTemplate-${uniq()}`,
        language: "de",
        status: "active",
        blocks: [],
        variables: { simple: [], selectableLists: [] },
      } as any)
      .returning();
    ownChainTemplateId = t.id;
    createdTemplateIds.push(ownChainTemplateId);
  });

  it("Hospital A manager CAN GET a template owned by Hospital A's own chain (returns 200)", async () => {
    const res = await request(buildApp(managerUserId)).get(
      `/api/business/${hospId}/contract-templates/${ownChainTemplateId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ownChainTemplateId);
  });

  it("Hospital A manager CAN clone a template owned by Hospital A's own chain (returns 201)", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates/${ownChainTemplateId}/clone`)
      .send({ name: "Own Chain Clone" });
    expect(res.status).toBe(201);
    expect(res.body.ownerHospitalId).toBe(hospId);
    createdTemplateIds.push(res.body.id);
  });
});
