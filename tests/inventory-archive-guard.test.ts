import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  units,
  userHospitalRoles,
  users,
  items,
  medicationConfigs,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Archive guard: an item still wired to medication_configs MUST NOT be
 * archivable, full stop. The route returns 409 ITEM_HAS_MED_CONFIGS with
 * enough detail for the UI to explain the decoupling steps. There is no
 * `force` bypass — historically there was, and someone clicked through it
 * (Fentanyl 2026-04-29 incident), so the escape hatch is gone.
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

// requireWriteAccess does a real DB lookup for the user's hospital role and
// also resolves hospitalId from the request — for the guard test we just need
// it to let writes through.
vi.mock("../server/utils/accessControl", async () => {
  const actual = await vi.importActual<typeof import("../server/utils/accessControl")>(
    "../server/utils/accessControl",
  );
  return {
    ...actual,
    requireWriteAccess: (_req: any, _res: any, next: any) => next(),
    getUserUnitForHospital: async (_userId: string, _hospitalId: string) => "stub-unit",
    hasLogisticsAccess: async () => true,
  };
});

import inventoryRouter from "../server/routes/inventory";

const uniq = () => randomUUID().slice(0, 8);

let hospId: string;
let unitId: string;
let userId: string;
let itemWithConfigId: string;
let itemPlainId: string;
let configId: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdItemIds: string[] = [];
const createdConfigIds: string[] = [];

function buildApp(uid: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: uid };
    next();
  });
  app.use(inventoryRouter);
  return app;
}

beforeAll(async () => {
  const [h] = await db.insert(hospitals).values({ name: `IAG_${uniq()}` } as any).returning();
  hospId = h.id;
  createdHospitalIds.push(hospId);

  const [u] = await db
    .insert(units)
    .values({ hospitalId: hospId, name: "Anesthesia", type: "anesthesia" } as any)
    .returning();
  unitId = u.id;
  createdUnitIds.push(unitId);

  const [usr] = await db
    .insert(users)
    .values({
      id: `iag-${uniq()}`,
      email: `${uniq()}@test.invalid`,
      firstName: "Arch",
      lastName: "Guard",
      isPlatformAdmin: false,
    } as any)
    .returning();
  userId = usr.id;
  createdUserIds.push(userId);

  const [role] = await db
    .insert(userHospitalRoles)
    .values({ userId, hospitalId: hospId, unitId, role: "manager" } as any)
    .returning();
  createdRoleIds.push(role.id);

  const [itm1] = await db
    .insert(items)
    .values({
      hospitalId: hospId,
      unitId,
      name: `Wired Item ${uniq()}`,
      unit: "Single unit",
      packSize: 10,
      status: "active",
    } as any)
    .returning();
  itemWithConfigId = itm1.id;
  createdItemIds.push(itemWithConfigId);

  const [itm2] = await db
    .insert(items)
    .values({
      hospitalId: hospId,
      unitId,
      name: `Plain Item ${uniq()}`,
      unit: "Single unit",
      status: "active",
    } as any)
    .returning();
  itemPlainId = itm2.id;
  createdItemIds.push(itemPlainId);

  const [cfg] = await db
    .insert(medicationConfigs)
    .values({
      itemId: itemWithConfigId,
      medicationGroup: "Opioide",
      administrationGroup: "Bolus",
      defaultDose: "100",
    } as any)
    .returning();
  configId = cfg.id;
  createdConfigIds.push(configId);
});

afterAll(async () => {
  if (createdConfigIds.length) {
    await db.delete(medicationConfigs).where(inArray(medicationConfigs.id, createdConfigIds)).catch(() => {});
  }
  if (createdItemIds.length) {
    await db.delete(items).where(inArray(items.id, createdItemIds)).catch(() => {});
  }
  if (createdRoleIds.length) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds)).catch(() => {});
  }
  if (createdUnitIds.length) {
    await db.delete(units).where(inArray(units.id, createdUnitIds)).catch(() => {});
  }
  if (createdHospitalIds.length) {
    await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds)).catch(() => {});
  }
  if (createdUserIds.length) {
    await db.delete(users).where(inArray(users.id, createdUserIds)).catch(() => {});
  }
  await pool.end();
});

describe("PATCH /api/items/:itemId — archive guard", () => {
  it("rejects status=archived with 409 ITEM_HAS_MED_CONFIGS when a medication config still references the item", async () => {
    const app = buildApp(userId);
    const res = await request(app)
      .patch(`/api/items/${itemWithConfigId}`)
      .send({ status: "archived" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ITEM_HAS_MED_CONFIGS");
    expect(res.body.count).toBe(1);
    expect(res.body.adminGroups).toContain("Bolus");
    expect(res.body.configs).toEqual([
      { id: configId, administrationGroup: "Bolus", medicationGroup: "Opioide" },
    ]);
  });

  it("does NOT honor a force=true bypass (the escape hatch was removed)", async () => {
    const app = buildApp(userId);
    const res = await request(app)
      .patch(`/api/items/${itemWithConfigId}`)
      .send({ status: "archived", force: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ITEM_HAS_MED_CONFIGS");
  });

  it("archives once every medication config is decoupled", async () => {
    await db.delete(medicationConfigs).where(inArray(medicationConfigs.id, [configId]));
    const app = buildApp(userId);
    const res = await request(app)
      .patch(`/api/items/${itemWithConfigId}`)
      .send({ status: "archived" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("archived");
  });

  it("archives an item that never had configurations attached", async () => {
    const app = buildApp(userId);
    const res = await request(app)
      .patch(`/api/items/${itemPlainId}`)
      .send({ status: "archived" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("archived");
  });
});
