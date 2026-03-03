# TARDOC Auto-Invoice from Surgery — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable generating pre-filled TARDOC insurance invoices from surgery records using reusable templates, with status management UI for the full invoice lifecycle.

**Architecture:** New `tardoc_invoice_templates` + `tardoc_invoice_template_items` tables. New backend endpoints for template CRUD + surgery prefill. Revised `TardocInvoiceForm` with surgery selector, template picker, and auto-fill. Status action buttons in invoice list/detail.

**Tech Stack:** Drizzle ORM (Postgres), Express routes, React + React Hook Form + Zod, shadcn/ui, Vitest for tests.

**Design doc:** `docs/plans/2026-03-03-tardoc-auto-invoice-design.md`

---

### Task 1: Schema — Add Template Tables

**Files:**
- Modify: `shared/schema.ts` (after line ~5766, where TARDOC types are exported)

**Step 1: Add table definitions to schema**

Add after the existing TARDOC table definitions (after `tardocInvoiceItems` around line 5759):

```typescript
// TARDOC Invoice Templates — reusable line item sets for common procedures
export const tardocInvoiceTemplates = pgTable("tardoc_invoice_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  billingModel: varchar("billing_model", { enum: ["TG", "TP"] }),
  lawType: varchar("law_type", { enum: ["KVG", "UVG", "IVG", "MVG", "VVG"] }),
  treatmentType: varchar("treatment_type").default("ambulatory"),
  treatmentReason: varchar("treatment_reason").default("disease"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_tardoc_templates_hospital").on(table.hospitalId),
]);

export const tardocInvoiceTemplateItems = pgTable("tardoc_invoice_template_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => tardocInvoiceTemplates.id, { onDelete: 'cascade' }),
  tardocCode: varchar("tardoc_code").notNull(),
  description: varchar("description").notNull(),
  taxPoints: decimal("tax_points", { precision: 10, scale: 2 }),
  scalingFactor: decimal("scaling_factor", { precision: 5, scale: 2 }).default("1.00"),
  sideCode: varchar("side_code"),
  quantity: integer("quantity").default(1).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (table) => [
  index("idx_tardoc_template_items_template").on(table.templateId),
]);

// Types
export type TardocInvoiceTemplate = typeof tardocInvoiceTemplates.$inferSelect;
export type TardocInvoiceTemplateItem = typeof tardocInvoiceTemplateItems.$inferSelect;
```

**Step 2: Generate migration**

Run: `npm run db:generate`

**Step 3: Make migration idempotent**

Open the new migration file in `migrations/`. Convert every statement to use `IF NOT EXISTS` guards. Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DO $$ BEGIN ... END $$` for constraints.

**Step 4: Verify journal timestamp**

Check `migrations/meta/_journal.json` — the new entry's `when` must be higher than `1772472002111` (migration 150).

**Step 5: Apply migration**

Run: `npm run db:migrate`

**Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat(tardoc): add invoice template tables to schema"
```

---

### Task 2: Backend — Template CRUD Endpoints

**Files:**
- Modify: `server/routes/tardoc.ts` (add after the service mappings section, around line 229)

**Step 1: Write tests for template CRUD**

