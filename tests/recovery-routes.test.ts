import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { db, pool } from '../server/db';
import {
  hospitals, units, users, userHospitalRoles, patients, clinicAppointments,
  recoveryCases, recoveryCaseContacts,
} from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const uniq = () => randomUUID().slice(0, 8);

let userId: string;
let unauthorizedUserId: string;

// `isAuthenticated` consults the session — we stub it to pull the user from
// a header so each test can target the authorized or the unauthorized user.
vi.mock('../server/auth/google', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    const u = req.headers['x-test-user'];
    if (u) req.user = { id: u };
    next();
  },
}));

let recoveryRouter: any;
let hospitalId: string;
let unitId: string;
let providerId: string;
let patientId: string;
const createdApptIds: string[] = [];
const createdRoleIds: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(recoveryRouter);
  return app;
}

async function seedAppt(opts: {
  status: 'scheduled' | 'confirmed' | 'no_show' | 'cancelled' | 'completed';
  appointmentDate: string;
  appointmentType?: 'external' | 'internal';
  serviceId?: string | null;
}) {
  const [a] = await db.insert(clinicAppointments).values({
    hospitalId, unitId, patientId, providerId,
    appointmentType: opts.appointmentType ?? 'external',
    appointmentDate: opts.appointmentDate,
    startTime: '10:00', endTime: '10:30', durationMinutes: 30,
    status: opts.status, serviceId: opts.serviceId ?? null,
  } as any).returning();
  createdApptIds.push(a.id);
  return a;
}

beforeAll(async () => {
  recoveryRouter = (await import('../server/routes/recovery')).default;

  const [h] = await db.insert(hospitals).values({ name: `RouteTest-${uniq()}` } as any).returning();
  hospitalId = h.id;
  const [u] = await db.insert(units).values({ hospitalId, name: 'Clinic', type: 'clinic' } as any).returning();
  unitId = u.id;
  const [prov] = await db.insert(users).values({ email: `routeprov-${uniq()}@test.test` } as any).returning();
  providerId = prov.id;
  const [admin] = await db.insert(users).values({ email: `admin-${uniq()}@test.test` } as any).returning();
  userId = admin.id;
  const [staff] = await db.insert(users).values({ email: `staff-${uniq()}@test.test` } as any).returning();
  unauthorizedUserId = staff.id;
  const [role] = await db.insert(userHospitalRoles).values({
    userId, hospitalId, unitId, role: 'admin',
  } as any).returning();
  createdRoleIds.push(role.id);
  // Unauthorized user has no role at this hospital → isMarketingOrManager → 403
  const [p] = await db.insert(patients).values({
    hospitalId, firstName: 'Route', surname: 'Patient',
    patientNumber: `RT-${uniq()}`, birthday: '1990-01-01', sex: 'F',
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
  if (createdRoleIds.length) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds));
  }
  await db.delete(users).where(inArray(users.id, [userId, unauthorizedUserId, providerId]));
  await db.delete(units).where(eq(units.id, unitId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe('GET /api/business/:hospitalId/recovery-cases', () => {
  it('returns cases filtered by status', async () => {
    const appt1 = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const appt2 = await seedAppt({ status: 'cancelled', appointmentDate: '2026-05-02' });
    await db.insert(recoveryCases).values([
      { hospitalId, appointmentId: appt1.id, patientId, trigger: 'no_show', status: 'pending' },
      { hospitalId, appointmentId: appt2.id, patientId, trigger: 'cancelled', status: 'closed_lost', closedAt: new Date(), closedBy: userId },
    ] as any);

    const res = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases?status=pending`)
      .set('x-test-user', userId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('pending');
  });

  it('returns verifyConfidence on to_verify rows', async () => {
    const original = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01', serviceId: null });
    const successor = await seedAppt({ status: 'scheduled', appointmentDate: '2026-06-15', serviceId: null });
    await db.insert(recoveryCases).values({
      hospitalId, appointmentId: original.id, patientId,
      trigger: 'no_show', status: 'to_verify',
      rescheduledAppointmentId: successor.id,
    } as any);

    const res = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases?status=to_verify`)
      .set('x-test-user', userId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // Same provider, both serviceId null → service-equality false, provider match → medium
    expect(res.body[0].verifyConfidence).toBe('medium');
    expect(res.body[0].successor).toBeDefined();
    expect(res.body[0].successor.id).toBe(successor.id);
  });

  it('filters by patient name via q parameter', async () => {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status: 'pending',
    } as any);

    const matched = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases?q=Route`)
      .set('x-test-user', userId);
    expect(matched.body).toHaveLength(1);

    const missed = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases?q=Nobody`)
      .set('x-test-user', userId);
    expect(missed.body).toHaveLength(0);
  });
});

