/* eslint-disable no-console */
/**
 * Dev-only: seed a demo A/B campaign with fake engagement events so the
 * FlowMetrics drill-down shows interesting numbers without needing a real
 * Resend webhook setup. Intended for the Patrick demo.
 *
 * Usage: npm run seed:ab-demo -- <hospital-id>
 */
import "dotenv/config";
import { db } from "../db";
import {
  flows,
  flowVariants,
  flowExecutions,
  flowEvents,
  patients,
  clinicAppointments,
  clinicServices,
  units,
  users,
  referralEvents,
} from "../../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const hospitalId = process.argv[2];
  if (!hospitalId) {
    console.error("Usage: npm run seed:ab-demo -- <hospital-id>");
    process.exit(1);
  }

  // Find a unit + provider + service to use for appointments
  const [unit] = await db
    .select({ id: units.id })
    .from(units)
    .where(eq(units.hospitalId, hospitalId))
    .limit(1);
  if (!unit) {
    console.error(`No units found on hospital ${hospitalId}`);
    process.exit(1);
  }

  const [provider] = await db.select({ id: users.id }).from(users).limit(1);
  if (!provider) {
    console.error("No users found");
    process.exit(1);
  }

  const [service] = await db
    .select({ id: clinicServices.id, price: clinicServices.price })
    .from(clinicServices)
    .where(eq(clinicServices.hospitalId, hospitalId))
    .limit(1);
  const serviceId = service?.id ?? null;

  const availablePatients = await db
    .select({ id: patients.id })
    .from(patients)
    .where(eq(patients.hospitalId, hospitalId))
    .limit(80);
  if (availablePatients.length < 20) {
    console.error(
      `Need at least 20 patients on hospital ${hospitalId}, found ${availablePatients.length}`
    );
    process.exit(1);
  }

  console.log(
    `Seeding demo flow on hospital ${hospitalId} with ${availablePatients.length} patients...`
  );

  // Create the demo flow
  const [flow] = await db
    .insert(flows)
    .values({
      hospitalId,
      name: "Demo: Spring Botox A/B",
      status: "sent",
      triggerType: "manual",
      channel: "email",
      messageTemplate: "Variant A (fallback)",
      abTestEnabled: true,
      abHoldoutPctPerArm: 10,
      recipientCount: availablePatients.length,
      sentAt: new Date(Date.now() - 2 * 86400000),
    })
    .returning();

  const [varA, varB] = await db
    .insert(flowVariants)
    .values([
      {
        flowId: flow.id,
        label: "A",
        messageTemplate: "Spring Glow — 20% off Botox, book now!",
        messageSubject: "Spring Glow 🌸",
      },
      {
        flowId: flow.id,
        label: "B",
        messageTemplate: "Refresh your look — 20% off Botox this week",
        messageSubject: "Refresh your look",
      },
    ])
    .returning();

  // Split: ~10% per arm to each variant, rest holdout
  const count = Math.min(80, availablePatients.length);
  const perArm = Math.max(5, Math.floor(count * 0.1));
  const aPatients = availablePatients.slice(0, perArm);
  const bPatients = availablePatients.slice(perArm, perArm * 2);
  const holdoutPatients = availablePatients.slice(perArm * 2, count);

  const executionsA = await db
    .insert(flowExecutions)
    .values(
      aPatients.map((p) => ({
        flowId: flow.id,
        patientId: p.id,
        variantId: varA.id,
        status: "completed",
        startedAt: new Date(Date.now() - 2 * 86400000),
        completedAt: new Date(Date.now() - 2 * 86400000),
      }))
    )
    .returning();

  const executionsB = await db
    .insert(flowExecutions)
    .values(
      bPatients.map((p) => ({
        flowId: flow.id,
        patientId: p.id,
        variantId: varB.id,
        status: "completed",
        startedAt: new Date(Date.now() - 2 * 86400000),
        completedAt: new Date(Date.now() - 2 * 86400000),
      }))
    )
    .returning();

  if (holdoutPatients.length > 0) {
    await db.insert(flowExecutions).values(
      holdoutPatients.map((p) => ({
        flowId: flow.id,
        patientId: p.id,
        variantId: null,
        status: "pending",
        startedAt: new Date(Date.now() - 2 * 86400000),
      }))
    );
  }

  // Engagement events: B outperforms A
  // Variant A: all sent, ~85% delivered, ~40% opened, ~15% clicked
  // Variant B: all sent, 100% delivered, ~75% opened, ~50% clicked
  for (const e of executionsA) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "sent", metadata: {} });
  }
  for (const e of executionsA.slice(
    0,
    Math.floor(executionsA.length * 0.85)
  )) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "delivered", metadata: {} });
  }
  for (const e of executionsA.slice(
    0,
    Math.floor(executionsA.length * 0.4)
  )) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "opened", metadata: {} });
  }
  for (const e of executionsA.slice(
    0,
    Math.floor(executionsA.length * 0.15)
  )) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "clicked", metadata: {} });
  }

  for (const e of executionsB) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "sent", metadata: {} });
  }
  for (const e of executionsB) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "delivered", metadata: {} });
  }
  for (const e of executionsB.slice(
    0,
    Math.floor(executionsB.length * 0.75)
  )) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "opened", metadata: {} });
  }
  for (const e of executionsB.slice(
    0,
    Math.floor(executionsB.length * 0.5)
  )) {
    await db
      .insert(flowEvents)
      .values({ executionId: e.id, eventType: "clicked", metadata: {} });
  }

  // Bookings: 1 from A, 4 from B — creates real appointments + referral_events
  const bookedA = executionsA.slice(0, 1);
  const bookedB = executionsB.slice(0, 4);

  for (const exec of [...bookedA, ...bookedB]) {
    const [appt] = await db
      .insert(clinicAppointments)
      .values({
        hospitalId,
        unitId: unit.id,
        appointmentType: "external",
        patientId: exec.patientId,
        providerId: provider.id,
        serviceId,
        appointmentDate: new Date().toISOString().slice(0, 10),
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: 60,
        status: "confirmed",
      })
      .returning();
    await db
      .update(flowExecutions)
      .set({ bookedAppointmentId: appt.id })
      .where(eq(flowExecutions.id, exec.id));
    await db.insert(referralEvents).values({
      hospitalId,
      patientId: exec.patientId,
      appointmentId: appt.id,
      source: "marketing",
      utmSource: "email_campaign",
      utmMedium: "email",
      utmCampaign: flow.name,
      utmContent: flow.id,
      flowExecutionId: exec.id,
      captureMethod: "utm",
    });
  }

  console.log(`✓ Seeded demo flow ${flow.id}`);
  console.log(`  /business/flows/${flow.id}/metrics`);
  console.log(`  Variant A: ${executionsA.length} sent, 1 booking`);
  console.log(`  Variant B: ${executionsB.length} sent, 4 bookings`);
  console.log(
    `  Hold-out: ${holdoutPatients.length} patients waiting for winner pick`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