Create `tests/tardoc-templates.test.ts`:

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import { tardocInvoiceTemplates, tardocInvoiceTemplateItems } from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    await db.delete(tardocInvoiceTemplates)
      .where(eq(tardocInvoiceTemplates.id, id))
      .catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("TARDOC Invoice Templates", () => {
  it("creates a template with items", async () => {
    const [template] = await db.insert(tardocInvoiceTemplates).values({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Test Day Surgery + GA",
      billingModel: "TG",
      lawType: "KVG",
    }).returning();
    createdIds.push(template.id);

    await db.insert(tardocInvoiceTemplateItems).values([
      {
        templateId: template.id,
        tardocCode: "00.0010",
        description: "Test consultation",
        taxPoints: "20.00",
        quantity: 1,
        sortOrder: 0,
      },
      {
        templateId: template.id,
        tardocCode: "00.0020",
        description: "Test anesthesia base",
        taxPoints: "50.00",
        quantity: 1,
        sortOrder: 1,
      },
    ]);

    const items = await db.select()
      .from(tardocInvoiceTemplateItems)
      .where(eq(tardocInvoiceTemplateItems.templateId, template.id));

    expect(template.name).toBe("Test Day Surgery + GA");
    expect(items).toHaveLength(2);
    expect(items[0].tardocCode).toBe("00.0010");
  });

  it("cascade deletes items when template deleted", async () => {
    const [template] = await db.insert(tardocInvoiceTemplates).values({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Cascade Test",
    }).returning();
    createdIds.push(template.id);

    await db.insert(tardocInvoiceTemplateItems).values({
      templateId: template.id,
      tardocCode: "00.0099",
      description: "Test item",
      quantity: 1,
      sortOrder: 0,
    });

    await db.delete(tardocInvoiceTemplates)
      .where(eq(tardocInvoiceTemplates.id, template.id));

    const orphanItems = await db.select()
      .from(tardocInvoiceTemplateItems)
      .where(eq(tardocInvoiceTemplateItems.templateId, template.id));
    expect(orphanItems).toHaveLength(0);

    // Remove from cleanup since already deleted
    createdIds.pop();
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/tardoc-templates.test.ts`
Expected: Tests should PASS (tables exist from Task 1, these are DB-level tests).

**Step 3: Add template CRUD routes to `server/routes/tardoc.ts`**

Add after the service mappings section (after line ~229), before the invoices section:

```typescript
// ==================== TARDOC INVOICE TEMPLATES ====================

// List templates for a hospital
router.get('/api/clinic/:hospitalId/tardoc-templates', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;

    const templates = await db
      .select()
      .from(tardocInvoiceTemplates)
      .where(eq(tardocInvoiceTemplates.hospitalId, hospitalId))
      .orderBy(desc(tardocInvoiceTemplates.isDefault), asc(tardocInvoiceTemplates.name));

    // Fetch items for each template
    const templateIds = templates.map(t => t.id);
    const allItems = templateIds.length > 0
      ? await db
          .select()
          .from(tardocInvoiceTemplateItems)
          .where(sql`${tardocInvoiceTemplateItems.templateId} = ANY(${templateIds})`)
          .orderBy(asc(tardocInvoiceTemplateItems.sortOrder))
      : [];

    const result = templates.map(t => ({
      ...t,
      items: allItems.filter(i => i.templateId === t.id),
    }));

    res.json(result);
  } catch (error: any) {
    logger.error("Error listing TARDOC templates:", error);
    res.status(500).json({ message: "Failed to list templates" });
  }
});

// Create template with items
router.post('/api/clinic/:hospitalId/tardoc-templates', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;

    const schema = z.object({
      name: z.string().min(1),
      billingModel: z.enum(["TG", "TP"]).optional(),
      lawType: z.enum(["KVG", "UVG", "IVG", "MVG", "VVG"]).optional(),
      treatmentType: z.string().optional(),
      treatmentReason: z.string().optional(),
      isDefault: z.boolean().optional(),
      items: z.array(z.object({
        tardocCode: z.string().min(1),
        description: z.string().min(1),
        taxPoints: z.string().optional(),
        scalingFactor: z.string().optional(),
        sideCode: z.string().optional(),
        quantity: z.number().int().min(1).default(1),
      })).default([]),
    });

    const data = schema.parse(req.body);
    const { items, ...templateData } = data;

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await db.update(tardocInvoiceTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(tardocInvoiceTemplates.hospitalId, hospitalId),
          eq(tardocInvoiceTemplates.isDefault, true)
        ));
    }

    const [template] = await db.insert(tardocInvoiceTemplates).values({
      hospitalId,
      ...templateData,
    }).returning();

    if (items.length > 0) {
      await db.insert(tardocInvoiceTemplateItems).values(
        items.map((item, idx) => ({
          templateId: template.id,
          ...item,
          sortOrder: idx,
        }))
      );
    }

    const templateItems = await db
      .select()
      .from(tardocInvoiceTemplateItems)
      .where(eq(tardocInvoiceTemplateItems.templateId, template.id))
      .orderBy(asc(tardocInvoiceTemplateItems.sortOrder));

    res.status(201).json({ ...template, items: templateItems });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating TARDOC template:", error);
    res.status(500).json({ message: "Failed to create template" });
  }
});

