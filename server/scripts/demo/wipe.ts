/* eslint-disable no-console */
//
// Cascade-clean every row that belongs to a beauty2go (Demo) group so the
// seed can safely re-run. Handles three failure modes the original wipe
// missed:
//
//  1. Multi-group leakage. `findFirst` on the group name only catches one
//     of the duplicate groups created by aborted prior runs. We iterate
//     every match instead.
//  2. Orphan test fixtures. Worktree vitest seeds (chain-funnels-endpoints
//     etc.) create chain hospitals named "H1-…" / "H-…" that leak when an
//     `afterAll` cleanup aborts. Wipe those too.
//  3. FK gaps. The original wipe predates several tables that now reference
//     hospitals/units (referral_events, clinic_appointments, leads,
//     provider_availability, provider_time_off, flow_steps, flow_executions,
//     flow_hospitals, clinic_invoices, clinic_invoice_items). Without those
//     deletes the hospital/unit drop fails mid-flight.
//
import { db } from "../../db";
import {
  hospitals,
  hospitalGroups,
  units,
  userHospitalRoles,
  users,
  clinicServices,
  clinicServiceProviders,
  patients,
  patientHospitals,
  treatments,
  treatmentLines,
  clinicAppointments,
  clinicInvoices,
  clinicInvoiceItems,
  referralEvents,
  leads,
  flows,
  flowSteps,
  flowExecutions,
  flowHospitals,
  providerAvailability,
  providerTimeOff,
  inventorySnapshots,
} from "../../../shared/schema";
import { and, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import {
  DEMO_FIXTURE_NAME_PATTERN,
  DEMO_GROUP_NAME_PATTERN,
  DEMO_BOOKING_TOKEN_PREFIX,
  PROVIDER_EMAIL_PATTERN,
  PATIENT_EMAIL_PATTERN,
} from "./skew";

/**
 * Wipe every chain demo row in the DB. Safe to run any time.
 *
 *   1. Wipe ALL hospital_groups rows whose name = GROUP_NAME (handles
 *      duplicates from prior aborted runs).
 *   2. Wipe orphan chain hospitals matching DEMO_FIXTURE_NAME_PATTERN
 *      (test-fixture leftovers with group_id set).
 */
export async function wipeAllDemoGroups(): Promise<void> {
  // 1. Multi-group wipe by name pattern (catches "beauty2go (Demo)" plus
  //    test-fixture group names). Conservative pattern — never matches a
  //    bare "beauty2go" or any real customer-shaped name.
  const groupsByName = await db
    .select({ id: hospitalGroups.id, name: hospitalGroups.name })
    .from(hospitalGroups)
    .where(sql`${hospitalGroups.name} ~ ${DEMO_GROUP_NAME_PATTERN}`);

  // 2. Also catch groups whose booking_token has the demo prefix — that's
  //    a strong demo signature even when the name was changed.
  const groupsByToken = await db
    .select({ id: hospitalGroups.id, name: hospitalGroups.name })
    .from(hospitalGroups)
    .where(
      sql`${hospitalGroups.bookingToken} LIKE ${DEMO_BOOKING_TOKEN_PREFIX + "%"}`,
    );

  const groups = [...groupsByName, ...groupsByToken];
  const groupIds = Array.from(new Set(groups.map((g) => g.id)));

  // 3. Orphan test-fixture hospitals — group_id set but name matches the
  //    H-prefix pattern from worktree vitest seeds.
  const orphanHospitalRows = await db
    .select({ id: hospitals.id, name: hospitals.name })
    .from(hospitals)
    .where(sql`${hospitals.name} ~ ${DEMO_FIXTURE_NAME_PATTERN} AND ${hospitals.groupId} IS NOT NULL`);

  // 4. Childless GROUPS that ALSO match the demo/test pattern. Restricted
  //    to those names so a real customer's empty group (e.g. a brand-new
  //    chain set up via /admin/groups but no clinics yet) is left alone.
  const childlessRows = await db.execute<{ id: string; name: string }>(sql`
    SELECT g.id, g.name FROM hospital_groups g
    LEFT JOIN hospitals h ON h.group_id = g.id
    WHERE h.id IS NULL
      AND g.name ~ ${DEMO_GROUP_NAME_PATTERN}
  `);
  const childlessGroupIds = (childlessRows.rows as any[]).map((r) => r.id);

  // Pre-wipe preview. Print everything we're about to delete so the user
  // can Ctrl-C if anything unexpected appears, especially in production.
  if (
    groupIds.length === 0 &&
    orphanHospitalRows.length === 0 &&
    childlessGroupIds.length === 0
  ) {
    console.log("  > no existing demo groups / orphan fixtures, nothing to wipe");
    return;
  }
  console.log("  > wipe plan:");
  if (groupIds.length > 0) {
    console.log(`     - ${groupIds.length} demo/test group(s):`);
    for (const id of groupIds) {
      const name = groups.find((g) => g.id === id)?.name ?? "?";
      console.log(`         · ${id}  ${name}`);
    }
  }
  if (orphanHospitalRows.length > 0) {
    console.log(`     - ${orphanHospitalRows.length} orphan test-fixture hospital(s):`);
    for (const h of orphanHospitalRows) {
      console.log(`         · ${h.id}  ${h.name}`);
    }
  }
  if (childlessGroupIds.length > 0) {
    console.log(`     - ${childlessGroupIds.length} childless demo/test group(s) to drop`);
  }

  // Now actually do the wipe.
  for (const id of groupIds) {
    const name = groups.find((g) => g.id === id)?.name;
    console.log(`  > wiping group ${id} (${name ?? "?"})`);
    await wipeExistingGroup(id);
  }
  if (orphanHospitalRows.length > 0) {
    await wipeHospitalsAndDependents(orphanHospitalRows.map((h) => h.id));
  }
  if (childlessGroupIds.length > 0) {
    await db.delete(hospitalGroups).where(inArray(hospitalGroups.id, childlessGroupIds));
  }
}

/**
 * Wipe a single demo group + its dependents. Kept exported because the
 * test suite calls it directly when it needs to clean only the group it
 * created (and not anything else in the dev DB).
 */
export async function wipeExistingGroup(groupId: string): Promise<void> {
  console.log(`  > found existing group ${groupId}, wiping cascade…`);

  const memberHospitals = await db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(eq(hospitals.groupId, groupId));
  await wipeHospitalsAndDependents(memberHospitals.map((h) => h.id));

  // Group-level service rows (hospitalId IS NULL, groupId set). The
  // hospital wipe above only catches services that point at member
  // hospitals; group services need a separate sweep.
  const groupServiceRows = await db
    .select({ id: clinicServices.id })
    .from(clinicServices)
    .where(eq(clinicServices.groupId, groupId));
  const groupServiceIds = groupServiceRows.map((r) => r.id);
  if (groupServiceIds.length > 0) {
    await db
      .delete(clinicServiceProviders)
      .where(inArray(clinicServiceProviders.serviceId, groupServiceIds));
    await db
      .delete(clinicServices)
      .where(inArray(clinicServices.id, groupServiceIds));
  }

  // Orphan demo provider users — but ONLY those whose every userHospitalRoles
  // row is at a hospital being wiped right now. If a provider has any role at
  // a hospital outside `memberHospitalIds`, leave the user (and their data)
  // strictly alone — they belong to a renamed/preserved group that the user
  // wants protected.
  const memberHospitalIds = memberHospitals.map((h) => h.id);
  const demoProviderRows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, PROVIDER_EMAIL_PATTERN));
  const demoProviderIds = demoProviderRows.map((u) => u.id);

  if (demoProviderIds.length > 0 && memberHospitalIds.length > 0) {
    // Find providers with at least one role at a hospital outside the wipe
    // scope — these are protected.
    const protectedRoleRows = await db
      .select({ userId: userHospitalRoles.userId })
      .from(userHospitalRoles)
      .where(
        and(
          inArray(userHospitalRoles.userId, demoProviderIds),
          notInArray(userHospitalRoles.hospitalId, memberHospitalIds),
        ),
      );
    const protectedProviderIds = new Set(protectedRoleRows.map((r) => r.userId));
    const wipeableProviderIds = demoProviderIds.filter(
      (id) => !protectedProviderIds.has(id),
    );

    if (wipeableProviderIds.length > 0) {
      await db
        .delete(treatments)
        .where(inArray(treatments.providerId, wipeableProviderIds));
      await db
        .delete(userHospitalRoles)
        .where(inArray(userHospitalRoles.userId, wipeableProviderIds));
      await db.delete(users).where(inArray(users.id, wipeableProviderIds));
    }
  } else if (demoProviderIds.length > 0) {
    // No member hospitals (childless group) — safe to fully wipe demo
    // providers since they can't be tied to any preserved group.
    await db
      .delete(treatments)
      .where(inArray(treatments.providerId, demoProviderIds));
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.userId, demoProviderIds));
    await db.delete(users).where(inArray(users.id, demoProviderIds));
  }

  // Finally, the group row itself.
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
}

