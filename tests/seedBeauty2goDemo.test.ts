import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db, pool } from "../server/db";
import {
  hospitalGroups,
  hospitals,
  clinicServices,
  patientHospitals,
  patients,
  userHospitalRoles,
  treatments,
  flows,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { seed, wipeExistingGroup } from "../server/scripts/seedBeauty2goDemo";

/**
 * Lightweight sanity test for the beauty2go demo seed.
 *
 * A full integration test would be overkill — the seed is a dev tool. We
 * just call seed() twice and check:
 *   1. Shape on first run (group, 3 hospitals, 5 group services, ~30
 *      patients, cross-location visits, treatments, flow)
 *   2. Idempotency — a second run produces the same counts (no duplicates)
 *
 * We rely on the seed's own cascade-clean to tear down when the test ends.
 */

const GROUP_NAME = "beauty2go (Demo)";

async function countOwnedRowsByGroup(groupId: string) {
  const memberHospitalIds = (
    await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId))
  ).map((h) => h.id);

  const groupServices = await db
    .select({ id: clinicServices.id })
    .from(clinicServices)
    .where(eq(clinicServices.groupId, groupId));

  const hospitalServices = memberHospitalIds.length
    ? await db
        .select({ id: clinicServices.id })
        .from(clinicServices)
        .where(inArray(clinicServices.hospitalId, memberHospitalIds))
    : [];

  const memberPatients = memberHospitalIds.length
    ? await db
        .select({ id: patients.id })
        .from(patients)
        .where(inArray(patients.hospitalId, memberHospitalIds))
    : [];

  const roster = memberHospitalIds.length
    ? await db
        .select({
          patientId: patientHospitals.patientId,
          hospitalId: patientHospitals.hospitalId,
        })
        .from(patientHospitals)
        .where(inArray(patientHospitals.hospitalId, memberHospitalIds))
    : [];

  const providers = memberHospitalIds.length
    ? await db
        .select({
          userId: userHospitalRoles.userId,
          hospitalId: userHospitalRoles.hospitalId,
        })
        .from(userHospitalRoles)
        .where(
          and(
            inArray(userHospitalRoles.hospitalId, memberHospitalIds),
            eq(userHospitalRoles.role, "doctor"),
          ),
        )
    : [];

  const treatmentsForMembers = memberHospitalIds.length
    ? await db
        .select({ id: treatments.id })
        .from(treatments)
        .where(inArray(treatments.hospitalId, memberHospitalIds))
    : [];

  const flowsForMembers = memberHospitalIds.length
    ? await db
        .select({ id: flows.id })
        .from(flows)
        .where(inArray(flows.hospitalId, memberHospitalIds))
    : [];

  const uniqueRosterPatients = new Set(roster.map((r) => r.patientId));
  const patientsWithMultipleLocations = Array.from(uniqueRosterPatients).filter(
    (pid) => roster.filter((r) => r.patientId === pid).length > 1,
  );

  return {
    memberHospitalIds,
    groupServiceCount: groupServices.length,
    hospitalServiceCount: hospitalServices.length,
    patientCount: memberPatients.length,
    rosterRowCount: roster.length,
    providerRoleCount: providers.length,
    uniqueProviderUserIds: new Set(providers.map((p) => p.userId)).size,
    treatmentCount: treatmentsForMembers.length,
    flowCount: flowsForMembers.length,
    crossLocationPatientCount: patientsWithMultipleLocations.length,
  };
}

// Track if a pre-existing group was present — we must NOT wipe the real
// demo data at end-of-test if it was there before we started.
let preExisting = false;

beforeAll(async () => {
  const [existing] = await db
    .select({ id: hospitalGroups.id })
    .from(hospitalGroups)
    .where(eq(hospitalGroups.name, GROUP_NAME));
  preExisting = !!existing;
});

afterAll(async () => {
  // Clean up: if the demo was not present before we started the test run,
  // wipe it. Otherwise leave it in place — the operator was using it.
  if (!preExisting) {
    const [existing] = await db
      .select({ id: hospitalGroups.id })
      .from(hospitalGroups)
      .where(eq(hospitalGroups.name, GROUP_NAME));
    if (existing) {
      await wipeExistingGroup(existing.id);
    }
  }
  await pool.end();
});

describe("seedBeauty2goDemo", () => {
  it(
    "creates the expected shape on first run",
    async () => {
      const summary = await seed();

      expect(summary.groupId).toBeTruthy();
      expect(summary.bookingToken).toMatch(/^beauty2go-demo-/);
      expect(summary.hospitalIds).toHaveLength(3);
      expect(summary.unitIds).toHaveLength(3);
      expect(summary.groupServiceIds).toHaveLength(5);
      expect(summary.hospitalServiceIds).toHaveLength(1);
      // 9 base providers + 1 rotating role row = 10 role rows. But
      // providerUserIds counts unique users, which should still be 9.
      expect(summary.providerUserIds).toHaveLength(9);
      expect(summary.roleIds.length).toBeGreaterThanOrEqual(10);
      expect(summary.patientIds).toHaveLength(30);
      expect(summary.crossLocationPatientIds).toHaveLength(6);
      // 6 cross-location patients × 2 treatments each = 12 treatments.
      expect(summary.treatmentIds).toHaveLength(12);
      expect(summary.flowIds).toHaveLength(1);

      const counts = await countOwnedRowsByGroup(summary.groupId);
      expect(counts.memberHospitalIds).toHaveLength(3);
      expect(counts.groupServiceCount).toBe(5);
      expect(counts.hospitalServiceCount).toBe(1);
      expect(counts.patientCount).toBe(30);
      // 30 home entries + 6 secondary = 36 roster rows.
      expect(counts.rosterRowCount).toBe(36);
      expect(counts.uniqueProviderUserIds).toBe(9);
      // 9 base roles + 1 rotating = 10 doctor role rows.
      expect(counts.providerRoleCount).toBe(10);
      expect(counts.treatmentCount).toBe(12);
      expect(counts.flowCount).toBe(1);
      expect(counts.crossLocationPatientCount).toBe(6);
    },
    60_000,
  );

  it(
    "is idempotent — second run produces identical counts",
    async () => {
      const summary = await seed();
      const counts = await countOwnedRowsByGroup(summary.groupId);

      expect(counts.memberHospitalIds).toHaveLength(3);
      expect(counts.groupServiceCount).toBe(5);
      expect(counts.hospitalServiceCount).toBe(1);
      expect(counts.patientCount).toBe(30);
      expect(counts.rosterRowCount).toBe(36);
      expect(counts.uniqueProviderUserIds).toBe(9);
      expect(counts.providerRoleCount).toBe(10);
      expect(counts.treatmentCount).toBe(12);
      expect(counts.flowCount).toBe(1);
      expect(counts.crossLocationPatientCount).toBe(6);

      // Also: exactly one group row still, no orphans.
      const groups = await db
        .select()
        .from(hospitalGroups)
        .where(eq(hospitalGroups.name, GROUP_NAME));
      expect(groups).toHaveLength(1);
    },
    60_000,
  );
});
