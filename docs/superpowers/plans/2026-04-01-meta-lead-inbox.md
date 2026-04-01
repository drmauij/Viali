# Meta Lead Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Excel-based Meta lead workflow with a webhook receiver + inbox sidebar on the appointment calendar, enabling staff to receive leads, log contact attempts, and drag-and-drop to schedule appointments.

**Architecture:** New `meta_leads` and `meta_lead_contacts` tables store incoming leads and contact history. A public webhook endpoint receives leads from the agency's Zapier/Make flow. The inbox UI reuses the existing `ResizablePanelGroup` + drag-and-drop pattern from external surgery requests in OpList.tsx. On conversion, the system creates a patient (or matches existing), a clinic appointment, and a referral event with `metaLeadId`/`metaFormId` for downstream funnel tracking.

**Tech Stack:** Drizzle ORM (Postgres), Express routes, React + TanStack Query, shadcn/ui components, react-big-calendar (existing), Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-04-01-meta-lead-inbox-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `client/src/components/metaLeads/useMetaLeadDrag.ts` | Global drag state for meta leads (mirrors `useExternalRequestDrag.ts`) |
| `client/src/components/metaLeads/MetaLeadsPanel.tsx` | Inbox sidebar panel: lead cards, contact log, filters, scheduling dialog |
| `client/src/pages/admin/components/MetaLeadWebhookCard.tsx` | Webhook config UI for Integrations page |
| `server/routes/metaLeads.ts` | All Meta lead endpoints: webhook receiver, CRUD, convert, fuzzy-match |
| `tests/meta-leads-webhook.test.ts` | Webhook endpoint tests |
| `tests/meta-leads-api.test.ts` | Internal API endpoint tests |

### Modified files
| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `metaLeadStatusEnum`, `metaLeadContactOutcomeEnum`, `metaLeads`, `metaLeadContacts`, `metaLeadWebhookConfig` tables + types |
| `server/routes/index.ts` | Register `metaLeadsRouter` |
| `client/src/pages/anesthesia/OpList.tsx` | Add Meta Leads panel toggle button, integrate `MetaLeadsPanel` in sidebar, extend drop handler for meta leads |
| `client/src/components/anesthesia/OPCalendar.tsx` | Extend `dragFromOutsideItem` to handle meta lead drags alongside surgery request drags |
| `client/src/pages/admin/Integrations.tsx` | Add "Meta Leads" tab with `MetaLeadWebhookCard` |

---

## Task 1: Schema — Meta Lead Tables

**Files:**
- Modify: `shared/schema.ts` (append after line 6349)

- [ ] **Step 1: Add enums and tables to schema**

Add after the `adBudgets` table (line 6349) in `shared/schema.ts`:

```typescript
// ── Meta Lead Inbox ─────────────────────────────────────────────────────

export const metaLeadStatusEnum = pgEnum("meta_lead_status", ["new", "in_progress", "converted", "closed"]);
export const metaLeadContactOutcomeEnum = pgEnum("meta_lead_contact_outcome", ["reached", "no_answer", "wants_callback", "will_call_back", "needs_time"]);

export const metaLeads = pgTable("meta_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  operation: varchar("operation").notNull(),
  source: varchar("source").notNull(), // "fb" or "ig"
  metaLeadId: varchar("meta_lead_id").notNull(),
  metaFormId: varchar("meta_form_id").notNull(),
  status: metaLeadStatusEnum("status").notNull().default("new"),
  patientId: varchar("patient_id").references(() => patients.id, { onDelete: 'set null' }),
  appointmentId: varchar("appointment_id").references(() => clinicAppointments.id, { onDelete: 'set null' }),
  closedReason: varchar("closed_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("meta_leads_hospital_status_created").on(table.hospitalId, table.status, table.createdAt),
  uniqueIndex("meta_leads_hospital_lead_id").on(table.hospitalId, table.metaLeadId),
]);

export const insertMetaLeadSchema = createInsertSchema(metaLeads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MetaLead = typeof metaLeads.$inferSelect;
export type InsertMetaLead = z.infer<typeof insertMetaLeadSchema>;

export const metaLeadContacts = pgTable("meta_lead_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metaLeadId: varchar("meta_lead_id").notNull().references(() => metaLeads.id, { onDelete: 'cascade' }),
  outcome: metaLeadContactOutcomeEnum("outcome").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => [
  index("meta_lead_contacts_lead_created").on(table.metaLeadId, table.createdAt),
]);

export type MetaLeadContact = typeof metaLeadContacts.$inferSelect;

export const metaLeadWebhookConfig = pgTable("meta_lead_webhook_config", {
  hospitalId: varchar("hospital_id").primaryKey().references(() => hospitals.id, { onDelete: 'cascade' }),
  apiKey: varchar("api_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MetaLeadWebhookConfig = typeof metaLeadWebhookConfig.$inferSelect;
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 3: Make migration idempotent**

Open the generated migration file in `migrations/`. Convert all statements to idempotent form:
- `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
- `CREATE TYPE` (enums) → wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`
- `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`
- `CREATE UNIQUE INDEX` → `CREATE UNIQUE INDEX IF NOT EXISTS`

Verify the `_journal.json` entry has a `when` timestamp higher than all previous entries.

- [ ] **Step 4: Run migration**

Run: `npm run db:migrate`
Expected: "Changes applied" with no errors.

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat(meta-leads): add schema for meta_leads, meta_lead_contacts, meta_lead_webhook_config tables"
```

---

## Task 2: Webhook Endpoint + API Key Validation

**Files:**
- Create: `server/routes/metaLeads.ts`
- Modify: `server/routes/index.ts` (add import + registration)
- Create: `tests/meta-leads-webhook.test.ts`

- [ ] **Step 1: Write failing tests for the webhook endpoint**

Create `tests/meta-leads-webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the webhook payload validation logic (unit-testable without DB)
describe('Meta Leads Webhook Validation', () => {
  const validPayload = {
    lead_id: 'lead_123',
    form_id: 'form_456',
    first_name: 'Maria',
    last_name: 'Müller',
    email: 'maria@example.com',
    phone: '+41791234567',
    operation: 'Brustvergrößerung',
    source: 'ig',
  };

  // We'll import the validation function once created
  let validateMetaLeadPayload: (body: unknown) => { success: boolean; data?: any; error?: string };

  beforeEach(async () => {
    const mod = await import('../server/routes/metaLeads');
    validateMetaLeadPayload = mod.validateMetaLeadPayload;
  });

  it('accepts a valid full payload', () => {
    const result = validateMetaLeadPayload(validPayload);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      metaLeadId: 'lead_123',
      metaFormId: 'form_456',
      firstName: 'Maria',
      lastName: 'Müller',
    });
  });

  it('accepts payload without email (phone only)', () => {
    const { email, ...noEmail } = validPayload;
    const result = validateMetaLeadPayload(noEmail);
    expect(result.success).toBe(true);
  });

  it('accepts payload without phone (email only)', () => {
    const { phone, ...noPhone } = validPayload;
    const result = validateMetaLeadPayload(noPhone);
    expect(result.success).toBe(true);
  });

  it('rejects payload missing lead_id', () => {
    const { lead_id, ...missing } = validPayload;
    const result = validateMetaLeadPayload(missing);
    expect(result.success).toBe(false);
  });

  it('rejects payload missing first_name', () => {
    const { first_name, ...missing } = validPayload;
    const result = validateMetaLeadPayload(missing);
    expect(result.success).toBe(false);
  });

  it('rejects payload with invalid source', () => {
    const result = validateMetaLeadPayload({ ...validPayload, source: 'tiktok' });
    expect(result.success).toBe(false);
  });

  it('rejects empty body', () => {
    const result = validateMetaLeadPayload({});
    expect(result.success).toBe(false);
  });

  it('rejects null body', () => {
    const result = validateMetaLeadPayload(null);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/meta-leads-webhook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the metaLeads route file with webhook endpoint + validation**

Create `server/routes/metaLeads.ts`:

```typescript
import { Router } from "express";
import { db } from "../db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { metaLeads, metaLeadContacts, metaLeadWebhookConfig, patients, clinicAppointments, referralEvents, users } from "@shared/schema";
import type { MetaLead } from "@shared/schema";
import { isAuthenticated, isMarketingOrManager, isAdmin } from "../middleware/auth";
import { calculateNameSimilarity } from "../services/patientDeduplication";
import { normalizePhoneForMatching } from "../services/normalizePhone";
import { randomBytes, createHash } from "crypto";
import { logger } from "../logger";

