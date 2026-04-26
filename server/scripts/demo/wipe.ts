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
import { and, eq, inArray, like, sql } from "drizzle-orm";
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
  // 1. Multi-group wipe by name pattern (catches "beauty2go (Demo)",
  //    plus a renamed-to-"beauty2go" copy if someone touched it via
  //    /admin/groups, plus test-fixture group names).
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

  const groupIds = Array.from(
    new Set([...groupsByName.map((g) => g.id), ...groupsByToken.map((g) => g.id)]),
  );
  for (const id of groupIds) {
    const name = [...groupsByName, ...groupsByToken].find((g) => g.id === id)?.name;
    console.log(`  > wiping group ${id} (${name ?? "?"})`);
    await wipeExistingGroup(id);
  }
  if (groupIds.length === 0) {
    console.log("  > no existing demo groups, nothing to wipe");
  }

  // 3. Orphan test-fixture hospitals. These have group_id set but their
  //    parent group may already be gone. Catch them by name pattern.
  const orphanIdRows = await db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(sql`${hospitals.name} ~ ${DEMO_FIXTURE_NAME_PATTERN} AND ${hospitals.groupId} IS NOT NULL`);
  if (orphanIdRows.length > 0) {
    console.log(`  > wiping ${orphanIdRows.length} orphan test-fixture hospitals`);
    await wipeHospitalsAndDependents(orphanIdRows.map((h) => h.id));
  }

  // 4. Childless chain groups. After steps 1-3 these are orphan group rows
  //    whose hospitals were already deleted by an earlier abort. Safe to
  //    drop — no children means no real data.
  const childlessRows = await db.execute<{ id: string; name: string }>(sql`
    SELECT g.id, g.name FROM hospital_groups g
    LEFT JOIN hospitals h ON h.group_id = g.id
    WHERE h.id IS NULL
  `);
  const childlessIds = (childlessRows.rows as any[]).map((r) => r.id);
  if (childlessIds.length > 0) {
    console.log(`  > dropping ${childlessIds.length} childless chain group(s)`);
    await db.delete(hospitalGroups).where(inArray(hospitalGroups.id, childlessIds));
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

  // Orphan demo provider users. A previous run may have left rows at
  // hospitals that aren't in the current group (auto-provisioned admin
  // rows + treatments survive group restructure), so the hospital-scoped
  // deletes above don't catch them.
  const orphanedProviderRows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, PROVIDER_EMAIL_PATTERN));
  const orphanedProviderIds = orphanedProviderRows.map((u) => u.id);
  if (orphanedProviderIds.length > 0) {
    await db
      .delete(treatments)
      .where(inArray(treatments.providerId, orphanedProviderIds));
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.userId, orphanedProviderIds));
  }
  await db.delete(users).where(like(users.email, PROVIDER_EMAIL_PATTERN));

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

  // Demo patients (across the whole DB by email pattern). Their treatments
  // may be authored at hospitals outside the current demo group — typical
  // when a prior run failed mid-way and left orphans. Wipe both sets.
  const demoPatientRows = await db
    .select({ id: patients.id })
    .from(patients)
    .where(like(patients.email, PATIENT_EMAIL_PATTERN));
  const demoPatientIds = demoPatientRows.map((p) => p.id);

  const hospitalScopedTreatments = await db
    .select({ id: treatments.id })
    .from(treatments)
    .where(inArray(treatments.hospitalId, hospitalIds));
  const orphanPatientTreatments =
    demoPatientIds.length > 0
      ? await db
          .select({ id: treatments.id })
          .from(treatments)
          .where(inArray(treatments.patientId, demoPatientIds))
      : [];
  const treatmentIds = Array.from(
    new Set([
      ...hospitalScopedTreatments.map((t) => t.id),
      ...orphanPatientTreatments.map((t) => t.id),
    ]),
  );

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

  // 2. Hospital-scoped tables (most of them). For tables that reference
  //    patients (referral_events, clinic_appointments) we also catch rows
  //    that point at demo patients but live at non-demo hospitals — same
  //    orphan pattern as treatments above.
  if (demoPatientIds.length > 0) {
    await db
      .delete(referralEvents)
      .where(inArray(referralEvents.patientId, demoPatientIds));
    await db
      .delete(clinicAppointments)
      .where(inArray(clinicAppointments.patientId, demoPatientIds));
  }
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
