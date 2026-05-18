import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, pool } from '../server/db';
import {
  hospitals, units, users, patients, clinicAppointments,
  recoveryCases, recoveryCaseContacts,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { runBackfill } from '../scripts/backfill-recovery-cases';

const uniq = () => randomUUID().slice(0, 8);

let hospitalId: string;
let unitId: string;
let providerId: string;
let patientId: string;
const createdApptIds: string[] = [];

async function seedAppt(opts: {
  status: 'scheduled' | 'no_show' | 'cancelled' | 'confirmed';
  daysAgo: number;
  appointmentType?: 'external' | 'internal';
}) {
  const date = new Date(Date.now() - opts.daysAgo * 86400_000).toISOString().slice(0, 10);
  const [a] = await db.insert(clinicAppointments).values({
    hospitalId, unitId, patientId, providerId,
    appointmentType: opts.appointmentType ?? 'external',
    appointmentDate: date,
    startTime: '10:00', endTime: '10:30', durationMinutes: 30,
    status: opts.status,
  } as any).returning();
  createdApptIds.push(a.id);
  return a;
}

beforeAll(async () => {
  const [h] = await db.insert(hospitals).values({ name: `BackfillTest-${uniq()}` } as any).returning();
  hospitalId = h.id;
  const [u] = await db.insert(units).values({ hospitalId, name: 'Clinic', type: 'clinic' } as any).returning();
  unitId = u.id;
  const [prov] = await db.insert(users).values({ email: `bfprov-${uniq()}@test.test` } as any).returning();
  providerId = prov.id;
  const [p] = await db.insert(patients).values({
    hospitalId, firstName: 'Back', surname: 'Fill',
    patientNumber: `BF-${uniq()}`, birthday: '1990-01-01', sex: 'F',
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

describe('runBackfill', () => {
  it('creates cases for past no-shows and cancels within the window', async () => {
    await seedAppt({ status: 'no_show', daysAgo: 30 });
    await seedAppt({ status: 'no_show', daysAgo: 60 });
    await seedAppt({ status: 'cancelled', daysAgo: 45 });
    // Should be skipped: internal appointment type
    await seedAppt({ status: 'cancelled', daysAgo: 30, appointmentType: 'internal' });
    // Should be skipped: outside the 90-day window
    await seedAppt({ status: 'no_show', daysAgo: 200 });

    const stats = await runBackfill({ daysAgo: 90, hospitalId });

    expect(stats.created).toBe(3);
    // Internal isn't even in the candidate set (filtered by appointmentType)
    // but enqueueRecoveryCase would silently skip it if it were.
  });

  it('is idempotent on re-run', async () => {
    await seedAppt({ status: 'no_show', daysAgo: 30 });
    await seedAppt({ status: 'cancelled', daysAgo: 45 });

    const first = await runBackfill({ daysAgo: 90, hospitalId });
    expect(first.created).toBe(2);

    const second = await runBackfill({ daysAgo: 90, hospitalId });
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
  });

  it('auto-closes cancel-with-successor case directly as rescheduled', async () => {
    await seedAppt({ status: 'cancelled', daysAgo: 30 });
    // Future scheduled appointment for the same patient (negative daysAgo)
    await seedAppt({ status: 'scheduled', daysAgo: -30 });

    await runBackfill({ daysAgo: 90, hospitalId });

    const rows = await db.select().from(recoveryCases).where(eq(recoveryCases.hospitalId, hospitalId));
    const cancelCase = rows.find(r => r.trigger === 'cancelled')!;
    expect(cancelCase.status).toBe('rescheduled');
    expect(cancelCase.rescheduledAppointmentId).toBeTruthy();
  });
});
