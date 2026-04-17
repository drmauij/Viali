import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  serviceFolders,
  clinicServices,
  userHospitalRoles,
  hospitals,
  units,
} from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";

// Mock isAuthenticated so supertest requests bypass Google auth. `req.user.id`
// is injected by a middleware in `buildApp()` below; the downstream access
// control middlewares (`requireStrictHospitalAccess`, `requireWriteAccess`)
// run for real against the DB.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import clinicRouter from "../server/routes/clinic";

// Known-good test data in the local dev DB
const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const TEST_USER_ID = "J6E7BoJZUGNyrd_yxnrg2"; // demo@viali.app — admin on all units
const TEST_UNIT_ID = "a1e99123-37b3-4434-828b-de1ab368b08e"; // "Clinic" unit

// For the cross-hospital test we stand up a second hospital + unit + role.
let OTHER_HOSPITAL_ID: string;
let OTHER_UNIT_ID: string;
let OTHER_ROLE_ID: string;

const createdFolderIds: string[] = [];
const createdServiceIds: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject an authenticated test user
  app.use((req: any, _res, next) => {
    req.user = { id: TEST_USER_ID };
    next();
  });
  app.use(clinicRouter);
  return app;
}

/** Seed a clinic_services row directly (routes don't cover creation). */
async function seedService(
  name: string,
  opts: { hospitalId?: string; unitId?: string; folderId?: string | null } = {},
): Promise<string> {
  const [row] = await db
    .insert(clinicServices)
    .values({
      hospitalId: opts.hospitalId ?? TEST_HOSPITAL_ID,
      unitId: opts.unitId ?? TEST_UNIT_ID,
      name,
      price: "100.00",
      folderId: opts.folderId ?? null,
    } as any)
    .returning();
  createdServiceIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  // Create a second hospital + unit + admin role for the cross-hospital test.
  const [otherHospital] = await db
    .insert(hospitals)
    .values({ name: `TEST_OTHER_HOSPITAL_${Date.now()}` })
    .returning();
  OTHER_HOSPITAL_ID = otherHospital.id;

  const [otherUnit] = await db
    .insert(units)
    .values({
      hospitalId: OTHER_HOSPITAL_ID,
      name: "Clinic",
      type: "clinic",
    } as any)
    .returning();
  OTHER_UNIT_ID = otherUnit.id;

  const [otherRole] = await db
    .insert(userHospitalRoles)
    .values({
      userId: TEST_USER_ID,
      hospitalId: OTHER_HOSPITAL_ID,
      unitId: OTHER_UNIT_ID,
      role: "admin",
    } as any)
    .returning();
  OTHER_ROLE_ID = otherRole.id;
});

afterAll(async () => {
  // Clean up in dependency order
  if (createdServiceIds.length) {
    await db
      .delete(clinicServices)
      .where(inArray(clinicServices.id, createdServiceIds))
      .catch(() => {});
  }
  if (createdFolderIds.length) {
    await db
      .delete(serviceFolders)
      .where(inArray(serviceFolders.id, createdFolderIds))
      .catch(() => {});
  }
  if (OTHER_ROLE_ID) {
    await db
      .delete(userHospitalRoles)
      .where(eq(userHospitalRoles.id, OTHER_ROLE_ID))
      .catch(() => {});
  }
  if (OTHER_UNIT_ID) {
    await db.delete(units).where(eq(units.id, OTHER_UNIT_ID)).catch(() => {});
  }
  if (OTHER_HOSPITAL_ID) {
    await db
      .delete(hospitals)
      .where(eq(hospitals.id, OTHER_HOSPITAL_ID))
      .catch(() => {});
  }

  await pool.end();
});

