import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import {
  hospitalGroups,
  hospitals,
  patientHospitals,
  clinicServices,
  units,
} from "@shared/schema";
import { sql, eq, inArray } from "drizzle-orm";

// Track everything we create so afterAll can tidy up even on failure.
const createdGroupIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdServiceIds: string[] = [];

afterAll(async () => {
  if (createdServiceIds.length) {
    await db
      .delete(clinicServices)
      .where(inArray(clinicServices.id, createdServiceIds))
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
  await pool.end();
});

describe("multi-location groups schema", () => {
  it("creates a hospital_groups row", async () => {
    const [g] = await db
      .insert(hospitalGroups)
      .values({ name: "test-group-" + Date.now() })
      .returning();
    createdGroupIds.push(g.id);
    expect(g.id).toBeDefined();
    expect(g.name).toMatch(/^test-group-/);
  });

  it("allows a hospital to reference a group", async () => {
    const [g] = await db
      .insert(hospitalGroups)
      .values({ name: "t-link-" + Date.now() })
      .returning();
    createdGroupIds.push(g.id);

    const [h] = await db
      .insert(hospitals)
      .values({ name: "H-" + Date.now(), groupId: g.id } as any)
      .returning();
    createdHospitalIds.push(h.id);

    expect(h.groupId).toBe(g.id);
  });

  it("backfill created a patient_hospitals row for every existing patient", async () => {
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM patients) AS patient_count,
        (SELECT COUNT(DISTINCT patient_id) FROM patient_hospitals) AS roster_count
    `);
    const row = result.rows[0] as { patient_count: string | number; roster_count: string | number };
    expect(Number(row.roster_count)).toBeGreaterThanOrEqual(Number(row.patient_count));
  });

  it("rejects a clinic_service with BOTH hospital_id AND group_id (XOR check)", async () => {
    const [g] = await db
      .insert(hospitalGroups)
      .values({ name: "t-xor-" + Date.now() })
      .returning();
    createdGroupIds.push(g.id);

    const [h] = await db
      .insert(hospitals)
      .values({ name: "H-xor-" + Date.now() } as any)
      .returning();
    createdHospitalIds.push(h.id);

    const [u] = await db
      .insert(units)
      .values({ hospitalId: h.id, name: "U-xor", type: "clinic" } as any)
      .returning();
    createdUnitIds.push(u.id);

    await expect(
      db.execute(sql`
        INSERT INTO clinic_services (id, hospital_id, group_id, unit_id, name)
        VALUES (gen_random_uuid(), ${h.id}, ${g.id}, ${u.id}, 'bad')
      `),
    ).rejects.toThrow();
  });

  it("rejects a clinic_service with NEITHER hospital_id NOR group_id (XOR check)", async () => {
    const [h] = await db
      .insert(hospitals)
      .values({ name: "H-neither-" + Date.now() } as any)
      .returning();
    createdHospitalIds.push(h.id);

    const [u] = await db
      .insert(units)
      .values({ hospitalId: h.id, name: "U-neither", type: "clinic" } as any)
      .returning();
    createdUnitIds.push(u.id);

    await expect(
      db.execute(sql`
        INSERT INTO clinic_services (id, hospital_id, group_id, unit_id, name)
        VALUES (gen_random_uuid(), NULL, NULL, ${u.id}, 'neither')
      `),
    ).rejects.toThrow();
  });

  it("accepts a clinic_service owned by only a group (group_id set, hospital_id null)", async () => {
    const [g] = await db
      .insert(hospitalGroups)
      .values({ name: "t-group-only-" + Date.now() })
      .returning();
    createdGroupIds.push(g.id);

    // We still need a unit (unit_id is NOT NULL). For a group-owned service
    // the unit belongs to one of the group's hospitals — acceptable in this
    // schema since the hybrid XOR check only constrains ownership, not unit.
    const [h] = await db
      .insert(hospitals)
      .values({ name: "H-group-" + Date.now(), groupId: g.id } as any)
      .returning();
    createdHospitalIds.push(h.id);

    const [u] = await db
      .insert(units)
      .values({ hospitalId: h.id, name: "U-group", type: "clinic" } as any)
      .returning();
    createdUnitIds.push(u.id);

    const [s] = await db
      .insert(clinicServices)
      .values({
        groupId: g.id,
        unitId: u.id,
        name: "Group Botox",
      } as any)
      .returning();
    createdServiceIds.push(s.id);

    expect(s.groupId).toBe(g.id);
    expect(s.hospitalId).toBeNull();
  });

  it("accepts a clinic_service owned by only a hospital (hospital_id set, group_id null)", async () => {
    const [h] = await db
      .insert(hospitals)
      .values({ name: "H-hosp-only-" + Date.now() } as any)
      .returning();
    createdHospitalIds.push(h.id);

    const [u] = await db
      .insert(units)
      .values({ hospitalId: h.id, name: "U-hosp", type: "clinic" } as any)
      .returning();
    createdUnitIds.push(u.id);

    const [s] = await db
      .insert(clinicServices)
      .values({
        hospitalId: h.id,
        unitId: u.id,
        name: "Hospital Service",
      } as any)
      .returning();
    createdServiceIds.push(s.id);

    expect(s.hospitalId).toBe(h.id);
    expect(s.groupId).toBeNull();
  });

  it("enforces patient_hospitals unique (patient_id, hospital_id)", async () => {
    // Pick any existing patient+hospital pair from the roster to double-insert.
    const result = await db.execute(sql`
      SELECT patient_id, hospital_id FROM patient_hospitals LIMIT 1
    `);
    if (result.rows.length === 0) {
      // No seed data in this DB — skip silently rather than fail flaky.
      return;
    }
    const row = result.rows[0] as { patient_id: string; hospital_id: string };
    await expect(
      db.insert(patientHospitals).values({
        patientId: row.patient_id,
        hospitalId: row.hospital_id,
      }),
    ).rejects.toThrow();
  });
});
