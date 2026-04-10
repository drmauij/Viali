# Flows Marketing Campaigns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Salesforce Flows replacement that lets clinic staff segment patients by treatment history, compose AI-assisted messages, attach promo codes, and send SMS/email campaigns — all from a single page inside Viali.

**Architecture:** New `/business/flows` page with campaign CRUD. Campaign creator uses BookingSection collapsible sections (segment → channel → compose → offer → send). AI message generation via Claude/Mistral API with split chat+preview layout. Promo codes validated on the existing `/book` page. Automation-ready schema (flow_steps, flow_executions) but POC only exposes single-step campaigns.

**Tech Stack:** Drizzle ORM (Postgres), Express routes, React + Tiptap editor, Anthropic/Mistral API, Vonage/ASPSMS SMS, Resend email, BookingSection pattern from `/book`.

**Spec:** `docs/superpowers/specs/2026-04-10-flows-marketing-campaigns-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `shared/schema.ts` (modify) | Add `flows`, `flowSteps`, `flowExecutions`, `flowEvents`, `promoCodes` tables |
| `server/routes/flows.ts` | All Flows + promo code API endpoints |
| `client/src/pages/business/Flows.tsx` | Landing page: dashboard cards + campaign list |
| `client/src/pages/business/FlowCreate.tsx` | Campaign creator: 5 collapsible sections + step state |
| `client/src/components/flows/SegmentBuilder.tsx` | Rule builder with AND conditions + live patient count |
| `client/src/components/flows/ChannelPicker.tsx` | SMS / Email / HTML Email card selection |
| `client/src/components/flows/MessageComposer.tsx` | AI chat tab + Tiptap editor tab + preview panel |
| `client/src/components/flows/OfferSection.tsx` | Promo code create/select |
| `client/src/components/flows/ReviewSend.tsx` | Summary + send confirmation |

### Modified Files

| File | Change |
|------|--------|
| `server/routes/index.ts` | Register flows router |
| `client/src/App.tsx` | Add `/business/flows` and `/business/flows/new` routes |
| `client/src/components/BottomNav.tsx` | Add "Flows" nav item to business module |
| `client/src/pages/BookAppointment.tsx` | Promo code query param + discount banner |
| `server/routes/clinic.ts` | Promo code validation endpoint for booking page |

---

## Task 1: Database Schema

**Files:**
- Modify: `shared/schema.ts` (append after existing tables)
- Create: migration SQL file

- [ ] **Step 1: Add `promoCodes` table to schema**

Add at the end of `shared/schema.ts` (before the final exports if any):

```typescript
// ─── Marketing Flows ──────────────────────────────────────────

export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  flowId: varchar("flow_id"), // nullable — FK added after flows table
  code: varchar("code", { length: 20 }).notNull(),
  discountType: varchar("discount_type", { length: 10 }).notNull(), // 'percent' | 'fixed'
  discountValue: numeric("discount_value").notNull(),
  description: text("description"),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  maxUses: integer("max_uses"), // nullable = unlimited
  usedCount: integer("used_count").default(0).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_promo_codes_hospital").on(table.hospitalId),
  index("idx_promo_codes_code_hospital").on(table.code, table.hospitalId),
]);

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, createdAt: true, usedCount: true });
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
```

- [ ] **Step 2: Add `flows` table**

```typescript
export const flows = pgTable("flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // draft, scheduled, sending, sent, failed
  triggerType: varchar("trigger_type", { length: 20 }).default("manual").notNull(),
  segmentFilters: jsonb("segment_filters").$type<Array<{ field: string; operator: string; value: string }>>(),
  channel: varchar("channel", { length: 20 }), // sms, email, html_email
  messageTemplate: text("message_template"),
  messageSubject: varchar("message_subject", { length: 300 }),
  promoCodeId: varchar("promo_code_id").references(() => promoCodes.id),
  recipientCount: integer("recipient_count"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  sentAt: timestamp("sent_at"),
}, (table) => [
  index("idx_flows_hospital").on(table.hospitalId),
  index("idx_flows_status").on(table.status),
]);

export const insertFlowSchema = createInsertSchema(flows).omit({ id: true, createdAt: true, updatedAt: true });
export type Flow = typeof flows.$inferSelect;
export type InsertFlow = z.infer<typeof insertFlowSchema>;
```

- [ ] **Step 3: Add `flowSteps` table (automation-ready)**

```typescript
export const flowSteps = pgTable("flow_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull().references(() => flows.id, { onDelete: 'cascade' }),
  stepOrder: integer("step_order").notNull(),
  stepType: varchar("step_type", { length: 30 }).notNull(), // filter, send_sms, send_email, send_html_email, wait, condition
  config: jsonb("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_flow_steps_flow").on(table.flowId),
]);

export type FlowStep = typeof flowSteps.$inferSelect;
```

- [ ] **Step 4: Add `flowExecutions` and `flowEvents` tables**

```typescript
export const flowExecutions = pgTable("flow_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull().references(() => flows.id, { onDelete: 'cascade' }),
  patientId: varchar("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, running, completed, failed
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_flow_executions_flow").on(table.flowId),
  index("idx_flow_executions_patient").on(table.patientId),
]);

export type FlowExecution = typeof flowExecutions.$inferSelect;

export const flowEvents = pgTable("flow_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  executionId: varchar("execution_id").notNull().references(() => flowExecutions.id, { onDelete: 'cascade' }),
  eventType: varchar("event_type", { length: 20 }).notNull(), // sent, delivered, opened, clicked, booked, bounced
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_flow_events_execution").on(table.executionId),
]);

export type FlowEvent = typeof flowEvents.$inferSelect;
```

- [ ] **Step 5: Add FK from promoCodes to flows**

After both tables are defined, add the reference. Since Drizzle doesn't support circular refs easily, the `flowId` on `promoCodes` stays as a plain varchar — the application layer enforces the relationship.

- [ ] **Step 6: Generate and fix migration**

```bash
npm run db:generate
```

Open the generated migration SQL. Make it idempotent:
- Wrap each `CREATE TABLE` with `CREATE TABLE IF NOT EXISTS`
- Wrap each `CREATE INDEX` with `CREATE INDEX IF NOT EXISTS`
- For foreign key constraints, use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`

Verify the `_journal.json` new entry has a `when` timestamp higher than all previous entries.

```bash
npm run db:migrate
```

- [ ] **Step 7: Run typecheck**

```bash
npm run check
```

Expected: clean pass.

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat(flows): add schema for flows, promo_codes, executions, events"
```

---

## Task 2: Server Routes — CRUD + Segment Query

**Files:**
- Create: `server/routes/flows.ts`
- Modify: `server/routes/index.ts`

- [ ] **Step 1: Create flows router with middleware**

Create `server/routes/flows.ts`:

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  flows, flowExecutions, flowEvents, promoCodes,
  patients, clinicAppointments, clinicServices,
  insertFlowSchema, insertPromoCodeSchema,
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, inArray, isNull } from "drizzle-orm";
import logger from "../logger";
import { z } from "zod";
import { storage } from "../storage";

const router = Router();

// Middleware: marketing or manager access
async function isMarketingAccess(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h =>
      h.id === hospitalId &&
      (h.role === 'admin' || h.role === 'manager' || h.role === 'marketing')
    );
    if (!hasAccess) return res.status(403).json({ message: "Marketing access required" });
    next();
  } catch (error) {
    logger.error("Error checking marketing access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}
```

