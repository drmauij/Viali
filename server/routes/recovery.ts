import { Router, type Response } from 'express';
import { db } from '../db';
import {
  recoveryCases, recoveryCaseContacts, clinicAppointments, clinicServices,
  patients, users,
} from '@shared/schema';
import { and, desc, eq, gte, lte, gt, ilike, inArray, or, sql } from 'drizzle-orm';
import { isAuthenticated } from '../auth/google';
import { isMarketingOrManager } from './leads';
import { computeVerifyConfidence } from '../services/recoveryCases';
import logger from '../logger';

const router = Router();

const VALID_STATUSES = ['pending', 'to_verify', 'in_progress', 'rescheduled', 'closed_lost', 'closed_other'] as const;
const VALID_TRIGGERS = ['no_show', 'cancelled'] as const;
const VALID_OUTCOMES = ['reached', 'no_answer', 'wants_callback', 'will_call_back', 'needs_time'] as const;

type RecoveryStatus = (typeof VALID_STATUSES)[number];

// Allowed status transitions (mirrors design spec status table).
const ALLOWED_TRANSITIONS: Record<RecoveryStatus, RecoveryStatus[]> = {
  pending:      ['to_verify', 'rescheduled', 'closed_lost', 'closed_other'],
  to_verify:    ['rescheduled', 'pending', 'closed_lost', 'closed_other'],
  in_progress:  ['to_verify', 'rescheduled', 'closed_lost', 'closed_other'],
  rescheduled:  ['pending'],
  closed_lost:  ['pending'],
  closed_other: ['pending'],
};

