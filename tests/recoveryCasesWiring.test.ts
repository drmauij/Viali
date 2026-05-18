import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, pool } from '../server/db';
import {
  hospitals, units, users, patients, clinicAppointments, recoveryCases, recoveryCaseContacts,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createClinicAppointment, updateClinicAppointment } from '../server/storage/clinic';

const uniq = () => randomUUID().slice(0, 8);

let hospitalId: string;
let unitId: string;
let providerId: string;
let patientId: string;
const createdApptIds: string[] = [];

async function makeAppt(opts: {
  status: 'scheduled' | 'confirmed' | 'no_show' | 'cancelled' | 'completed';
  appointmentDate: string;
  appointmentType?: 'external' | 'internal';
  patientId?: string | null;
}) {
  const created = await createClinicAppointment({
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
  } as any);
  createdApptIds.push(created.id);
  return created;
}

beforeAll(async () => {
  const [h] = await db.insert(hospitals).values({ name: `WireTest-${uniq()}` } as any).returning();
  hospitalId = h.id;
  const [u] = await db.insert(units).values({ hospitalId, name: 'Clinic', type: 'clinic' } as any).returning();
  unitId = u.id;
  const [prov] = await db.insert(users).values({ email: `wireprov-${uniq()}@test.test` } as any).returning();
  providerId = prov.id;
  const [p] = await db.insert(patients).values({
    hospitalId, firstName: 'Wire', surname: 'Test',
    patientNumber: `W-${uniq()}`, birthday: '1990-01-01', sex: 'F',
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

describe('storage.updateClinicAppointment recovery hook', () => {
  it('creates a pending case when transitioning to no_show', async () => {
    const appt = await makeAppt({ status: 'scheduled', appointmentDate: '2026-05-01' });

    await updateClinicAppointment(appt.id, { status: 'no_show' });

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(row).toBeDefined();
    expect(row.status).toBe('pending');
    expect(row.trigger).toBe('no_show');
  });

  it('creates a pending case when transitioning to cancelled', async () => {
    const appt = await makeAppt({ status: 'scheduled', appointmentDate: '2026-05-01' });

    await updateClinicAppointment(appt.id, { status: 'cancelled', cancellationReason: 'patient cancelled' });

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(row).toBeDefined();
    expect(row.trigger).toBe('cancelled');
  });

  it('does NOT create a case for an in-place reschedule (date change, status stays scheduled)', async () => {
    const appt = await makeAppt({ status: 'scheduled', appointmentDate: '2026-05-01' });

    await updateClinicAppointment(appt.id, { appointmentDate: '2026-05-08' });

    const rows = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(rows).toHaveLength(0);
  });

  it('does NOT create a case for internal appointments', async () => {
    const appt = await makeAppt({ status: 'scheduled', appointmentDate: '2026-05-01', appointmentType: 'internal', patientId: null });

    await updateClinicAppointment(appt.id, { status: 'cancelled' });

    const rows = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, appt.id));
    expect(rows).toHaveLength(0);
  });
});

describe('storage.createClinicAppointment recovery hook', () => {
  it('moves an open recovery case to to_verify when patient gets a new appointment', async () => {
    const cancelled = await makeAppt({ status: 'scheduled', appointmentDate: '2026-05-01' });
    await updateClinicAppointment(cancelled.id, { status: 'cancelled' });
    // confirm pending first
    let [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, cancelled.id));
    expect(row.status).toBe('pending');

    // Patient books a new appointment (creates via storage helper).
    const next = await makeAppt({ status: 'scheduled', appointmentDate: '2026-06-15' });

    [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, cancelled.id));
    expect(row.status).toBe('to_verify');
    expect(row.rescheduledAppointmentId).toBe(next.id);
  });

  it('does not touch a case for internal appointment creates', async () => {
    const cancelled = await makeAppt({ status: 'scheduled', appointmentDate: '2026-05-01' });
    await updateClinicAppointment(cancelled.id, { status: 'cancelled' });

    await makeAppt({ status: 'scheduled', appointmentDate: '2026-06-15', appointmentType: 'internal', patientId: null });

    const [row] = await db.select().from(recoveryCases).where(eq(recoveryCases.appointmentId, cancelled.id));
    expect(row.status).toBe('pending');
  });
});
