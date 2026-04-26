/* eslint-disable no-console */
//
// Per-clinic funnel data generator. For each chain location and each of
// three time windows (current 0-30d, prior 30-60d, older 60-90d at half
// density), inserts:
//
//   - referral_events (count = BASE_REFERRALS_PER_30D × LOCATION_SKEW)
//   - leads (count = BASE_LEADS_PER_30D × LOCATION_SKEW × density)
//   - clinic_appointments tied to ~APPOINTMENT_RATE of referrals, with a
//     weighted status mix (50% completed, 20% confirmed, 15% cancelled,
//     15% no_show) — drives no-show% on Cockpit anomalies
//   - treatments + treatment_lines tied to ~TREATMENT_RATE of completed
//     appointments — drives chain-wide referral→treatment conversion
//
// All randomness flows through `prng` so re-running the seed with the
// same SEED env produces identical output.
//
import { db } from "../../db";
import {
  referralEvents,
  leads,
  clinicAppointments,
  treatments,
  treatmentLines,
} from "../../../shared/schema";
import { eq } from "drizzle-orm";
import {
  LOCATION_SKEW,
  SOURCE_WEIGHTS,
  APPOINTMENT_STATUS_WEIGHTS,
  BASE_REFERRALS_PER_30D,
  BASE_LEADS_PER_30D,
  APPOINTMENT_RATE,
  TREATMENT_RATE,
  PERIOD_BOUNDS,
} from "./skew";
import { makePrng, type Prng } from "./prng";
import type { Location } from "./locations";
import type { ProviderRow } from "./providers";
import type { PatientRow } from "./patients";
import type { SeededServices } from "./services";

type Window = "current" | "prior" | "older";
const WINDOW_DENSITY: Record<Window, number> = {
  current: 1.0,
  prior: 1.0,
  older: 0.5,
};

export type FunnelStats = {
  referrals: number;
  leads: number;
  appointments: number;
  treatments: number;
};

export async function seedFunnelData(args: {
  locationRows: Location[];
  providers: ProviderRow[];
  patients: PatientRow[];
  services: SeededServices;
}): Promise<FunnelStats> {
  const { locationRows, providers, patients, services } = args;
  const prng = makePrng();
  const stats: FunnelStats = { referrals: 0, leads: 0, appointments: 0, treatments: 0 };

  console.log("Seeding funnel data (referrals + leads + appointments + treatments)…");

  for (const window of ["current", "prior", "older"] as const) {
    for (let hIdx = 0; hIdx < locationRows.length; hIdx++) {
      const loc = locationRows[hIdx];
      const skew = LOCATION_SKEW[loc.hospital.name];
      if (!skew) continue;
      const skewMult =
        window === "older" ? (skew.current + skew.prior) / 2 :
        window === "prior" ? skew.prior : skew.current;
      const density = WINDOW_DENSITY[window];

      const refCount = Math.round(BASE_REFERRALS_PER_30D * skewMult * density);
      const leadCount = Math.round(BASE_LEADS_PER_30D * skewMult * density);

      const clinicPatients = patients.filter((p) => p.homeIdx === hIdx);
      const clinicProviders = providers.filter((p) => p.hospitalIdx === hIdx);
      if (clinicPatients.length === 0 || clinicProviders.length === 0) continue;

      const r = await seedReferralsForClinic({
        loc, prng, count: refCount, window,
        clinicPatients, clinicProviders, services,
      });
      stats.referrals += r.referrals;
      stats.appointments += r.appointments;
      stats.treatments += r.treatments;

      const lead = await seedLeadsForClinic({
        loc, prng, count: leadCount, window,
        clinicPatients, clinicProviders, services,
      });
      stats.leads += lead.leads;
      stats.appointments += lead.appointments;
      stats.treatments += lead.treatments;

      console.log(
        `  > ${loc.hospital.name} [${window}] referrals=${r.referrals} appts=${r.appointments + lead.appointments} tx=${r.treatments + lead.treatments} leads=${lead.leads}`,
      );
    }
  }

  return stats;
}

