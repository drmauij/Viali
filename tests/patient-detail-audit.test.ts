import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  units,
  userHospitalRoles,
  users,
  patients,
  patientHospitals,
  patientEditAudit,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";
import { updatePatient } from "../server/storage/anesthesia";

/**
 * Task 7: cross-location patient chart — audit + detail endpoint.
 *
 * Two layers:
 *   1. Storage-level audit: `updatePatient` takes an audit context and logs a
 *      `patient_edit_audit` row per changed clinical field when the editing
 *      hospital differs from the patient's home hospital.
 *   2. Route-level: `GET /api/patients/:id` and `GET /api/patients/:id/hospitals`
 *      now delegate to `userHasGroupAwareHospitalAccess`, so a user at any
 *      hospital in the patient's group can read the chart and its roster.
 */

// Bypass Google auth; tests set req.user via buildApp(userId).
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

// Import router AFTER the mock so it picks up the bypassed auth.
import patientsRouter from "../server/routes/anesthesia/patients";

const uniq = () => randomUUID().slice(0, 8);

let groupG: string;
let hospA: string; // in groupG — patient home
let hospB: string; // in groupG — visiting location
let hospC: string; // ungrouped — outside-group user

let unitA: string;
let unitB: string;
let unitC: string;

let userAtA: string; // admin at hospA (home)
let userAtB: string; // admin at hospB (same group — visiting)
let userAtC: string; // admin at hospC (ungrouped — must be denied)

let patientP: string; // home = A

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdGroupIds: string[] = [];
const createdPatientIds: string[] = [];

async function mkHospital(name: string, groupId?: string | null) {
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId: groupId ?? null } as any)
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
async function mkPatient(hospitalId: string, overrides: Partial<Record<string, any>> = {}) {
  // Create archived so the groups-schema backfill invariant
  // (non-archived patient ⇒ has roster row) isn't momentarily violated
  // if another test runs in parallel. We un-archive via the beforeEach
  // reset when a specific test needs a non-archived patient — but all
  // tests in this file work with the archive flag irrelevant, so leaving
  // it on is fine.
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId,
      patientNumber: `PDA-${uniq()}`,
      surname: "Audit",
      firstName: "Test",
      birthday: "1990-01-01",
      sex: "F",
      isArchived: true,
      ...overrides,
    } as any)
    .returning();
  createdPatientIds.push(p.id);
  await ensurePatientHospitalLink(p.id, hospitalId, null);
  return p.id;
}

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(patientsRouter);
  return app;
}

beforeAll(async () => {
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: `pda-G-${uniq()}` } as any)
    .returning();
  groupG = g.id;
  createdGroupIds.push(groupG);

  hospA = await mkHospital(`PDA_A_${uniq()}`, groupG);
  hospB = await mkHospital(`PDA_B_${uniq()}`, groupG);
  hospC = await mkHospital(`PDA_C_${uniq()}`); // ungrouped

  unitA = await mkUnit(hospA, "Clinic A");
  unitB = await mkUnit(hospB, "Clinic B");
  unitC = await mkUnit(hospC, "Clinic C");

  userAtA = await mkUser("pda-A");
  userAtB = await mkUser("pda-B");
  userAtC = await mkUser("pda-C");

  await mkRole(userAtA, hospA, unitA, "admin");
  await mkRole(userAtB, hospB, unitB, "admin");
  await mkRole(userAtC, hospC, unitC, "admin");

  patientP = await mkPatient(hospA, {
    allergies: ["latex"],
    otherAllergies: "nuts",
    internalNotes: "initial note",
    weight: "70",
  });
});

beforeEach(async () => {
  // Clean audit log + reset patient roster/fields between tests.
  await db
    .delete(patientEditAudit)
    .where(eq(patientEditAudit.patientId, patientP))
    .catch(() => {});

  // Reset patient P to a known clinical state so field-change assertions
  // don't depend on ordering between tests. Leave `isArchived = true` to
  // avoid racing with the groups-schema backfill invariant in parallel runs.
  await db
    .update(patients)
    .set({
      allergies: ["latex"],
      otherAllergies: "nuts",
      internalNotes: "initial note",
      weight: "70",
      archivedAt: null,
      isArchived: true,
      phone: null,
    })
    .where(eq(patients.id, patientP));

  // Keep the roster minimal: only the home hospital row.
  await db
    .delete(patientHospitals)
    .where(eq(patientHospitals.patientId, patientP));
  await ensurePatientHospitalLink(patientP, hospA, null);
});

