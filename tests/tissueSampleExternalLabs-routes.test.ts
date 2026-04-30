import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  tissueSampleExternalLabs,
  users,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const OTHER_HOSPITAL_ID = "00000000-0000-0000-0000-000000000111"; // synthetic

// `mockHasAccess` defaults to true; flip per-call to exercise denial paths.
const mockHasAccess = vi.hoisted(() => vi.fn(async () => true));
// authenticated-by-default; flip with `authed.mockImplementationOnce(...)`
// to exercise the 401 path.
const authed = vi.hoisted(() =>
  vi.fn((req: any, _res: any, next: any) => {
    if (!req.user) {
      // If the harness app didn't inject a user, simulate anonymous.
      return _res.status(401).json({ message: "Authentication required" });
    }
    next();
  }),
);

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (req: any, res: any, next: any) => authed(req, res, next),
}));

vi.mock("../server/utils", () => ({
  requireWriteAccess: (req: any, _res: any, next: any) => {
    // Mirror the production middleware contract: stash the resolved hospital
    // so the route can read req.verifiedHospitalId.
    const headerHospitalId = req.headers["x-active-hospital-id"];
    if (typeof headerHospitalId === "string") {
      req.verifiedHospitalId = headerHospitalId;
      req.resolvedHospitalId = headerHospitalId;
    }
    next();
  },
  requireStrictHospitalAccess: (req: any, res: any, next: any) => {
    const headerHospitalId = req.headers["x-active-hospital-id"];
    if (!headerHospitalId) {
      return res
        .status(400)
        .json({ message: "Hospital context required.", code: "HOSPITAL_ID_REQUIRED" });
    }
    req.verifiedHospitalId = headerHospitalId;
    req.resolvedHospitalId = headerHospitalId;
    next();
  },
  userHasGroupAwareHospitalAccess: mockHasAccess,
  requireResourceAdmin: () => (_req: any, _res: any, next: any) => next(),
}));

// `getUserHospitals` is what the route uses to determine if the caller is
// admin at the lab's hospital. Default: admin at TEST_HOSPITAL_ID.
import { storage } from "../server/storage";
const getUserHospitalsSpy = vi.spyOn(storage, "getUserHospitals");

import labsRouter from "../server/routes/anesthesia/tissueSampleExternalLabs";

let testUserId: string;
const createdIds: string[] = [];

function buildApp(opts: { withUser?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (opts.withUser !== false) {
      req.user = { id: testUserId ?? "test-user-id" };
    }
    next();
  });
  app.use(labsRouter);
  return app;
}

async function cleanup() {
  if (createdIds.length) {
    await db
      .delete(tissueSampleExternalLabs)
      .where(inArray(tissueSampleExternalLabs.id, createdIds))
      .catch(() => {});
    createdIds.length = 0;
  }
  // Also wipe any rows we may have inserted directly for cross-hospital
  // setup (these aren't tracked in createdIds because they bypass the route).
  await db
    .delete(tissueSampleExternalLabs)
    .where(eq(tissueSampleExternalLabs.hospitalId, OTHER_HOSPITAL_ID))
    .catch(() => {});
}

beforeAll(async () => {
  const [u] = await db.select().from(users).limit(1);
  testUserId = u.id;
  await cleanup();
});

beforeEach(async () => {
  await cleanup();
  // Reset to defaults each test.
  mockHasAccess.mockImplementation(async () => true);
  authed.mockImplementation((req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ message: "Authentication required" });
    next();
  });
  getUserHospitalsSpy.mockResolvedValue([
    { id: TEST_HOSPITAL_ID, role: "admin" } as any,
  ]);
});

afterAll(async () => {
  await cleanup();
  getUserHospitalsSpy.mockRestore();
  await pool.end();
});

describe("auth gating", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp({ withUser: false });
    const res = await request(app)
      .get("/api/tissue-sample-external-labs")
      .set("X-Active-Hospital-Id", TEST_HOSPITAL_ID);
    expect(res.status).toBe(401);
  });

  it("non-admin POST returns 403 ADMIN_ACCESS_REQUIRED", async () => {
    getUserHospitalsSpy.mockResolvedValue([
      { id: TEST_HOSPITAL_ID, role: "doctor" } as any,
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/tissue-sample-external-labs")
      .set("X-Active-Hospital-Id", TEST_HOSPITAL_ID)
      .send({ name: "Should Fail" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ADMIN_ACCESS_REQUIRED");
  });
});

describe("admin POST + GET (list)", () => {
  it("admin creates a lab; list returns it", async () => {
    const app = buildApp();
    const create = await request(app)
      .post("/api/tissue-sample-external-labs")
      .set("X-Active-Hospital-Id", TEST_HOSPITAL_ID)
      .send({
        name: "Created via route",
        applicableSampleTypes: ["fat"],
        contact: "x@y.test",
        isDefault: false,
      });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe("Created via route");
    createdIds.push(create.body.id);

    const list = await request(app)
      .get("/api/tissue-sample-external-labs")
      .set("X-Active-Hospital-Id", TEST_HOSPITAL_ID);
    expect(list.status).toBe(200);
    expect(list.body.some((l: any) => l.id === create.body.id)).toBe(true);
  });

  it("filters by ?type=fat — universal lab still appears", async () => {
    const app = buildApp();
    const universal = await request(app)
      .post("/api/tissue-sample-external-labs")
      .set("X-Active-Hospital-Id", TEST_HOSPITAL_ID)
      .send({ name: "U", applicableSampleTypes: null });
    expect(universal.status).toBe(201);
    createdIds.push(universal.body.id);

    const fatOnly = await request(app)
      .post("/api/tissue-sample-external-labs")
      .set("X-Active-Hospital-Id", TEST_HOSPITAL_ID)
      .send({ name: "F", applicableSampleTypes: ["fat"] });
    expect(fatOnly.status).toBe(201);
    createdIds.push(fatOnly.body.id);

    const list = await request(app)
      .get("/api/tissue-sample-external-labs?type=histology")
      .set("X-Active-Hospital-Id", TEST_HOSPITAL_ID);
    expect(list.status).toBe(200);
    const ids = list.body.map((l: any) => l.id);
    expect(ids).toContain(universal.body.id);
    expect(ids).not.toContain(fatOnly.body.id);
  });
});

describe("cross-hospital access denial", () => {
  it("admin in hospital A cannot modify a lab belonging to hospital B", async () => {
    // Insert a lab directly into the OTHER hospital, bypassing the route.
    // hospital_id is a FK to hospitals(id) so we use a real hospital but
    // simulate "not the user's hospital" via getUserHospitalsSpy below.
    const [otherLab] = await db
      .insert(tissueSampleExternalLabs)
      .values({
        hospitalId: TEST_HOSPITAL_ID, // FK requires real hospital
        name: "OtherHospitalLab",
        applicableSampleTypes: null,
        contact: null,
        isDefault: false,
        isArchived: false,
      })
      .returning();
    createdIds.push(otherLab.id);

    // Caller has NO direct admin role at TEST_HOSPITAL_ID — they're admin
    // somewhere else. The route looks at getUserHospitals() to decide
    // admin-of-hospital, so a list without TEST_HOSPITAL_ID denies.
    getUserHospitalsSpy.mockResolvedValue([
      { id: OTHER_HOSPITAL_ID, role: "admin" } as any,
    ]);

    const app = buildApp();
    const res = await request(app)
      .patch(`/api/tissue-sample-external-labs/${otherLab.id}`)
      .set("X-Active-Hospital-Id", OTHER_HOSPITAL_ID)
      .send({ name: "hijacked" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ADMIN_ACCESS_REQUIRED");
  });
});