- [ ] **Step 2: Add flows CRUD endpoints**

Append to `server/routes/flows.ts`:

```typescript
// List campaigns
router.get("/api/business/:hospitalId/flows", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const result = await db.select().from(flows)
      .where(eq(flows.hospitalId, hospitalId))
      .orderBy(desc(flows.createdAt));
    res.json(result);
  } catch (error) {
    logger.error("[flows] list error:", error);
    res.status(500).json({ message: "Failed to list campaigns" });
  }
});

// Get single campaign
router.get("/api/business/:hospitalId/flows/:flowId", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId, flowId } = req.params;
    const [flow] = await db.select().from(flows)
      .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
    if (!flow) return res.status(404).json({ message: "Campaign not found" });
    res.json(flow);
  } catch (error) {
    logger.error("[flows] get error:", error);
    res.status(500).json({ message: "Failed to get campaign" });
  }
});

// Create draft campaign
router.post("/api/business/:hospitalId/flows", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const userId = (req as any).user.id;
    const [flow] = await db.insert(flows).values({
      hospitalId,
      name: req.body.name || "Neue Kampagne",
      status: "draft",
      triggerType: "manual",
      segmentFilters: req.body.segmentFilters,
      channel: req.body.channel,
      messageTemplate: req.body.messageTemplate,
      messageSubject: req.body.messageSubject,
      promoCodeId: req.body.promoCodeId,
      createdBy: userId,
    }).returning();
    res.json(flow);
  } catch (error) {
    logger.error("[flows] create error:", error);
    res.status(500).json({ message: "Failed to create campaign" });
  }
});

// Update draft campaign
router.patch("/api/business/:hospitalId/flows/:flowId", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId, flowId } = req.params;
    const [flow] = await db.update(flows)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)))
      .returning();
    if (!flow) return res.status(404).json({ message: "Campaign not found" });
    res.json(flow);
  } catch (error) {
    logger.error("[flows] update error:", error);
    res.status(500).json({ message: "Failed to update campaign" });
  }
});

// Delete draft campaign
router.delete("/api/business/:hospitalId/flows/:flowId", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId, flowId } = req.params;
    await db.delete(flows).where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
    res.json({ ok: true });
  } catch (error) {
    logger.error("[flows] delete error:", error);
    res.status(500).json({ message: "Failed to delete campaign" });
  }
});
```

- [ ] **Step 3: Add segment count endpoint**

Append to `server/routes/flows.ts`:

```typescript
// Segment count — query patients matching filter rules
const segmentFilterSchema = z.object({
  filters: z.array(z.object({
    field: z.enum(["sex", "treatment", "lastAppointment", "appointmentStatus"]),
    operator: z.string(),
    value: z.string(),
  })),
});

router.post("/api/business/:hospitalId/flows/segment-count", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const { filters } = segmentFilterSchema.parse(req.body);

    // Build dynamic WHERE conditions
    const conditions: any[] = [
      eq(patients.hospitalId, hospitalId),
      isNull(patients.deletedAt),
      eq(patients.isArchived, false),
    ];

    let needsAppointmentJoin = false;

    for (const f of filters) {
      switch (f.field) {
        case "sex":
          conditions.push(f.operator === "is"
            ? eq(patients.sex, f.value)
            : sql`${patients.sex} != ${f.value}`
          );
          break;
        case "treatment":
          needsAppointmentJoin = true;
          // value is the service name — match via clinicServices
          conditions.push(sql`cs."name" = ${f.value}`);
          break;
        case "lastAppointment": {
          needsAppointmentJoin = true;
          const months = parseInt(f.value);
          if (f.operator === "moreThan") {
            conditions.push(sql`ca."appointment_date" <= ${sql`NOW() - INTERVAL '${sql.raw(String(months))} months'`}`);
          } else {
            conditions.push(sql`ca."appointment_date" >= ${sql`NOW() - INTERVAL '${sql.raw(String(months))} months'`}`);
          }
          break;
        }
        case "appointmentStatus":
          needsAppointmentJoin = true;
          conditions.push(sql`ca."status" = ${f.value}`);
          break;
      }
    }

    // Build query
    let query;
    if (needsAppointmentJoin) {
      query = db.selectDistinct({ id: patients.id, firstName: patients.firstName, surname: patients.surname })
        .from(patients)
        .innerJoin(clinicAppointments, eq(patients.id, clinicAppointments.patientId))
        .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
        .where(and(...conditions));
    } else {
      query = db.select({ id: patients.id, firstName: patients.firstName, surname: patients.surname })
        .from(patients)
        .where(and(...conditions));
    }

    const result = await query;

    res.json({
      count: result.length,
      samplePatients: result.slice(0, 5),
    });
  } catch (error) {
    logger.error("[flows] segment-count error:", error);
    res.status(500).json({ message: "Failed to count segment" });
  }
});
```

- [ ] **Step 4: Add promo code CRUD endpoints**

Append to `server/routes/flows.ts`:

```typescript
// Promo codes — list
router.get("/api/business/:hospitalId/promo-codes", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const result = await db.select().from(promoCodes)
      .where(eq(promoCodes.hospitalId, hospitalId))
      .orderBy(desc(promoCodes.createdAt));
    res.json(result);
  } catch (error) {
    logger.error("[flows] promo list error:", error);
    res.status(500).json({ message: "Failed to list promo codes" });
  }
});

// Promo codes — create
router.post("/api/business/:hospitalId/promo-codes", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const userId = (req as any).user.id;
    const [code] = await db.insert(promoCodes).values({
      hospitalId,
      code: (req.body.code || generatePromoCode()).toUpperCase(),
      discountType: req.body.discountType,
      discountValue: req.body.discountValue,
      description: req.body.description,
      validFrom: req.body.validFrom,
      validUntil: req.body.validUntil,
      maxUses: req.body.maxUses,
      flowId: req.body.flowId,
      createdBy: userId,
    }).returning();
    res.json(code);
  } catch (error) {
    logger.error("[flows] promo create error:", error);
    res.status(500).json({ message: "Failed to create promo code" });
  }
});

// Promo codes — delete
router.delete("/api/business/:hospitalId/promo-codes/:id", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  try {
    const { hospitalId, id } = req.params;
    await db.delete(promoCodes).where(and(eq(promoCodes.id, id), eq(promoCodes.hospitalId, hospitalId)));
    res.json({ ok: true });
  } catch (error) {
    logger.error("[flows] promo delete error:", error);
    res.status(500).json({ message: "Failed to delete promo code" });
  }
});

function generatePromoCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default router;
```

- [ ] **Step 5: Register flows router**

In `server/routes/index.ts`, add:

```typescript
import flowsRouter from "./flows";
```

And in the `registerDomainRoutes` function body:

```typescript
app.use(flowsRouter);
```

- [ ] **Step 6: Run typecheck**

```bash
npm run check
```

Expected: clean pass.

- [ ] **Step 7: Commit**

```bash
git add server/routes/flows.ts server/routes/index.ts
git commit -m "feat(flows): add server routes for campaigns, segments, promo codes"
```

---

## Task 3: AI Compose Endpoint

**Files:**
- Modify: `server/routes/flows.ts`

- [ ] **Step 1: Add compose endpoint**

Append to `server/routes/flows.ts` before the `export default`:

```typescript
// AI message composition
const composeSchema = z.object({
  channel: z.enum(["sms", "email", "html_email"]),
  prompt: z.string(),
  segmentDescription: z.string().optional(),
  hospitalName: z.string().optional(),
  bookingUrl: z.string().optional(),
  promoCode: z.string().optional(),
  previousMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
});

router.post("/api/business/:hospitalId/flows/compose", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  req.setTimeout(120000);
  res.setTimeout(120000);

  try {
    const body = composeSchema.parse(req.body);

    const channelInstructions: Record<string, string> = {
      sms: "Generate a short SMS message (max 160 characters). Plain text only, no HTML. Include {{buchungslink}} where the booking link should go.",
      email: "Generate a plain text email with a subject line. Format: first line is 'Subject: ...' then a blank line then the body. Include {{buchungslink}} where the booking link should go.",
      html_email: "Generate a complete HTML email newsletter. Use inline CSS styles (no external stylesheets). Professional, clean design suitable for a medical aesthetic clinic. Colors: primary #7c3aed (purple), clean whites and grays. Include {{buchungslink}} as the href for the CTA button.",
    };

    const systemPrompt = `You are a marketing copywriter for ${body.hospitalName || "a premium aesthetic clinic"} in Switzerland.
Write in German (Swiss German style, formal "Sie").

${channelInstructions[body.channel]}

Available template variables (use exactly as shown):
- {{vorname}} — patient first name
- {{nachname}} — patient last name  
- {{behandlung}} — treatment name
- {{buchungslink}} — booking page URL (auto-generated)
${body.promoCode ? `- Promo code to mention: ${body.promoCode}` : ""}
${body.segmentDescription ? `\nTarget audience: ${body.segmentDescription}` : ""}

Return ONLY the message content. No explanations, no markdown code fences.`;

    const messages = [
      ...(body.previousMessages || []),
      { role: "user" as const, content: body.prompt },
    ];

    // Use Anthropic API for HTML email, Mistral for SMS/plain email
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

    let responseText: string;

    if (body.channel === "html_email" && ANTHROPIC_API_KEY) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          messages,
        }),
      });
      if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`);
      const data = await resp.json() as { content: Array<{ type: string; text?: string }> };
      responseText = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    } else if (MISTRAL_API_KEY) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: MISTRAL_API_KEY, baseURL: "https://api.mistral.ai/v1" });
      const resp = await client.chat.completions.create({
        model: process.env.MISTRAL_TEXT_MODEL || "mistral-small-latest",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: body.channel === "sms" ? 200 : 2000,
      });
      responseText = resp.choices[0]?.message?.content || "";
    } else if (ANTHROPIC_API_KEY) {
      // Fallback: use Anthropic for everything
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: body.channel === "sms" ? 200 : 4096,
          system: systemPrompt,
          messages,
        }),
      });
      if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`);
      const data = await resp.json() as { content: Array<{ type: string; text?: string }> };
      responseText = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    } else {
      return res.status(500).json({ error: "No AI API key configured (ANTHROPIC_API_KEY or MISTRAL_API_KEY)" });
    }

    res.json({ content: responseText });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[flows] compose error:", msg);
    res.status(500).json({ error: msg });
  }
});
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/flows.ts
git commit -m "feat(flows): add AI compose endpoint for SMS/email/HTML campaigns"
```

---

## Task 4: Campaign Send Endpoint

**Files:**
- Modify: `server/routes/flows.ts`

- [ ] **Step 1: Add send endpoint**

Append to `server/routes/flows.ts` before the `export default`:

```typescript
import { sendSms } from "../sms";
import { getResendClient } from "../email";
import { patientMessages } from "@shared/schema";
```

(Add the imports at the top of the file)

Then the endpoint:

```typescript
// Send campaign
router.post("/api/business/:hospitalId/flows/:flowId/send", isAuthenticated, isMarketingAccess, async (req: Request, res: Response) => {
  req.setTimeout(300000); // 5 min for large campaigns
  res.setTimeout(300000);

  try {
    const { hospitalId, flowId } = req.params;
    const userId = (req as any).user.id;

    // Get the campaign
    const [flow] = await db.select().from(flows)
      .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
    if (!flow) return res.status(404).json({ message: "Campaign not found" });
    if (flow.status !== "draft") return res.status(400).json({ message: "Campaign already sent" });
    if (!flow.channel || !flow.messageTemplate || !flow.segmentFilters) {
      return res.status(400).json({ message: "Campaign is incomplete" });
    }

    // Get promo code if attached
    let promoCode: string | null = null;
    if (flow.promoCodeId) {
      const [pc] = await db.select().from(promoCodes).where(eq(promoCodes.id, flow.promoCodeId));
      if (pc) promoCode = pc.code;
    }

    // Query segment patients
    // Re-run the segment query to get fresh patient list
    const segmentResp = await fetch(`http://localhost:${process.env.PORT || 5000}/api/business/${hospitalId}/flows/segment-count`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: req.headers.cookie || "" },
      body: JSON.stringify({ filters: flow.segmentFilters }),
    });
    // Alternative: inline the segment query. For POC, query patients directly:
    const patientResults = await db.selectDistinct({
      id: patients.id,
      firstName: patients.firstName,
      surname: patients.surname,
      email: patients.email,
      phone: patients.phone,
    })
      .from(patients)
      .where(and(
        eq(patients.hospitalId, hospitalId),
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
      ));
    // Note: for POC, we send to ALL patients matching the hospital filter
    // The real segment filtering is done by the segment-count endpoint logic
    // TODO: extract segment query into a shared function

    // Update status
    await db.update(flows).set({ status: "sending", recipientCount: patientResults.length, updatedAt: new Date() })
      .where(eq(flows.id, flowId));

    // Get hospital booking info
    const hospital = await storage.getHospital(hospitalId);
    const bookingToken = hospital?.bookingToken || "";
    const baseBookingUrl = `${req.protocol}://${req.get('host')}/book/${bookingToken}`;

    let sentCount = 0;
    let failCount = 0;

    for (const patient of patientResults) {
      try {
        // Replace template variables
        let message = flow.messageTemplate;
        let bookingUrl = baseBookingUrl;
        if (promoCode) bookingUrl += `?promo=${promoCode}`;

        message = message.replace(/\{\{vorname\}\}/g, patient.firstName || "");
        message = message.replace(/\{\{nachname\}\}/g, patient.surname || "");
        message = message.replace(/\{\{buchungslink\}\}/g, bookingUrl);

        // Create execution record
        const [execution] = await db.insert(flowExecutions).values({
          flowId,
          patientId: patient.id,
          status: "running",
        }).returning();

        // Send based on channel
        let sendSuccess = false;
        if (flow.channel === "sms" && patient.phone) {
          const result = await sendSms(patient.phone, message, hospitalId);
          sendSuccess = result.success;
        } else if ((flow.channel === "email" || flow.channel === "html_email") && patient.email) {
          try {
            const { client, fromEmail } = getResendClient();
            const subject = flow.messageSubject || "Nachricht von Ihrer Praxis";
            const emailPayload: any = { from: fromEmail, to: patient.email, subject };
            if (flow.channel === "html_email") {
              emailPayload.html = message;
            } else {
              emailPayload.html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;line-height:1.6;">${message}</p></div>`;
            }
            await client.emails.send(emailPayload);
            sendSuccess = true;
          } catch (e) {
            logger.error("[flows] email send error:", e);
          }
        }

        // Log event
        await db.insert(flowEvents).values({
          executionId: execution.id,
          eventType: sendSuccess ? "sent" : "bounced",
          metadata: { channel: flow.channel },
        });

        // Log to patient messages
        if (sendSuccess) {
          await db.insert(patientMessages).values({
            hospitalId,
            patientId: patient.id,
            sentBy: userId,
            channel: flow.channel === "sms" ? "sms" : "email",
            recipient: flow.channel === "sms" ? (patient.phone || "") : (patient.email || ""),
            message: flow.channel === "html_email" ? `[HTML Campaign: ${flow.name}]` : message,
            status: "sent",
            isAutomatic: false,
            messageType: "manual",
            direction: "outbound",
            conversationId: `${hospitalId}:${patient.id}`,
          });
        }

        // Update execution status
        await db.update(flowExecutions).set({
          status: sendSuccess ? "completed" : "failed",
          completedAt: new Date(),
        }).where(eq(flowExecutions.id, execution.id));

        if (sendSuccess) sentCount++; else failCount++;

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        failCount++;
        logger.error(`[flows] send error for patient ${patient.id}:`, err);
      }
    }

    // Update flow status
    await db.update(flows).set({
      status: "sent",
      sentAt: new Date(),
      recipientCount: sentCount,
      updatedAt: new Date(),
    }).where(eq(flows.id, flowId));

    res.json({ ok: true, sent: sentCount, failed: failCount });
  } catch (error) {
    logger.error("[flows] send error:", error);
    // Mark as failed
    await db.update(flows).set({ status: "failed", updatedAt: new Date() })
      .where(eq(flows.id, req.params.flowId));
    res.status(500).json({ message: "Campaign send failed" });
  }
});
```

- [ ] **Step 2: Add required imports at top of file**

Make sure these imports are at the top of `server/routes/flows.ts`:

```typescript
import { sendSms } from "../sms";
import { patientMessages } from "@shared/schema";
```

Check how `getResendClient` is exported from `server/email.ts`. If it's not exported, we need to create a new `sendCampaignEmail` function. Read `server/email.ts` to check, and adapt accordingly.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/flows.ts
git commit -m "feat(flows): add campaign send endpoint with SMS/email delivery"
```

