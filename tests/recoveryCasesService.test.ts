import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, pool } from '../server/db';
import {
  hospitals, units, users, patients, clinicAppointments,
  recoveryCases, recoveryCaseContacts,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { enqueueRecoveryCase, reconcileRecoveryCasesForPatient } from '../server/services/recoveryCases';

const uniq = () => randomUUID().slice(0, 8);

let hospitalId: string;
let unitId: string;
let providerId: string;
let patientId: string;
const createdApptIds: string[] = [];

async function seedAppointment(opts: {
  status: 'scheduled' | 'confirmed' | 'no_show' | 'cancelled' | 'completed';
  appointmentDate: string;
  appointmentType?: 'external' | 'internal';
  patientId?: string | null;
  serviceId?: string | null;
}) {
  const [a] = await db.insert(clinicAppointments).values({
    hospitalId,
    unitId,
    patientId: opts.patientId === undefined ? patientId : opts.patientId,
    providerId,
    appointmentType: opts.appointmentType ?? 'external',
    appointmentDate: opts.appointmentDate,
    startTime: '10:00',
    endTime: '10:30',
    durationMinutes: 30,
    status: opts.status,
    serviceId: opts.serviceId ?? null,
  } as any).returning();
  createdApptIds.push(a.id);
  return a;
}

beforeAll(async () => {
  const [h] = await db.insert(hospitals).values({ name: `RecoveryTest-${uniq()}` } as any).returning();
  hospitalId = h.id;
  const [u] = await db.insert(units).values({ hospitalId, name: 'Clinic', type: 'clinic' } as any).returning();
  unitId = u.id;
  const [prov] = await db.insert(users).values({ email: `recprov-${uniq()}@test.test` } as any).returning();
  providerId = prov.id;
  const [p] = await db.insert(patients).values({
    hospitalId, firstName: 'Rec', surname: 'Test',
    patientNumber: `R-${uniq()}`, birthday: '1990-01-01', sex: 'F',
  } as any).returning();
  patientId = p.id;
});

beforeEach(async () => {
  if (createdApptIds.length) {
    await db.delete(recoveryCaseContacts).where(
      inArray(recoveryCaseContacts.recoveryCaseId,
        db.select({ id: recoveryCases.id }).from(recoveryCases).where(inArray(recoveryCases.appointmentId, createdApptIds)) as any
      )
    ).catch(() => {});
    await db.delete(recoveryCases).where(inArray(recoveryCases.appointmentId, createdApptIds));
    await db.delete(clinicAppointments).where(inArray(clinicAppointments.id, createdApptIds));
    createdApptIds.length = 0;
  }
});

afterAll(async () => {
  if (createdApptIds.length) {
    await db.delete(recoveryCases).where(inArray(recoveryCases.appointmentId, createdApptIds));
    await db.delete(clinicAppointments).where(inArray(clinicAppointments.id, createdApptIds));
  }
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.delete(users).where(eq(users.id, providerId));
  await db.delete(units).where(eq(units.id, unitId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe('enqueueRecoveryCase', () => {
  it('creates a pending case for a no-show external appointment with no successor', async () => {
    const appt = await seedAppointment({ status: 'no_show', appointmentDate: '2026-05-01' });

    await enqueueRecoveryCase(appt as any, 'no_show', db);

    const rows = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].trigger).toBe('no_show');
    expect(rows[0].rescheduledAppointmentId).toBeNull();
  });

  it('creates a to_verify case when a future external appointment exists for the patient', async () => {
    const cancelled = await seedAppointment({ status: 'cancelled', appointmentDate: '2026-05-01' });
    const future = await seedAppointment({ status: 'scheduled', appointmentDate: '2026-06-15' });

    await enqueueRecoveryCase(cancelled as any, 'cancelled', db);

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, cancelled.id));
    expect(row.status).toBe('to_verify');
    expect(row.rescheduledAppointmentId).toBe(future.id);
  });

  it('is idempotent — calling twice does not create a duplicate', async () => {
    const appt = await seedAppointment({ status: 'no_show', appointmentDate: '2026-05-01' });

    await enqueueRecoveryCase(appt as any, 'no_show', db);
    await enqueueRecoveryCase(appt as any, 'no_show', db);

    const rows = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(rows).toHaveLength(1);
  });

  it('skips internal appointments', async () => {
    const appt = await seedAppointment({ status: 'cancelled', appointmentDate: '2026-05-01', appointmentType: 'internal' });

    await enqueueRecoveryCase(appt as any, 'cancelled', db);

    const rows = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(rows).toHaveLength(0);
  });

  it('skips appointments with no patient', async () => {
    const appt = await seedAppointment({ status: 'no_show', appointmentDate: '2026-05-01', patientId: null });

    await enqueueRecoveryCase(appt as any, 'no_show', db);

    const rows = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(rows).toHaveLength(0);
  });

  it('ignores cancelled/no_show appointments when checking for successors', async () => {
    const original = await seedAppointment({ status: 'no_show', appointmentDate: '2026-05-01' });
    // Another cancelled appointment in the future — should NOT count as a rebook
    await seedAppointment({ status: 'cancelled', appointmentDate: '2026-06-15' });

    await enqueueRecoveryCase(original as any, 'no_show', db);

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, original.id));
    expect(row.status).toBe('pending');
  });
});

describe('reconcileRecoveryCasesForPatient', () => {
  it('transitions pending cases to to_verify when a new appointment is created', async () => {
    const original = await seedAppointment({ status: 'no_show', appointmentDate: '2026-05-01' });
    await enqueueRecoveryCase(original as any, 'no_show', db);

    const newAppt = await seedAppointment({ status: 'scheduled', appointmentDate: '2026-06-15' });

    await reconcileRecoveryCasesForPatient(patientId, newAppt.id, db);

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, original.id));
    expect(row.status).toBe('to_verify');
    expect(row.rescheduledAppointmentId).toBe(newAppt.id);
  });

  it('transitions in_progress cases too', async () => {
    const original = await seedAppointment({ status: 'cancelled', appointmentDate: '2026-05-01' });
    await enqueueRecoveryCase(original as any, 'cancelled', db);
    await db.update(recoveryCases).set({ status: 'in_progress' }).where(eq(recoveryCases.appointmentId, original.id));

    const newAppt = await seedAppointment({ status: 'confirmed', appointmentDate: '2026-06-15' });

    await reconcileRecoveryCasesForPatient(patientId, newAppt.id, db);

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, original.id));
    expect(row.status).toBe('to_verify');
  });

  it('does not touch already-closed cases', async () => {
    const original = await seedAppointment({ status: 'no_show', appointmentDate: '2026-05-01' });
    await enqueueRecoveryCase(original as any, 'no_show', db);
    await db.update(recoveryCases).set({ status: 'closed_lost' }).where(eq(recoveryCases.appointmentId, original.id));

    const newAppt = await seedAppointment({ status: 'scheduled', appointmentDate: '2026-06-15' });

    await reconcileRecoveryCasesForPatient(patientId, newAppt.id, db);

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, original.id));
    expect(row.status).toBe('closed_lost');
  });

  it('only transitions cases whose original appointment is before the new one', async () => {
    const old = await seedAppointment({ status: 'no_show', appointmentDate: '2026-05-01' });
    await enqueueRecoveryCase(old as any, 'no_show', db);

    const earlier = await seedAppointment({ status: 'scheduled', appointmentDate: '2026-04-01' });

    await reconcileRecoveryCasesForPatient(patientId, earlier.id, db);

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, old.id));
    expect(row.status).toBe('pending');
  });
});