// Update template
router.patch('/api/clinic/:hospitalId/tardoc-templates/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, id } = req.params;
    const { items, ...updateData } = req.body;

    // If setting as default, unset others
    if (updateData.isDefault) {
      await db.update(tardocInvoiceTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(tardocInvoiceTemplates.hospitalId, hospitalId),
          eq(tardocInvoiceTemplates.isDefault, true)
        ));
    }

    updateData.updatedAt = new Date();
    const [updated] = await db
      .update(tardocInvoiceTemplates)
      .set(updateData)
      .where(and(
        eq(tardocInvoiceTemplates.id, id),
        eq(tardocInvoiceTemplates.hospitalId, hospitalId)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Replace items if provided
    if (items && Array.isArray(items)) {
      await db.delete(tardocInvoiceTemplateItems)
        .where(eq(tardocInvoiceTemplateItems.templateId, id));

      if (items.length > 0) {
        await db.insert(tardocInvoiceTemplateItems).values(
          items.map((item: any, idx: number) => ({
            templateId: id,
            tardocCode: item.tardocCode,
            description: item.description,
            taxPoints: item.taxPoints,
            scalingFactor: item.scalingFactor,
            sideCode: item.sideCode,
            quantity: item.quantity || 1,
            sortOrder: idx,
          }))
        );
      }
    }

    const templateItems = await db
      .select()
      .from(tardocInvoiceTemplateItems)
      .where(eq(tardocInvoiceTemplateItems.templateId, id))
      .orderBy(asc(tardocInvoiceTemplateItems.sortOrder));

    res.json({ ...updated, items: templateItems });
  } catch (error: any) {
    logger.error("Error updating TARDOC template:", error);
    res.status(500).json({ message: "Failed to update template" });
  }
});

// Delete template
router.delete('/api/clinic/:hospitalId/tardoc-templates/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, id } = req.params;

    const deleted = await db.delete(tardocInvoiceTemplates).where(
      and(
        eq(tardocInvoiceTemplates.id, id),
        eq(tardocInvoiceTemplates.hospitalId, hospitalId)
      )
    );

    res.status(204).send();
  } catch (error: any) {
    logger.error("Error deleting TARDOC template:", error);
    res.status(500).json({ message: "Failed to delete template" });
  }
});
```

Add `tardocInvoiceTemplates` and `tardocInvoiceTemplateItems` to the imports from `@shared/schema` at top of file.

**Step 4: Run tests**

Run: `npx vitest run tests/tardoc-templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/tardoc.ts shared/schema.ts tests/tardoc-templates.test.ts
git commit -m "feat(tardoc): add invoice template CRUD endpoints + tests"
```

---

### Task 3: Backend — Surgery Prefill Endpoint

**Files:**
- Modify: `server/routes/tardoc.ts`

**Step 1: Write test for prefill logic**

Add to `tests/tardoc-templates.test.ts` or create `tests/tardoc-prefill.test.ts`:

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import { surgeries, patients, hospitals, users, anesthesiaRecords } from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

describe("TARDOC Prefill from Surgery", () => {
  it("extracts patient, surgery, and hospital data", async () => {
    // Find a completed surgery with a patient
    const [surgery] = await db
      .select()
      .from(surgeries)
      .where(eq(surgeries.hospitalId, TEST_HOSPITAL_ID))
      .limit(1);

    if (!surgery || !surgery.patientId) {
      console.log("No test surgery found — skipping");
      return;
    }

    const [patient] = await db.select().from(patients)
      .where(eq(patients.id, surgery.patientId));
    const [hospital] = await db.select().from(hospitals)
      .where(eq(hospitals.id, TEST_HOSPITAL_ID));

    expect(patient).toBeDefined();
    expect(hospital).toBeDefined();

    // Verify essential fields exist on patient
    expect(patient.surname).toBeDefined();
    expect(patient.firstName).toBeDefined();
  });
});
```

**Step 2: Run test**

Run: `npx vitest run tests/tardoc-prefill.test.ts`

**Step 3: Add prefill endpoint**

Add to `server/routes/tardoc.ts` before the invoices section:

```typescript
// ==================== SURGERY PREFILL ====================

// Get pre-filled invoice data from a surgery record
router.get('/api/clinic/:hospitalId/tardoc-prefill/:surgeryId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, surgeryId } = req.params;

    // Fetch surgery
    const [surgery] = await db.select().from(surgeries)
      .where(and(
        eq(surgeries.id, surgeryId),
        eq(surgeries.hospitalId, hospitalId)
      ));

    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    // Fetch patient
    let patient = null;
    if (surgery.patientId) {
      [patient] = await db.select().from(patients)
        .where(eq(patients.id, surgery.patientId));
    }

    // Fetch hospital (for GLN, ZSR, TP value)
    const [hospital] = await db.select().from(hospitals)
      .where(eq(hospitals.id, hospitalId));

    // Fetch surgeon (for GLN, ZSR)
    let surgeon = null;
    if (surgery.surgeonId) {
      [surgeon] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        gln: users.gln,
        zsrNumber: users.zsrNumber,
      }).from(users).where(eq(users.id, surgery.surgeonId));
    }

    // Fetch anesthesia record + anesthesiologist
    let anesthesiaRecord = null;
    let anesthesiologist = null;
    const [aRecord] = await db.select().from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.surgeryId, surgeryId));

    if (aRecord) {
      anesthesiaRecord = aRecord;
      if (aRecord.providerId) {
        [anesthesiologist] = await db.select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          gln: users.gln,
          zsrNumber: users.zsrNumber,
        }).from(users).where(eq(users.id, aRecord.providerId));
      }
    }

    // Check for existing TARDOC invoice on this surgery
    const [existingInvoice] = await db.select({ id: tardocInvoices.id, status: tardocInvoices.status })
      .from(tardocInvoices)
      .where(and(
        eq(tardocInvoices.surgeryId, surgeryId),
        eq(tardocInvoices.hospitalId, hospitalId)
      ));

    // Build warnings for missing critical data
    const warnings: string[] = [];
    if (!patient) warnings.push("No patient linked to this surgery");
    if (patient && !patient.healthInsuranceNumber) warnings.push("Patient has no AHV number");
    if (patient && !patient.insurerGln) warnings.push("Patient has no insurer GLN");
    if (patient && !patient.insuranceNumber) warnings.push("Patient has no insurance number");
    if (!hospital?.companyGln) warnings.push("Hospital has no GLN configured");
    if (!hospital?.companyZsr) warnings.push("Hospital has no ZSR configured");
    if (!surgeon?.gln) warnings.push("Surgeon has no GLN configured");
    if (!hospital?.defaultTpValue) warnings.push("Hospital has no default TP value");
    if (hospital && !hospital.companyBankIban) warnings.push("Hospital has no bank IBAN (required for Tiers Garant)");

    // Format surgery date
    const surgeryDate = surgery.plannedDate
      ? new Date(surgery.plannedDate).toISOString().split('T')[0]
      : null;
    const surgeryEndDate = surgery.actualEndTime
      ? new Date(surgery.actualEndTime).toISOString().split('T')[0]
      : surgeryDate;

    // Extract canton from hospital postal code (first 2 chars might not be canton)
    // Swiss cantons are not derivable from postal codes — leave empty for manual entry
    const treatmentCanton = hospital?.companyCanton || "";

    const prefill = {
      // Surgery reference
      surgeryId: surgery.id,
      patientId: surgery.patientId,
      surgeryDescription: surgery.plannedSurgery,
      chopCode: surgery.chopCode,
      surgerySide: surgery.surgerySide,

      // Patient data snapshot
      patientSurname: patient?.surname || "",
      patientFirstName: patient?.firstName || "",
      patientBirthday: patient?.birthday || "",
      patientSex: patient?.sex || "",
      patientStreet: patient?.street || "",
      patientPostalCode: patient?.postalCode || "",
      patientCity: patient?.city || "",

      // Insurance
      ahvNumber: patient?.healthInsuranceNumber || "",
      insurerGln: patient?.insurerGln || "",
      insurerName: patient?.insuranceProvider || "",
      insuranceNumber: patient?.insuranceNumber || "",

      // Dates
      caseDate: surgeryDate || "",
      caseDateEnd: surgeryEndDate || "",

      // Hospital / biller
      billerGln: hospital?.companyGln || "",
      billerZsr: hospital?.companyZsr || "",
      tpValue: hospital?.defaultTpValue || "",

      // Surgeon / provider
      providerGln: surgeon?.gln || "",
      providerZsr: surgeon?.zsrNumber || "",
      surgeonName: surgeon ? `${surgeon.firstName} ${surgeon.lastName}` : surgery.surgeon || "",

      // Anesthesia
      anesthesiaType: anesthesiaRecord?.anesthesiaType || null,
      anesthesiaStartTime: anesthesiaRecord?.anesthesiaStartTime || null,
      anesthesiaEndTime: anesthesiaRecord?.anesthesiaEndTime || null,
      anesthesiologistGln: anesthesiologist?.gln || "",
      anesthesiologistName: anesthesiologist ? `${anesthesiologist.firstName} ${anesthesiologist.lastName}` : "",
      physicalStatus: anesthesiaRecord?.physicalStatus || null,
      emergencyCase: anesthesiaRecord?.emergencyCase || false,

      // Treatment defaults
      treatmentType: "ambulatory",
      treatmentCanton,

      // Existing invoice warning
      existingInvoice: existingInvoice || null,

      // Missing data warnings
      warnings,
    };

    res.json(prefill);
  } catch (error: any) {
    logger.error("Error prefilling TARDOC invoice:", error);
    res.status(500).json({ message: "Failed to prefill invoice data" });
  }
});

// List surgeries eligible for TARDOC invoicing (completed, no existing invoice)
router.get('/api/clinic/:hospitalId/tardoc-eligible-surgeries', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const search = (req.query.q as string || '').trim();

    // Get surgeries that are completed and have a patient
    let query = db
      .select({
        id: surgeries.id,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
        chopCode: surgeries.chopCode,
        surgeon: surgeries.surgeon,
        patientId: surgeries.patientId,
        patientSurname: patients.surname,
        patientFirstName: patients.firstName,
        status: surgeries.status,
        hasInvoice: sql<boolean>`EXISTS (
          SELECT 1 FROM tardoc_invoices ti
          WHERE ti.surgery_id = ${surgeries.id}
          AND ti.status != 'cancelled'
        )`,
      })
      .from(surgeries)
      .leftJoin(patients, eq(surgeries.patientId, patients.id))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        eq(surgeries.status, 'completed'),
        sql`${surgeries.patientId} IS NOT NULL`,
        eq(surgeries.isArchived, false),
      ))
      .orderBy(desc(surgeries.plannedDate))
      .limit(50);

    const results = await query;

    // If search term provided, filter in memory (simpler than complex SQL with joins)
    let filtered = results;
    if (search) {
      const lower = search.toLowerCase();
      filtered = results.filter(r =>
        (r.patientSurname?.toLowerCase().includes(lower)) ||
        (r.patientFirstName?.toLowerCase().includes(lower)) ||
        (r.plannedSurgery?.toLowerCase().includes(lower)) ||
        (r.chopCode?.toLowerCase().includes(lower))
      );
    }

    res.json(filtered);
  } catch (error: any) {
    logger.error("Error listing eligible surgeries:", error);
    res.status(500).json({ message: "Failed to list eligible surgeries" });
  }
});
```