afterAll(async () => {
  if (createdPatientIds.length) {
    await db
      .delete(patientEditAudit)
      .where(inArray(patientEditAudit.patientId, createdPatientIds))
      .catch(() => {});
    await db
      .delete(patients)
      .where(inArray(patients.id, createdPatientIds))
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
// Piece A: cross-location clinical edit audit.
// ---------------------------------------------------------------------------
describe("updatePatient — cross-location clinical edit audit", () => {
  async function auditFor(patientId: string) {
    return await db
      .select()
      .from(patientEditAudit)
      .where(eq(patientEditAudit.patientId, patientId));
  }

  it("logs an audit row when editingHospital differs from home hospital (clinical field)", async () => {
    await updatePatient(
      patientP,
      { allergies: ["penicillin"] },
      { editingUserId: userAtB, editingHospitalId: hospB },
    );

    const rows = await auditFor(patientP);
    expect(rows).toHaveLength(1);
    expect(rows[0].editingHospitalId).toBe(hospB);
    expect(rows[0].editingUserId).toBe(userAtB);
    expect(rows[0].field).toBe("allergies");
    expect(rows[0].oldValue).toBe(JSON.stringify(["latex"]));
    expect(rows[0].newValue).toBe(JSON.stringify(["penicillin"]));
  });

  it("does NOT log when editingHospital equals the patient's home hospital", async () => {
    await updatePatient(
      patientP,
      { allergies: ["penicillin"] },
      { editingUserId: userAtA, editingHospitalId: hospA },
    );
    const rows = await auditFor(patientP);
    expect(rows).toHaveLength(0);
  });

  it("does NOT log for non-clinical cross-location edits (phone, archive status)", async () => {
    await updatePatient(
      patientP,
      { phone: "+41 79 000 00 00" } as any,
      { editingUserId: userAtB, editingHospitalId: hospB },
    );
    await updatePatient(
      patientP,
      { archivedAt: new Date(), isArchived: true } as any,
      { editingUserId: userAtB, editingHospitalId: hospB },
    );
    const rows = await auditFor(patientP);
    expect(rows).toHaveLength(0);
  });

  it("does NOT log when a clinical field is set to the same value (no-op)", async () => {
    // P already has allergies=['latex'] from the beforeEach reset.
    await updatePatient(
      patientP,
      { allergies: ["latex"] },
      { editingUserId: userAtB, editingHospitalId: hospB },
    );
    const rows = await auditFor(patientP);
    expect(rows).toHaveLength(0);
  });

  it("logs one audit row per changed clinical field", async () => {
    await updatePatient(
      patientP,
      {
        allergies: ["latex", "penicillin"],
        otherAllergies: "seafood",
        internalNotes: "second note",
      },
      { editingUserId: userAtB, editingHospitalId: hospB },
    );

    const rows = await auditFor(patientP);
    expect(rows).toHaveLength(3);
    const fields = rows.map((r) => r.field).sort();
    expect(fields).toEqual(["allergies", "internalNotes", "otherAllergies"]);
  });

  it("skips unchanged fields even when other clinical fields DO change", async () => {
    // allergies stays the same, but internalNotes changes — only 1 row expected.
    await updatePatient(
      patientP,
      { allergies: ["latex"], internalNotes: "new note" },
      { editingUserId: userAtB, editingHospitalId: hospB },
    );
    const rows = await auditFor(patientP);
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe("internalNotes");
  });

  it("enrols the editing hospital on the patient roster when clinical fields change", async () => {
    // Before: P is only rostered at A.
    await updatePatient(
      patientP,
      { allergies: ["penicillin"] },
      { editingUserId: userAtB, editingHospitalId: hospB },
    );
    const roster = await db
      .select()
      .from(patientHospitals)
      .where(eq(patientHospitals.patientId, patientP));
    const hospitalIds = roster.map((r) => r.hospitalId).sort();
    expect(hospitalIds).toContain(hospB);
    expect(hospitalIds).toContain(hospA);
  });

  it("omitting audit context behaves like the legacy single-location path", async () => {
    await updatePatient(patientP, { allergies: ["aspirin"] });
    const rows = await auditFor(patientP);
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Piece B: patient detail endpoint — group-aware access.
// ---------------------------------------------------------------------------
describe("GET /api/patients/:id — group-aware access", () => {
  it("user at the home hospital reads the chart: 200", async () => {
    const app = buildApp(userAtA);
    const res = await request(app)
      .get(`/api/patients/${patientP}`)
      .set("x-active-hospital-id", hospA);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(patientP);
  });

  it("user at a sibling hospital in the same group reads the chart: 200", async () => {
    const app = buildApp(userAtB);
    const res = await request(app)
      .get(`/api/patients/${patientP}`)
      .set("x-active-hospital-id", hospB);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(patientP);
  });

  it("user at an ungrouped hospital cannot read a chart in a group: 403", async () => {
    const app = buildApp(userAtC);
    const res = await request(app)
      .get(`/api/patients/${patientP}`)
      .set("x-active-hospital-id", hospC);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("RESOURCE_ACCESS_DENIED");
  });
});

// ---------------------------------------------------------------------------
// Piece C: hospitals-roster endpoint for the patient detail UI.
// ---------------------------------------------------------------------------
describe("GET /api/patients/:id/hospitals — roster endpoint", () => {
  it("returns all roster rows in ascending addedAt order", async () => {
    // Add a second roster row at B so the patient has been seen at both.
    await ensurePatientHospitalLink(patientP, hospB, null);

    const app = buildApp(userAtA);
    const res = await request(app)
      .get(`/api/patients/${patientP}/hospitals`)
      .set("x-active-hospital-id", hospA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    const hospitalIds = res.body.map((r: any) => r.hospitalId);
    expect(hospitalIds).toContain(hospA);
    expect(hospitalIds).toContain(hospB);
    // Each row has hospitalName + addedAt.
    for (const row of res.body) {
      expect(typeof row.hospitalName).toBe("string");
      expect(row.hospitalName.length).toBeGreaterThan(0);
      expect(row.addedAt).toBeDefined();
    }
  });

  it("a sibling-group user reads the roster: 200", async () => {
    const app = buildApp(userAtB);
    const res = await request(app)
      .get(`/api/patients/${patientP}/hospitals`)
      .set("x-active-hospital-id", hospB);
    expect(res.status).toBe(200);
  });

  it("an ungrouped-hospital user cannot read the roster: 403", async () => {
    const app = buildApp(userAtC);
    const res = await request(app)
      .get(`/api/patients/${patientP}/hospitals`)
      .set("x-active-hospital-id", hospC);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("RESOURCE_ACCESS_DENIED");
  });

  it("unknown patient: 404", async () => {
    const app = buildApp(userAtA);
    const res = await request(app)
      .get(`/api/patients/nonexistent-${uniq()}/hospitals`)
      .set("x-active-hospital-id", hospA);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Piece D: patient documents endpoint — group-aware access.
//
// The documents sub-route used to use the legacy `hospitals.some(h => h.id ===
// patient.hospitalId)` check, which denied cross-location staff (in the same
// group) access to a visiting patient's photos/documents. The final review
// rewired this and every other patient sub-route to
// `userHasGroupAwareHospitalAccess` — these tests pin that behavior.
// ---------------------------------------------------------------------------
describe("GET /api/patients/:id/documents — group-aware access", () => {
  it("user at the home hospital lists documents: 200", async () => {
    const app = buildApp(userAtA);
    const res = await request(app)
      .get(`/api/patients/${patientP}/documents`)
      .set("x-active-hospital-id", hospA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("user at a sibling hospital in the same group lists documents: 200", async () => {
    const app = buildApp(userAtB);
    const res = await request(app)
      .get(`/api/patients/${patientP}/documents`)
      .set("x-active-hospital-id", hospB);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("user at an ungrouped hospital cannot list documents in a group: 403", async () => {
    const app = buildApp(userAtC);
    const res = await request(app)
      .get(`/api/patients/${patientP}/documents`)
      .set("x-active-hospital-id", hospC);
    expect(res.status).toBe(403);
  });
});
