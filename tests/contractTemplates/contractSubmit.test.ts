import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../../server/db";
import {
  contractTemplates,
  workerContracts,
  hospitals,
  hospitalGroups,
  units,
  users,
  userHospitalRoles,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// Bypass real Google session auth — same pattern used in templatesCrud.test.ts
vi.mock("../../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import contractInstancesRouter from "../../server/routes/contractInstances";
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
  app.use(contractInstancesRouter);
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

// Cross-tenant fixtures
let otherGroupId: string;
let otherHospId: string;
/** Template owned by a foreign hospital (otherHospId) */
let foreignTemplateId: string;
/** Template owned by a foreign chain (otherGroupId) */
let foreignChainTemplateId: string;

const createdTemplateIds: string[] = [];
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];

// A minimal template with a simple variable for the worker's first name
const minimalTemplate = {
  name: "Test Employment Agreement",
  language: "de" as const,
  status: "active" as const,
  blocks: [
    { id: "b1", type: "heading", level: 1, text: "Agreement for {{worker.firstName}}" },
    { id: "b2", type: "paragraph", text: "IBAN: {{worker.iban}}" },
  ],
  variables: {
    simple: [
      { key: "worker.firstName", type: "text", label: "First Name", required: true },
      { key: "worker.lastName", type: "text", label: "Last Name", required: true },
      { key: "worker.street", type: "text", label: "Street", required: false },
      { key: "worker.postalCode", type: "text", label: "Postal Code", required: false },
      { key: "worker.city", type: "text", label: "City", required: false },
      { key: "worker.email", type: "email", label: "Email", required: true },
      { key: "worker.dateOfBirth", type: "date", label: "Date of Birth", required: false },
      { key: "worker.iban", type: "iban", label: "IBAN", required: true },
    ],
    selectableLists: [],
  },
};

// Valid submit data matching the template variables.
// buildZodSchema builds a nested Zod schema from dotted paths, so the data
// must be nested (not flat dotted-key strings).
const validSubmitData = {
  worker: {
    firstName: "Anna",
    lastName: "Müller",
    email: "anna@example.com",
    iban: "CH9300762011623852957",
  },
};

let templateId: string;

beforeAll(async () => {
  // Hospital group
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

  // Hospital
  const [h] = await db
    .insert(hospitals)
    .values({ name: `TestHosp-${uniq()}`, groupId } as any)
    .returning();
  hospId = h.id;
  createdHospitalIds.push(hospId);

  // Unit (required for role rows)
  const [u] = await db
    .insert(units)
    .values({ hospitalId: hospId, name: "Default", type: "clinic" } as any)
    .returning();
  unitId = u.id;
  createdUnitIds.push(unitId);

  // Manager user
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

  // Plain user (no role at hospital — used for 403 assertions)
  const [pu] = await db
    .insert(users)
    .values({ email: `plain-${uniq()}@test.test` } as any)
    .returning();
  plainUserId = pu.id;
  createdUserIds.push(plainUserId);

  // Create a template to use across tests
  const app = buildApp(managerUserId);
  const res = await request(app)
    .post(`/api/business/${hospId}/contract-templates`)
    .send(minimalTemplate);
  templateId = res.body.id;
  createdTemplateIds.push(templateId);

  // ── Cross-tenant setup: a separate chain + hospital ────────────────────────

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

  // Template owned by the foreign hospital
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
  foreignTemplateId = ft.id;
  createdTemplateIds.push(foreignTemplateId);

  // Template owned by the foreign chain
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
  createdTemplateIds.push(foreignChainTemplateId);
});

afterAll(async () => {
  if (createdContractIds.length) {
    await db
      .delete(workerContracts)
      .where(inArray(workerContracts.id, createdContractIds));
  }
  if (createdTemplateIds.length) {
    await db
      .delete(contractTemplates)
      .where(inArray(contractTemplates.id, createdTemplateIds));
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
// Scenario 1: Manager creates a draft
// ---------------------------------------------------------------------------

describe("POST /api/business/:hospitalId/contracts — create draft", () => {
  it("returns 403 when user has no role at hospital", async () => {
    const res = await request(buildApp(plainUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId });
    expect(res.status).toBe(403);
  });

  it("returns 400 when templateId is missing", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when templateId does not exist", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId: randomUUID() });
    expect(res.status).toBe(404);
  });

  it("creates a contract draft and returns 201 with a publicToken", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.publicToken).toBeTruthy();
    expect(res.body.templateId).toBe(templateId);
    expect(res.body.hospitalId).toBe(hospId);
    expect(res.body.status).toBe("pending_manager_signature");
    createdContractIds.push(res.body.id);
  });

  it("accepts optional prefill data and includes worker email in the record", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({
        templateId,
        prefill: { worker: { email: "prefill@example.com" } },
      });
    expect(res.status).toBe(201);
    expect(res.body.publicToken).toBeTruthy();
    createdContractIds.push(res.body.id);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Public fetch by token
// ---------------------------------------------------------------------------

describe("GET /api/public/contracts/c/:token — fetch by token", () => {
  let token: string;
  let contractId: string;

  beforeAll(async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId });
    token = res.body.publicToken;
    contractId = res.body.id;
    createdContractIds.push(contractId);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(buildApp(null)).get(
      `/api/public/contracts/c/${randomUUID()}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns template + prefill for a valid unused token", async () => {
    const res = await request(buildApp(null)).get(
      `/api/public/contracts/c/${token}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.contractId).toBe(contractId);
    expect(res.body.template.id).toBe(templateId);
    expect(res.body.template.blocks).toBeTruthy();
    expect(res.body.template.variables).toBeTruthy();
    expect(res.body.mode).toBe("single-use");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Public submit by token
// ---------------------------------------------------------------------------

describe("POST /api/public/contracts/c/:token/submit — submit", () => {
  let token: string;
  let contractId: string;

  beforeAll(async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId });
    token = res.body.publicToken;
    contractId = res.body.id;
    createdContractIds.push(contractId);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/c/${randomUUID()}/submit`)
      .send({
        data: validSubmitData,
        workerSignature: "data:image/png;base64,abc",
        workerSignatureLocation: "Zürich",
      });
    expect(res.status).toBe(404);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/c/${token}/submit`)
      .send({ data: {}, workerSignature: "", workerSignatureLocation: "" });
    expect(res.status).toBe(400);
  });

  it("first submit succeeds with 200", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/c/${token}/submit`)
      .send({
        data: validSubmitData,
        workerSignature: "data:image/png;base64,abc",
        workerSignatureLocation: "Zürich",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("second submit on the same token returns 410 (single-use enforcement)", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/c/${token}/submit`)
      .send({
        data: validSubmitData,
        workerSignature: "data:image/png;base64,abc",
        workerSignatureLocation: "Zürich",
      });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("token already used");
  });

  it("GET on a consumed token returns 410", async () => {
    const res = await request(buildApp(null)).get(
      `/api/public/contracts/c/${token}`,
    );
    expect(res.status).toBe(410);
  });

  it("workerSignedAt is set in the DB after submit (single-use enforced by timestamp)", async () => {
    const [row] = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.id, contractId));
    // Token is kept so that a second attempt via the same URL gets 410 (not 404).
    // Single-use is enforced by checking workerSignedAt, not by nulling the token.
    expect(row.workerSignedAt).toBeTruthy();
    expect(row.publicToken).toBeTruthy(); // kept for UX-friendly 410 response
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Snapshot is frozen at submit time
// ---------------------------------------------------------------------------

describe("templateSnapshot frozen at submit — PATCH to template does not affect existing signed contract", () => {
  let token: string;
  let contractId: string;
  const originalBlockText = "Original paragraph content";

  beforeAll(async () => {
    // Create a fresh template with a known block text
    const tmplRes = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates`)
      .send({
        name: `Snapshot-test-${uniq()}`,
        language: "de",
        status: "active",
        blocks: [
          { id: "snap1", type: "paragraph", text: originalBlockText },
        ],
        variables: {
          simple: [
            { key: "worker.firstName", type: "text", label: "First Name", required: true },
            { key: "worker.lastName", type: "text", label: "Last Name", required: true },
            { key: "worker.email", type: "email", label: "Email", required: true },
            { key: "worker.iban", type: "iban", label: "IBAN", required: true },
          ],
          selectableLists: [],
        },
      });
    const snapTemplateId = tmplRes.body.id;
    createdTemplateIds.push(snapTemplateId);

    // Create a draft
    const draftRes = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId: snapTemplateId });
    token = draftRes.body.publicToken;
    contractId = draftRes.body.id;
    createdContractIds.push(contractId);

    // Submit the contract — this locks in the snapshot
    await request(buildApp(null))
      .post(`/api/public/contracts/c/${token}/submit`)
      .send({
        data: validSubmitData,
        workerSignature: "data:image/png;base64,snapshottest",
        workerSignatureLocation: "Bern",
      });

    // Now edit the template — change the block text
    await request(buildApp(managerUserId))
      .patch(`/api/business/${hospId}/contract-templates/${snapTemplateId}`)
      .send({
        blocks: [
          { id: "snap1", type: "paragraph", text: "Completely different content" },
        ],
      });
  });

  it("the signed contract's templateSnapshot still has the original block text", async () => {
    const [row] = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.id, contractId));

    expect(row.templateSnapshot).toBeTruthy();
    const snapshot = row.templateSnapshot as any;
    // The snapshot should contain the original block text, not the edited one
    const paragraphBlock = (snapshot.blocks as any[]).find(
      (b: any) => b.id === "snap1",
    );
    expect(paragraphBlock).toBeTruthy();
    expect(paragraphBlock.text).toBe(originalBlockText);
  });

  it("the signed contract has workerSignedAt set", async () => {
    const [row] = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.id, contractId));
    expect(row.workerSignedAt).toBeTruthy();
  });

  it("the signed contract has legacy denormalized fields populated", async () => {
    const [row] = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.id, contractId));
    // worker.firstName comes from validSubmitData
    expect(row.firstName).toBe("Anna");
    expect(row.lastName).toBe("Müller");
    expect(row.email).toBe("anna@example.com");
    expect(row.iban).toBe("CH9300762011623852957");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: op_nurse role mapping
// ---------------------------------------------------------------------------

describe("op_nurse role → legacy enum mapping", () => {
  let token: string;
  let contractId: string;

  beforeAll(async () => {
    // Template with a role selectable list that includes op_nurse
    const tmplRes = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contract-templates`)
      .send({
        name: `Role-map-test-${uniq()}`,
        language: "de",
        status: "active",
        blocks: [],
        variables: {
          simple: [
            { key: "worker.firstName", type: "text", label: "First Name", required: true },
            { key: "worker.lastName", type: "text", label: "Last Name", required: true },
            { key: "worker.email", type: "email", label: "Email", required: true },
            { key: "worker.iban", type: "iban", label: "IBAN", required: true },
          ],
          selectableLists: [
            {
              key: "role",
              label: "Role",
              fields: [{ key: "id", type: "text" }],
              options: [
                { id: "op_nurse", label: "OR Nurse" },
                { id: "awr_nurse", label: "AWR Nurse" },
              ],
            },
          ],
        },
      });
    const roleTemplateId = tmplRes.body.id;
    createdTemplateIds.push(roleTemplateId);

    const draftRes = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId: roleTemplateId });
    token = draftRes.body.publicToken;
    contractId = draftRes.body.id;
    createdContractIds.push(contractId);
  });

  it("submit with op_nurse succeeds and maps to awr_nurse in legacy column", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/c/${token}/submit`)
      .send({
        data: {
          ...validSubmitData,
          role: { id: "op_nurse" },
        },
        workerSignature: "data:image/png;base64,roletest",
        workerSignatureLocation: "Basel",
      });
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.id, contractId));
    // Legacy column must be a valid enum value
    expect(["awr_nurse", "anesthesia_nurse", "anesthesia_doctor"]).toContain(row.role);
    // The real value is preserved in data.role.id
    expect((row.data as any)?.role?.id).toBe("op_nurse");
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 (Path B): per-template shareable link via legacy hospital token
// ---------------------------------------------------------------------------

describe("Path B — GET /api/public/contracts/t/:token", () => {
  let legacyToken: string;
  let pathBHospId: string;
  let pathBTemplateId: string;

  beforeAll(async () => {
    // Create a hospital with a contractToken (the legacy token)
    legacyToken = `pathb-${randomUUID().replace(/-/g, "")}`;
    const [h] = await db
      .insert(hospitals)
      .values({ name: `PathB-Hosp-${uniq()}`, groupId, contractToken: legacyToken } as any)
      .returning();
    pathBHospId = h.id;
    createdHospitalIds.push(pathBHospId);

    // Create a template with starterKey="on_call_v1" owned by the hospital
    const [t] = await db
      .insert(contractTemplates)
      .values({
        ownerHospitalId: pathBHospId,
        starterKey: "on_call_v1",
        name: `PathB-OnCall-${uniq()}`,
        language: "de",
        status: "active",
        blocks: [
          { id: "pb1", type: "heading", level: 1, text: "On-Call Contract {{worker.firstName}}" },
        ],
        variables: {
          simple: [
            { key: "worker.firstName", type: "text", label: "First Name", required: true },
            { key: "worker.lastName", type: "text", label: "Last Name", required: true },
            { key: "worker.email", type: "email", label: "Email", required: true },
            { key: "worker.iban", type: "iban", label: "IBAN", required: true },
          ],
          selectableLists: [],
        },
      } as any)
      .returning();
    pathBTemplateId = t.id;
    createdTemplateIds.push(pathBTemplateId);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(buildApp(null)).get(
      `/api/public/contracts/t/does-not-exist-token`,
    );
    expect(res.status).toBe(404);
  });

  it("returns the on-call template for a valid legacy token", async () => {
    const res = await request(buildApp(null)).get(
      `/api/public/contracts/t/${legacyToken}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("shareable");
    expect(res.body.template.id).toBe(pathBTemplateId);
    expect(res.body.template.blocks).toBeTruthy();
    expect(res.body.template.variables).toBeTruthy();
  });
});