describe("Service Folders — CRUD via HTTP", () => {
  it("1. Create + list: POST then GET returns the folder", async () => {
    const app = buildApp();

    const createRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders`)
      .send({ unitId: TEST_UNIT_ID, name: "Folder CreateList" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();
    expect(createRes.body.name).toBe("Folder CreateList");
    expect(createRes.body.hospitalId).toBe(TEST_HOSPITAL_ID);
    expect(createRes.body.unitId).toBe(TEST_UNIT_ID);
    createdFolderIds.push(createRes.body.id);

    const listRes = await request(app)
      .get(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders`)
      .query({ unitId: TEST_UNIT_ID });
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const found = listRes.body.find((f: any) => f.id === createRes.body.id);
    expect(found).toBeDefined();
    expect(found.name).toBe("Folder CreateList");
  });

  it("2. Rename: PATCH with { name } updates the folder", async () => {
    const app = buildApp();

    const createRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders`)
      .send({ unitId: TEST_UNIT_ID, name: "Old" });
    expect(createRes.status).toBe(201);
    const folderId = createRes.body.id;
    createdFolderIds.push(folderId);

    const patchRes = await request(app)
      .patch(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders/${folderId}`)
      .send({ name: "New" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.id).toBe(folderId);
    expect(patchRes.body.name).toBe("New");
  });

  it("3. Delete reparents children — services keep existing with folderId=null", async () => {
    const app = buildApp();

    const createRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders`)
      .send({ unitId: TEST_UNIT_ID, name: "Folder DeleteReparent" });
    expect(createRes.status).toBe(201);
    const folderId = createRes.body.id;
    // Do NOT push to createdFolderIds — we're about to delete it.

    const serviceId = await seedService("TEST_svc_reparent", {
      folderId,
    });

    // Confirm service is attached to the folder before delete
    const before = await db
      .select()
      .from(clinicServices)
      .where(eq(clinicServices.id, serviceId));
    expect(before[0].folderId).toBe(folderId);

    const deleteRes = await request(app).delete(
      `/api/clinic/${TEST_HOSPITAL_ID}/service-folders/${folderId}`,
    );
    expect(deleteRes.status).toBe(200);

    // Folder should be gone
    const remainingFolder = await db
      .select()
      .from(serviceFolders)
      .where(eq(serviceFolders.id, folderId));
    expect(remainingFolder).toHaveLength(0);

    // Service row MUST still exist with folderId = null
    const after = await db
      .select()
      .from(clinicServices)
      .where(eq(clinicServices.id, serviceId));
    expect(after).toHaveLength(1);
    expect(after[0].folderId).toBeNull();
  });

  it("4. bulk-move-to-folder moves only the given serviceIds", async () => {
    const app = buildApp();

    // Create a destination folder
    const folderRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders`)
      .send({ unitId: TEST_UNIT_ID, name: "Folder BulkMoveSubset" });
    expect(folderRes.status).toBe(201);
    const folderId = folderRes.body.id;
    createdFolderIds.push(folderId);

    // Seed 3 services, none assigned to the folder
    const s1 = await seedService("TEST_svc_bulk_1");
    const s2 = await seedService("TEST_svc_bulk_2");
    const s3 = await seedService("TEST_svc_bulk_3");

    const moveRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/services/bulk-move-to-folder`)
      .send({ serviceIds: [s1, s2], folderId });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.movedCount).toBe(2);

    const rows = await db
      .select()
      .from(clinicServices)
      .where(inArray(clinicServices.id, [s1, s2, s3]));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[s1].folderId).toBe(folderId);
    expect(byId[s2].folderId).toBe(folderId);
    expect(byId[s3].folderId).toBeNull();
  });

  it("5. bulk-move-to-folder with folderId=null moves services to root", async () => {
    const app = buildApp();

    // First create a folder + service attached to it
    const folderRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders`)
      .send({ unitId: TEST_UNIT_ID, name: "Folder BulkMoveToRoot" });
    expect(folderRes.status).toBe(201);
    const folderId = folderRes.body.id;
    createdFolderIds.push(folderId);

    const serviceId = await seedService("TEST_svc_to_root", { folderId });

    // Confirm starting state
    const before = await db
      .select()
      .from(clinicServices)
      .where(eq(clinicServices.id, serviceId));
    expect(before[0].folderId).toBe(folderId);

    const moveRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/services/bulk-move-to-folder`)
      .send({ serviceIds: [serviceId], folderId: null });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.movedCount).toBe(1);

    const after = await db
      .select()
      .from(clinicServices)
      .where(eq(clinicServices.id, serviceId));
    expect(after[0].folderId).toBeNull();
  });

  it("6. Cross-hospital rejection: folder in hospital A cannot receive services from hospital B", async () => {
    const app = buildApp();

    // Create a folder in hospital A
    const folderRes = await request(app)
      .post(`/api/clinic/${TEST_HOSPITAL_ID}/service-folders`)
      .send({ unitId: TEST_UNIT_ID, name: "Folder CrossHospital" });
    expect(folderRes.status).toBe(201);
    const folderInA = folderRes.body.id;
    createdFolderIds.push(folderInA);

    // Seed a service in hospital B
    const serviceInB = await seedService("TEST_svc_in_B", {
      hospitalId: OTHER_HOSPITAL_ID,
      unitId: OTHER_UNIT_ID,
    });

    // POST on hospital B's URL, targeting folderInA — handler must reject with 400
    // because folder.hospitalId (A) !== URL hospitalId (B).
    const moveRes = await request(app)
      .post(`/api/clinic/${OTHER_HOSPITAL_ID}/services/bulk-move-to-folder`)
      .send({ serviceIds: [serviceInB], folderId: folderInA });
    expect(moveRes.status).toBe(400);

    // Confirm nothing was moved
    const after = await db
      .select()
      .from(clinicServices)
      .where(eq(clinicServices.id, serviceInB));
    expect(after[0].folderId).toBeNull();
  });
});