async function seedReferralsForClinic(args: {
  loc: Location;
  prng: Prng;
  count: number;
  window: Window;
  clinicPatients: PatientRow[];
  clinicProviders: ProviderRow[];
  services: SeededServices;
}): Promise<{ referrals: number; appointments: number; treatments: number }> {
  const { loc, prng, count, window, clinicPatients, clinicProviders, services } = args;
  const period = PERIOD_BOUNDS[window];
  let appointmentsCount = 0;
  let treatmentsCount = 0;

  const allServices = [...services.groupServices, ...services.localServices];

  for (let i = 0; i < count; i++) {
    const patient = prng.pick(clinicPatients);
    const src = prng.weighted(SOURCE_WEIGHTS);
    const referralDate = prng.dateInRange(period.from, period.to);

    // Insert referral event without an appointment first.
    const [refEvent] = await db
      .insert(referralEvents)
      .values({
        hospitalId: loc.hospital.id,
        patientId: patient.patient.id,
        source: src.source,
        utmSource: src.utmSource,
        utmMedium: src.utmMedium,
        captureMethod: "utm",
        createdAt: referralDate,
      } as any)
      .returning();

    // Some referrals book an appointment.
    if (prng.next() >= APPOINTMENT_RATE) continue;

    const provider = prng.pick(clinicProviders);
    const status = prng.weighted(APPOINTMENT_STATUS_WEIGHTS);
    // Appointment date = 1-14 days after the referral.
    const apptDate = new Date(referralDate.getTime() + prng.range(1, 15) * 24 * 60 * 60 * 1000);
    const apptDateStr = apptDate.toISOString().slice(0, 10);

    const startHour = 9 + prng.range(0, 8); // 9-16
    const startTime = `${String(startHour).padStart(2, "0")}:00`;
    const endTime = `${String(startHour).padStart(2, "0")}:30`;

    // The (provider, date, start_time) unique partial index can reject an
    // insert when the random PRNG output happens to collide with a slot
    // already booked by the referral OR cross-location patient passes.
    // Skip that referral's appointment+treatment branch instead of
    // crashing the whole seed.
    const [appt] = await db
      .insert(clinicAppointments)
      .values({
        hospitalId: loc.hospital.id,
        unitId: loc.unit.id,
        patientId: patient.patient.id,
        providerId: provider.user.id,
        appointmentDate: apptDateStr,
        startTime,
        endTime,
        durationMinutes: 30,
        status: status.status,
      } as any)
      .onConflictDoNothing()
      .returning();
    if (!appt) continue;
    appointmentsCount++;

    // Link the referral to the appointment.
    await db
      .update(referralEvents)
      .set({ appointmentId: appt.id })
      .where(eq(referralEvents.id, refEvent.id));

    // Completed appointments → maybe a signed treatment.
    if (status.status !== "completed") continue;
    if (prng.next() >= TREATMENT_RATE) continue;

    const service = prng.pick(allServices);
    const [tx] = await db
      .insert(treatments)
      .values({
        hospitalId: loc.hospital.id,
        unitId: loc.unit.id,
        patientId: patient.patient.id,
        providerId: provider.user.id,
        appointmentId: appt.id,
        performedAt: apptDate,
        status: "signed",
      } as any)
      .returning();
    await db.insert(treatmentLines).values({
      treatmentId: tx.id,
      serviceId: service.id,
      unitPrice: service.price ?? "0",
      total: service.price ?? "0",
    } as any);
    treatmentsCount++;
  }

  return { referrals: count, appointments: appointmentsCount, treatments: treatmentsCount };
}