Add `anesthesiaRecords` to the imports from `@shared/schema` if not already there. Also add `surgeries` if not already imported.

**Step 4: Run TypeScript check**

Run: `npm run check`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/tardoc.ts tests/
git commit -m "feat(tardoc): add surgery prefill + eligible surgeries endpoints"
```

---

### Task 4: Frontend — Revised TardocInvoiceForm

**Files:**
- Rewrite: `client/src/pages/clinic/TardocInvoiceForm.tsx`

This is the largest task. The form is restructured into clear sections with surgery selection, auto-fill, and template support.

**Step 1: Rewrite the TardocInvoiceForm component**

The new form has these sections:

1. **Surgery Selector** — searchable dropdown using `/api/clinic/:hospitalId/tardoc-eligible-surgeries`, selecting one calls `/api/clinic/:hospitalId/tardoc-prefill/:surgeryId` and populates the form
2. **Patient & Insurance** — read-only display of auto-filled patient data, with warning alerts for missing fields
3. **Billing Setup** — billing model, law type, treatment type/reason, case dates, canton, GLN/ZSR fields (mostly auto-filled)
4. **Template & Service Lines** — template picker using `/api/clinic/:hospitalId/tardoc-templates`, applying one populates line items. TARDOC code search for adding individual lines. Editable table with amounts auto-calculated.
5. **Totals & Actions** — calculated totals, save draft button

Key behaviors:
- When surgery is selected → call prefill API → populate patient/billing sections
- When template is selected → populate line items (don't clear existing ones, append or replace based on user choice)
- Line item amounts: `taxPoints × tpValue × scalingFactor × quantity`
- Subtotals recalculated on every line change
- Warning banners for missing critical data (no AHV, no GLN, etc.)
- If surgery already has an invoice → show warning with link to existing invoice

Props interface remains:
```typescript
interface TardocInvoiceFormProps {
  hospitalId: string;
  onSuccess: () => void;
  onCancel: () => void;
  preSelectedSurgeryId?: string; // New: auto-select surgery on mount
}
```

**Step 2: Verify it renders**

Run: `npm run dev`
Navigate to Invoices → Create Insurance Invoice
Expected: Form loads with surgery selector at top

**Step 3: Test the flow manually**

1. Search for a surgery → select it → patient data fills
2. Pick a template → line items populate
3. Save as draft → invoice appears in list

**Step 4: Commit**

```bash
git add client/src/pages/clinic/TardocInvoiceForm.tsx
git commit -m "feat(tardoc): rewrite invoice form with surgery selector + template support"
```

---

### Task 5: Frontend — Invoice Status Management

**Files:**
- Modify: `client/src/pages/clinic/Invoices.tsx`

**Step 1: Add status action buttons to the TARDOC invoice detail dialog**

In the `TardocInvoiceDetailDialog` component (around line 554), add contextual action buttons based on the invoice's current status:

- **draft**: "Validate" button → calls `POST /validate` endpoint, then refreshes
- **validated**: "Export XML" + "Export PDF" buttons (already exist), plus "Revert to Draft"
- **exported**: "Mark as Sent" button, "Revert to Validated"
- **sent**: "Mark as Paid" + "Mark as Rejected" buttons
- **rejected**: "Revert to Draft" button
- **paid / cancelled**: no action buttons, just status display

Each button calls `PATCH /api/clinic/:hospitalId/tardoc-invoices/:invoiceId/status` with the new status.

Show validation errors inline when validation fails (the `/validate` endpoint returns `{ valid: false, errors: [...] }`).

**Step 2: Add status badges to the invoice list**

The list already shows status, but enhance the badges with color coding:
- `draft` → gray
- `validated` → blue
- `exported` → purple
- `sent` → orange
- `paid` → green
- `rejected` → red
- `cancelled` → dark gray

**Step 3: Test manually**

1. Create a draft invoice → validate → export → mark sent → mark paid
2. Create a draft → validate → revert to draft → verify editable again
3. Try invalid transitions → verify error messages

**Step 4: Commit**

```bash
git add client/src/pages/clinic/Invoices.tsx
git commit -m "feat(tardoc): add invoice status management UI with action buttons"
```

---

### Task 6: Frontend — Template Management UI

**Files:**
- Create: `client/src/pages/clinic/TardocTemplateManager.tsx` (or inline in Invoices.tsx as a dialog)

**Step 1: Build template management dialog**

Accessible from the Invoices page via a "Manage Templates" button. The dialog shows:
- List of existing templates with name, billing model, law type, item count
- "Create Template" button → opens form:
  - Template name, billing model, law type, treatment type, treatment reason, isDefault checkbox
  - Line items table: add TARDOC codes via search, set tax points, scaling factor, quantity
- Edit/Delete existing templates
- "Set as Default" toggle

This component reuses the TARDOC code search that already exists in the invoice form.

**Step 2: Integrate into Invoices page**

Add a "Templates" button/icon in the Invoices page header that opens the template manager dialog.

**Step 3: Test manually**

1. Create a template with 2-3 TARDOC codes
2. Create a new invoice → pick this template → verify lines populate
3. Edit the template → verify changes persist
4. Delete the template → verify it's gone from the picker

**Step 4: Commit**

```bash
git add client/src/pages/clinic/TardocTemplateManager.tsx client/src/pages/clinic/Invoices.tsx
git commit -m "feat(tardoc): add invoice template management UI"
```

---

### Task 7: TypeScript Check + Lint

**Step 1: Run TypeScript check**

Run: `npm run check`
Fix any type errors.

**Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from TARDOC auto-invoice changes"
```