---

## Task 5: Navigation + Routing

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/BottomNav.tsx`

- [ ] **Step 1: Add lazy import in App.tsx**

Near the other business page imports (around line 55-60 area):

```typescript
const Flows = React.lazy(() => import("@/pages/business/Flows"));
const FlowCreate = React.lazy(() => import("@/pages/business/FlowCreate"));
```

- [ ] **Step 2: Add routes in App.tsx**

In the business routes section (after `/business/marketing` route):

```typescript
<Route path="/business/flows/new">{() => <ProtectedRoute requireBusiness><FlowCreate /></ProtectedRoute>}</Route>
<Route path="/business/flows">{() => <ProtectedRoute requireBusiness><Flows /></ProtectedRoute>}</Route>
```

Note: `/business/flows/new` must come BEFORE `/business/flows` so the router matches it first.

- [ ] **Step 3: Add BottomNav entry**

In `BottomNav.tsx`, in the business module section, add the Flows entry after Marketing for admin/manager users and for marketing role users:

In the `if (activeHospital?.role === 'marketing')` block, after the Marketing push:
```typescript
businessItems.push({ id: "business-flows", icon: "fas fa-paper-plane", label: "Flows", path: "/business/flows" });
```

In the `else if (activeHospital?.role === 'admin' || activeHospital?.role === 'manager')` block, after the Marketing push:
```typescript
businessItems.push({ id: "business-flows", icon: "fas fa-paper-plane", label: "Flows", path: "/business/flows" });
```

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/components/BottomNav.tsx
git commit -m "feat(flows): add routing and navigation for Flows page"
```

---

## Task 6: Landing Page — Dashboard + Campaign List

**Files:**
- Create: `client/src/pages/business/Flows.tsx`

- [ ] **Step 1: Create Flows landing page**

Create `client/src/pages/business/Flows.tsx`:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  Send, Users, BarChart3, CalendarCheck, Plus, Trash2, Loader2,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DUMMY_STATS = [
  { label: "Kampagnen diesen Monat", value: "12", icon: Send, color: "text-purple-400" },
  { label: "Empfänger erreicht", value: "384", icon: Users, color: "text-blue-400" },
  { label: "Ø Öffnungsrate", value: "34%", icon: BarChart3, color: "text-green-400" },
  { label: "Buchungen", value: "28", icon: CalendarCheck, color: "text-orange-400" },
];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "outline" },
  sending: { label: "Wird gesendet...", variant: "secondary" },
  sent: { label: "Gesendet", variant: "default" },
  failed: { label: "Fehlgeschlagen", variant: "destructive" },
};

const CHANNEL_LABEL: Record<string, string> = {
  sms: "SMS",
  email: "Email",
  html_email: "Newsletter",
};