/**
 * Cascade-clean every dependent row for the given hospitals. Order matters:
 * leaf tables first (lines, items, child rows that reference parents), then
 * parents, then units, then hospitals themselves. Ignoring this order causes
 * the FK errors we hit with the original wipe.
 */
async function wipeHospitalsAndDependents(hospitalIds: string[]): Promise<void> {
  if (hospitalIds.length === 0) return;

  // Resolve dependent IDs we'll need for child-row cleanup.
  const unitRows = await db
    .select({ id: units.id })
    .from(units)
    .where(inArray(units.hospitalId, hospitalIds));
  const unitIds = unitRows.map((u) => u.id);

  // Treatments at hospitals being wiped. We deliberately do NOT widen to
  // "every treatment by a demo-email patient" — if the user renamed the
  // group to keep it as a base, that group's treatments are protected.
  const hospitalScopedTreatments = await db
    .select({ id: treatments.id })
    .from(treatments)
    .where(inArray(treatments.hospitalId, hospitalIds));
  const treatmentIds = hospitalScopedTreatments.map((t) => t.id);

  const invoiceRows = await db
    .select({ id: clinicInvoices.id })
    .from(clinicInvoices)
    .where(inArray(clinicInvoices.hospitalId, hospitalIds));
  const invoiceIds = invoiceRows.map((i) => i.id);

  const flowRows = await db
    .select({ id: flows.id })
    .from(flows)
    .where(inArray(flows.hospitalId, hospitalIds));
  const flowIds = flowRows.map((f) => f.id);

  const hospitalServiceRows = await db
    .select({ id: clinicServices.id })
    .from(clinicServices)
    .where(inArray(clinicServices.hospitalId, hospitalIds));
  const hospitalServiceIds = hospitalServiceRows.map((s) => s.id);

  // 1. Leaf tables that reference treatments/appointments/invoices/flows.
  if (treatmentIds.length > 0) {
    await db
      .delete(treatmentLines)
      .where(inArray(treatmentLines.treatmentId, treatmentIds));
    await db.delete(treatments).where(inArray(treatments.id, treatmentIds));
  }
  if (invoiceIds.length > 0) {
    await db
      .delete(clinicInvoiceItems)
      .where(inArray(clinicInvoiceItems.invoiceId, invoiceIds));
    await db.delete(clinicInvoices).where(inArray(clinicInvoices.id, invoiceIds));
  }
  if (flowIds.length > 0) {
    await db.delete(flowExecutions).where(inArray(flowExecutions.flowId, flowIds));
    await db.delete(flowSteps).where(inArray(flowSteps.flowId, flowIds));
  }
  await db.delete(flowHospitals).where(inArray(flowHospitals.hospitalId, hospitalIds));

  // 2. Hospital-scoped tables. We deliberately do NOT do a cross-hospital
  //    sweep on demoPatientIds — if a renamed/preserved group has demo
  //    patients with referrals or appointments at its own hospitals, those
  //    rows must survive. Hospital-scope match is the only safe check.
  await db.delete(referralEvents).where(inArray(referralEvents.hospitalId, hospitalIds));
  await db.delete(leads).where(inArray(leads.hospitalId, hospitalIds));
  await db.delete(clinicAppointments).where(inArray(clinicAppointments.hospitalId, hospitalIds));
  await db.delete(providerAvailability).where(inArray(providerAvailability.hospitalId, hospitalIds));
  await db.delete(providerTimeOff).where(inArray(providerTimeOff.hospitalId, hospitalIds));
  await db.delete(flows).where(inArray(flows.hospitalId, hospitalIds));

  if (hospitalServiceIds.length > 0) {
    await db
      .delete(clinicServiceProviders)
      .where(inArray(clinicServiceProviders.serviceId, hospitalServiceIds));
    await db
      .delete(clinicServices)
      .where(inArray(clinicServices.id, hospitalServiceIds));
  }

  await db.delete(patientHospitals).where(inArray(patientHospitals.hospitalId, hospitalIds));
  await db
    .delete(patients)
    .where(
      and(
        inArray(patients.hospitalId, hospitalIds),
        like(patients.email, PATIENT_EMAIL_PATTERN),
      ),
    );

  // 3. Unit-scoped tables (anything blocking the unit drop).
  if (unitIds.length > 0) {
    await db
      .delete(inventorySnapshots)
      .where(inArray(inventorySnapshots.unitId, unitIds));
  }

  // 4. Hospital roles + units + the hospitals themselves.
  await db
    .delete(userHospitalRoles)
    .where(inArray(userHospitalRoles.hospitalId, hospitalIds));
  await db.delete(units).where(inArray(units.hospitalId, hospitalIds));
  await db
    .update(hospitals)
    .set({ groupId: null })
    .where(inArray(hospitals.id, hospitalIds));
  await db.delete(hospitals).where(inArray(hospitals.id, hospitalIds));
}
