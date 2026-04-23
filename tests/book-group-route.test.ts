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
  clinicServiceProviders,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Task 9 — /book/g/:token public group-booking flow.
 *
 * Covers:
 *   - GET /api/public/group-booking/:token returns { group, hospitals }
 *     with all group members, in deterministic (alphabetical) order.
 *   - Invalid token → 404 + GROUP_NOT_FOUND.
 *   - Group services surface on the per-hospital `/book/:token/services`
 *     endpoint for every member location.
 *   - Provider-for-service filtering: for a group service linked to
 *     providers at multiple locations, each hospital's bookable list
 *     returns only its own providers. Multi-location providers appear
 *     once per location (no duplicates).
 */

// Bypass auth: the public booking endpoints don't use it, but importing the
// clinic router pulls in its middleware chain. Match the pattern used in
// clinic-services-hybrid.test.ts.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import clinicRouter from "../server/routes/clinic";

const uniq = () => randomUUID().slice(0, 8);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(clinicRouter);
  return app;
}

// Ordered test state shared across the `describe` blocks.
let groupId: string;
let groupName: string;
let groupBookingToken: string;
let hospAId: string; // "Astra"  — alphabetically first
let hospBId: string; // "Bellini"
let hospCId: string; // "Corona" — no providers, used for order test
let hospAToken: string;
let hospBToken: string;
let unitAId: string;
let unitBId: string;
let unitCId: string;
let providerP1Id: string; // bookable at hospA only
let providerP2Id: string; // bookable at hospB only
let providerUMultiId: string; // bookable at both hospA and hospB
let groupServiceId: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];
const createdServiceIds: string[] = [];
const createdServiceProviderRows: Array<{ serviceId: string; providerId: string }> = [];

async function mkHospital(name: string, groupId: string | null) {
  const suffix = uniq();
  const bookingToken = `bt-${suffix}`;
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId, bookingToken } as any)
    .returning();
  createdHospitalIds.push(h.id);
  return { id: h.id, bookingToken };
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
    } as any)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}

async function mkRole(
  userId: string,
  hospitalId: string,
  unitId: string,
  opts: { role?: string; bookable?: boolean; publicCalendar?: boolean } = {},
) {
  const [r] = await db
    .insert(userHospitalRoles)
    .values({
      userId,
      hospitalId,
      unitId,
      role: opts.role ?? "doctor",
      isBookable: opts.bookable ?? true,
      publicCalendarEnabled: opts.publicCalendar ?? true,
    } as any)
    .returning();
  createdRoleIds.push(r.id);
  return r.id;
}

async function mkGroupService(groupId: string, name: string) {
  const [s] = await db
    .insert(clinicServices)
    .values({ groupId, hospitalId: null, unitId: null, name } as any)
    .returning();
  createdServiceIds.push(s.id);
  return s.id;
}

async function linkServiceProvider(serviceId: string, providerId: string) {
  await db
    .insert(clinicServiceProviders)
    .values({ serviceId, providerId } as any);
  createdServiceProviderRows.push({ serviceId, providerId });
}