describe('GET /api/business/:hospitalId/recovery-cases-stats', () => {
  it('returns counts by status with open_total', async () => {
    const a1 = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const a2 = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-02' });
    const a3 = await seedAppt({ status: 'cancelled', appointmentDate: '2026-05-03' });
    await db.insert(recoveryCases).values([
      { hospitalId, appointmentId: a1.id, patientId, trigger: 'no_show', status: 'pending' },
      { hospitalId, appointmentId: a2.id, patientId, trigger: 'no_show', status: 'in_progress' },
      { hospitalId, appointmentId: a3.id, patientId, trigger: 'cancelled', status: 'rescheduled', closedAt: new Date(), closedBy: userId },
    ] as any);

    const res = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases-stats`)
      .set('x-test-user', userId);
    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(1);
    expect(res.body.in_progress).toBe(1);
    expect(res.body.rescheduled).toBe(1);
    expect(res.body.open_total).toBe(2); // pending + to_verify + in_progress
  });
});

describe('GET /api/business/:hospitalId/recovery-cases/:caseId', () => {
  it('returns the case with contact history', async () => {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const [rc] = await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status: 'in_progress',
    } as any).returning();
    await db.insert(recoveryCaseContacts).values([
      { recoveryCaseId: rc.id, outcome: 'no_answer', createdBy: userId, note: 'first try' },
      { recoveryCaseId: rc.id, outcome: 'reached', createdBy: userId, note: 'wants to think' },
    ] as any);

    const res = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases/${rc.id}`)
      .set('x-test-user', userId);
    expect(res.status).toBe(200);
    expect(res.body.contacts).toHaveLength(2);
    expect(res.body.patientFirstName).toBe('Route');
  });

  it('404s on a case from another hospital', async () => {
    const res = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases/${randomUUID()}`)
      .set('x-test-user', userId);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/business/:hospitalId/recovery-cases/:caseId/status', () => {
  async function makeCase(status: 'pending' | 'to_verify' | 'in_progress' = 'pending', successorId: string | null = null) {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const [rc] = await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status,
      rescheduledAppointmentId: successorId,
    } as any).returning();
    return rc;
  }

  it('transitions to_verify → rescheduled and stamps closedBy/closedAt', async () => {
    const successor = await seedAppt({ status: 'scheduled', appointmentDate: '2026-06-15' });
    const rc = await makeCase('to_verify', successor.id);

    const res = await request(buildApp())
      .patch(`/api/business/${hospitalId}/recovery-cases/${rc.id}/status`)
      .set('x-test-user', userId)
      .send({ status: 'rescheduled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rescheduled');
    expect(res.body.closedAt).toBeTruthy();
    expect(res.body.closedBy).toBe(userId);
  });

  it('transitions to_verify → pending (re-open) and clears successor', async () => {
    const successor = await seedAppt({ status: 'scheduled', appointmentDate: '2026-06-15' });
    const rc = await makeCase('to_verify', successor.id);

    const res = await request(buildApp())
      .patch(`/api/business/${hospitalId}/recovery-cases/${rc.id}/status`)
      .set('x-test-user', userId)
      .send({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.rescheduledAppointmentId).toBeNull();
  });

  it('transitions to closed_lost with a reason', async () => {
    const rc = await makeCase('pending');

    const res = await request(buildApp())
      .patch(`/api/business/${hospitalId}/recovery-cases/${rc.id}/status`)
      .set('x-test-user', userId)
      .send({ status: 'closed_lost', closedReason: 'Patient declined' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed_lost');
    expect(res.body.closedReason).toBe('Patient declined');
  });

  it('rejects illegal transitions (pending → in_progress)', async () => {
    const rc = await makeCase('pending');
    const res = await request(buildApp())
      .patch(`/api/business/${hospitalId}/recovery-cases/${rc.id}/status`)
      .set('x-test-user', userId)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(400);
  });

  it('rejects pending → rescheduled without rescheduledAppointmentId', async () => {
    const rc = await makeCase('pending');
    const res = await request(buildApp())
      .patch(`/api/business/${hospitalId}/recovery-cases/${rc.id}/status`)
      .set('x-test-user', userId)
      .send({ status: 'rescheduled' });
    expect(res.status).toBe(400);
  });

  it('accepts pending → rescheduled with rescheduledAppointmentId', async () => {
    const successor = await seedAppt({ status: 'scheduled', appointmentDate: '2026-06-15' });
    const rc = await makeCase('pending');
    const res = await request(buildApp())
      .patch(`/api/business/${hospitalId}/recovery-cases/${rc.id}/status`)
      .set('x-test-user', userId)
      .send({ status: 'rescheduled', rescheduledAppointmentId: successor.id });
    expect(res.status).toBe(200);
    expect(res.body.rescheduledAppointmentId).toBe(successor.id);
  });
});

describe('POST /api/business/:hospitalId/recovery-cases/:caseId/contacts', () => {
  it('logs a contact and auto-transitions pending → in_progress', async () => {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const [rc] = await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status: 'pending',
    } as any).returning();

    const res = await request(buildApp())
      .post(`/api/business/${hospitalId}/recovery-cases/${rc.id}/contacts`)
      .set('x-test-user', userId)
      .send({ outcome: 'no_answer', note: 'Tried mobile' });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe('no_answer');

    const [updated] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, rc.id));
    expect(updated.status).toBe('in_progress');
  });

  it('logs a contact on in_progress without changing status', async () => {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const [rc] = await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status: 'in_progress',
    } as any).returning();

    await request(buildApp())
      .post(`/api/business/${hospitalId}/recovery-cases/${rc.id}/contacts`)
      .set('x-test-user', userId)
      .send({ outcome: 'reached' })
      .expect(201);

    const [updated] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, rc.id));
    expect(updated.status).toBe('in_progress');
  });

  it('rejects logging contact on a closed case', async () => {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const [rc] = await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status: 'closed_lost',
      closedAt: new Date(), closedBy: userId,
    } as any).returning();

    await request(buildApp())
      .post(`/api/business/${hospitalId}/recovery-cases/${rc.id}/contacts`)
      .set('x-test-user', userId)
      .send({ outcome: 'reached' })
      .expect(400);
  });

  it('rejects invalid outcome', async () => {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    const [rc] = await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status: 'pending',
    } as any).returning();

    await request(buildApp())
      .post(`/api/business/${hospitalId}/recovery-cases/${rc.id}/contacts`)
      .set('x-test-user', userId)
      .send({ outcome: 'invalid_outcome' })
      .expect(400);
  });
});

describe('GET /api/business/:hospitalId/patients/:patientId/future-appointments', () => {
  it('returns only future external scheduled/confirmed appointments', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);

    await seedAppt({ status: 'scheduled', appointmentDate: future });
    await seedAppt({ status: 'cancelled', appointmentDate: future });
    await seedAppt({ status: 'scheduled', appointmentDate: past });
    await seedAppt({ status: 'scheduled', appointmentDate: future, appointmentType: 'internal' });

    const res = await request(buildApp())
      .get(`/api/business/${hospitalId}/patients/${patientId}/future-appointments`)
      .set('x-test-user', userId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].appointmentDate).toBe(future);
  });
});

describe('Permission gating', () => {
  it('returns 403 for users without marketing/manager role at the hospital', async () => {
    const appt = await seedAppt({ status: 'no_show', appointmentDate: '2026-05-01' });
    await db.insert(recoveryCases).values({
      hospitalId, appointmentId: appt.id, patientId,
      trigger: 'no_show', status: 'pending',
    } as any);

    const res = await request(buildApp())
      .get(`/api/business/${hospitalId}/recovery-cases`)
      .set('x-test-user', unauthorizedUserId);
    expect(res.status).toBe(403);
  });
});