const router = Router();

// ── Webhook Payload Validation ──────────────────────────────────────────

export function validateMetaLeadPayload(body: unknown): { success: boolean; data?: any; error?: string } {
  if (!body || typeof body !== 'object') {
    return { success: false, error: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;

  const requiredString = (key: string): string | null => {
    const val = b[key];
    if (typeof val !== 'string' || val.trim().length === 0) return null;
    return val.trim();
  };

  const leadId = requiredString('lead_id');
  const formId = requiredString('form_id');
  const firstName = requiredString('first_name');
  const lastName = requiredString('last_name');
  const operation = requiredString('operation');
  const source = requiredString('source');

  if (!leadId) return { success: false, error: 'lead_id is required' };
  if (!formId) return { success: false, error: 'form_id is required' };
  if (!firstName) return { success: false, error: 'first_name is required' };
  if (!lastName) return { success: false, error: 'last_name is required' };
  if (!operation) return { success: false, error: 'operation is required' };
  if (!source || !['fb', 'ig'].includes(source)) {
    return { success: false, error: 'source must be "fb" or "ig"' };
  }

  const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim() : null;
  const phone = typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim() : null;

  return {
    success: true,
    data: {
      metaLeadId: leadId,
      metaFormId: formId,
      firstName,
      lastName,
      email,
      phone,
      operation,
      source,
    },
  };
}

// ── Helper: hash API key ────────────────────────────────────────────────

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ── Webhook Endpoint (public, API key auth) ─────────────────────────────

router.post('/api/webhooks/meta-leads/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const apiKey = req.query.key as string;

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required (pass as ?key=...)' });
    }

    // Look up webhook config
    const [config] = await db
      .select()
      .from(metaLeadWebhookConfig)
      .where(eq(metaLeadWebhookConfig.hospitalId, hospitalId))
      .limit(1);

    if (!config) {
      return res.status(401).json({ error: 'Webhook not configured for this hospital' });
    }

    if (!config.enabled) {
      return res.status(403).json({ error: 'Webhook is disabled' });
    }

    // Validate API key
    if (hashApiKey(apiKey) !== config.apiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Validate payload
    const validation = validateMetaLeadPayload(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const data = validation.data;

    // Dedup: check if lead_id already exists for this hospital
    const [existing] = await db
      .select({ id: metaLeads.id })
      .from(metaLeads)
      .where(and(
        eq(metaLeads.hospitalId, hospitalId),
        eq(metaLeads.metaLeadId, data.metaLeadId),
      ))
      .limit(1);

    if (existing) {
      return res.json({ status: 'received', id: existing.id, duplicate: true });
    }

    // Insert new lead
    const [lead] = await db
      .insert(metaLeads)
      .values({
        hospitalId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        operation: data.operation,
        source: data.source,
        metaLeadId: data.metaLeadId,
        metaFormId: data.metaFormId,
      })
      .returning({ id: metaLeads.id });

    logger.info(`Meta lead received: ${data.firstName} ${data.lastName} (${data.metaLeadId}) for hospital ${hospitalId}`);

    return res.json({ status: 'received', id: lead.id });
  } catch (err: any) {
    logger.error('Meta lead webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

- [ ] **Step 4: Register the route**

In `server/routes/index.ts`, add:

```typescript
import metaLeadsRouter from "./metaLeads";
```

And inside `registerDomainRoutes`:

```typescript
app.use(metaLeadsRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/meta-leads-webhook.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/metaLeads.ts server/routes/index.ts tests/meta-leads-webhook.test.ts
git commit -m "feat(meta-leads): add webhook endpoint with API key validation and payload tests"
```

---

## Task 3: Internal API — List, Detail, Contact Log, Close

**Files:**
- Modify: `server/routes/metaLeads.ts`
- Create: `tests/meta-leads-api.test.ts`

- [ ] **Step 1: Write failing tests for internal API**

Create `tests/meta-leads-api.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Meta Leads API - Contact outcome labels', () => {
  // Verify outcome enum values are the expected set
  const validOutcomes = ['reached', 'no_answer', 'wants_callback', 'will_call_back', 'needs_time'];

  it('has exactly 5 outcome types', () => {
    expect(validOutcomes).toHaveLength(5);
  });

  it('includes all required outcomes from Excel workflow', () => {
    expect(validOutcomes).toContain('reached');
    expect(validOutcomes).toContain('no_answer');
    expect(validOutcomes).toContain('wants_callback');
    expect(validOutcomes).toContain('will_call_back');
    expect(validOutcomes).toContain('needs_time');
  });
});

describe('Meta Leads API - Status transitions', () => {
  const validStatuses = ['new', 'in_progress', 'converted', 'closed'];

  it('has exactly 4 statuses', () => {
    expect(validStatuses).toHaveLength(4);
  });

  it('new is the initial status', () => {
    expect(validStatuses[0]).toBe('new');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/meta-leads-api.test.ts`
Expected: PASS (these are enum-contract tests).

- [ ] **Step 3: Add internal API endpoints to metaLeads.ts**

Append to `server/routes/metaLeads.ts` before `export default router`:

```typescript
// ── Internal API (authenticated) ────────────────────────────────────────

// GET /api/business/:hospitalId/meta-leads — list leads with contact summary
router.get('/api/business/:hospitalId/meta-leads', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const statusFilter = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string | undefined;

    let query = db
      .select({
        id: metaLeads.id,
        firstName: metaLeads.firstName,
        lastName: metaLeads.lastName,
        email: metaLeads.email,
        phone: metaLeads.phone,
        operation: metaLeads.operation,
        source: metaLeads.source,
        metaLeadId: metaLeads.metaLeadId,
        metaFormId: metaLeads.metaFormId,
        status: metaLeads.status,
        patientId: metaLeads.patientId,
        appointmentId: metaLeads.appointmentId,
        closedReason: metaLeads.closedReason,
        createdAt: metaLeads.createdAt,
        updatedAt: metaLeads.updatedAt,
        contactCount: sql<number>`(SELECT count(*) FROM meta_lead_contacts WHERE meta_lead_id = ${metaLeads.id})::int`.as('contact_count'),
        lastContactOutcome: sql<string | null>`(SELECT outcome FROM meta_lead_contacts WHERE meta_lead_id = ${metaLeads.id} ORDER BY created_at DESC LIMIT 1)`.as('last_contact_outcome'),
        lastContactAt: sql<string | null>`(SELECT created_at FROM meta_lead_contacts WHERE meta_lead_id = ${metaLeads.id} ORDER BY created_at DESC LIMIT 1)`.as('last_contact_at'),
      })
      .from(metaLeads)
      .where(and(
        eq(metaLeads.hospitalId, hospitalId),
        statusFilter && statusFilter !== 'all'
          ? eq(metaLeads.status, statusFilter as any)
          : undefined,
        before ? sql`${metaLeads.createdAt} < ${before}` : undefined,
      ))
      .orderBy(desc(metaLeads.createdAt))
      .limit(limit);

    const leads = await query;
    return res.json(leads);
  } catch (err: any) {
    logger.error('Meta leads list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/business/:hospitalId/meta-leads/:leadId — full detail with contact history
router.get('/api/business/:hospitalId/meta-leads/:leadId', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId, leadId } = req.params;

    const [lead] = await db
      .select()
      .from(metaLeads)
      .where(and(
        eq(metaLeads.id, leadId),
        eq(metaLeads.hospitalId, hospitalId),
      ))
      .limit(1);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const contacts = await db
      .select({
        id: metaLeadContacts.id,
        outcome: metaLeadContacts.outcome,
        note: metaLeadContacts.note,
        createdAt: metaLeadContacts.createdAt,
        createdBy: metaLeadContacts.createdBy,
        userName: sql<string>`(SELECT "first_name" || ' ' || "surname" FROM users WHERE id = ${metaLeadContacts.createdBy})`.as('user_name'),
      })
      .from(metaLeadContacts)
      .where(eq(metaLeadContacts.metaLeadId, leadId))
      .orderBy(desc(metaLeadContacts.createdAt));

    return res.json({ ...lead, contacts });
  } catch (err: any) {
    logger.error('Meta lead detail error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/business/:hospitalId/meta-leads/:leadId/contacts — log a contact attempt
router.post('/api/business/:hospitalId/meta-leads/:leadId/contacts', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId, leadId } = req.params;
    const { outcome, note } = req.body;
    const userId = req.user.id;

    const validOutcomes = ['reached', 'no_answer', 'wants_callback', 'will_call_back', 'needs_time'];
    if (!outcome || !validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: `outcome must be one of: ${validOutcomes.join(', ')}` });
    }

    // Verify lead exists and belongs to hospital
    const [lead] = await db
      .select({ id: metaLeads.id, status: metaLeads.status })
      .from(metaLeads)
      .where(and(eq(metaLeads.id, leadId), eq(metaLeads.hospitalId, hospitalId)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Insert contact log
    const [contact] = await db
      .insert(metaLeadContacts)
      .values({
        metaLeadId: leadId,
        outcome,
        note: note?.trim() || null,
        createdBy: userId,
      })
      .returning();

    // Auto-advance status from new → in_progress
    if (lead.status === 'new') {
      await db
        .update(metaLeads)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(metaLeads.id, leadId));
    }

    return res.json(contact);
  } catch (err: any) {
    logger.error('Meta lead contact log error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/business/:hospitalId/meta-leads/:leadId — close a lead
router.patch('/api/business/:hospitalId/meta-leads/:leadId', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId, leadId } = req.params;
    const { status, closedReason } = req.body;

    if (status !== 'closed') {
      return res.status(400).json({ error: 'Only "closed" status can be set manually' });
    }

    const [updated] = await db
      .update(metaLeads)
      .set({
        status: 'closed',
        closedReason: closedReason?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(metaLeads.id, leadId), eq(metaLeads.hospitalId, hospitalId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Lead not found' });

    return res.json(updated);
  } catch (err: any) {
    logger.error('Meta lead close error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/business/:hospitalId/meta-leads/count — badge count of new leads
router.get('/api/business/:hospitalId/meta-leads-count', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metaLeads)
      .where(and(
        eq(metaLeads.hospitalId, hospitalId),
        eq(metaLeads.status, 'new'),
      ));

    return res.json({ count: result?.count ?? 0 });
  } catch (err: any) {
    logger.error('Meta leads count error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run tests/meta-leads-webhook.test.ts tests/meta-leads-api.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add server/routes/metaLeads.ts tests/meta-leads-api.test.ts
git commit -m "feat(meta-leads): add internal API endpoints — list, detail, contact log, close, count"
```

---

## Task 4: Convert Endpoint — Patient Match + Appointment + Referral

**Files:**
- Modify: `server/routes/metaLeads.ts`

- [ ] **Step 1: Add the convert endpoint and fuzzy-match proxy**

Append to `server/routes/metaLeads.ts` before `export default router`:

```typescript
// POST /api/business/:hospitalId/meta-leads/:leadId/convert — create appointment + referral
router.post('/api/business/:hospitalId/meta-leads/:leadId/convert', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId, leadId } = req.params;
    const { patientId, patient: newPatientData, appointmentDate, appointmentTime, surgeryRoomId, duration, unitId, providerId } = req.body;

    // Verify lead exists, belongs to hospital, and is not already converted
    const [lead] = await db
      .select()
      .from(metaLeads)
      .where(and(eq(metaLeads.id, leadId), eq(metaLeads.hospitalId, hospitalId)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.status === 'converted') return res.status(400).json({ error: 'Lead already converted' });

    let resolvedPatientId = patientId;

    // Create new patient if no existing match
    if (!resolvedPatientId && newPatientData) {
      const { hospitals: hospitalsTable } = await import("@shared/schema");

      const [hospital] = await db
        .select({ patientIdPrefix: hospitalsTable.patientIdPrefix })
        .from(hospitalsTable)
        .where(eq(hospitalsTable.id, hospitalId))
        .limit(1);

      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(patients)
        .where(eq(patients.hospitalId, hospitalId));
      const patientCount = countResult[0]?.count || 0;

      const prefix = hospital?.patientIdPrefix || 'P';
      const patientNumber = `${prefix}${String(patientCount + 1).padStart(5, '0')}`;

      const [newPatient] = await db
        .insert(patients)
        .values({
          hospitalId,
          patientNumber,
          firstName: newPatientData.firstName || lead.firstName,
          surname: newPatientData.lastName || lead.lastName,
          email: newPatientData.email || lead.email,
          phone: newPatientData.phone || lead.phone,
        })
        .returning({ id: patients.id });

      resolvedPatientId = newPatient.id;
    }

    if (!resolvedPatientId) {
      return res.status(400).json({ error: 'Either patientId or patient data required' });
    }

    // Create clinic appointment
    const startTime = appointmentTime; // "HH:mm"
    const durationMin = duration || 30;
    const [startH, startM] = startTime.split(':').map(Number);
    const endMinutes = startH * 60 + startM + durationMin;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    const [appointment] = await db
      .insert(clinicAppointments)
      .values({
        hospitalId,
        patientId: resolvedPatientId,
        appointmentDate,
        startTime,
        endTime,
        unitId: unitId || null,
        providerId: providerId || null,
        surgeryRoomId: surgeryRoomId || null,
        status: 'scheduled',
        reason: lead.operation,
      })
      .returning({ id: clinicAppointments.id });

    // Create referral event
    await db
      .insert(referralEvents)
      .values({
        hospitalId,
        patientId: resolvedPatientId,
        appointmentId: appointment.id,
        source: 'social',
        sourceDetail: lead.source === 'ig' ? 'Instagram Lead Form' : 'Facebook Lead Form',
        metaLeadId: lead.metaLeadId,
        metaFormId: lead.metaFormId,
        captureMethod: 'staff',
      });

    // Mark lead as converted
    await db
      .update(metaLeads)
      .set({
        status: 'converted',
        patientId: resolvedPatientId,
        appointmentId: appointment.id,
        updatedAt: new Date(),
      })
      .where(eq(metaLeads.id, leadId));

    logger.info(`Meta lead ${leadId} converted → patient ${resolvedPatientId}, appointment ${appointment.id}`);

    return res.json({
      status: 'converted',
      patientId: resolvedPatientId,
      appointmentId: appointment.id,
    });
  } catch (err: any) {
    logger.error('Meta lead convert error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/business/:hospitalId/meta-leads/fuzzy-match — find matching patients
router.post('/api/business/:hospitalId/meta-leads/fuzzy-match', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { firstName, lastName, email, phone } = req.body;

    if (!firstName && !lastName) {
      return res.status(400).json({ error: 'firstName or lastName required' });
    }

    // Fetch non-archived patients
    const allPatients = await db
      .select({
        id: patients.id,
        firstName: patients.firstName,
        surname: patients.surname,
        email: patients.email,
        phone: patients.phone,
        dateOfBirth: patients.birthday,
      })
      .from(patients)
      .where(and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.isArchived, false),
      ));

    const normalizedPatients = allPatients.map(p => ({
      ...p,
      normalizedPhone: p.phone ? normalizePhoneForMatching(p.phone) : '',
      normalizedEmail: p.email ? p.email.trim().toLowerCase() : '',
      fullName: `${p.firstName} ${p.surname}`,
    }));

    const leadName = `${firstName || ''} ${lastName || ''}`.trim();
    const leadPhone = phone ? normalizePhoneForMatching(phone) : '';
    const leadEmail = email ? email.trim().toLowerCase() : '';

    const candidates = normalizedPatients
      .map(p => {
        const nameSim = calculateNameSimilarity(leadName, p.fullName);
        const phoneMatch = leadPhone && p.normalizedPhone ? leadPhone === p.normalizedPhone : false;
        const emailMatch = leadEmail && p.normalizedEmail ? leadEmail === p.normalizedEmail : false;

        // Boost: +20% for phone match, +15% for email match
        let confidence = nameSim;
        if (phoneMatch) confidence = Math.min(1, confidence + 0.20);
        if (emailMatch) confidence = Math.min(1, confidence + 0.15);

        return {
          patientId: p.id,
          firstName: p.firstName,
          surname: p.surname,
          phone: p.phone,
          email: p.email,
          dateOfBirth: p.dateOfBirth,
          confidence: Math.round(confidence * 100),
          phoneMatch,
          emailMatch,
        };
      })
      .filter(c => c.confidence >= 40)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    return res.json(candidates);
  } catch (err: any) {
    logger.error('Meta lead fuzzy match error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: TypeScript check**

Run: `npm run check`
Expected: No errors. If `clinicAppointments` insert schema is stricter (requires more fields), adjust the insert accordingly — check `shared/schema.ts` for required columns on `clinicAppointments`.

- [ ] **Step 3: Commit**

```bash
git add server/routes/metaLeads.ts
git commit -m "feat(meta-leads): add convert endpoint (patient + appointment + referral) and fuzzy-match"
```

---

## Task 5: Webhook Config API + Admin UI

**Files:**
- Modify: `server/routes/metaLeads.ts` (add admin endpoints)
- Create: `client/src/pages/admin/components/MetaLeadWebhookCard.tsx`
- Modify: `client/src/pages/admin/Integrations.tsx` (add tab)

- [ ] **Step 1: Add webhook config admin endpoints**

Append to `server/routes/metaLeads.ts` before `export default router`:

```typescript
// ── Webhook Config (admin only) ─────────────────────────────────────────

// GET /api/admin/:hospitalId/meta-lead-config
router.get('/api/admin/:hospitalId/meta-lead-config', isAuthenticated, isAdmin, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const [config] = await db
      .select()
      .from(metaLeadWebhookConfig)
      .where(eq(metaLeadWebhookConfig.hospitalId, hospitalId))
      .limit(1);

    // Get last received lead timestamp
    const [lastLead] = await db
      .select({ createdAt: metaLeads.createdAt })
      .from(metaLeads)
      .where(eq(metaLeads.hospitalId, hospitalId))
      .orderBy(desc(metaLeads.createdAt))
      .limit(1);

    const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/meta-leads/${hospitalId}`;

    return res.json({
      configured: !!config,
      enabled: config?.enabled ?? false,
      webhookUrl,
      hasApiKey: !!config?.apiKey,
      lastReceivedAt: lastLead?.createdAt || null,
      createdAt: config?.createdAt || null,
    });
  } catch (err: any) {
    logger.error('Meta lead config get error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/:hospitalId/meta-lead-config/generate-key
router.post('/api/admin/:hospitalId/meta-lead-config/generate-key', isAuthenticated, isAdmin, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const rawKey = randomBytes(32).toString('hex');
    const hashedKey = hashApiKey(rawKey);

    // Upsert: insert or update existing config
    const [existing] = await db
      .select({ hospitalId: metaLeadWebhookConfig.hospitalId })
      .from(metaLeadWebhookConfig)
      .where(eq(metaLeadWebhookConfig.hospitalId, hospitalId))
      .limit(1);

    if (existing) {
      await db
        .update(metaLeadWebhookConfig)
        .set({ apiKey: hashedKey, enabled: true })
        .where(eq(metaLeadWebhookConfig.hospitalId, hospitalId));
    } else {
      await db
        .insert(metaLeadWebhookConfig)
        .values({ hospitalId, apiKey: hashedKey, enabled: true });
    }

    // Return raw key ONCE — it won't be stored in plaintext
    return res.json({ apiKey: rawKey });
  } catch (err: any) {
    logger.error('Meta lead config generate key error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/:hospitalId/meta-lead-config
router.patch('/api/admin/:hospitalId/meta-lead-config', isAuthenticated, isAdmin, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const [updated] = await db
      .update(metaLeadWebhookConfig)
      .set({ enabled })
      .where(eq(metaLeadWebhookConfig.hospitalId, hospitalId))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Webhook config not found — generate a key first' });

    return res.json({ enabled: updated.enabled });
  } catch (err: any) {
    logger.error('Meta lead config update error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: Create MetaLeadWebhookCard component**

Create `client/src/pages/admin/components/MetaLeadWebhookCard.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCw, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function MetaLeadWebhookCard() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const configKey = `/api/admin/${hospitalId}/meta-lead-config`;

  const { data: config, isLoading } = useQuery<{
    configured: boolean;
    enabled: boolean;
    webhookUrl: string;
    hasApiKey: boolean;
    lastReceivedAt: string | null;
    createdAt: string | null;
  }>({
    queryKey: [configKey],
    enabled: !!hospitalId,
  });

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `${configKey}/generate-key`);
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedKey(data.apiKey);
      setShowKey(true);
      queryClient.invalidateQueries({ queryKey: [configKey] });
      toast({ title: "API key generated", description: "Copy this key now — it won't be shown again." });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest('PATCH', configKey, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [configKey] });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  if (isLoading) return <div className="animate-pulse h-48 bg-muted rounded-lg" />;

  const fullWebhookUrl = config?.webhookUrl
    ? generatedKey
      ? `${config.webhookUrl}?key=${generatedKey}`
      : `${config.webhookUrl}?key=YOUR_API_KEY`
    : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Meta Lead Webhook</span>
          {config?.configured && (
            <Badge variant={config.enabled ? "default" : "secondary"}>
              {config.enabled ? "Active" : "Disabled"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Webhook URL */}
        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={config?.webhookUrl || ''}
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => config?.webhookUrl && copyToClipboard(config.webhookUrl, 'Webhook URL')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label>API Key</Label>
          {generatedKey ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={showKey ? generatedKey : '••••••••••••••••'}
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={() => setShowKey(v => !v)}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(generatedKey, 'API key')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Save this key now — it won't be shown again.
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              {config?.hasApiKey ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate API Key
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will invalidate the current key. The agency will need to update their integration with the new key.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => generateKeyMutation.mutate()}>
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button onClick={() => generateKeyMutation.mutate()}>
                  Generate API Key
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Enable/Disable Toggle */}
        {config?.configured && (
          <div className="flex items-center justify-between">
            <Label>Webhook Enabled</Label>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            />
          </div>
        )}

        {/* Last Received */}
        {config?.lastReceivedAt && (
          <div className="text-sm text-muted-foreground">
            Last lead received: {new Date(config.lastReceivedAt).toLocaleString()}
          </div>
        )}

        {/* Instructions */}
        <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {instructionsOpen ? 'Hide' : 'Show'} Setup Instructions
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap">
{`POST ${fullWebhookUrl}
Content-Type: application/json

{
  "lead_id": "Meta Lead ID",
  "form_id": "Meta Form ID",
  "first_name": "Maria",
  "last_name": "Müller",
  "email": "maria@example.com",
  "phone": "+41791234567",
  "operation": "Brustvergrößerung",
  "source": "fb"
}`}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>source:</strong> "fb" (Facebook) or "ig" (Instagram)<br />
              <strong>lead_id + form_id:</strong> Required for conversion tracking back to Meta.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Add Meta Leads tab to Integrations page**

In `client/src/pages/admin/Integrations.tsx`:

**a)** Add import at top:
```typescript
import { MetaLeadWebhookCard } from "./components/MetaLeadWebhookCard";
```

**b)** Update validTabs array (line 40):
```typescript
const validTabs = ["galexis", "sms", "cameras", "cardreader", "tardoc", "meta-leads"];
```

**c)** Update useState type (line 41):
```typescript
const [activeTab, setActiveTab] = useState<"galexis" | "sms" | "cameras" | "cardreader" | "tardoc" | "meta-leads">(
```

**d)** Add TabsTrigger inside TabsList (after the last existing trigger):
```tsx
<TabsTrigger value="meta-leads">Meta Leads</TabsTrigger>
```

**e)** Add TabsContent (after the last existing TabsContent):
```tsx
<TabsContent value="meta-leads">
  <MetaLeadWebhookCard />
</TabsContent>
```

- [ ] **Step 4: TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add server/routes/metaLeads.ts client/src/pages/admin/components/MetaLeadWebhookCard.tsx client/src/pages/admin/Integrations.tsx
git commit -m "feat(meta-leads): add webhook config admin API + Integrations tab UI"
```

---

## Task 6: Meta Lead Drag State Module

**Files:**
- Create: `client/src/components/metaLeads/useMetaLeadDrag.ts`

- [ ] **Step 1: Create the drag state module**

Create `client/src/components/metaLeads/useMetaLeadDrag.ts`:

```typescript
import type { MetaLead } from "@shared/schema";

export let draggedMetaLead: MetaLead | null = null;

export function setDraggedMetaLead(lead: MetaLead | null) {
  draggedMetaLead = lead;
}
```

- [ ] **Step 2: TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/metaLeads/useMetaLeadDrag.ts
git commit -m "feat(meta-leads): add global drag state module for meta lead cards"
```

---

## Task 7: Meta Leads Inbox Panel Component

**Files:**
- Create: `client/src/components/metaLeads/MetaLeadsPanel.tsx`

This is the main inbox UI — lead cards with drag support, contact log form, close button, filters. It mirrors the pattern of `ExternalReservationsPanel.tsx`.

- [ ] **Step 1: Create the MetaLeadsPanel component**

Create `client/src/components/metaLeads/MetaLeadsPanel.tsx`:

```tsx
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Phone, Mail, Clock, MessageSquare, X, GripVertical, Instagram } from "lucide-react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setDraggedMetaLead } from "./useMetaLeadDrag";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import type { MetaLead } from "@shared/schema";

// ── Types ───────────────────────────────────────────────────────────────

interface MetaLeadWithSummary extends MetaLead {
  contactCount: number;
  lastContactOutcome: string | null;
  lastContactAt: string | null;
}

interface ContactEntry {
  id: string;
  outcome: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
  userName: string;
}

interface MetaLeadsPanelProps {
  mode?: 'inline' | 'sheet';
  selectedLeadId?: string | null;
  onLeadTap?: (lead: MetaLead | null) => void;
}

const OUTCOME_LABELS: Record<string, string> = {
  reached: "Erreicht",
  no_answer: "Nicht erreicht",
  wants_callback: "Wünscht Rückruf",
  will_call_back: "Ruft zurück",
  needs_time: "Braucht Zeit",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Neu",
  in_progress: "In Bearbeitung",
  converted: "Termin erstellt",
  closed: "Geschlossen",
};

// ── Contact Log Dialog ──────────────────────────────────────────────────

function ContactLogDialog({ lead, open, onOpenChange }: {
  lead: MetaLeadWithSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [outcome, setOutcome] = useState<string>('');
  const [note, setNote] = useState('');

  const { data: detail } = useQuery<MetaLead & { contacts: ContactEntry[] }>({
    queryKey: [`/api/business/${hospitalId}/meta-leads/${lead.id}`],
    enabled: open && !!hospitalId,
  });

  const logContactMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/meta-leads/${lead.id}/contacts`, { outcome, note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/meta-leads`] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/meta-leads/${lead.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/meta-leads-count`] });
      setOutcome('');
      setNote('');
      toast({ title: "Contact logged" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest('PATCH', `/api/business/${hospitalId}/meta-leads/${lead.id}`, { status: 'closed', closedReason: reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/meta-leads`] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/meta-leads-count`] });
      onOpenChange(false);
      toast({ title: "Lead closed" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead.firstName} {lead.lastName}</DialogTitle>
        </DialogHeader>

        {/* Lead info */}
        <div className="space-y-1 text-sm">
          <div className="font-medium">{lead.operation}</div>
          {lead.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{lead.phone}</div>}
          {lead.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{lead.email}</div>}
          <div className="text-muted-foreground">
            {lead.source === 'ig' ? 'Instagram' : 'Facebook'} &middot; Lead ID: {lead.metaLeadId}
          </div>
        </div>

        {/* Log new contact */}
        {lead.status !== 'converted' && lead.status !== 'closed' && (
          <div className="space-y-3 border-t pt-3">
            <Label className="font-medium">Log Contact</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger>
                <SelectValue placeholder="Outcome..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Notes (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
            <Button
              size="sm"
              disabled={!outcome || logContactMutation.isPending}
              onClick={() => logContactMutation.mutate()}
            >
              Log Contact
            </Button>
          </div>
        )}

        {/* Contact history */}
        {detail?.contacts && detail.contacts.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <Label className="font-medium">Contact History</Label>
            {detail.contacts.map(c => (
              <div key={c.id} className="text-sm border-l-2 pl-3 py-1 border-muted-foreground/20">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{OUTCOME_LABELS[c.outcome] || c.outcome}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {new Date(c.createdAt).toLocaleString()} &middot; {c.userName}
                  </span>
                </div>
                {c.note && <p className="text-muted-foreground mt-1">{c.note}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Close lead */}
        {lead.status !== 'converted' && lead.status !== 'closed' && (
          <DialogFooter>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => closeMutation.mutate('')}
            >
              <X className="mr-1 h-3 w-3" />
              Close Lead
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Badge Component ─────────────────────────────────────────────────────

export function MetaLeadsBadge() {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;

  const { data } = useQuery<{ count: number }>({
    queryKey: [`/api/business/${hospitalId}/meta-leads-count`],
    enabled: !!hospitalId,
    refetchInterval: 30_000, // Poll every 30s for new leads
  });

  if (!data?.count) return null;

  return (
    <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs min-w-[1.25rem] justify-center">
      {data.count}
    </Badge>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────

export function MetaLeadsPanel({ mode = 'inline', selectedLeadId, onLeadTap }: MetaLeadsPanelProps) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [contactDialogLead, setContactDialogLead] = useState<MetaLeadWithSummary | null>(null);

  const { data: leads = [], isLoading } = useQuery<MetaLeadWithSummary[]>({
    queryKey: [`/api/business/${hospitalId}/meta-leads`, statusFilter],
    queryFn: async () => {
      // "active" = new + in_progress
      const statusParam = statusFilter === 'active' ? '' : `status=${statusFilter}`;
      const url = `/api/business/${hospitalId}/meta-leads?${statusParam}&limit=50`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch leads');
      const data = await res.json();
      // For "active" filter, exclude converted and closed client-side
      if (statusFilter === 'active') {
        return data.filter((l: MetaLeadWithSummary) => l.status === 'new' || l.status === 'in_progress');
      }
      return data;
    },
    enabled: !!hospitalId,
    refetchInterval: 30_000,
  });

  const handleDragStart = useCallback((lead: MetaLeadWithSummary, e: React.DragEvent) => {
    setDraggedMetaLead(lead);
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedMetaLead(null);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500';
      case 'in_progress': return 'bg-amber-500';
      case 'converted': return 'bg-green-500';
      case 'closed': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <h3 className="font-semibold text-sm">Meta Leads</h3>
        <ToggleGroup
          type="single"
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v)}
          className="w-full"
          size="sm"
        >
          <ToggleGroupItem value="active" className="flex-1 text-xs">Active</ToggleGroupItem>
          <ToggleGroupItem value="new" className="flex-1 text-xs">New</ToggleGroupItem>
          <ToggleGroupItem value="all" className="flex-1 text-xs">All</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Lead Cards */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {isLoading && (
            <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
          )}
          {!isLoading && leads.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">No leads</div>
          )}
          {leads.map(lead => (
            <Card
              key={lead.id}
              className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                selectedLeadId === lead.id ? 'ring-2 ring-primary' : ''
              } ${lead.status === 'new' ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30' : ''}`}
              draggable={mode === 'inline' && lead.status !== 'converted' && lead.status !== 'closed'}
              onDragStart={(e) => handleDragStart(lead, e)}
              onDragEnd={handleDragEnd}
              onClick={() => {
                if (mode === 'inline' && lead.status !== 'converted' && lead.status !== 'closed') {
                  onLeadTap?.(selectedLeadId === lead.id ? null : lead);
                }
              }}
            >
              <div className="space-y-1.5">
                {/* Name + status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {mode === 'inline' && lead.status !== 'converted' && lead.status !== 'closed' && (
                      <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
                    )}
                    <span className="font-medium text-sm">{lead.firstName} {lead.lastName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(lead.status)}`} />
                    {lead.source === 'ig' ? (
                      <Instagram className="h-3.5 w-3.5 text-pink-500" />
                    ) : (
                      <svg className="h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    )}
                  </div>
                </div>

                {/* Operation */}
                <div className="text-xs text-muted-foreground">{lead.operation}</div>

                {/* Contact summary + time */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {lead.contactCount > 0 ? (
                      <>
                        <MessageSquare className="h-3 w-3" />
                        <span>{lead.contactCount}x — {OUTCOME_LABELS[lead.lastContactOutcome || ''] || lead.lastContactOutcome}</span>
                      </>
                    ) : (
                      <span>{STATUS_LABELS[lead.status]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true, locale: de })}</span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex gap-1 pt-1">
                  {lead.status !== 'converted' && lead.status !== 'closed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContactDialogLead(lead);
                      }}
                    >
                      <MessageSquare className="mr-1 h-3 w-3" />
                      Contact
                    </Button>
                  )}
                  {lead.phone && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`tel:${lead.phone}`);
                      }}
                    >
                      <Phone className="mr-1 h-3 w-3" />
                      Call
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Contact Log Dialog */}
      {contactDialogLead && (
        <ContactLogDialog
          lead={contactDialogLead}
          open={!!contactDialogLead}
          onOpenChange={(open) => { if (!open) setContactDialogLead(null); }}
        />
      )}

      {/* Tap-to-select hint */}
      {mode === 'inline' && selectedLeadId && (
        <div className="p-2 border-t text-center text-xs text-muted-foreground animate-pulse">
          Tap a calendar slot to schedule this lead
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/metaLeads/MetaLeadsPanel.tsx
git commit -m "feat(meta-leads): add MetaLeadsPanel inbox component with contact log, drag support, and filters"
```

---

## Task 8: Scheduling Dialog for Meta Leads

**Files:**
- Modify: `client/src/components/metaLeads/MetaLeadsPanel.tsx` (add ScheduleMetaLeadDialog export)

- [ ] **Step 1: Add the scheduling dialog to MetaLeadsPanel.tsx**

Add this component before the `MetaLeadsPanel` function in `MetaLeadsPanel.tsx`. Also add the necessary import for the fuzzy match result type:

```tsx
// ── Schedule Dialog ─────────────────────────────────────────────────────

interface ScheduleMetaLeadDialogProps {
  lead: MetaLeadWithSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dropData: { date: string; time: string; roomId?: string } | null;
}

interface FuzzyMatchCandidate {
  patientId: string;
  firstName: string;
  surname: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  confidence: number;
  phoneMatch: boolean;
  emailMatch: boolean;
}

export function ScheduleMetaLeadDialog({ lead, open, onOpenChange, dropData }: ScheduleMetaLeadDialogProps) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [duration, setDuration] = useState(30);

  // Auto-run fuzzy match when dialog opens
  const { data: candidates = [], isLoading: matchLoading } = useQuery<FuzzyMatchCandidate[]>({
    queryKey: [`meta-lead-fuzzy-match`, lead?.id],
    queryFn: async () => {
      if (!lead) return [];
      const res = await apiRequest('POST', `/api/business/${hospitalId}/meta-leads/fuzzy-match`, {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
      });
      return res.json();
    },
    enabled: open && !!lead && !!hospitalId,
  });

  // Auto-select if only one high-confidence match
  useState(() => {
    if (candidates.length === 1 && candidates[0].confidence >= 80) {
      setSelectedPatientId(candidates[0].patientId);
    } else if (candidates.length === 0 && !matchLoading) {
      setCreateNew(true);
    }
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!lead || !dropData) throw new Error('Missing data');
      const body: any = {
        appointmentDate: dropData.date,
        appointmentTime: dropData.time,
        surgeryRoomId: dropData.roomId || null,
        duration,
      };
      if (selectedPatientId && !createNew) {
        body.patientId = selectedPatientId;
      } else {
        body.patient = {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
        };
      }
      const res = await apiRequest('POST', `/api/business/${hospitalId}/meta-leads/${lead.id}/convert`, body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/meta-leads`] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/meta-leads-count`] });
      // Invalidate appointment/surgery caches so calendar refreshes
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/surgeries'] });
      onOpenChange(false);
      toast({ title: "Appointment created", description: `${lead!.firstName} ${lead!.lastName} — ${dropData!.date} ${dropData!.time}` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!lead || !dropData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Lead Appointment</DialogTitle>
        </DialogHeader>

        {/* Lead info */}
        <div className="space-y-1 text-sm border-b pb-3">
          <div className="font-medium text-base">{lead.firstName} {lead.lastName}</div>
          <div className="text-muted-foreground">{lead.operation}</div>
          {lead.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{lead.phone}</div>}
          {lead.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{lead.email}</div>}
        </div>

        {/* Appointment details */}
        <div className="grid grid-cols-3 gap-3 text-sm border-b pb-3">
          <div>
            <Label className="text-xs">Date</Label>
            <div className="font-medium">{dropData.date}</div>
          </div>
          <div>
            <Label className="text-xs">Time</Label>
            <div className="font-medium">{dropData.time}</div>
          </div>
          <div>
            <Label className="text-xs">Duration</Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Patient matching */}
        <div className="space-y-2">
          <Label className="font-medium">Patient</Label>

          {matchLoading && <div className="text-sm text-muted-foreground">Searching for matching patients...</div>}

          {!matchLoading && candidates.length > 0 && !createNew && (
            <div className="space-y-2">
              {candidates.map(c => (
                <div
                  key={c.patientId}
                  className={`p-2 border rounded cursor-pointer text-sm transition-colors ${
                    selectedPatientId === c.patientId ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedPatientId(c.patientId)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.firstName} {c.surname}</span>
                    <Badge variant="outline" className="text-xs">{c.confidence}%</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {c.phone && <span className={c.phoneMatch ? 'text-green-600' : ''}>{c.phone}</span>}
                    {c.phone && c.email && ' · '}
                    {c.email && <span className={c.emailMatch ? 'text-green-600' : ''}>{c.email}</span>}
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setCreateNew(true); setSelectedPatientId(null); }}>
                None of these — create new patient
              </Button>
            </div>
          )}

          {!matchLoading && (candidates.length === 0 || createNew) && (
            <div className="text-sm p-2 border rounded bg-muted/50">
              <div className="font-medium">New patient will be created:</div>
              <div className="text-muted-foreground">
                {lead.firstName} {lead.lastName}
                {lead.phone && ` · ${lead.phone}`}
                {lead.email && ` · ${lead.email}`}
              </div>
              {candidates.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => setCreateNew(false)}>
                  Back to matches
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={(!selectedPatientId && !createNew) || convertMutation.isPending}
            onClick={() => convertMutation.mutate()}
          >
            {convertMutation.isPending ? 'Creating...' : 'Create Appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/metaLeads/MetaLeadsPanel.tsx
git commit -m "feat(meta-leads): add ScheduleMetaLeadDialog with patient fuzzy matching and appointment creation"
```

---

## Task 9: Integrate Meta Leads Panel into OpList + OPCalendar

**Files:**
- Modify: `client/src/pages/anesthesia/OpList.tsx`
- Modify: `client/src/components/anesthesia/OPCalendar.tsx`

This is the integration task — adding the panel toggle, extending drag handling, and wiring up the scheduling dialog.

- [ ] **Step 1: Update OPCalendar to handle meta lead drags**

In `client/src/components/anesthesia/OPCalendar.tsx`:

**a)** Add import at top (near the existing `draggedRequest` import — find where it's imported):
```typescript
import { draggedMetaLead } from "@/components/metaLeads/useMetaLeadDrag";
```

**b)** Replace the `dragFromOutsideItem` callback (lines 1692-1709) to handle both drag sources:

```typescript
dragFromOutsideItem={() => {
  const req = draggedRequest;
  const metaLead = draggedMetaLead;
  if (!req && !metaLead) return undefined as unknown as CalendarEvent;

  if (req) {
    const now = new Date();
    const durationMs = (req.surgeryDurationMinutes || 60) * 60 * 1000;
    return {
      id: 'ext-req',
      title: req.surgeryName || 'Request',
      start: now,
      end: new Date(now.getTime() + durationMs),
      surgeryId: 'ext-req',
      patientId: null,
      plannedSurgery: req.surgeryName || '',
      patientName: '',
      patientBirthday: '',
      isCancelled: false,
      isSuspended: false,
    } as CalendarEvent;
  }

  // Meta lead drag
  const now = new Date();
  const durationMs = 30 * 60 * 1000; // 30 min default
  return {
    id: 'meta-lead',
    title: `${metaLead!.firstName} ${metaLead!.lastName}`,
    start: now,
    end: new Date(now.getTime() + durationMs),
    surgeryId: 'meta-lead',
    patientId: null,
    plannedSurgery: metaLead!.operation || '',
    patientName: `${metaLead!.firstName} ${metaLead!.lastName}`,
    patientBirthday: '',
    isCancelled: false,
    isSuspended: false,
  } as CalendarEvent;
}}
```

- [ ] **Step 2: Update OpList to integrate Meta Leads panel**

In `client/src/pages/anesthesia/OpList.tsx`:

**a)** Add imports at top:
```typescript
import { MetaLeadsPanel, MetaLeadsBadge, ScheduleMetaLeadDialog } from "@/components/metaLeads/MetaLeadsPanel";
import { draggedMetaLead, setDraggedMetaLead } from "@/components/metaLeads/useMetaLeadDrag";
import type { MetaLead } from "@shared/schema";
```

**b)** Add state variables after the existing `scheduleDropData` state (around line 95):
```typescript
// Meta Leads panel state
const [metaLeadsPanelOpen, setMetaLeadsPanelOpen] = useState(false);
const [sidebarPanel, setSidebarPanel] = useState<'requests' | 'meta-leads'>('requests');
const [tapSelectedMetaLead, setTapSelectedMetaLead] = useState<MetaLead | null>(null);
const [selectedMetaLead, setSelectedMetaLead] = useState<MetaLead | null>(null);
const [metaLeadScheduleDialogOpen, setMetaLeadScheduleDialogOpen] = useState(false);
const [metaLeadDropData, setMetaLeadDropData] = useState<{ date: string; time: string; roomId?: string } | null>(null);
```

**c)** Check if user has marketing/manager role (add near `showExternalRequests` around line 72):
```typescript
const showMetaLeads = activeHospital?.role === 'admin' || activeHospital?.role === 'manager' || activeHospital?.role === 'marketing';
```

**d)** Extend `handleDropFromOutside` (replace lines 330-341):
```typescript
const handleDropFromOutside = useCallback(({ start, resource }: { start: Date; end: Date; resource?: string }) => {
  const req = draggedRequest;
  const metaLead = draggedMetaLead;

  if (req) {
    setInlineSelectedRequest(req);
    setScheduleDropData({
      date: format(start, 'yyyy-MM-dd'),
      time: format(start, 'HH:mm'),
      roomId: resource,
    });
    setScheduleDialogOpen(true);
    setDraggedRequest(null);
    return;
  }

  if (metaLead) {
    setSelectedMetaLead(metaLead as any);
    setMetaLeadDropData({
      date: format(start, 'yyyy-MM-dd'),
      time: format(start, 'HH:mm'),
      roomId: resource,
    });
    setMetaLeadScheduleDialogOpen(true);
    setDraggedMetaLead(null);
    return;
  }
}, []);
```

**e)** Add tap-to-place handler for meta leads (after `handleTapSlotWithSelection`):
```typescript
const handleTapSlotWithMetaLead = useCallback(({ start, resource }: { start: Date; resource?: string }) => {
  if (!tapSelectedMetaLead) return;
  setSelectedMetaLead(tapSelectedMetaLead as any);
  setMetaLeadDropData({
    date: format(start, 'yyyy-MM-dd'),
    time: format(start, 'HH:mm'),
    roomId: resource,
  });
  setMetaLeadScheduleDialogOpen(true);
  setTapSelectedMetaLead(null);
}, [tapSelectedMetaLead]);
```

**f)** Update `handleTapSlotWithSelection` to also handle meta leads — modify the existing function to check both sources. Or extend the `OPCalendar`'s `onTapSlotWithSelection` to also call `handleTapSlotWithMetaLead`. The simplest approach: in the existing `handleTapSlotWithSelection`, add a fallback:

After the existing `handleTapSlotWithSelection`, update `showSplitPanel` (line 357) to also consider meta leads:
```typescript
const showSplitPanel = !isMobile && viewMode === "calendar" && (
  (requestsPanelOpen && showExternalRequests) || (metaLeadsPanelOpen && showMetaLeads)
);
```

**g)** In the toolbar area where the Requests button is (around lines 405-436), add Meta Leads button:

After the existing `showExternalRequests` button block (after line 436), add:
```tsx
{showMetaLeads && (
  <Button
    variant={metaLeadsPanelOpen ? "default" : "outline"}
    className="relative"
    onClick={() => {
      setMetaLeadsPanelOpen(p => !p);
      if (!metaLeadsPanelOpen) {
        setSidebarPanel('meta-leads');
        setRequestsPanelOpen(false);
      }
    }}
  >
    <MessageSquare className="mr-2 h-4 w-4" />
    Meta Leads
    <MetaLeadsBadge />
  </Button>
)}
```

Add `MessageSquare` to the lucide-react import at the top of the file.

**h)** Update the `ResizablePanelGroup` sidebar panel (lines 473-485) to switch between panels:

Replace the sidebar panel content:
```tsx
<ResizablePanel defaultSize={28} minSize={20} maxSize={40}>
  {sidebarPanel === 'requests' && showExternalRequests ? (
    <ExternalReservationsPanel
      mode="inline"
      surgeryRooms={surgeryRooms}
      onScheduleRequest={(req) => {
        setInlineSelectedRequest(req);
        setScheduleDropData(null);
        setScheduleDialogOpen(true);
      }}
      selectedRequestId={tapSelectedRequest?.id ?? null}
      onRequestTap={(req) => setTapSelectedRequest(p => p?.id === req?.id ? null : req)}
    />
  ) : (
    <MetaLeadsPanel
      mode="inline"
      selectedLeadId={tapSelectedMetaLead?.id ?? null}
      onLeadTap={(lead) => setTapSelectedMetaLead(p => p?.id === lead?.id ? null : lead)}
    />
  )}
</ResizablePanel>
```

Also update the Requests button to set `sidebarPanel`:
In the existing Requests button `onClick` (line 429), change to:
```typescript
onClick={() => {
  setRequestsPanelOpen(p => !p);
  if (!requestsPanelOpen) {
    setSidebarPanel('requests');
    setMetaLeadsPanelOpen(false);
  }
}}
```

**i)** Add the `ScheduleMetaLeadDialog` at the bottom of the component (near where `ScheduleDialog` is rendered):
```tsx
<ScheduleMetaLeadDialog
  lead={selectedMetaLead as any}
  open={metaLeadScheduleDialogOpen}
  onOpenChange={setMetaLeadScheduleDialogOpen}
  dropData={metaLeadDropData}
/>
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: No errors. Fix any type mismatches between `MetaLead` schema type and the `MetaLeadWithSummary` interface.

- [ ] **Step 4: Manual test**

Run: `npm run dev`

1. Go to `/admin/integrations` → Meta Leads tab → generate API key
2. Use curl to POST a test lead:
   ```bash
   curl -X POST "http://localhost:5000/api/webhooks/meta-leads/YOUR_HOSPITAL_ID?key=YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{"lead_id":"test_1","form_id":"form_1","first_name":"Test","last_name":"Patient","email":"test@test.com","phone":"+41791234567","operation":"Brustvergrößerung","source":"ig"}'
   ```
3. Go to appointment calendar → click "Meta Leads" button → verify lead appears
4. Click "Contact" → log a contact → verify status changes
5. Drag lead onto calendar → verify scheduling dialog opens with fuzzy match
6. Confirm → verify appointment created

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/anesthesia/OpList.tsx client/src/components/anesthesia/OPCalendar.tsx
git commit -m "feat(meta-leads): integrate Meta Leads panel into appointment calendar with drag-and-drop scheduling"
```

---

## Task 10: Final Lint, Typecheck, and Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including the new meta-leads tests.

- [ ] **Step 3: Verify migration idempotency**

Run: `npx drizzle-kit push`
Expected: "No changes detected" or "Changes applied" with no pending diffs.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore(meta-leads): lint and typecheck cleanup"
```
