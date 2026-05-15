import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared mutable test state — reset in beforeEach.
type LeadRow = {
  id: string; hospitalId: string; email: string | null;
  status: 'new' | 'in_progress' | 'converted' | 'closed';
  patientId: string | null; appointmentId: string | null;
};
type RefRow = { appointmentId: string; leadId: string | null };

let leadsTable: LeadRow[] = [];
let refTable: RefRow[] = [];

process.env.LEAD_ATTRIBUTION_SECRET = 'test-secret';

vi.mock('../server/db', () => {
  return {
    db: {
      select: () => ({
        from: (tbl: any) => ({
          where: (_w: any) => ({
            orderBy: () => ({
              limit: async (_n: number) => {
                if (tbl.__name === 'leads') {
                  return (globalThis as any).__leadsQuery?.() ?? [];
                }
                return [];
              },
            }),
            limit: async (_n: number) => {
              if (tbl.__name === 'leads') return (globalThis as any).__leadsQuery?.() ?? [];
              return [];
            },
          }),
        }),
      }),
      update: (tbl: any) => ({
        set: (vals: any) => ({
          where: (_w: any) => ({
            returning: async () => {
              if (tbl.__name === 'leads') {
                const matcher = (globalThis as any).__leadsUpdateFilter?.() ?? (() => false);
                const updated: LeadRow[] = [];
                for (const r of leadsTable) {
                  if (matcher(r)) {
                    Object.assign(r, vals);
                    updated.push(r);
                  }
                }
                return updated.map(r => ({ id: r.id }));
              }
              if (tbl.__name === 'referralEvents') {
                const aId = (globalThis as any).__refUpdateAppointmentId;
                const row = refTable.find(r => r.appointmentId === aId);
                if (row) Object.assign(row, vals);
                return row ? [row] : [];
              }
              return [];
            },
          }),
        }),
      }),
      insert: (tbl: any) => ({
        values: (vals: any) => ({
          returning: async () => {
            if (tbl.__name === 'referralEvents') {
              refTable.push({ appointmentId: vals.appointmentId, leadId: vals.leadId ?? null });
              return [{ id: 'ref-new' }];
            }
            return [];
          },
        }),
      }),
    },
  };
});

vi.mock('@shared/schema', () => ({
  leads: { __name: 'leads', id: 'id', hospitalId: 'hospitalId', email: 'email', status: 'status' },
  referralEvents: { __name: 'referralEvents', appointmentId: 'appointmentId', leadId: 'leadId' },
  hospitals: { __name: 'hospitals' },
}));

vi.mock('drizzle-orm', () => ({
  eq: () => ({}), and: () => ({}), inArray: () => ({}), sql: (() => ({})) as any, desc: () => ({}), isNull: () => ({}),
}));

vi.mock('../server/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { attachLeadToBooking, signLeadAttribution } from '../server/services/leadInvitation';

const HOSPITAL = { id: 'hosp-1', name: 'X', leadAttributionSecret: null } as any;

beforeEach(() => {
  leadsTable = [];
  refTable = [];
  (globalThis as any).__leadsQuery = () => leadsTable;
  (globalThis as any).__leadsUpdateFilter = () => (r: LeadRow) =>
    r.id === (globalThis as any).__updateTargetId && (r.status === 'new' || r.status === 'in_progress');
  (globalThis as any).__refUpdateAppointmentId = null;
});

describe('attachLeadToBooking', () => {
  it('attributes via valid lid token, flips lead, tags referralEvents row', async () => {
    leadsTable.push({ id: 'L1', hospitalId: 'hosp-1', email: 'm@x.com', status: 'new', patientId: null, appointmentId: null });
    refTable.push({ appointmentId: 'A1', leadId: null });
    (globalThis as any).__updateTargetId = 'L1';
    (globalThis as any).__refUpdateAppointmentId = 'A1';

    const lid = signLeadAttribution('L1', 'test-secret');

    await attachLeadToBooking({
      hospital: HOSPITAL, bookingEmail: 'm@x.com', signedLid: lid,
      patientId: 'P1', appointmentId: 'A1',
    });

    expect(leadsTable[0].status).toBe('converted');
    expect(leadsTable[0].patientId).toBe('P1');
    expect(leadsTable[0].appointmentId).toBe('A1');
    expect(refTable[0].leadId).toBe('L1');
  });

  it('ignores a tampered lid and falls through to email fallback', async () => {
    leadsTable.push({ id: 'L1', hospitalId: 'hosp-1', email: 'm@x.com', status: 'new', patientId: null, appointmentId: null });
    refTable.push({ appointmentId: 'A1', leadId: null });
    (globalThis as any).__updateTargetId = 'L1';
    (globalThis as any).__refUpdateAppointmentId = 'A1';

    await attachLeadToBooking({
      hospital: HOSPITAL, bookingEmail: 'm@x.com',
      signedLid: 'bogus.signature',
      patientId: 'P1', appointmentId: 'A1',
    });

    expect(leadsTable[0].status).toBe('converted');
    expect(refTable[0].leadId).toBe('L1');
  });

  it('skips attribution when no lid and email matches zero open leads', async () => {
    leadsTable.push({ id: 'L1', hospitalId: 'hosp-1', email: 'm@x.com', status: 'closed', patientId: null, appointmentId: null });
    refTable.push({ appointmentId: 'A1', leadId: null });
    (globalThis as any).__leadsQuery = () => leadsTable.filter(l => l.status !== 'closed');

    await attachLeadToBooking({
      hospital: HOSPITAL, bookingEmail: 'someone-else@x.com',
      signedLid: undefined, patientId: 'P1', appointmentId: 'A1',
    });

    expect(refTable[0].leadId).toBeNull();
  });

  it('does NOT auto-link when 2+ open leads share the same email', async () => {
    leadsTable.push(
      { id: 'L1', hospitalId: 'hosp-1', email: 'm@x.com', status: 'new', patientId: null, appointmentId: null },
      { id: 'L2', hospitalId: 'hosp-1', email: 'm@x.com', status: 'in_progress', patientId: null, appointmentId: null },
    );
    refTable.push({ appointmentId: 'A1', leadId: null });

    await attachLeadToBooking({
      hospital: HOSPITAL, bookingEmail: 'm@x.com',
      signedLid: undefined, patientId: 'P1', appointmentId: 'A1',
    });

    expect(leadsTable.every(l => l.status !== 'converted')).toBe(true);
    expect(refTable[0].leadId).toBeNull();
  });

  it('does NOT double-convert when lid points at an already-converted lead', async () => {
    leadsTable.push({ id: 'L1', hospitalId: 'hosp-1', email: 'm@x.com', status: 'converted', patientId: 'P_old', appointmentId: 'A_old' });
    refTable.push({ appointmentId: 'A1', leadId: null });
    (globalThis as any).__updateTargetId = 'L1';
    (globalThis as any).__refUpdateAppointmentId = 'A1';

    const lid = signLeadAttribution('L1', 'test-secret');

    await attachLeadToBooking({
      hospital: HOSPITAL, bookingEmail: 'm@x.com', signedLid: lid,
      patientId: 'P1', appointmentId: 'A1',
    });

    // status guarded — patient/appointment NOT clobbered
    expect(leadsTable[0].patientId).toBe('P_old');
    expect(leadsTable[0].appointmentId).toBe('A_old');
  });
});