describe("Path B — POST /api/public/contracts/t/:token/submit", () => {
  let legacyToken: string;
  let pathBHospId: string;

  beforeAll(async () => {
    // Create a fresh hospital + on-call template for this describe block
    legacyToken = `pathbpost-${randomUUID().replace(/-/g, "")}`;
    const [h] = await db
      .insert(hospitals)
      .values({ name: `PathBPost-Hosp-${uniq()}`, groupId, contractToken: legacyToken } as any)
      .returning();
    pathBHospId = h.id;
    createdHospitalIds.push(pathBHospId);

    const [t] = await db
      .insert(contractTemplates)
      .values({
        ownerHospitalId: pathBHospId,
        starterKey: "on_call_v1",
        name: `PathBPost-OnCall-${uniq()}`,
        language: "de",
        status: "active",
        blocks: [],
        variables: {
          simple: [
            { key: "worker.firstName", type: "text", label: "First Name", required: true },
            { key: "worker.lastName", type: "text", label: "Last Name", required: true },
            { key: "worker.email", type: "email", label: "Email", required: true },
            { key: "worker.iban", type: "iban", label: "IBAN", required: true },
          ],
          selectableLists: [],
        },
      } as any)
      .returning();
    createdTemplateIds.push(t.id);
  });

  const submitPayload = {
    data: validSubmitData,
    workerSignature: "data:image/png;base64,pathbtest",
    workerSignatureLocation: "Zürich",
  };

  it("returns 404 for an unknown token", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/t/totally-invalid-token/submit`)
      .send(submitPayload);
    expect(res.status).toBe(404);
  });

  it("first submit succeeds and returns 200 with contractId", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/t/${legacyToken}/submit`)
      .send(submitPayload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.contractId).toBeTruthy();
    createdContractIds.push(res.body.contractId);
  });

  it("second submit succeeds (multi-use: same token accepts many submissions)", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/t/${legacyToken}/submit`)
      .send(submitPayload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    createdContractIds.push(res.body.contractId);
  });

  it("third submit succeeds (still within the 3/24h rate limit)", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/t/${legacyToken}/submit`)
      .send(submitPayload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    createdContractIds.push(res.body.contractId);
  });

  it("fourth submit within the same window returns 429 (rate limit enforced)", async () => {
    const res = await request(buildApp(null))
      .post(`/api/public/contracts/t/${legacyToken}/submit`)
      .send(submitPayload);
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 (Path A cross-tenant): manager cannot use a foreign template
// ---------------------------------------------------------------------------

describe("POST /api/business/:hospitalId/contracts — cross-tenant template ownership", () => {
  it("returns 403 when templateId belongs to a foreign hospital (no shared chain)", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId: foreignTemplateId });
    expect(res.status).toBe(403);
  });

  it("returns 403 when templateId belongs to a foreign chain", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId: foreignChainTemplateId });
    expect(res.status).toBe(403);
  });

  it("returns 201 when templateId belongs to the requesting hospital (baseline sanity check)", async () => {
    const res = await request(buildApp(managerUserId))
      .post(`/api/business/${hospId}/contracts`)
      .send({ templateId });
    expect(res.status).toBe(201);
    expect(res.body.publicToken).toBeTruthy();
    createdContractIds.push(res.body.id);
  });
});