beforeAll(async () => {
  groupName = `bg-grp-${uniq()}`;
  groupBookingToken = `gbt-${uniq()}-${uniq()}`;
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: groupName, bookingToken: groupBookingToken } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  // Deterministic alphabetical ordering: A < B < C.
  const a = await mkHospital(`Astra-${uniq()}`, groupId);
  hospAId = a.id;
  hospAToken = a.bookingToken;
  const b = await mkHospital(`Bellini-${uniq()}`, groupId);
  hospBId = b.id;
  hospBToken = b.bookingToken;
  const c = await mkHospital(`Corona-${uniq()}`, groupId);
  hospCId = c.id;

  unitAId = await mkUnit(hospAId, "Clinic A");
  unitBId = await mkUnit(hospBId, "Clinic B");
  unitCId = await mkUnit(hospCId, "Clinic C");

  providerP1Id = await mkUser("p1");
  providerP2Id = await mkUser("p2");
  providerUMultiId = await mkUser("umulti");

  // P1 only at A, P2 only at B, U at both A and B (multi-location).
  await mkRole(providerP1Id, hospAId, unitAId);
  await mkRole(providerP2Id, hospBId, unitBId);
  await mkRole(providerUMultiId, hospAId, unitAId);
  await mkRole(providerUMultiId, hospBId, unitBId);

  // One group-owned service; all three providers linked to it.
  groupServiceId = await mkGroupService(groupId, `Botox-${uniq()}`);
  await linkServiceProvider(groupServiceId, providerP1Id);
  await linkServiceProvider(groupServiceId, providerP2Id);
  await linkServiceProvider(groupServiceId, providerUMultiId);
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
// GET /api/public/group-booking/:token
// ---------------------------------------------------------------------------
describe("GET /api/public/group-booking/:token", () => {
  it("returns group + hospitals for a valid token", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/group-booking/${groupBookingToken}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.group).toEqual({ id: groupId, name: groupName });
    expect(Array.isArray(res.body.hospitals)).toBe(true);
    const ids = res.body.hospitals.map((h: any) => h.id);
    expect(ids).toContain(hospAId);
    expect(ids).toContain(hospBId);
    expect(ids).toContain(hospCId);
  });

  it("returns hospitals in alphabetical order", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/group-booking/${groupBookingToken}`,
    );
    expect(res.status).toBe(200);
    const names = res.body.hospitals.map((h: any) => h.name);
    // Our seed prefixes are Astra- / Bellini- / Corona- so sorted names match
    // the insertion order.
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it("surfaces each hospital's booking token so the client can forward", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/group-booking/${groupBookingToken}`,
    );
    expect(res.status).toBe(200);
    const tokens = res.body.hospitals.map((h: any) => h.bookingToken);
    expect(tokens).toContain(hospAToken);
    expect(tokens).toContain(hospBToken);
  });

  it("returns 404 + GROUP_NOT_FOUND for an invalid token", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/group-booking/does-not-exist-${uniq()}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("GROUP_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Group service + provider-filter behaviour at each member location
// ---------------------------------------------------------------------------
describe("per-location provider filter for a group service", () => {
  it("/api/public/booking/:token/services at hospital A lists the group service with only A's providers", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/booking/${hospAToken}/services`,
    );
    expect(res.status).toBe(200);
    const svc = (res.body.services as any[]).find((s) => s.id === groupServiceId);
    expect(svc).toBeDefined();
    expect(svc.providerIds).toContain(providerP1Id);
    expect(svc.providerIds).toContain(providerUMultiId);
    expect(svc.providerIds).not.toContain(providerP2Id);
    // Multi-location provider should appear once, not twice.
    const dupCount = svc.providerIds.filter(
      (id: string) => id === providerUMultiId,
    ).length;
    expect(dupCount).toBe(1);
  });

  it("same query at hospital B returns only B's providers for the same service", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/booking/${hospBToken}/services`,
    );
    expect(res.status).toBe(200);
    const svc = (res.body.services as any[]).find((s) => s.id === groupServiceId);
    expect(svc).toBeDefined();
    expect(svc.providerIds).toContain(providerP2Id);
    expect(svc.providerIds).toContain(providerUMultiId);
    expect(svc.providerIds).not.toContain(providerP1Id);
    const dupCount = svc.providerIds.filter(
      (id: string) => id === providerUMultiId,
    ).length;
    expect(dupCount).toBe(1);
  });

  it("/api/public/booking/:token at hospital A exposes A's providers only", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/booking/${hospAToken}`,
    );
    expect(res.status).toBe(200);
    const ids = (res.body.providers as any[]).map((p) => p.id);
    expect(ids).toContain(providerP1Id);
    expect(ids).toContain(providerUMultiId);
    expect(ids).not.toContain(providerP2Id);
    // De-dup: U has roles at A and B; the hospitalId filter pins this
    // response to A, so U appears exactly once.
    expect(ids.filter((id) => id === providerUMultiId).length).toBe(1);
  });

  it("/api/public/booking/:token at hospital B exposes B's providers only", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/public/booking/${hospBToken}`,
    );
    expect(res.status).toBe(200);
    const ids = (res.body.providers as any[]).map((p) => p.id);
    expect(ids).toContain(providerP2Id);
    expect(ids).toContain(providerUMultiId);
    expect(ids).not.toContain(providerP1Id);
    expect(ids.filter((id) => id === providerUMultiId).length).toBe(1);
  });
});
