import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub heavy server modules that require env vars (DATABASE_URL, ENCRYPTION_SECRET, etc.)
vi.mock('../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../server/storage', () => ({ storage: {}, db: {} }));
vi.mock('../server/auth/google', () => ({ isAuthenticated: vi.fn() }));
vi.mock('../server/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../server/utils/encryption', () => ({
  encryptPatientData: vi.fn(),
  decryptPatientData: vi.fn(),
  encryptCredential: vi.fn(),
  decryptCredential: vi.fn(),
  ENCRYPTION_KEY: 'mock-key',
}));
vi.mock('../server/utils', () => ({
  requireWriteAccess: vi.fn(),
  requireStrictHospitalAccess: vi.fn(),
  requireAdminWriteAccess: vi.fn(),
  requireHospitalAccess: vi.fn(),
  getUserUnitForHospital: vi.fn(),
  getActiveUnitIdFromRequest: vi.fn(),
  getUserRole: vi.fn(),
  verifyUserHospitalUnitAccess: vi.fn(),
  canWrite: vi.fn(),
}));
vi.mock('../server/utils/timeoff', () => ({
  expandRecurringTimeOff: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Chainable Drizzle mock helpers
// ---------------------------------------------------------------------------

type ChainableMock = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  then: (resolve: (v: any) => any) => any;
};

function chainableResolve(value: any): ChainableMock {
  const chain: any = {};
  ['from', 'where', 'limit'].forEach(k => {
    chain[k] = vi.fn(() => chain);
  });
  chain.then = (resolve: any) => resolve(value);
  return chain;
}

// A chainable whose terminal `.returning()` resolves to `value`.
// Exposes `.set` and `.values` as individual mocks so tests can assert on args.
function writeChain(returnValue: any): { chain: any; set: ReturnType<typeof vi.fn>; values: ReturnType<typeof vi.fn> } {
  const returningChain: any = {};
  returningChain.where = vi.fn(() => returningChain);
  returningChain.then = (resolve: any) => resolve(returnValue);

  const setMock = vi.fn().mockReturnValue(returningChain);
  const valuesMock = vi.fn().mockReturnValue(returningChain);
  returningChain.returning = vi.fn(() => returningChain);

  const chain: any = {
    set: setMock,
    values: valuesMock,
  };

  return { chain, set: setMock, values: valuesMock };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const HOSPITAL_ID = 'hosp-1';
const APPOINTMENT_ID = 'appt-1';
const LEAD_ID = 'lead-1';
const LEAD_CREATED_AT = new Date('2026-03-01T10:00:00Z');

function buildAppointment(overrides: Record<string, any> = {}) {
  return {
    id: APPOINTMENT_ID,
    hospitalId: HOSPITAL_ID,
    patientId: 'patient-1',
    appointmentType: 'external',
    ...overrides,
  };
}

function buildLead(overrides: Record<string, any> = {}) {
  return {
    id: LEAD_ID,
    hospitalId: HOSPITAL_ID,
    firstName: 'Maria',
    lastName: 'Muster',
    email: null,
    phone: null,
    operation: null,
    message: null,
    source: 'fb',
    metaLeadId: 'm-1',
    metaFormId: 'form-1',
    campaignId: null,
    campaignName: null,
    adsetId: null,
    adId: null,
    status: 'new',
    patientId: null,
    appointmentId: null,
    closedReason: null,
    utmSource: 'facebook',
    utmMedium: 'paid',
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    gclid: 'GCL123',
    gbraid: null,
    wbraid: null,
    fbclid: null,
    ttclid: null,
    msclkid: null,
    igshid: null,
    li_fat_id: null,
    twclid: null,
    createdAt: LEAD_CREATED_AT,
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildReq(overrides: Record<string, any> = {}) {
  return {
    params: { hospitalId: HOSPITAL_ID, appointmentId: APPOINTMENT_ID },
    body: { leadId: LEAD_ID },
    ...overrides,
  };
}

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importLeadReferralHandler', () => {
  let handler: (req: any, res: any) => Promise<void>;
  let storageMock: any;
  let dbMock: any;

  beforeEach(async () => {
    vi.resetModules();

    // Build a fresh db mock for each test
    dbMock = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    // Build a fresh storage mock for each test
    storageMock = {
      getClinicAppointment: vi.fn(),
    };

    // Inject mocks via vi.doMock (after vi.resetModules())
    vi.doMock('../server/storage', () => ({ storage: storageMock, db: dbMock }));
    vi.doMock('../server/db', () => ({ db: dbMock, pool: {} }));
    vi.doMock('../server/auth/google', () => ({ isAuthenticated: vi.fn() }));
    vi.doMock('../server/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

    const mod = await import('../server/routes/clinic');
    handler = mod.importLeadReferralHandler;
  });

  // ── 1. Validation ──────────────────────────────────────────────────────────

  it('returns 400 when leadId is missing', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid body' }));
  });

  it('returns 400 when leadId is an empty string', async () => {
    const req = buildReq({ body: { leadId: '' } });
    const res = buildRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── 2. Appointment not found ───────────────────────────────────────────────

  it('returns 404 when appointment is not found', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(null);

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Appointment not found' }));
  });

  // ── 3. Cross-hospital appointment ─────────────────────────────────────────

  it('returns 404 when appointment belongs to a different hospital', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(
      buildAppointment({ hospitalId: 'other-hosp' }),
    );

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  // ── 4. Internal appointment ────────────────────────────────────────────────

  it('returns 409 for internal appointments', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(
      buildAppointment({ appointmentType: 'internal' }),
    );

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Referral does not apply to internal appointments' }),
    );
  });

  // ── 5. Lead not found / cross-hospital ────────────────────────────────────

  it('returns 404 when lead is not found', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(buildAppointment());
    // db.select() for leads returns empty array
    dbMock.select.mockReturnValueOnce(chainableResolve([]));

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Lead not found' }));
  });

  it('returns 404 when lead belongs to a different hospital', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(buildAppointment());
    dbMock.select.mockReturnValueOnce(
      chainableResolve([buildLead({ hospitalId: 'other-hosp' })]),
    );

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  // ── 6. Happy path — insert new referral ───────────────────────────────────

  it('inserts a new referral event and updates lead on happy path', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(buildAppointment());

    // db.select() call 1: lead lookup → returns a lead
    const leadRow = buildLead();
    dbMock.select
      .mockReturnValueOnce(chainableResolve([leadRow]))
      // db.select() call 2: existing referral event lookup → nothing found
      .mockReturnValueOnce(chainableResolve([]));

    // Expose insert values mock so we can assert on args
    const returningChainInsert: any = { then: (r: any) => r([{ id: 're-new' }]) };
    const insertValuesMock = vi.fn().mockReturnValue(returningChainInsert);
    returningChainInsert.returning = vi.fn().mockReturnValue(returningChainInsert);
    dbMock.insert.mockReturnValue({ values: insertValuesMock });

    // Expose update set mock for lead update (no returning needed)
    const leadUpdateChain: any = { then: (r: any) => r([]) };
    leadUpdateChain.where = vi.fn().mockReturnValue(leadUpdateChain);
    const leadSetMock = vi.fn().mockReturnValue(leadUpdateChain);
    dbMock.update.mockReturnValue({ set: leadSetMock });

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    // Response shape
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ referralEventId: 're-new', leadId: LEAD_ID }),
    );

    // Insert values contain expected referral fields from the lead
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'social',
        sourceDetail: 'Facebook Lead Form',
        captureMethod: 'staff',
        utmSource: 'facebook',
        gclid: 'GCL123',
        metaLeadId: 'm-1',
        createdAt: LEAD_CREATED_AT,
        hospitalId: HOSPITAL_ID,
        appointmentId: APPOINTMENT_ID,
        patientId: 'patient-1',
      }),
    );

    // Lead update — status converted, appointmentId set
    expect(leadSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'converted', appointmentId: APPOINTMENT_ID }),
    );
  });

  // ── 7. Happy path — update existing referral ──────────────────────────────

  it('updates an existing referral event instead of inserting when one exists', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(buildAppointment());

    const leadRow = buildLead();
    const existingEvent = { id: 're-existing', appointmentId: APPOINTMENT_ID, hospitalId: HOSPITAL_ID };

    // db.select() call 1: lead → found
    // db.select() call 2: existing referral event → found
    dbMock.select
      .mockReturnValueOnce(chainableResolve([leadRow]))
      .mockReturnValueOnce(chainableResolve([existingEvent]));

    // Expose update set mock for referral update
    const referralUpdateChain: any = { then: (r: any) => r([{ id: 're-existing' }]) };
    referralUpdateChain.where = vi.fn().mockReturnValue(referralUpdateChain);
    referralUpdateChain.returning = vi.fn().mockReturnValue(referralUpdateChain);
    const referralSetMock = vi.fn().mockReturnValue(referralUpdateChain);

    // Expose update set mock for lead update
    const leadUpdateChain: any = { then: (r: any) => r([]) };
    leadUpdateChain.where = vi.fn().mockReturnValue(leadUpdateChain);
    const leadSetMock = vi.fn().mockReturnValue(leadUpdateChain);

    // First update call = referral, second = lead
    dbMock.update
      .mockReturnValueOnce({ set: referralSetMock })
      .mockReturnValueOnce({ set: leadSetMock });

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    // db.update(referralEvents) was called with the referral fields
    expect(referralSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'social', sourceDetail: 'Facebook Lead Form' }),
    );

    // db.insert was NOT called
    expect(dbMock.insert).not.toHaveBeenCalled();

    // Response contains the existing event id
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ referralEventId: 're-existing' }),
    );
  });

  // ── 8. Closed lead stays closed ───────────────────────────────────────────

  it('preserves "closed" status when lead is already closed', async () => {
    storageMock.getClinicAppointment.mockResolvedValue(buildAppointment());

    const closedLead = buildLead({ status: 'closed' });
    dbMock.select
      .mockReturnValueOnce(chainableResolve([closedLead]))
      .mockReturnValueOnce(chainableResolve([]));

    const returningChainInsert: any = { then: (r: any) => r([{ id: 're-new' }]) };
    returningChainInsert.returning = vi.fn().mockReturnValue(returningChainInsert);
    dbMock.insert.mockReturnValue({ values: vi.fn().mockReturnValue(returningChainInsert) });

    const leadUpdateChain: any = { then: (r: any) => r([]) };
    leadUpdateChain.where = vi.fn().mockReturnValue(leadUpdateChain);
    const leadSetMock = vi.fn().mockReturnValue(leadUpdateChain);
    dbMock.update.mockReturnValue({ set: leadSetMock });

    const req = buildReq();
    const res = buildRes();

    await handler(req, res);

    expect(leadSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed' }),
    );
  });
});
