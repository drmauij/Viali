import { db } from '../db';
import { recoveryCases, clinicAppointments, type ClinicAppointment } from '@shared/schema';
import { and, eq, gt, inArray } from 'drizzle-orm';

export type VerifyConfidence = 'high' | 'medium' | 'low';

interface ApptForHeuristic {
  serviceId: string | null;
  providerId: string;
}

export function computeVerifyConfidence(
  original: ApptForHeuristic,
  successor: ApptForHeuristic,
): VerifyConfidence {
  const sameService =
    original.serviceId != null &&
    successor.serviceId != null &&
    original.serviceId === successor.serviceId;
  const sameProvider = original.providerId === successor.providerId;

  if (sameService && sameProvider) return 'high';
  if (sameService || sameProvider) return 'medium';
  return 'low';
}

const FUTURE_APPT_STATUSES = ['scheduled', 'confirmed', 'arrived', 'in_progress', 'completed'] as const;

type DbLike = typeof db;

export async function enqueueRecoveryCase(
  appointment: ClinicAppointment,
  trigger: 'no_show' | 'cancelled',
  tx: DbLike,
): Promise<void> {
  if (appointment.appointmentType !== 'external') return;
  if (!appointment.patientId) return;

  const successors = await tx
    .select({
      id: clinicAppointments.id,
      appointmentDate: clinicAppointments.appointmentDate,
    })
    .from(clinicAppointments)
    .where(
      and(
        eq(clinicAppointments.patientId, appointment.patientId),
        eq(clinicAppointments.appointmentType, 'external'),
        inArray(clinicAppointments.status, [...FUTURE_APPT_STATUSES]),
        gt(clinicAppointments.appointmentDate, appointment.appointmentDate),
      ),
    )
    .orderBy(clinicAppointments.appointmentDate)
    .limit(1);

  const successor = successors[0] ?? null;

  // If the patient already has a future appointment, we treat the case as
  // already rescheduled — no coordinator review needed. closedBy is null
  // (system close). If no successor, the case lands as 'pending' for the
  // coordinator to work.
  const status = successor ? 'rescheduled' : 'pending';
  const closedAt = successor ? new Date() : null;

  await tx
    .insert(recoveryCases)
    .values({
      hospitalId: appointment.hospitalId,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      trigger,
      status,
      rescheduledAppointmentId: successor?.id ?? null,
      closedAt,
    })
    .onConflictDoNothing({ target: recoveryCases.appointmentId });
}

export async function reconcileRecoveryCasesForPatient(
  patientId: string,
  newAppointmentId: string,
  tx: DbLike,
): Promise<void> {
  const [newAppt] = await tx
    .select({ appointmentDate: clinicAppointments.appointmentDate })
    .from(clinicAppointments)
    .where(eq(clinicAppointments.id, newAppointmentId));
  if (!newAppt) return;

  const openCases = await tx
    .select({
      id: recoveryCases.id,
      originalApptDate: clinicAppointments.appointmentDate,
    })
    .from(recoveryCases)
    .innerJoin(clinicAppointments, eq(clinicAppointments.id, recoveryCases.appointmentId))
    .where(
      and(
        eq(recoveryCases.patientId, patientId),
        inArray(recoveryCases.status, ['pending', 'in_progress']),
      ),
    );

  const matching = openCases.filter(c => c.originalApptDate <= newAppt.appointmentDate);
  if (matching.length === 0) return;

  // Auto-close open cases as rescheduled when the patient books a new
  // appointment. System-initiated close (no closedBy) — coordinator can
  // re-open from any closed state if it turns out to be a false positive.
  const now = new Date();
  await tx
    .update(recoveryCases)
    .set({
      status: 'rescheduled',
      rescheduledAppointmentId: newAppointmentId,
      closedAt: now,
      updatedAt: now,
    })
    .where(inArray(recoveryCases.id, matching.map(c => c.id)));
}