// GET /api/business/:hospitalId/recovery-cases — list with filters
router.get(
  '/api/business/:hospitalId/recovery-cases',
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const status = (req.query.status as string) || 'all';
      const trigger = (req.query.trigger as string) || 'all';
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const q = (req.query.q as string | undefined)?.trim();

      const conditions = [eq(recoveryCases.hospitalId, hospitalId)];
      if (status !== 'all' && (VALID_STATUSES as readonly string[]).includes(status)) {
        conditions.push(eq(recoveryCases.status, status as RecoveryStatus));
      }
      if (trigger !== 'all' && (VALID_TRIGGERS as readonly string[]).includes(trigger)) {
        conditions.push(eq(recoveryCases.trigger, trigger as any));
      }
      if (from) conditions.push(gte(clinicAppointments.appointmentDate, from));
      if (to) conditions.push(lte(clinicAppointments.appointmentDate, to));
      if (q) {
        const filter = or(
          ilike(patients.firstName, `%${q}%`),
          ilike(patients.surname, `%${q}%`),
          ilike(patients.phone, `%${q}%`),
        );
        if (filter) conditions.push(filter);
      }

      const rows = await db
        .select({
          id: recoveryCases.id,
          status: recoveryCases.status,
          trigger: recoveryCases.trigger,
          createdAt: recoveryCases.createdAt,
          appointmentId: recoveryCases.appointmentId,
          appointmentDate: clinicAppointments.appointmentDate,
          appointmentStartTime: clinicAppointments.startTime,
          appointmentServiceId: clinicAppointments.serviceId,
          appointmentProviderId: clinicAppointments.providerId,
          patientId: patients.id,
          patientFirstName: patients.firstName,
          patientSurname: patients.surname,
          patientPhone: patients.phone,
          patientEmail: patients.email,
          rescheduledAppointmentId: recoveryCases.rescheduledAppointmentId,
          contactCount: sql<number>`(SELECT COUNT(*) FROM recovery_case_contacts WHERE recovery_case_id = ${recoveryCases.id})`,
          lastContactOutcome: sql<string | null>`(SELECT outcome FROM recovery_case_contacts WHERE recovery_case_id = ${recoveryCases.id} ORDER BY created_at DESC LIMIT 1)`,
          lastContactAt: sql<Date | null>`(SELECT created_at FROM recovery_case_contacts WHERE recovery_case_id = ${recoveryCases.id} ORDER BY created_at DESC LIMIT 1)`,
        })
        .from(recoveryCases)
        .innerJoin(clinicAppointments, eq(clinicAppointments.id, recoveryCases.appointmentId))
        .innerJoin(patients, eq(patients.id, recoveryCases.patientId))
        .where(and(...conditions))
        .orderBy(desc(recoveryCases.createdAt))
        .limit(200);

      const verifyIds = rows
        .filter(r => r.status === 'to_verify' && r.rescheduledAppointmentId)
        .map(r => r.rescheduledAppointmentId!);
      const successors = verifyIds.length
        ? await db.select({
            id: clinicAppointments.id,
            appointmentDate: clinicAppointments.appointmentDate,
            startTime: clinicAppointments.startTime,
            serviceId: clinicAppointments.serviceId,
            providerId: clinicAppointments.providerId,
          }).from(clinicAppointments).where(inArray(clinicAppointments.id, verifyIds))
        : [];
      const successorById = new Map(successors.map(s => [s.id, s]));

      const enriched = rows.map(r => {
        if (r.status === 'to_verify' && r.rescheduledAppointmentId) {
          const s = successorById.get(r.rescheduledAppointmentId);
          if (s) {
            return {
              ...r,
              successor: s,
              verifyConfidence: computeVerifyConfidence(
                { serviceId: r.appointmentServiceId, providerId: r.appointmentProviderId },
                { serviceId: s.serviceId, providerId: s.providerId },
              ),
            };
          }
        }
        return r;
      });

      return res.json(enriched);
    } catch (err) {
      logger.error({ err }, 'Error listing recovery cases');
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/business/:hospitalId/recovery-cases-stats — counts by status
router.get(
  '/api/business/:hospitalId/recovery-cases-stats',
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const rows = await db
        .select({ status: recoveryCases.status, count: sql<number>`COUNT(*)` })
        .from(recoveryCases)
        .where(eq(recoveryCases.hospitalId, hospitalId))
        .groupBy(recoveryCases.status);

      const counts: Record<string, number> = {
        pending: 0, to_verify: 0, in_progress: 0,
        rescheduled: 0, closed_lost: 0, closed_other: 0,
      };
      for (const r of rows) counts[r.status] = Number(r.count);
      counts.open_total = counts.pending + counts.to_verify + counts.in_progress;

      return res.json(counts);
    } catch (err) {
      logger.error({ err }, 'Error fetching recovery stats');
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/business/:hospitalId/recovery-cases/:caseId — detail with contacts
router.get(
  '/api/business/:hospitalId/recovery-cases/:caseId',
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, caseId } = req.params;
      const [row] = await db
        .select({
          id: recoveryCases.id,
          status: recoveryCases.status,
          trigger: recoveryCases.trigger,
          rescheduledAppointmentId: recoveryCases.rescheduledAppointmentId,
          closedReason: recoveryCases.closedReason,
          closedAt: recoveryCases.closedAt,
          createdAt: recoveryCases.createdAt,
          appointmentId: recoveryCases.appointmentId,
          appointmentDate: clinicAppointments.appointmentDate,
          appointmentStartTime: clinicAppointments.startTime,
          appointmentServiceId: clinicAppointments.serviceId,
          appointmentProviderId: clinicAppointments.providerId,
          appointmentCancellationReason: clinicAppointments.cancellationReason,
          patientId: patients.id,
          patientFirstName: patients.firstName,
          patientSurname: patients.surname,
          patientPhone: patients.phone,
          patientEmail: patients.email,
        })
        .from(recoveryCases)
        .innerJoin(clinicAppointments, eq(clinicAppointments.id, recoveryCases.appointmentId))
        .innerJoin(patients, eq(patients.id, recoveryCases.patientId))
        .where(and(eq(recoveryCases.id, caseId), eq(recoveryCases.hospitalId, hospitalId)));
      if (!row) return res.status(404).json({ error: 'Not found' });

      const contacts = await db
        .select({
          id: recoveryCaseContacts.id,
          outcome: recoveryCaseContacts.outcome,
          note: recoveryCaseContacts.note,
          createdAt: recoveryCaseContacts.createdAt,
          createdBy: recoveryCaseContacts.createdBy,
          createdByName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        })
        .from(recoveryCaseContacts)
        .leftJoin(users, eq(users.id, recoveryCaseContacts.createdBy))
        .where(eq(recoveryCaseContacts.recoveryCaseId, caseId))
        .orderBy(desc(recoveryCaseContacts.createdAt));

      let successor: any = null;
      let verifyConfidence: 'high' | 'medium' | 'low' | null = null;
      if (row.status === 'to_verify' && row.rescheduledAppointmentId) {
        const [s] = await db.select({
          id: clinicAppointments.id,
          appointmentDate: clinicAppointments.appointmentDate,
          startTime: clinicAppointments.startTime,
          serviceId: clinicAppointments.serviceId,
          providerId: clinicAppointments.providerId,
        }).from(clinicAppointments).where(eq(clinicAppointments.id, row.rescheduledAppointmentId));
        if (s) {
          successor = s;
          verifyConfidence = computeVerifyConfidence(
            { serviceId: row.appointmentServiceId, providerId: row.appointmentProviderId },
            { serviceId: s.serviceId, providerId: s.providerId },
          );
        }
      }

      return res.json({ ...row, contacts, successor, verifyConfidence });
    } catch (err) {
      logger.error({ err }, 'Error fetching recovery case');
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/business/:hospitalId/recovery-cases/:caseId/status — change status
router.patch(
  '/api/business/:hospitalId/recovery-cases/:caseId/status',
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, caseId } = req.params;
      const { status: newStatus, closedReason, rescheduledAppointmentId } = req.body ?? {};

      if (!(VALID_STATUSES as readonly string[]).includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const [existing] = await db
        .select()
        .from(recoveryCases)
        .where(and(eq(recoveryCases.id, caseId), eq(recoveryCases.hospitalId, hospitalId)));
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const allowed = ALLOWED_TRANSITIONS[existing.status as RecoveryStatus] ?? [];
      if (!allowed.includes(newStatus as RecoveryStatus)) {
        return res.status(400).json({ error: `Cannot transition from ${existing.status} to ${newStatus}` });
      }

      // Manual pending/in_progress → rescheduled requires a successor id.
      if (newStatus === 'rescheduled' && (existing.status === 'pending' || existing.status === 'in_progress')) {
        if (!rescheduledAppointmentId) {
          return res.status(400).json({ error: 'rescheduledAppointmentId required for manual rescheduled transition' });
        }
      }

      const update: any = {
        status: newStatus,
        updatedAt: new Date(),
      };
      if (newStatus === 'rescheduled' || newStatus === 'closed_lost' || newStatus === 'closed_other') {
        update.closedAt = new Date();
        update.closedBy = req.user.id;
        if (newStatus === 'closed_lost' || newStatus === 'closed_other') {
          update.closedReason = closedReason ?? null;
        }
      }
      if (newStatus === 'pending') {
        update.closedAt = null;
        update.closedBy = null;
        update.closedReason = null;
        if (existing.status === 'to_verify') update.rescheduledAppointmentId = null;
      }
      if (rescheduledAppointmentId && newStatus === 'rescheduled') {
        update.rescheduledAppointmentId = rescheduledAppointmentId;
      }

      const [updated] = await db
        .update(recoveryCases)
        .set(update)
        .where(eq(recoveryCases.id, caseId))
        .returning();

      return res.json(updated);
    } catch (err) {
      logger.error({ err }, 'Error updating recovery case status');
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/business/:hospitalId/recovery-cases/:caseId/contacts — log contact
router.post(
  '/api/business/:hospitalId/recovery-cases/:caseId/contacts',
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, caseId } = req.params;
      const { outcome, note } = req.body ?? {};

      if (!(VALID_OUTCOMES as readonly string[]).includes(outcome)) {
        return res.status(400).json({ error: 'Invalid outcome' });
      }

      const [existing] = await db
        .select()
        .from(recoveryCases)
        .where(and(eq(recoveryCases.id, caseId), eq(recoveryCases.hospitalId, hospitalId)));
      if (!existing) return res.status(404).json({ error: 'Not found' });

      if (!['pending', 'to_verify', 'in_progress'].includes(existing.status)) {
        return res.status(400).json({ error: 'Cannot log contact on a closed case' });
      }

      const contact = await db.transaction(async (tx) => {
        const [c] = await tx.insert(recoveryCaseContacts).values({
          recoveryCaseId: caseId,
          outcome,
          note: note ?? null,
          createdBy: req.user.id,
        }).returning();

        if (existing.status === 'pending') {
          await tx.update(recoveryCases)
            .set({ status: 'in_progress', updatedAt: new Date() })
            .where(eq(recoveryCases.id, caseId));
        }
        return c;
      });

      return res.status(201).json(contact);
    } catch (err) {
      logger.error({ err }, 'Error logging recovery case contact');
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/business/:hospitalId/patients/:patientId/future-appointments
// Helper for the "Mark Rescheduled" drawer picker.
router.get(
  '/api/business/:hospitalId/patients/:patientId/future-appointments',
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, patientId } = req.params;
      const today = new Date().toISOString().slice(0, 10);

      const rows = await db
        .select({
          id: clinicAppointments.id,
          appointmentDate: clinicAppointments.appointmentDate,
          startTime: clinicAppointments.startTime,
          serviceId: clinicAppointments.serviceId,
          serviceName: clinicServices.name,
        })
        .from(clinicAppointments)
        .leftJoin(clinicServices, eq(clinicServices.id, clinicAppointments.serviceId))
        .where(and(
          eq(clinicAppointments.hospitalId, hospitalId),
          eq(clinicAppointments.patientId, patientId),
          eq(clinicAppointments.appointmentType, 'external'),
          inArray(clinicAppointments.status, ['scheduled', 'confirmed']),
          gte(clinicAppointments.appointmentDate, today),
        ))
        .orderBy(clinicAppointments.appointmentDate)
        .limit(20);

      return res.json(rows);
    } catch (err) {
      logger.error({ err }, 'Error listing patient future appointments');
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
