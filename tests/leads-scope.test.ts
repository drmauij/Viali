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
  leads,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Task 13: Funnels page leads tab — "This clinic" / "All locations" scope
 * toggle for the three leads read endpoints that power the page:
 *   - GET /api/business/:hospitalId/leads
 *   - GET /api/business/:hospitalId/leads-stats
 *   - GET /api/business/:hospitalId/leads-export.csv (accepts scope via header
 *     OR `?scope=group` query param — the CSV is fetched via <a href>, which
 *     cannot set a custom header)
 *
 * Covers:
 *   - scope=hospital at A returns only A's seeded leads.
 *   - scope=group as group-access user returns A+B combined.
 *   - scope=group at an un-grouped tenant silently falls back.
 *   - scope=group as a non-group user: 403 with GROUP_SCOPE_FORBIDDEN.
 *   - CSV export ?scope=group path widens the row set.
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import leadsRouter from "../server/routes/leads";

const uniq = () => randomUUID().slice(0, 8);

let groupId: string;
let altGroupId: string;
let hospA: string;
let hospB: string;
let hospSolo: string;
let hospAltGroup: string;

let unitA: string;
let unitB: string;
let unitSolo: string;
let unitAltGroup: string;

let userManagerInA: string;
let userManagerInSolo: string;
let userManagerInAltGroup: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdGroupIds: string[] = [];
const createdLeadIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(leadsRouter);
  return app;
}

async function mkHospital(name: string, gid?: string | null) {
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId: gid ?? null } as any)
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

async function mkLead(hospitalId: string, source: string) {
  const [l] = await db
    .insert(leads)
    .values({
      hospitalId,
      firstName: `First-${uniq()}`,
      lastName: `Last-${uniq()}`,
      email: `${uniq()}@test.invalid`,
      source,
      status: "new",
    } as any)
    .returning();
  createdLeadIds.push(l.id);
  return l.id;
}

beforeAll(async () => {
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: `lds-group-G-${uniq()}` } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  const [g2] = await db
    .insert(hospitalGroups)
    .values({ name: `lds-group-alt-${uniq()}` } as any)
    .returning();
  altGroupId = g2.id;
  createdGroupIds.push(altGroupId);

  hospA = await mkHospital(`LDS_A_${uniq()}`, groupId);
  hospB = await mkHospital(`LDS_B_${uniq()}`, groupId);
  hospSolo = await mkHospital(`LDS_SOLO_${uniq()}`);
  hospAltGroup = await mkHospital(`LDS_ALT_${uniq()}`, altGroupId);

  unitA = await mkUnit(hospA, "Clinic A");
  unitB = await mkUnit(hospB, "Clinic B");
  unitSolo = await mkUnit(hospSolo, "Clinic Solo");
  unitAltGroup = await mkUnit(hospAltGroup, "Clinic Alt");

  userManagerInA = await mkUser("lds-inA");
  userManagerInSolo = await mkUser("lds-solo");
  userManagerInAltGroup = await mkUser("lds-alt");

  await mkRole(userManagerInA, hospA, unitA, "manager");
  await mkRole(userManagerInSolo, hospSolo, unitSolo, "manager");
  await mkRole(userManagerInAltGroup, hospAltGroup, unitAltGroup, "manager");

  // 3 leads each at A (source="ig") and B (source="fb") to have
  // distinguishable sources in assertions.
  for (let i = 0; i < 3; i++) {
    await mkLead(hospA, "ig");
    await mkLead(hospB, "fb");
  }
  // 1 lead at the solo tenant.
  await mkLead(hospSolo, "ig");
});

afterAll(async () => {
  if (createdLeadIds.length) {
    await db.delete(leads).where(inArray(leads.id, createdLeadIds)).catch(() => {});
  }
  if (createdRoleIds.length) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds)).catch(() => {});
  }
  if (createdUnitIds.length) {
    await db.delete(units).where(inArray(units.id, createdUnitIds)).catch(() => {});
  }
  if (createdHospitalIds.length) {
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
    await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds)).catch(() => {});
  }
  if (createdGroupIds.length) {
    await db.delete(hospitalGroups).where(inArray(hospitalGroups.id, createdGroupIds)).catch(() => {});
  }
  if (createdUserIds.length) {
    await db.delete(users).where(inArray(users.id, createdUserIds)).catch(() => {});
  }
  await pool.end();
});