// A fraction of leads convert: link to a real patient, create an
// appointment, and (when the appointment is "completed") sometimes a
// signed treatment. The /chain/funnels Bookings / First-visits / Paid
// revenue KPIs are derived from leads.appointment_id + leads.patient_id,
// so without these links every KPI on that page reads 0.
async function seedLeadsForClinic(args: {
  loc: Location;
  prng: Prng;
  count: number;
  window: Window;
  clinicPatients: PatientRow[];
  clinicProviders: ProviderRow[];
  services: SeededServices;
}): Promise<{ leads: number; appointments: number; treatments: number }> {
  const { loc, prng, count, window, clinicPatients, clinicProviders, services } = args;
  const period = PERIOD_BOUNDS[window];
  const allServices = [...services.groupServices, ...services.localServices];
  let appointmentsCount = 0;
  let treatmentsCount = 0;

  for (let i = 0; i < count; i++) {
    const src = prng.weighted(SOURCE_WEIGHTS);
    const leadDate = prng.dateInRange(period.from, period.to);
    // Most converting leads need a known patient so the chain funnel's
    // payment lookup (treatments by patient_id) works. Anonymous leads
    // never convert.
    const known = clinicPatients.length > 0 && prng.next() < 0.5;
    const patient = known ? prng.pick(clinicPatients) : null;
    const willConvert = patient && prng.next() < APPOINTMENT_RATE;

    let appointmentId: string | null = null;
    if (willConvert && patient) {
      const provider = prng.pick(clinicProviders);
      const status = prng.weighted(APPOINTMENT_STATUS_WEIGHTS);
      const apptDate = new Date(leadDate.getTime() + prng.range(1, 15) * 24 * 60 * 60 * 1000);
      const apptDateStr = apptDate.toISOString().slice(0, 10);
      const startHour = 9 + prng.range(0, 8);
      const startTime = `${String(startHour).padStart(2, "0")}:00`;
      const endTime = `${String(startHour).padStart(2, "0")}:30`;

      // Skip on (provider, date, time) collision — same partial-unique
      // index as the referral path above.
      const [appt] = await db
        .insert(clinicAppointments)
        .values({
          hospitalId: loc.hospital.id,
          unitId: loc.unit.id,
          patientId: patient.patient.id,
          providerId: provider.user.id,
          appointmentDate: apptDateStr,
          startTime,
          endTime,
          durationMinutes: 30,
          status: status.status,
        } as any)
        .onConflictDoNothing()
        .returning();
      if (!appt) {
        // Lead row is still inserted below (just without appointment_id).
        // Skip the treatment branch entirely.
      } else {
        appointmentId = appt.id;
        appointmentsCount++;
      }

      // Completed appointments → maybe a signed treatment so the chain
      // funnel "paid_count" / revenue KPI is non-zero for converting leads.
      if (appt && status.status === "completed" && prng.next() < TREATMENT_RATE) {
        const service = prng.pick(allServices);
        const [tx] = await db
          .insert(treatments)
          .values({
            hospitalId: loc.hospital.id,
            unitId: loc.unit.id,
            patientId: patient.patient.id,
            providerId: provider.user.id,
            appointmentId: appt.id,
            performedAt: apptDate,
            status: "signed",
          } as any)
          .returning();
        await db.insert(treatmentLines).values({
          treatmentId: tx.id,
          serviceId: service.id,
          unitPrice: service.price ?? "0",
          total: service.price ?? "0",
        } as any);
        treatmentsCount++;
      }
    }

    await db.insert(leads).values({
      hospitalId: loc.hospital.id,
      patientId: patient?.patient.id ?? null,
      appointmentId,
      source: src.utmSource,
      utmSource: src.utmSource,
      utmMedium: src.utmMedium,
      firstName: patient?.patient.firstName ?? "Demo",
      lastName: patient?.patient.surname ?? `Lead-${i}`,
      email: patient?.patient.email ?? `demo-lead-${loc.hospital.id.slice(0, 6)}-${window}-${i}@example.local`,
      phone: patient?.patient.phone ?? "+41790000000",
      status: "new",
      createdAt: leadDate,
    } as any);
  }
  return { leads: count, appointments: appointmentsCount, treatments: treatmentsCount };
}
