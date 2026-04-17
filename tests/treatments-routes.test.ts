import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  treatments,
  patients,
  users,
  clinicServices,
  clinicInvoices,
  clinicInvoiceItems,
  units,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

// Mock isAuthenticated to pass through (sets req.user in the middleware below)
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => next(),
}));

import treatmentsRouter from "../server/routes/treatments";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
let testPatientId: string;
let testProviderId: string;
let testServiceId: string;
let testUnitId: string;
const createdIds: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject a test user so req.user?.id is available in action routes
  app.use((req: any, _res, next) => {
    req.user = { id: testProviderId ?? "test-user-id" };
    next();
  });
  app.use(treatmentsRouter);
  return app;
}

beforeAll(async () => {
  const [p] = await db
    .select()
    .from(patients)
    .where(eq(patients.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  testPatientId = p.id;

  const [u] = await db.select().from(users).limit(1);
  testProviderId = u.id;

  // Get a unit for this hospital
  const [unit] = await db
    .select()
    .from(units)
    .where(eq(units.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  testUnitId = unit.id;

  // Create a test clinic service to use in line creation
  const [s] = await db
    .insert(clinicServices)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      name: "TEST_ROUTE_SERVICE_" + Date.now(),
      price: "100.00",
      isInvoiceable: true,
    } as any)
    .returning();
  testServiceId = s.id;
});

afterAll(async () => {
  // Delete treatments (cascades to treatment_lines)
  if (createdIds.length) {
    // Find any invoices created by these treatments first
    const treatedRows = await db
      .select({ invoiceId: treatments.invoiceId })
      .from(treatments)
      .where(inArray(treatments.id, createdIds));
    const invoiceIds = treatedRows
      .map((r) => r.invoiceId)
      .filter(Boolean) as string[];

    await db.delete(treatments).where(inArray(treatments.id, createdIds));

    // Clean up invoices (after treatments so FK on treatments.invoice_id is gone)
    if (invoiceIds.length) {
      await db
        .delete(clinicInvoiceItems)
        .where(inArray(clinicInvoiceItems.invoiceId, invoiceIds));
      await db
        .delete(clinicInvoices)
        .where(inArray(clinicInvoices.id, invoiceIds));
    }
  }

  // Clean up test service (must happen after invoices are deleted)
  if (testServiceId) {
    await db
      .delete(clinicServices)
      .where(eq(clinicServices.id, testServiceId));
  }
  await pool.end();
});

describe("POST /api/treatments — validation", () => {
  it("rejects lines with no serviceId and no itemId (both null) → 422", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/treatments")
      .send({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: testPatientId,
        providerId: testProviderId,
        performedAt: new Date().toISOString(),
        lines: [
          {
            serviceId: null,
            itemId: null,
            dose: "15",
            doseUnit: "units",
            zones: [],
            unitPrice: "250",
            total: "250",
            lineOrder: 0,
          },
        ],
      });
    expect([400, 422]).toContain(res.status);
  });

  it("rejects missing required fields (no patientId) → 422", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/treatments")
      .send({
        hospitalId: TEST_HOSPITAL_ID,
        providerId: testProviderId,
        performedAt: new Date().toISOString(),
        lines: [],
      });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/treatments — list by patientId", () => {
  it("returns 200 with array when patientId provided", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/treatments?patientId=${testPatientId}`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 400 when patientId is missing", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/treatments");
    expect(res.status).toBe(400);
  });
});

describe("Full treatment flow: POST → GET → sign → invoice-draft", () => {
  let treatmentId: string;

  it("POST creates a valid treatment with lines", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/treatments")
      .send({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: testPatientId,
        providerId: testProviderId,
        performedAt: new Date().toISOString(),
        notes: "route integration test",
        lines: [
          {
            serviceId: testServiceId,
            itemId: null,
            dose: "1",
            doseUnit: "session",
            zones: [],
            unitPrice: "100.00",
            total: "100.00",
            lineOrder: 0,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(res.body.lines.length).toBe(1);
    expect(res.body.status).toBe("draft");
    treatmentId = res.body.id;
    createdIds.push(treatmentId);
  });

  it("GET by id returns the treatment", async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/treatments/${treatmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(treatmentId);
    expect(res.body.notes).toBe("route integration test");
  });

  it("sign action transitions status to signed", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/treatments/${treatmentId}/sign`)
      .send({ signature: "data:image/png;base64,AAAA" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("signed");
    expect(res.body.signature).toBe("data:image/png;base64,AAAA");
    expect(res.body.signedBy).toBe(testProviderId);
  });

  it("invoice-draft creates invoice and returns invoiceId", async () => {
    const app = buildApp();
    const res = await request(app).post(
      `/api/treatments/${treatmentId}/invoice-draft`,
    );
    expect(res.status).toBe(201);
    expect(typeof res.body.invoiceId).toBe("string");
    expect(res.body.invoiceId.length).toBeGreaterThan(0);
  });

  it("GET returns status=invoiced after invoice-draft", async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/treatments/${treatmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("invoiced");
    expect(res.body.invoiceId).toBeTruthy();
  });
});

describe("GET /api/treatments/:id — not found", () => {
  it("returns 404 for unknown id", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/treatments/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/treatments/:id — draft only", () => {
  it("deletes a draft treatment", async () => {
    const app = buildApp();
    // Create a new draft treatment
    const createRes = await request(app)
      .post("/api/treatments")
      .send({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: testPatientId,
        providerId: testProviderId,
        performedAt: new Date().toISOString(),
        lines: [
          {
            serviceId: testServiceId,
            itemId: null,
            dose: "1",
            doseUnit: "session",
            zones: [],
            unitPrice: "50.00",
            total: "50.00",
            lineOrder: 0,
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const delRes = await request(app).delete(`/api/treatments/${id}`);
    expect(delRes.status).toBe(204);

    // Confirm it's gone
    const getRes = await request(app).get(`/api/treatments/${id}`);
    expect(getRes.status).toBe(404);
  });
});