describe("GET /api/business/:hospitalId/leads — scope toggle (Funnels)", () => {
  it("scope=hospital at active=A returns only A's 3 seeded leads (ig only)", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads?limit=100`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    const ours = (res.body as any[]).filter((l) => createdLeadIds.includes(l.id));
    const aRows = ours.filter((l) => l.source === "ig");
    const bRows = ours.filter((l) => l.source === "fb");
    expect(aRows.length).toBeGreaterThanOrEqual(3);
    expect(bRows.length).toBe(0);
  });

  it("scope=group at active=A returns A+B combined (picks up B's fb rows)", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads?limit=100`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    const ours = (res.body as any[]).filter((l) => createdLeadIds.includes(l.id));
    const bRows = ours.filter((l) => l.source === "fb");
    expect(bRows.length).toBeGreaterThanOrEqual(3);
  });

  it("scope=group at un-grouped tenant silently falls back to hospital scope", async () => {
    const app = buildApp(userManagerInSolo);
    const res = await request(app)
      .get(`/api/business/${hospSolo}/leads?limit=100`)
      .set("X-Active-Hospital-Id", hospSolo)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    // The solo tenant has 1 seeded lead; grouped leads (A, B) MUST NOT leak.
    const ours = (res.body as any[]).filter((l) => createdLeadIds.includes(l.id));
    // Every row returned must belong to hospSolo (the helper falls back to it)
    const aLeak = ours.filter((l) => l.hospitalId === hospA);
    const bLeak = ours.filter((l) => l.hospitalId === hospB);
    expect(aLeak.length).toBe(0);
    expect(bLeak.length).toBe(0);
  });

  it("scope=group as user outside the target group: 403 from middleware", async () => {
    const app = buildApp(userManagerInAltGroup);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads?limit=100`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/business/:hospitalId/leads-stats — scope toggle (Funnels)", () => {
  it("scope=hospital returns only A's contribution to `total`", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads-stats`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    const byIg = (res.body.bySource as any[]).find((r) => r.source === "ig");
    // A's 3 ig rows are at least counted; we don't assert absence of others
    // because the table may contain pre-existing test data.
    expect(byIg?.count ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("scope=group widens total to >= A+B contribution", async () => {
    const app = buildApp(userManagerInA);
    const hospRes = await request(app)
      .get(`/api/business/${hospA}/leads-stats`)
      .set("X-Active-Hospital-Id", hospA);
    const hospTotal = hospRes.body.total as number;

    const groupRes = await request(app)
      .get(`/api/business/${hospA}/leads-stats`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(groupRes.status).toBe(200);
    expect(groupRes.body.total).toBeGreaterThanOrEqual(hospTotal + 3);
  });

  it("scope=group as non-group user: 403", async () => {
    const app = buildApp(userManagerInAltGroup);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads-stats`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/business/:hospitalId/leads-export.csv — scope via query fallback", () => {
  it("no scope → only A's rows in CSV", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads-export.csv`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const csv = res.text;
    // A's leads carry source=ig; B's carry source=fb. Under scope=hospital
    // no B rows should leak.
    const fbCount = (csv.match(/,fb,/g) ?? []).length;
    expect(fbCount).toBe(0);
  });

  it("?scope=group (query param) → A+B rows in CSV", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads-export.csv?scope=group`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    const csv = res.text;
    // At least B's 3 fb rows must be present when the group scope fallback
    // kicks in.
    const fbCount = (csv.match(/,fb,/g) ?? []).length;
    expect(fbCount).toBeGreaterThanOrEqual(3);
  });

  it("X-Active-Scope header alone also widens CSV (in case a client can set it)", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads-export.csv`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    const fbCount = (res.text.match(/,fb,/g) ?? []).length;
    expect(fbCount).toBeGreaterThanOrEqual(3);
  });

  it("?scope=group as non-group user: 403 on CSV too", async () => {
    const app = buildApp(userManagerInAltGroup);
    const res = await request(app)
      .get(`/api/business/${hospA}/leads-export.csv?scope=group`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(403);
  });
});
