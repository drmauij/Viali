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
  surgeries,
  anesthesiaRecords,
  anesthesiaMedications,
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

  it("rejects archive when only historical dose entries reference the item (no config)", async () => {
    // Build a minimal surgery → record → dose chain pointing at a fresh item
    // that has zero medication_configs. The history-only branch must still
    // block the archive because the cascade would silently sever the chart.
    const [historyItem] = await db
      .insert(items)
      .values({
        hospitalId: hospId,
        unitId,
        name: `Hist Only ${uniq()}`,
        unit: "Single unit",
        status: "active",
      } as any)
      .returning();
    createdItemIds.push(historyItem.id);

    const [surgery] = await db
      .insert(surgeries)
      .values({ hospitalId: hospId, plannedDate: new Date() } as any)
      .returning();
    const [record] = await db
      .insert(anesthesiaRecords)
      .values({ surgeryId: surgery.id, caseStatus: "closed" } as any)
      .returning();
    const [med] = await db
      .insert(anesthesiaMedications)
      .values({
        anesthesiaRecordId: record.id,
        itemId: historyItem.id,
        timestamp: new Date(),
        type: "bolus",
        dose: "100",
        unit: "mg",
      } as any)
      .returning();

    try {
      const app = buildApp(userId);
      const res = await request(app)
        .patch(`/api/items/${historyItem.id}`)
        .send({ status: "archived" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ITEM_HAS_MED_CONFIGS");
      expect(res.body.count).toBe(0);
      expect(res.body.historyCount).toBe(1);
      expect(res.body.configs).toEqual([]);
    } finally {
      // Clean up so afterAll's broader cascade doesn't see orphaned rows.
      await db.delete(anesthesiaMedications).where(inArray(anesthesiaMedications.id, [med.id])).catch(() => {});
      await db.delete(anesthesiaRecords).where(inArray(anesthesiaRecords.id, [record.id])).catch(() => {});
      await db.delete(surgeries).where(inArray(surgeries.id, [surgery.id])).catch(() => {});
    }
  });
});

describe("POST /api/items/bulk-delete — same guard", () => {
  // Bulk-delete hard-DELETEs items + cascades onto medication_configs and
  // anesthesia_medications, so an unguarded delete is even more destructive
  // than archiving. Same hard block applies — and the response includes the
  // structured "blocked" array so the client can render specifics.
  let blockedItemId: string;
  let plainItemId: string;
  let blockedConfigId: string;

  beforeAll(async () => {
    const [itm1] = await db
      .insert(items)
      .values({
        hospitalId: hospId,
        unitId,
        name: `Bulk Wired ${uniq()}`,
        unit: "Single unit",
        status: "active",
      } as any)
      .returning();
    blockedItemId = itm1.id;
    createdItemIds.push(blockedItemId);

    const [itm2] = await db
      .insert(items)
      .values({
        hospitalId: hospId,
        unitId,
        name: `Bulk Plain ${uniq()}`,
        unit: "Single unit",
        status: "active",
      } as any)
      .returning();
    plainItemId = itm2.id;
    createdItemIds.push(plainItemId);

    const [cfg] = await db
      .insert(medicationConfigs)
      .values({
        itemId: blockedItemId,
        medicationGroup: "Hypnotika",
        administrationGroup: "Perfusoren",
        defaultDose: "5",
      } as any)
      .returning();
    blockedConfigId = cfg.id;
    createdConfigIds.push(blockedConfigId);
  });

  it("returns 409 + blocked[] when any item has a medication config", async () => {
    const app = buildApp(userId);
    const res = await request(app)
      .post(`/api/items/bulk-delete`)
      .send({ itemIds: [blockedItemId, plainItemId] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ITEMS_HAVE_MED_CONFIGS");
    expect(res.body.blocked).toHaveLength(1);
    expect(res.body.blocked[0]).toMatchObject({
      id: blockedItemId,
      count: 1,
      adminGroups: ["Perfusoren"],
    });
    // The non-blocked item still gets deleted in the same batch — the guard
    // is per-item, not all-or-nothing.
    expect(res.body.deletedCount).toBe(1);
    expect(res.body.results.deleted).toContain(plainItemId);
  });

  it("succeeds once the configs are decoupled", async () => {
    await db
      .delete(medicationConfigs)
      .where(inArray(medicationConfigs.id, [blockedConfigId]));
    const app = buildApp(userId);
    const res = await request(app)
      .post(`/api/items/bulk-delete`)
      .send({ itemIds: [blockedItemId] });
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(1);
  });

  it("blocks bulk-delete when only historical dose entries reference the item", async () => {
    // Same shape as the archive history-only test: item has no config but has
    // one anesthesia_medications row, so deleteItem's cascade would wipe chart
    // history. Bulk-delete must refuse and report historyCount in blocked[].
    const [histItem] = await db
      .insert(items)
      .values({
        hospitalId: hospId,
        unitId,
        name: `Bulk Hist ${uniq()}`,
        unit: "Single unit",
        status: "active",
      } as any)
      .returning();
    createdItemIds.push(histItem.id);

    const [surgery] = await db
      .insert(surgeries)
      .values({ hospitalId: hospId, plannedDate: new Date() } as any)
      .returning();
    const [record] = await db
      .insert(anesthesiaRecords)
      .values({ surgeryId: surgery.id, caseStatus: "closed" } as any)
      .returning();
    const [med] = await db
      .insert(anesthesiaMedications)
      .values({
        anesthesiaRecordId: record.id,
        itemId: histItem.id,
        timestamp: new Date(),
        type: "bolus",
        dose: "50",
        unit: "mg",
      } as any)
      .returning();

    try {
      const app = buildApp(userId);
      const res = await request(app)
        .post(`/api/items/bulk-delete`)
        .send({ itemIds: [histItem.id] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ITEMS_HAVE_MED_CONFIGS");
      expect(res.body.blocked).toHaveLength(1);
      expect(res.body.blocked[0]).toMatchObject({
        id: histItem.id,
        count: 0,
        historyCount: 1,
      });
      expect(res.body.deletedCount).toBe(0);
    } finally {
      await db.delete(anesthesiaMedications).where(inArray(anesthesiaMedications.id, [med.id])).catch(() => {});
      await db.delete(anesthesiaRecords).where(inArray(anesthesiaRecords.id, [record.id])).catch(() => {});
      await db.delete(surgeries).where(inArray(surgeries.id, [surgery.id])).catch(() => {});
    }
  });
});
