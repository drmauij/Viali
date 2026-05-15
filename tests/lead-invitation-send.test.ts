import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture mock state in module scope so each test can rewire it.
const sendMock = vi.fn();
vi.mock('../server/email', () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: sendMock } },
    fromEmail: 'no-reply@viali.app',
  })),
  getAppBaseUrl: () => 'https://use.viali.app',
}));

// In-memory leads + hospitals table for the test.
type LeadRow = {
  id: string; hospitalId: string; firstName: string; lastName: string;
  email: string | null; phone: string | null; language: string | null;
  timeslot: string | null; operation: string | null;
  invitationEmailSentAt: Date | null; invitationEmailError: string | null;
};
type HospitalRow = {
  id: string; name: string; bookingToken: string | null;
  companyLogoUrl: string | null; bookingTheme: any;
  defaultLanguage: string | null; phone: string | null;
  autoSendLeadInvitationEmail: boolean; leadAttributionSecret: string | null;
};

const leadStore = new Map<string, LeadRow>();
const hospitalStore = new Map<string, HospitalRow>();

// Minimal db stub modelling only the calls sendLeadInvitationEmail makes.
vi.mock('../server/db', () => ({
  db: {
    select: (..._cols: any[]) => ({
      from: (tbl: any) => ({
        where: (_w: any) => ({
          limit: async (_n: number) => {
            if (tbl.__name === 'leads') {
              const arr = Array.from(leadStore.values());
              return arr.length ? [arr[0]] : [];
            }
            if (tbl.__name === 'hospitals') {
              const arr = Array.from(hospitalStore.values());
              return arr.length ? [arr[0]] : [];
            }
            return [];
          },
        }),
      }),
    }),
    update: (tbl: any) => ({
      set: (vals: any) => ({
        where: async (_w: any) => {
          if (tbl.__name === 'leads') {
            const row = Array.from(leadStore.values())[0];
            if (row) Object.assign(row, vals);
          }
        },
      }),
    }),
  },
}));

vi.mock('@shared/schema', () => ({
  leads: { __name: 'leads', id: 'id', hospitalId: 'hospitalId' },
  hospitals: { __name: 'hospitals', id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (_a: any, _b: any) => ({}),
  and: (..._args: any[]) => ({}),
}));

vi.mock('../server/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { sendLeadInvitationEmail } from '../server/services/leadInvitation';

function seedHospital(overrides: Partial<HospitalRow> = {}): HospitalRow {
  const h: HospitalRow = {
    id: 'hosp-1', name: 'Klinik X', bookingToken: 'tok-abc',
    companyLogoUrl: null, bookingTheme: null,
    defaultLanguage: 'de', phone: null,
    autoSendLeadInvitationEmail: true, leadAttributionSecret: null,
    ...overrides,
  };
  hospitalStore.clear();
  hospitalStore.set(h.id, h);
  return h;
}

function seedLead(overrides: Partial<LeadRow> = {}): LeadRow {
  const l: LeadRow = {
    id: 'lead-1', hospitalId: 'hosp-1', firstName: 'M', lastName: 'M',
    email: 'm@example.com', phone: null, language: 'de',
    timeslot: null, operation: null,
    invitationEmailSentAt: null, invitationEmailError: null,
    ...overrides,
  };
  leadStore.clear();
  leadStore.set(l.id, l);
  return l;
}

describe('sendLeadInvitationEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'msg_x' }, error: null });
    process.env.LEAD_ATTRIBUTION_SECRET = 'test-secret';
  });

  it('sends when autoSend=true, email present, and lead not previously sent', async () => {
    seedHospital();
    const lead = seedLead();

    await sendLeadInvitationEmail({ leadId: lead.id, hospitalId: 'hosp-1' });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('m@example.com');
    expect(call.html).toContain('https://use.viali.app/book/tok-abc?lid=');
    expect(lead.invitationEmailSentAt).toBeInstanceOf(Date);
    expect(lead.invitationEmailError).toBeNull();
  });

  it('does NOT send when hospital.autoSendLeadInvitationEmail is false', async () => {
    seedHospital({ autoSendLeadInvitationEmail: false });
    seedLead();
    await sendLeadInvitationEmail({ leadId: 'lead-1', hospitalId: 'hosp-1' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does NOT send when lead.email is null', async () => {
    seedHospital();
    seedLead({ email: null });
    await sendLeadInvitationEmail({ leadId: 'lead-1', hospitalId: 'hosp-1' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does NOT re-send when invitationEmailSentAt already set (idempotency)', async () => {
    seedHospital();
    seedLead({ invitationEmailSentAt: new Date('2026-01-01') });
    await sendLeadInvitationEmail({ leadId: 'lead-1', hospitalId: 'hosp-1' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('records invitationEmailError when Resend throws', async () => {
    seedHospital();
    const lead = seedLead();
    sendMock.mockRejectedValueOnce(new Error('Resend down'));

    await sendLeadInvitationEmail({ leadId: lead.id, hospitalId: 'hosp-1' });

    expect(lead.invitationEmailError).toContain('Resend down');
    expect(lead.invitationEmailSentAt).toBeNull();
  });

  it('does NOT throw when secret is missing — error is captured and logged', async () => {
    delete process.env.LEAD_ATTRIBUTION_SECRET;
    delete process.env.MARKETING_UNSUBSCRIBE_SECRET;
    seedHospital();
    const lead = seedLead();

    await expect(sendLeadInvitationEmail({ leadId: lead.id, hospitalId: 'hosp-1' })).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(lead.invitationEmailError).toMatch(/secret/i);
  });
});