---

### Task 8: Integration Testing

**Files:**
- Modify: `tests/tardoc-templates.test.ts` (expand)

**Step 1: Add integration tests for the full flow**

```typescript
describe("TARDOC Invoice Prefill", () => {
  it("returns warnings for missing patient data", async () => {
    // Create a surgery with a patient missing AHV
    // Call prefill endpoint
    // Verify warnings array includes "Patient has no AHV number"
  });

  it("returns all expected fields from surgery", async () => {
    // Use a known surgery with complete data
    // Verify all prefill fields are populated
  });
});
```

**Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/
git commit -m "test(tardoc): add integration tests for template CRUD and invoice prefill"
```

---

## Execution Order Summary

| # | Task | Effort | Dependencies |
|---|------|--------|--------------|
| 1 | Schema + migration | Small | None |
| 2 | Template CRUD endpoints | Medium | Task 1 |
| 3 | Surgery prefill endpoint | Medium | Task 1 |
| 4 | Revised invoice form | Large | Tasks 2, 3 |
| 5 | Status management UI | Medium | None (existing endpoints) |
| 6 | Template management UI | Medium | Task 2 |
| 7 | TypeScript check | Small | Tasks 1-6 |
| 8 | Integration tests | Medium | Tasks 1-3 |

Tasks 2+3 can be done in parallel. Tasks 5+6 can be done in parallel. Task 4 depends on 2+3.