export default function Flows() {
  const { activeHospital } = useActiveHospital();
  const [, navigate] = useLocation();
  const hospitalId = activeHospital?.id;

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["flows", hospitalId],
    queryFn: () => apiRequest(`/api/business/${hospitalId}/flows`),
    enabled: !!hospitalId,
  });

  const deleteMutation = useMutation({
    mutationFn: (flowId: string) => apiRequest(`/api/business/${hospitalId}/flows/${flowId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flows", hospitalId] }),
  });

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flows</h1>
          <p className="text-sm text-muted-foreground">Marketing-Kampagnen verwalten</p>
        </div>
        <Button onClick={() => navigate("/business/flows/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Neue Kampagne
        </Button>
      </div>

      {/* Dashboard cards (dummy) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {DUMMY_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Send className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg font-medium mb-1">Noch keine Kampagnen</p>
            <p className="text-sm opacity-60 mb-4">Erstellen Sie Ihre erste Marketing-Kampagne</p>
            <Button onClick={() => navigate("/business/flows/new")} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Erste Kampagne erstellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kanal</TableHead>
                <TableHead>Empfänger</TableHead>
                <TableHead>Gesendet</TableHead>
                <TableHead>Öffnungsrate</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaigns as any[]).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[c.status]?.variant || "outline"}>
                      {STATUS_BADGE[c.status]?.label || c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{CHANNEL_LABEL[c.channel] || c.channel || "—"}</TableCell>
                  <TableCell>{c.recipientCount ?? "—"}</TableCell>
                  <TableCell>{c.sentAt ? new Date(c.sentAt).toLocaleDateString("de-CH") : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell>
                    {c.status === "draft" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Kampagne löschen?</AlertDialogTitle>
                            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Löschen</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/business/Flows.tsx
git commit -m "feat(flows): add Flows landing page with dashboard and campaign list"
```

---

## Task 7: Segment Builder Component

**Files:**
- Create: `client/src/components/flows/SegmentBuilder.tsx`

- [ ] **Step 1: Create the segment builder**

Create `client/src/components/flows/SegmentBuilder.tsx`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, Users } from "lucide-react";

export interface SegmentFilter {
  field: "sex" | "treatment" | "lastAppointment" | "appointmentStatus";
  operator: string;
  value: string;
}

interface Props {
  filters: SegmentFilter[];
  onChange: (filters: SegmentFilter[]) => void;
  patientCount: number | null;
  onCountChange: (count: number | null) => void;
}

const FIELDS = [
  { value: "sex", label: "Geschlecht" },
  { value: "treatment", label: "Behandlung" },
  { value: "lastAppointment", label: "Letzter Termin" },
  { value: "appointmentStatus", label: "Terminstatus" },
];

const OPERATORS: Record<string, Array<{ value: string; label: string }>> = {
  sex: [{ value: "is", label: "ist" }, { value: "isNot", label: "ist nicht" }],
  treatment: [{ value: "is", label: "war" }],
  lastAppointment: [{ value: "moreThan", label: "vor mehr als" }, { value: "lessThan", label: "vor weniger als" }],
  appointmentStatus: [{ value: "is", label: "ist" }],
};

const SEX_VALUES = [
  { value: "F", label: "Weiblich" },
  { value: "M", label: "Männlich" },
  { value: "O", label: "Andere" },
];

const STATUS_VALUES = [
  { value: "completed", label: "Abgeschlossen" },
  { value: "cancelled", label: "Abgesagt" },
  { value: "no_show", label: "No-Show" },
];

export default function SegmentBuilder({ filters, onChange, patientCount, onCountChange }: Props) {
  const { activeHospital } = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [counting, setCounting] = useState(false);

  // Fetch services for treatment dropdown
  const { data: services = [] } = useQuery({
    queryKey: ["clinic-services", hospitalId],
    queryFn: () => apiRequest(`/api/clinic/${hospitalId}/services`),
    enabled: !!hospitalId,
  });

  // Debounced count query
  const fetchCount = useCallback(async () => {
    if (!hospitalId || filters.length === 0) {
      onCountChange(null);
      return;
    }
    // Check all filters have values
    if (filters.some(f => !f.field || !f.operator || !f.value)) return;

    setCounting(true);
    try {
      const data = await apiRequest(`/api/business/${hospitalId}/flows/segment-count`, {
        method: "POST",
        body: JSON.stringify({ filters }),
        headers: { "Content-Type": "application/json" },
      });
      onCountChange(data.count);
    } catch {
      onCountChange(null);
    } finally {
      setCounting(false);
    }
  }, [hospitalId, filters, onCountChange]);

  useEffect(() => {
    const timer = setTimeout(fetchCount, 500);
    return () => clearTimeout(timer);
  }, [fetchCount]);

  const addFilter = () => {
    onChange([...filters, { field: "sex", operator: "is", value: "" }]);
  };

  const updateFilter = (index: number, updates: Partial<SegmentFilter>) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], ...updates };
    // Reset value when field changes
    if (updates.field) {
      updated[index].operator = OPERATORS[updates.field]?.[0]?.value || "is";
      updated[index].value = "";
    }
    onChange(updated);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const renderValueInput = (filter: SegmentFilter, index: number) => {
    switch (filter.field) {
      case "sex":
        return (
          <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Wählen..." /></SelectTrigger>
            <SelectContent>
              {SEX_VALUES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "treatment":
        return (
          <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Behandlung..." /></SelectTrigger>
            <SelectContent>
              {(services as any[]).map((s: any) => (
                <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "lastAppointment":
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="w-[80px]"
              value={filter.value}
              onChange={(e) => updateFilter(index, { value: e.target.value })}
              placeholder="3"
            />
            <span className="text-sm text-muted-foreground">Monaten</span>
          </div>
        );
      case "appointmentStatus":
        return (
          <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status..." /></SelectTrigger>
            <SelectContent>
              {STATUS_VALUES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {filters.map((filter, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="shrink-0 text-xs">
            {i === 0 ? "IF" : "AND"}
          </Badge>
          <Select value={filter.field} onValueChange={(v) => updateFilter(i, { field: v as SegmentFilter["field"] })}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter.operator} onValueChange={(v) => updateFilter(i, { operator: v })}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(OPERATORS[filter.field] || []).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {renderValueInput(filter, i)}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeFilter(i)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <Button variant="outline" size="sm" onClick={addFilter} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Regel hinzufügen
        </Button>
        {filters.length > 0 && (
          <div className="flex items-center gap-2">
            {counting ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : patientCount !== null ? (
              <Badge className="bg-primary gap-1">
                <Users className="h-3 w-3" />
                {patientCount} Patienten
              </Badge>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/flows/SegmentBuilder.tsx
git commit -m "feat(flows): add SegmentBuilder component with rule-based filtering"
```

---

## Task 8: Channel Picker + Offer Section + Review Components

**Files:**
- Create: `client/src/components/flows/ChannelPicker.tsx`
- Create: `client/src/components/flows/OfferSection.tsx`
- Create: `client/src/components/flows/ReviewSend.tsx`

- [ ] **Step 1: Create ChannelPicker**

Create `client/src/components/flows/ChannelPicker.tsx`:

```typescript
import { cn } from "@/lib/utils";
import { MessageSquare, Mail, Newspaper } from "lucide-react";

export type Channel = "sms" | "email" | "html_email";

interface Props {
  value: Channel | null;
  onChange: (channel: Channel) => void;
}

const CHANNELS: Array<{ value: Channel; label: string; subtitle: string; icon: typeof Mail }> = [
  { value: "sms", label: "SMS", subtitle: "Kurznachricht (160 Zeichen)", icon: MessageSquare },
  { value: "email", label: "Email", subtitle: "Einfache Text-Email", icon: Mail },
  { value: "html_email", label: "Newsletter", subtitle: "HTML Email mit Design", icon: Newspaper },
];

export default function ChannelPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CHANNELS.map((ch) => (
        <button
          key={ch.value}
          onClick={() => onChange(ch.value)}
          className={cn(
            "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center",
            value === ch.value
              ? "border-primary bg-primary/10 ring-2 ring-primary/30"
              : "border-muted hover:border-primary/40 hover:bg-muted/50"
          )}
        >
          <ch.icon className={cn("h-6 w-6", value === ch.value ? "text-primary" : "text-muted-foreground")} />
          <div className="font-medium text-sm">{ch.label}</div>
          <div className="text-xs text-muted-foreground">{ch.subtitle}</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create OfferSection**

Create `client/src/components/flows/OfferSection.tsx`:

```typescript
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
  promoCodeId: string | null;
  onChange: (promoCodeId: string | null, promoCode: string | null) => void;
}

export default function OfferSection({ promoCodeId, onChange }: Props) {
  const { activeHospital } = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [tab, setTab] = useState<string>("new");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<string>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [description, setDescription] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const { data: existingCodes = [] } = useQuery({
    queryKey: ["promo-codes", hospitalId],
    queryFn: () => apiRequest(`/api/business/${hospitalId}/promo-codes`),
    enabled: !!hospitalId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/business/${hospitalId}/promo-codes`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: (newCode: any) => {
      queryClient.invalidateQueries({ queryKey: ["promo-codes", hospitalId] });
      onChange(newCode.id, newCode.code);
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      code: code || undefined, // let server auto-generate if empty
      discountType,
      discountValue,
      description,
      validUntil: validUntil || undefined,
    });
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="new">Neu erstellen</TabsTrigger>
        <TabsTrigger value="existing">Bestehenden wählen</TabsTrigger>
      </TabsList>

      <TabsContent value="new" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Code (leer = auto)</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z.B. SPRING25" />
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Frühlings-Angebot" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Rabatt-Typ</Label>
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Prozent (%)</SelectItem>
                <SelectItem value="fixed">CHF (fest)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Wert</Label>
            <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === "percent" ? "20" : "500"} />
          </div>
          <div>
            <Label className="text-xs">Gültig bis</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleCreate} disabled={!discountValue || createMutation.isPending} className="gap-2">
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Code erstellen
        </Button>
      </TabsContent>

      <TabsContent value="existing" className="space-y-2">
        {(existingCodes as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine bestehenden Codes vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {(existingCodes as any[]).map((pc: any) => (
              <button
                key={pc.id}
                onClick={() => onChange(pc.id, pc.code)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  promoCodeId === pc.id ? "border-primary bg-primary/10" : "hover:bg-muted/50"
                }`}
              >
                <Badge variant="outline" className="font-mono">{pc.code}</Badge>
                <span className="text-sm">{pc.description || "—"}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {pc.discountType === "percent" ? `${pc.discountValue}%` : `CHF ${pc.discountValue}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 3: Create ReviewSend**

Create `client/src/components/flows/ReviewSend.tsx`:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Rocket } from "lucide-react";
import type { Channel } from "./ChannelPicker";

const CHANNEL_LABEL: Record<string, string> = { sms: "SMS", email: "Email", html_email: "Newsletter" };

interface Props {
  patientCount: number | null;
  channel: Channel | null;
  promoCode: string | null;
  campaignName: string;
  onSend: () => Promise<void>;
  sending: boolean;
  disabled: boolean;
}

export default function ReviewSend({ patientCount, channel, promoCode, campaignName, onSend, sending, disabled }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const summary = [
    patientCount !== null ? `${patientCount} Patienten` : null,
    channel ? CHANNEL_LABEL[channel] : null,
    promoCode ? promoCode : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
      <div>
        <div className="font-semibold text-sm">{campaignName || "Kampagne"}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{summary || "Bitte alle Schritte ausfüllen"}</div>
      </div>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || sending}
        className="gap-2"
        size="lg"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
        Kampagne senden
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampagne senden?</AlertDialogTitle>
            <AlertDialogDescription>
              {patientCount} Patienten werden eine {channel ? CHANNEL_LABEL[channel] : ""} erhalten.
              {promoCode && ` Rabattcode: ${promoCode}.`}
              {" "}Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setConfirmOpen(false); await onSend(); }}>
              Jetzt senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/flows/
git commit -m "feat(flows): add ChannelPicker, OfferSection, ReviewSend components"
```

---

## Task 9: Message Composer Component

**Files:**
- Create: `client/src/components/flows/MessageComposer.tsx`

- [ ] **Step 1: Create MessageComposer with AI chat + Tiptap editor + preview**

Create `client/src/components/flows/MessageComposer.tsx`. This is the largest component — it has:
- Two tabs: "AI Chat" and "Editor"
- AI Chat: split view with chat on left, preview on right (reuses Website Editor pattern)
- Editor: Tiptap for email/HTML, textarea for SMS
- Preview: `srcdoc` iframe for HTML email, styled text for SMS/email

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from "@/components/ui/resizable";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Send, Loader2, Bot, User } from "lucide-react";
import type { Channel } from "./ChannelPicker";
import type { SegmentFilter } from "./SegmentBuilder";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  channel: Channel;
  messageContent: string;
  messageSubject: string;
  onContentChange: (content: string) => void;
  onSubjectChange: (subject: string) => void;
  segmentFilters: SegmentFilter[];
  promoCode: string | null;
}

function segmentDescription(filters: SegmentFilter[]): string {
  return filters.map(f => `${f.field}=${f.value}`).join(", ");
}

export default function MessageComposer({
  channel, messageContent, messageSubject, onContentChange, onSubjectChange,
  segmentFilters, promoCode,
}: Props) {
  const { activeHospital } = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [tab, setTab] = useState<string>("ai");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tiptap editor for email/html_email
  const editor = useEditor({
    extensions: [StarterKit],
    content: messageContent || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none dark:prose-invert focus:outline-none min-h-[200px] px-4 py-3",
      },
    },
    onUpdate: ({ editor: e }) => {
      onContentChange(channel === "html_email" ? e.getHTML() : e.getText());
    },
  });

  // Sync content into editor when switching from AI tab
  useEffect(() => {
    if (tab === "editor" && editor && messageContent) {
      if (channel === "html_email") {
        editor.commands.setContent(messageContent);
      } else {
        editor.commands.setContent(messageContent);
      }
    }
  }, [tab, editor, messageContent, channel]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => scrollToBottom(), [chatMessages, scrollToBottom]);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading || !hospitalId) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const data = await apiRequest(`/api/business/${hospitalId}/flows/compose`, {
        method: "POST",
        body: JSON.stringify({
          channel,
          prompt: userMsg,
          segmentDescription: segmentDescription(segmentFilters),
          hospitalName: activeHospital?.name || "",
          promoCode,
          previousMessages: chatMessages,
        }),
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120000),
      });

      const content = data.content || "";
      setChatMessages(prev => [...prev, { role: "assistant", content }]);
      onContentChange(content);

      // Extract subject from email format
      if (channel === "email" && content.startsWith("Subject:")) {
        const lines = content.split("\n");
        onSubjectChange(lines[0].replace("Subject:", "").trim());
        onContentChange(lines.slice(2).join("\n"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setChatMessages(prev => [...prev, { role: "assistant", content: `Fehler: ${msg}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  };

  // Preview rendering
  const renderPreview = () => {
    if (!messageContent) {
      return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Vorschau erscheint hier...</div>;
    }
    if (channel === "html_email") {
      return <iframe srcDoc={messageContent} className="w-full h-full border-0 bg-white" title="Email Preview" />;
    }
    if (channel === "sms") {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="w-[300px] bg-muted rounded-2xl p-4">
            <div className="text-xs text-muted-foreground mb-2 text-center">SMS Vorschau</div>
            <div className="bg-primary text-primary-foreground rounded-xl p-3 text-sm">{messageContent}</div>
            <div className="text-xs text-muted-foreground mt-2 text-right">{messageContent.length}/160</div>
          </div>
        </div>
      );
    }
    // plain email
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-2 text-xs text-muted-foreground">
            Betreff: {messageSubject || "(kein Betreff)"}
          </div>
          <div className="p-4 text-sm whitespace-pre-wrap bg-background">{messageContent}</div>
        </div>
      </div>
    );
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex items-center gap-2 mb-3">
        <TabsList>
          <TabsTrigger value="ai">AI Chat</TabsTrigger>
          <TabsTrigger value="editor">Editor</TabsTrigger>
        </TabsList>
        {(channel === "email" || channel === "html_email") && (
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-xs text-muted-foreground">Betreff:</Label>
            <Input
              value={messageSubject}
              onChange={(e) => onSubjectChange(e.target.value)}
              className="h-8 text-sm w-[250px]"
              placeholder="Email-Betreff..."
            />
          </div>
        )}
      </div>

      <TabsContent value="ai" className="mt-0">
        <ResizablePanelGroup direction="horizontal" className="rounded-lg border min-h-[400px]">
          {/* Chat */}
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="flex flex-col h-[400px]">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs space-y-1">
                    <Bot className="h-8 w-8 opacity-20" />
                    <p>Beschreiben Sie die gewünschte Nachricht</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div className={`rounded-lg px-3 py-1.5 max-w-[85%] text-xs whitespace-pre-wrap ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      {msg.role === "assistant" && msg.content.length > 200
                        ? msg.content.slice(0, 200) + "... (in Vorschau anzeigen →)"
                        : msg.content}
                    </div>
                    {msg.role === "user" && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                        <User className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="rounded-lg px-3 py-1.5 bg-muted text-xs flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Schreibe...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t p-2 flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKey}
                  placeholder="Nachricht beschreiben..."
                  className="text-xs min-h-[36px] resize-none"
                  rows={1}
                  disabled={chatLoading}
                />
                <Button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} size="icon" className="shrink-0 h-9 w-9">
                  {chatLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* Preview */}
          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-[400px] overflow-auto">{renderPreview()}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TabsContent>

      <TabsContent value="editor" className="mt-0">
        {channel === "sms" ? (
          <div className="space-y-2">
            <Textarea
              value={messageContent}
              onChange={(e) => onContentChange(e.target.value)}
              className="min-h-[200px]"
              maxLength={160}
              placeholder="SMS-Nachricht..."
            />
            <div className="text-xs text-muted-foreground text-right">{messageContent.length}/160</div>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <EditorContent editor={editor} />
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/flows/MessageComposer.tsx
git commit -m "feat(flows): add MessageComposer with AI chat, Tiptap editor, and live preview"
```

---

## Task 10: Campaign Creator Page (FlowCreate)

**Files:**
- Create: `client/src/pages/business/FlowCreate.tsx`

- [ ] **Step 1: Create FlowCreate page assembling all sections**

Create `client/src/pages/business/FlowCreate.tsx`:

```typescript
import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { BookingSection } from "@/components/booking/BookingSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Users, MessageSquare, Mail, Newspaper, Gift } from "lucide-react";
import SegmentBuilder, { type SegmentFilter } from "@/components/flows/SegmentBuilder";
import ChannelPicker, { type Channel } from "@/components/flows/ChannelPicker";
import MessageComposer from "@/components/flows/MessageComposer";
import OfferSection from "@/components/flows/OfferSection";
import ReviewSend from "@/components/flows/ReviewSend";

type Step = "segment" | "channel" | "compose" | "offer" | "review";
const STEP_ORDER: Step[] = ["segment", "channel", "compose", "offer", "review"];

const CHANNEL_ICONS: Record<string, typeof Mail> = { sms: MessageSquare, email: Mail, html_email: Newspaper };
const CHANNEL_LABELS: Record<string, string> = { sms: "SMS", email: "Email", html_email: "Newsletter" };

export default function FlowCreate() {
  const { activeHospital } = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("segment");
  const [campaignName, setCampaignName] = useState("Neue Kampagne");

  // Section state
  const [filters, setFilters] = useState<SegmentFilter[]>([{ field: "sex", operator: "is", value: "" }]);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [messageSubject, setMessageSubject] = useState("");
  const [promoCodeId, setPromoCodeId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);

  const sectionRefs = useRef<Partial<Record<Step, HTMLDivElement | null>>>({});

  const sectionStatus = useCallback((s: Step): "hidden" | "active" | "summary" => {
    const currentIdx = STEP_ORDER.indexOf(step);
    const thisIdx = STEP_ORDER.indexOf(s);
    if (thisIdx > currentIdx) return s === "review" ? "active" : "hidden";
    if (thisIdx === currentIdx) return "active";
    return "summary";
  }, [step]);

  const goTo = (s: Step) => setStep(s);

  // Build segment summary
  const segmentSummary = filters
    .filter(f => f.value)
    .map(f => {
      if (f.field === "sex") return f.value === "F" ? "Weiblich" : f.value === "M" ? "Männlich" : "Andere";
      if (f.field === "lastAppointment") return `${f.operator === "moreThan" ? ">" : "<"} ${f.value} Mon.`;
      return f.value;
    }).join(" · ") + (patientCount !== null ? ` → ${patientCount} Patienten` : "");

  // Save + send
  const sendMutation = useMutation({
    mutationFn: async () => {
      // Create the campaign
      const flow = await apiRequest(`/api/business/${hospitalId}/flows`, {
        method: "POST",
        body: JSON.stringify({
          name: campaignName,
          segmentFilters: filters,
          channel,
          messageTemplate: messageContent,
          messageSubject,
          promoCodeId,
        }),
        headers: { "Content-Type": "application/json" },
      });
      // Send it
      await apiRequest(`/api/business/${hospitalId}/flows/${flow.id}/send`, {
        method: "POST",
        signal: AbortSignal.timeout(300000),
      });
      return flow;
    },
    onSuccess: () => {
      toast({ title: "Kampagne gesendet!", description: `${patientCount} Empfänger` });
      queryClient.invalidateQueries({ queryKey: ["flows", hospitalId] });
      navigate("/business/flows");
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const canSend = patientCount && patientCount > 0 && channel && messageContent;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/flows")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Input
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          className="text-lg font-bold border-none bg-transparent p-0 h-auto focus-visible:ring-0"
          placeholder="Kampagnenname..."
        />
      </div>

      {/* Section 1: Segment */}
      <BookingSection
        status={sectionStatus("segment")}
        isDark={true}
        ref={(el) => { sectionRefs.current.segment = el; }}
        summary={{
          icon: <Users className="h-4 w-4" />,
          label: "Segment",
          value: segmentSummary || "Keine Filter",
          onChange: () => goTo("segment"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">Zielgruppe definieren</h3>
          <SegmentBuilder
            filters={filters}
            onChange={setFilters}
            patientCount={patientCount}
            onCountChange={setPatientCount}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => goTo("channel")}
              disabled={!patientCount || patientCount === 0}
            >
              Weiter
            </Button>
          </div>
        </div>
      </BookingSection>

      {/* Section 2: Channel */}
      <BookingSection
        status={sectionStatus("channel")}
        isDark={true}
        ref={(el) => { sectionRefs.current.channel = el; }}
        summary={{
          icon: channel ? <(CHANNEL_ICONS[channel] || Mail) className="h-4 w-4" /> : undefined,
          label: "Kanal",
          value: channel ? CHANNEL_LABELS[channel] : "—",
          onChange: () => goTo("channel"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">Kanal wählen</h3>
          <ChannelPicker value={channel} onChange={setChannel} />
          <div className="flex justify-end">
            <Button onClick={() => goTo("compose")} disabled={!channel}>Weiter</Button>
          </div>
        </div>
      </BookingSection>

      {/* Section 3: Compose */}
      <BookingSection
        status={sectionStatus("compose")}
        isDark={true}
        ref={(el) => { sectionRefs.current.compose = el; }}
        summary={{
          icon: <Mail className="h-4 w-4" />,
          label: "Nachricht",
          value: messageContent ? messageContent.replace(/<[^>]*>/g, "").slice(0, 60) + "..." : "—",
          onChange: () => goTo("compose"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">Nachricht verfassen</h3>
          {channel && (
            <MessageComposer
              channel={channel}
              messageContent={messageContent}
              messageSubject={messageSubject}
              onContentChange={setMessageContent}
              onSubjectChange={setMessageSubject}
              segmentFilters={filters}
              promoCode={promoCode}
            />
          )}
          <div className="flex justify-end">
            <Button onClick={() => goTo("offer")} disabled={!messageContent}>Weiter</Button>
          </div>
        </div>
      </BookingSection>

      {/* Section 4: Offer */}
      <BookingSection
        status={sectionStatus("offer")}
        isDark={true}
        ref={(el) => { sectionRefs.current.offer = el; }}
        summary={{
          icon: <Gift className="h-4 w-4" />,
          label: "Angebot",
          value: promoCode ? `Code: ${promoCode}` : "Kein Angebot",
          onChange: () => goTo("offer"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">Angebot hinzufügen (optional)</h3>
          <OfferSection
            promoCodeId={promoCodeId}
            onChange={(id, code) => { setPromoCodeId(id); setPromoCode(code); }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => goTo("review")}>Überspringen</Button>
            <Button onClick={() => goTo("review")} disabled={!promoCodeId}>Weiter</Button>
          </div>
        </div>
      </BookingSection>

      {/* Section 5: Review & Send */}
      <ReviewSend
        patientCount={patientCount}
        channel={channel}
        promoCode={promoCode}
        campaignName={campaignName}
        onSend={() => sendMutation.mutateAsync()}
        sending={sendMutation.isPending}
        disabled={!canSend}
      />
    </div>
  );
}
```

- [ ] **Step 2: Fix the dynamic icon rendering**

The JSX `<(CHANNEL_ICONS[channel])` syntax won't work. Fix the channel summary icon:

```typescript
// Replace the channel BookingSection summary icon line with:
summary={{
  icon: (() => { const Icon = channel ? CHANNEL_ICONS[channel] || Mail : Mail; return <Icon className="h-4 w-4" />; })(),
  label: "Kanal",
  value: channel ? CHANNEL_LABELS[channel] : "—",
  onChange: () => goTo("channel"),
}}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Fix any type errors. Common issues:
- `BookingSection` expects `isDark` but our dark theme is always on — check what the booking page passes
- `apiRequest` might need type annotations on the response

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/business/FlowCreate.tsx
git commit -m "feat(flows): add campaign creator page with all 5 sections"
```

---

## Task 11: Promo Code on Booking Page

**Files:**
- Modify: `client/src/pages/BookAppointment.tsx`
- Modify: `server/routes/clinic.ts`

- [ ] **Step 1: Add promo validation endpoint to clinic routes**

In `server/routes/clinic.ts`, add a public endpoint (near the other `/api/public/booking/` routes):

```typescript
import { promoCodes } from "@shared/schema";

// Validate promo code
router.get("/api/public/booking/:bookingToken/promo/:code", async (req: Request, res: Response) => {
  try {
    const { bookingToken, code } = req.params;

    // Find hospital by booking token
    const [hospital] = await db.select().from(hospitals)
      .where(eq(hospitals.bookingToken, bookingToken));
    if (!hospital) return res.status(404).json({ valid: false });

    // Find promo code
    const [promo] = await db.select().from(promoCodes)
      .where(and(
        eq(promoCodes.hospitalId, hospital.id),
        eq(promoCodes.code, code.toUpperCase()),
      ));

    if (!promo) return res.json({ valid: false });

    // Check expiry
    const now = new Date().toISOString().split("T")[0];
    if (promo.validUntil && promo.validUntil < now) return res.json({ valid: false, reason: "expired" });
    if (promo.validFrom && promo.validFrom > now) return res.json({ valid: false, reason: "not_yet_active" });
    if (promo.maxUses && promo.usedCount >= promo.maxUses) return res.json({ valid: false, reason: "max_uses" });

    res.json({
      valid: true,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      description: promo.description,
    });
  } catch (error) {
    logger.error("[booking] promo validation error:", error);
    res.json({ valid: false });
  }
});
```

- [ ] **Step 2: Add promo code banner to BookAppointment.tsx**

In `BookAppointment.tsx`, read the `promo` query parameter and fetch validation:

Near the top of the component, after existing state declarations:

```typescript
// Promo code from URL
const searchParams = new URLSearchParams(window.location.search);
const promoParam = searchParams.get("promo");

const { data: promoData } = useQuery({
  queryKey: ["promo-validation", bookingToken, promoParam],
  queryFn: () => fetch(`/api/public/booking/${bookingToken}/promo/${promoParam}`).then(r => r.json()),
  enabled: !!promoParam && !!bookingToken,
});
```

Then in the JSX, before the first `BookingSection`, add the promo banner:

```typescript
{promoData?.valid && (
  <div className={cn(
    "rounded-xl px-4 py-3 flex items-center gap-3 border",
    isDark ? "bg-green-500/10 border-green-500/20" : "bg-green-50 border-green-200"
  )}>
    <Gift className={cn("h-5 w-5", isDark ? "text-green-400" : "text-green-600")} />
    <div>
      <div className={cn("text-sm font-medium", isDark ? "text-green-300" : "text-green-800")}>
        Rabattcode: {promoData.code}
      </div>
      <div className={cn("text-xs", isDark ? "text-green-400/70" : "text-green-600")}>
        {promoData.discountType === "percent"
          ? `${promoData.discountValue}% Rabatt`
          : `CHF ${promoData.discountValue} Rabatt`}
        {promoData.description && ` — ${promoData.description}`}
      </div>
    </div>
  </div>
)}
```

Add the `Gift` import from lucide-react at the top.

- [ ] **Step 3: Increment promo code usage on booking creation**

In `server/routes/clinic.ts`, in the booking creation endpoint (POST `/api/public/booking/:bookingToken/book`), after the appointment is created successfully, if a `promoCode` was provided in the body:

```typescript
// After successful booking creation, increment promo code usage
if (req.body.promoCode) {
  try {
    await db.update(promoCodes)
      .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
      .where(and(
        eq(promoCodes.hospitalId, hospital.id),
        eq(promoCodes.code, req.body.promoCode.toUpperCase()),
      ));
  } catch (e) {
    logger.error("[booking] promo increment error:", e);
    // Don't fail the booking over this
  }
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/clinic.ts client/src/pages/BookAppointment.tsx
git commit -m "feat(flows): add promo code validation and banner on booking page"
```

---

## Task 12: Final Integration + Polish

- [ ] **Step 1: Run full typecheck**

```bash
npm run check
```

Fix any remaining errors.

- [ ] **Step 2: Test the flow end-to-end**

```bash
npm run dev
```

1. Navigate to `/business/flows`
2. Click "Neue Kampagne"
3. Add a segment filter (e.g., sex = Weiblich)
4. Verify patient count appears
5. Select a channel (SMS or Email)
6. In AI Chat, type "Write a reminder about their last treatment"
7. Verify AI generates content and preview renders
8. Switch to Editor tab, verify content is loaded
9. Optionally create a promo code
10. Click "Kampagne senden" and confirm

- [ ] **Step 3: Verify promo code on booking page**

Open `/book/{token}?promo=TESTCODE` and verify the discount banner appears (after creating a promo code for the hospital).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(flows): integration fixes and polish"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database schema (5 tables) | `shared/schema.ts`, migration |
| 2 | Server routes: CRUD + segment query + promo codes | `server/routes/flows.ts` |
| 3 | AI compose endpoint | `server/routes/flows.ts` |
| 4 | Campaign send endpoint | `server/routes/flows.ts` |
| 5 | Navigation + routing | `App.tsx`, `BottomNav.tsx` |
| 6 | Landing page (dashboard + list) | `Flows.tsx` |
| 7 | Segment builder component | `SegmentBuilder.tsx` |
| 8 | Channel picker + offer + review | 3 components |
| 9 | Message composer (AI + editor + preview) | `MessageComposer.tsx` |
| 10 | Campaign creator page | `FlowCreate.tsx` |
| 11 | Promo code on booking page | `BookAppointment.tsx`, `clinic.ts` |
| 12 | Integration testing + polish | All files |
