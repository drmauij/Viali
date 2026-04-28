# Contract Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded "On-Call Worker Contract" with a generalized template system that supports multiple contract types, block-based clauses, declarable variables, and snapshot-at-signing immutability.

**Architecture:** A new `contract_templates` table stores reusable templates owned by either a chain (`hospital_groups`) or a single hospital. Each template has `blocks` (JSONB clause tree) and `variables` (JSONB declared schema). `worker_contracts` gains `template_id`, `template_snapshot`, `data`, `public_token` columns — additive, no drops. Workers fill a dynamically-generated form; on submit the server snapshots the current template into the contract row. PDFs are rendered browser-side via `@react-pdf/renderer` from a single `<ContractDocument>` React component that drives both the in-app preview and the PDF.

**Tech Stack:** Drizzle ORM + PostgreSQL · React + TipTap (already installed) · `@react-pdf/renderer` (new dep) · `dnd-kit` for block reorder · Vitest + supertest for tests · Express server.

**Spec:** `docs/superpowers/specs/2026-04-28-contract-templates-design.md`

---

## File Structure

### Created files (new)

```
shared/contractTemplates/
  types.ts                          // Block, Variable, ContractData types
  resolveText.ts                    // {{x.y}} interpolation
  buildZodSchema.ts                 // Variables → runtime zod schema
  flattenBlocks.ts                  // Block tree traversal

server/seed/
  contractTemplateStarters.ts       // Viali starter template definitions
  seedContractTemplates.ts          // Runs on chain/hospital create
  backfillExistingContracts.ts      // One-time migration of legacy 4 rows

server/routes/
  contractTemplates.ts              // CRUD + clone endpoints (mounted under /api)
  contractInstances.ts              // Path A + Path B public + manager flows

server/storage/
  contractTemplatesStorage.ts       // DB ops for contract_templates
  contractInstancesStorage.ts       // DB ops for worker_contracts (new contract paths)

migrations/
  0238_contract_templates.sql       // Idempotent schema additions

client/src/lib/contractTemplates/
  ContractDocument.tsx              // HTML preview component (uses Tailwind)
  ContractDocumentPdf.tsx           // @react-pdf version (mirrors structure)
  renderBlock.ts                    // Shared text formatting helpers
  resolveAutoVariables.ts           // Client-side helper for default values

client/src/components/contracts/
  TemplateGallery.tsx               // List screen (Screen 1 in spec)
  TemplateEditor.tsx                // Three-pane editor wrapper (Screen 2)
  BlockTree.tsx                     //   - left rail (drag/reorder)
  BlockEditPanel.tsx                //   - center (TipTap inside paragraph blocks)
  VariablesPanel.tsx                //   - right rail (simple + selectable lists)
  AddBlockMenu.tsx                  //   - block palette popover
  TemplatePreview.tsx               // Screen 3 (uses ContractDocument)
  DynamicContractForm.tsx           // Worker-facing dynamic form

client/src/pages/business/
  ContractTemplates.tsx             // /business/hr/contracts/templates page

client/src/pages/chain/
  ContractTemplates.tsx             // /chain/contracts/templates page

tests/contractTemplates/
  resolveText.test.ts
  buildZodSchema.test.ts
  flattenBlocks.test.ts
  templatesCrud.test.ts             // Integration: route + DB
  contractSubmit.test.ts            // Integration: snapshot at signing
  backfill.test.ts                  // Integration: legacy migration
  renderer.test.tsx                 // Component snapshots
```

### Modified files

```
shared/schema.ts                                       // Add contractTemplates + cols on workerContracts
package.json                                           // Add @react-pdf/renderer + @dnd-kit/core, @dnd-kit/sortable
server/routes.ts                                       // Mount new routers
server/routes/business.ts                              // Update existing /sign + /send-email endpoints
client/src/pages/business/Contracts.tsx                // Replace generateContractPDF with ContractDocumentPdf
client/src/pages/WorkerContractForm.tsx                // Replace static form with DynamicContractForm
client/src/App.tsx (or router file)                    // Add new routes
client/src/i18n/locales/{en,de}.json                   // Strings for editor & gallery
```

### Deleted (in cutover, Phase G)

- The hardcoded `roleInfo` objects in `Contracts.tsx` (lines ~75-93) and `WorkerContractForm.tsx` (lines ~52-80).
- `generateContractPDF` and `generateContractPDFBase64` functions in `Contracts.tsx` (lines ~416-792).

---

## Phase A — Foundation: DB + types + helpers

### Task 1: Add dependencies + DB migration + Drizzle schema

**Files:**
- Modify: `package.json`
- Create: `migrations/0238_contract_templates.sql`
- Modify: `shared/schema.ts` (add `contractTemplates`, add columns to `workerContracts`)
- Modify: `migrations/meta/_journal.json` (auto-managed; verify after manual entry)

- [ ] **Step 1: Install new dependencies**

```bash
cd /home/mau/viali && npm install @react-pdf/renderer@^4.0.0 @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0
```

Expected: lockfile updates, no peer warnings beyond existing.

- [ ] **Step 2: Write the migration SQL**

Create `migrations/0238_contract_templates.sql`:

```sql
-- Migration 0238: Generalized contract templates.
-- Adds contract_templates (chain or hospital owned) plus 4 nullable columns on
-- worker_contracts so existing rows continue to function untouched.
-- Idempotent.

CREATE TABLE IF NOT EXISTS contract_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hospital_id varchar REFERENCES hospitals(id),
  owner_chain_id    varchar REFERENCES hospital_groups(id),
  name varchar NOT NULL,
  description text,
  language varchar(2) NOT NULL DEFAULT 'de',
  status varchar NOT NULL DEFAULT 'draft',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '{"simple":[],"selectableLists":[]}'::jsonb,
  is_starter_clone boolean NOT NULL DEFAULT false,
  starter_key varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  archived_at timestamp
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_templates_owner_xor') THEN
    ALTER TABLE contract_templates ADD CONSTRAINT contract_templates_owner_xor CHECK (
      (owner_hospital_id IS NOT NULL)::int + (owner_chain_id IS NOT NULL)::int = 1
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contract_templates_owner_hospital ON contract_templates(owner_hospital_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_owner_chain    ON contract_templates(owner_chain_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_status         ON contract_templates(status);

ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS template_id       varchar REFERENCES contract_templates(id);
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS template_snapshot jsonb;
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS data              jsonb;
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS public_token      varchar;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'worker_contracts_public_token_unique') THEN
    CREATE UNIQUE INDEX worker_contracts_public_token_unique ON worker_contracts(public_token) WHERE public_token IS NOT NULL;
  END IF;
END $$;
```

- [ ] **Step 3: Update `_journal.json`**

Append a new entry to `migrations/meta/_journal.json` (must have the highest `when` timestamp):

```jsonc
{
  "idx": 238,
  "version": "7",
  "when": 1779200000000,
  "tag": "0238_contract_templates",
  "breakpoints": true
}
```

- [ ] **Step 4: Add Drizzle schema entries**

In `shared/schema.ts`, after the existing `workerContracts` block (around line 5176), add:

```ts
export const contractTemplates = pgTable("contract_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerHospitalId: varchar("owner_hospital_id").references(() => hospitals.id),
  ownerChainId: varchar("owner_chain_id").references(() => hospitalGroups.id),
  name: varchar("name").notNull(),
  description: text("description"),
  language: varchar("language", { length: 2 }).notNull().default("de"),
  status: varchar("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft"),
  blocks: jsonb("blocks").notNull().default(sql`'[]'::jsonb`),
  variables: jsonb("variables").notNull().default(sql`'{"simple":[],"selectableLists":[]}'::jsonb`),
  isStarterClone: boolean("is_starter_clone").notNull().default(false),
  starterKey: varchar("starter_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
}, (table) => [
  index("idx_contract_templates_owner_hospital").on(table.ownerHospitalId),
  index("idx_contract_templates_owner_chain").on(table.ownerChainId),
  index("idx_contract_templates_status").on(table.status),
]);

export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type InsertContractTemplate = typeof contractTemplates.$inferInsert;
```

In the same file, modify the `workerContracts` definition to add four new nullable columns (place them just before the trailing `createdAt`):

```ts
  // ─── Template-system additions (2026-04-28) ────────────────────
  templateId: varchar("template_id").references(() => contractTemplates.id),
  templateSnapshot: jsonb("template_snapshot"),
  data: jsonb("data"),
  publicToken: varchar("public_token").unique(),
```

- [ ] **Step 5: Run migration & typecheck**

```bash
cd /home/mau/viali && npx drizzle-kit push && npm run check
```

Expected: `[✓] Changes applied` from drizzle, then `tsc` exits clean.

- [ ] **Step 6: Commit**

```bash
git add migrations/0238_contract_templates.sql migrations/meta/_journal.json shared/schema.ts package.json package-lock.json
git commit -m "feat(contracts): schema + deps for template system

Adds contract_templates table (chain or hospital owned, XOR check)
and four nullable columns on worker_contracts. Pulls in
@react-pdf/renderer + @dnd-kit. Migration is fully idempotent."
```

---

### Task 2: Shared types

**Files:**
- Create: `shared/contractTemplates/types.ts`

- [ ] **Step 1: Write the types**

```ts
// shared/contractTemplates/types.ts
// Pure type-only module — no runtime imports.

export type BlockType = "heading" | "paragraph" | "list" | "section" | "signature" | "pageBreak" | "spacer";

export interface BlockBase {
  id: string;             // stable id for editor reorder; generated client-side
  type: BlockType;
}

export interface HeadingBlock extends BlockBase { type: "heading"; level: 1 | 2 | 3; text: string; }
export interface ParagraphBlock extends BlockBase { type: "paragraph"; text: string; }
export interface ListBlock extends BlockBase { type: "list"; ordered: boolean; items: string[]; }
export interface SectionBlock extends BlockBase { type: "section"; title?: string; children: Block[]; }
export interface SignatureBlock extends BlockBase { type: "signature"; party: "worker" | "manager"; label: string; }
export interface PageBreakBlock extends BlockBase { type: "pageBreak"; }
export interface SpacerBlock extends BlockBase { type: "spacer"; height: number; }

export type Block =
  | HeadingBlock | ParagraphBlock | ListBlock | SectionBlock
  | SignatureBlock | PageBreakBlock | SpacerBlock;

// ───────── Variables ─────────

export type VariableType = "text" | "number" | "date" | "money" | "iban" | "email" | "phone";

export interface SimpleVariable {
  key: string;            // dotted path, e.g. "worker.iban"
  type: VariableType;
  label: string;
  required?: boolean;
  default?: string;
  source?: `auto:${string}`;  // server-injected at submit, e.g. "auto:hospital.companyName"
}

export interface SelectableListField {
  key: string;
  type: VariableType;
}

export interface SelectableListOption {
  id: string;
  [field: string]: string | number;
}

export interface SelectableListVariable {
  key: string;
  label: string;
  fields: SelectableListField[];
  options: SelectableListOption[];
}

export interface VariablesSchema {
  simple: SimpleVariable[];
  selectableLists: SelectableListVariable[];
}

// ───────── Template + snapshot ─────────

export interface TemplateBody {
  blocks: Block[];
  variables: VariablesSchema;
}

// Filled values stored in worker_contracts.data
export type ContractData = Record<string, unknown>;
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/mau/viali && npm run check
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add shared/contractTemplates/types.ts
git commit -m "feat(contracts): shared types for blocks + variables"
```

---

### Task 3: `resolveText` helper + tests

**Files:**
- Create: `shared/contractTemplates/resolveText.ts`
- Create: `tests/contractTemplates/resolveText.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/contractTemplates/resolveText.test.ts
import { describe, it, expect } from "vitest";
import { resolveText } from "@shared/contractTemplates/resolveText";

describe("resolveText", () => {
  it("replaces simple variable references", () => {
    expect(resolveText("Hello {{name}}", { name: "Anna" })).toBe("Hello Anna");
  });

  it("resolves nested dotted paths", () => {
    expect(resolveText("IBAN: {{worker.iban}}", { worker: { iban: "CH123" } })).toBe("IBAN: CH123");
  });

  it("returns empty string for missing keys", () => {
    expect(resolveText("Foo {{a.b.c}}", {})).toBe("Foo ");
  });

  it("ignores non-template double braces in adjacent text", () => {
    expect(resolveText("This {{ is fine }} actually", { foo: "bar" })).toBe("This {{ is fine }} actually");
  });

  it("replaces multiple occurrences", () => {
    expect(resolveText("{{a}} and {{a}} again", { a: "x" })).toBe("x and x again");
  });

  it("stringifies numbers", () => {
    expect(resolveText("Rate: {{rate}}", { rate: 50 })).toBe("Rate: 50");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/resolveText.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// shared/contractTemplates/resolveText.ts
const TOKEN_RE = /\{\{([\w.]+)\}\}/g;

export function resolveText(text: string, data: Record<string, unknown>): string {
  return text.replace(TOKEN_RE, (_, key: string) => {
    const value = key.split(".").reduce<unknown>(
      (acc, part) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      data,
    );
    return value == null ? "" : String(value);
  });
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/resolveText.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add shared/contractTemplates/resolveText.ts tests/contractTemplates/resolveText.test.ts
git commit -m "feat(contracts): {{x.y}} variable resolver"
```

---

### Task 4: `buildZodSchema` helper + tests

**Files:**
- Create: `shared/contractTemplates/buildZodSchema.ts`
- Create: `tests/contractTemplates/buildZodSchema.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/contractTemplates/buildZodSchema.test.ts
import { describe, it, expect } from "vitest";
import { buildZodSchema } from "@shared/contractTemplates/buildZodSchema";
import type { VariablesSchema } from "@shared/contractTemplates/types";

const schema: VariablesSchema = {
  simple: [
    { key: "worker.firstName", type: "text",  label: "First", required: true },
    { key: "worker.iban",      type: "iban",  label: "IBAN",  required: true },
    { key: "contract.startDate", type: "date", label: "Start" },
  ],
  selectableLists: [
    { key: "role", label: "Role",
      fields: [{ key: "id", type: "text" }, { key: "rate", type: "money" }],
      options: [{ id: "a", rate: "50" }, { id: "b", rate: "60" }] },
  ],
};

describe("buildZodSchema", () => {
  it("validates a well-formed payload", () => {
    const z = buildZodSchema(schema);
    const result = z.safeParse({
      worker: { firstName: "Anna", iban: "CH9300762011623852957" },
      contract: { startDate: "2026-05-01" },
      role: { id: "a" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const z = buildZodSchema(schema);
    const result = z.safeParse({ worker: {}, role: { id: "a" } });
    expect(result.success).toBe(false);
  });

  it("rejects unknown selectable-list option ids", () => {
    const z = buildZodSchema(schema);
    const result = z.safeParse({
      worker: { firstName: "Anna", iban: "CH9300762011623852957" },
      role: { id: "nope" },
    });
    expect(result.success).toBe(false);
  });

  it("skips auto-source variables (server-injected)", () => {
    const withAuto: VariablesSchema = {
      ...schema,
      simple: [...schema.simple, { key: "company.name", type: "text", label: "Co", source: "auto:hospital.companyName" }],
    };
    const z = buildZodSchema(withAuto);
    const result = z.safeParse({
      worker: { firstName: "Anna", iban: "CH9300762011623852957" },
      role: { id: "a" },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/buildZodSchema.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// shared/contractTemplates/buildZodSchema.ts
import { z, ZodTypeAny } from "zod";
import type { VariablesSchema, SimpleVariable, VariableType } from "./types";

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i;

function leafSchemaForType(t: VariableType): ZodTypeAny {
  switch (t) {
    case "text":   return z.string().min(1);
    case "number": return z.coerce.number();
    case "date":   return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    case "money":  return z.string().min(1);
    case "iban":   return z.string().regex(IBAN_RE, "Invalid IBAN");
    case "email":  return z.string().email();
    case "phone":  return z.string().min(5);
  }
}

function setByPath(target: Record<string, ZodRawShape>, key: string, leaf: ZodTypeAny) {
  const parts = key.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in cursor)) cursor[p] = {} as ZodRawShape;
    cursor = cursor[p] as unknown as Record<string, ZodRawShape>;
  }
  (cursor as unknown as Record<string, ZodTypeAny>)[parts[parts.length - 1]] = leaf;
}

type ZodRawShape = Record<string, ZodTypeAny | ZodRawShape>;

function shapeToZod(shape: ZodRawShape): ZodTypeAny {
  const out: Record<string, ZodTypeAny> = {};
  for (const [k, v] of Object.entries(shape)) {
    out[k] = v && typeof v === "object" && !("_def" in (v as object))
      ? shapeToZod(v as ZodRawShape)
      : (v as ZodTypeAny);
  }
  return z.object(out);
}

export function buildZodSchema(schema: VariablesSchema): ZodTypeAny {
  const shape: ZodRawShape = {};

  for (const v of schema.simple as SimpleVariable[]) {
    if (v.source) continue; // auto-injected server-side
    let leaf = leafSchemaForType(v.type);
    if (!v.required) leaf = leaf.optional();
    setByPath(shape, v.key, leaf);
  }

  for (const list of schema.selectableLists) {
    const allowedIds = list.options.map((o) => o.id);
    const leaf = z.object({ id: z.enum(allowedIds as [string, ...string[]]) }).passthrough();
    setByPath(shape, list.key, leaf);
  }

  return shapeToZod(shape);
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/buildZodSchema.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add shared/contractTemplates/buildZodSchema.ts tests/contractTemplates/buildZodSchema.test.ts
git commit -m "feat(contracts): runtime zod schema generator from variables"
```

---

### Task 5: `flattenBlocks` helper + tests

**Files:**
- Create: `shared/contractTemplates/flattenBlocks.ts`
- Create: `tests/contractTemplates/flattenBlocks.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/contractTemplates/flattenBlocks.test.ts
import { describe, it, expect } from "vitest";
import { flattenBlocks } from "@shared/contractTemplates/flattenBlocks";
import type { Block } from "@shared/contractTemplates/types";

describe("flattenBlocks", () => {
  it("returns blocks in linear order", () => {
    const blocks: Block[] = [
      { id: "a", type: "heading", level: 1, text: "T" },
      { id: "b", type: "paragraph", text: "X" },
    ];
    expect(flattenBlocks(blocks).map(b => b.id)).toEqual(["a", "b"]);
  });

  it("walks into section children", () => {
    const blocks: Block[] = [
      { id: "a", type: "heading", level: 1, text: "T" },
      { id: "s", type: "section", title: "S", children: [
        { id: "c", type: "paragraph", text: "X" },
        { id: "d", type: "paragraph", text: "Y" },
      ]},
      { id: "e", type: "paragraph", text: "Z" },
    ];
    expect(flattenBlocks(blocks).map(b => b.id)).toEqual(["a", "s", "c", "d", "e"]);
  });
});
```

- [ ] **Step 2: Run, expect fail; implement; rerun.**

Implementation:

```ts
// shared/contractTemplates/flattenBlocks.ts
import type { Block } from "./types";

export function flattenBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  function walk(b: Block) {
    out.push(b);
    if (b.type === "section") b.children.forEach(walk);
  }
  blocks.forEach(walk);
  return out;
}
```

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/flattenBlocks.test.ts
```

Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add shared/contractTemplates/flattenBlocks.ts tests/contractTemplates/flattenBlocks.test.ts
git commit -m "feat(contracts): block tree flattener"
```

---

## Phase B — Backend storage, seed, backfill

### Task 6: Viali starter template definition

**Files:**
- Create: `server/seed/contractTemplateStarters.ts`

The starter is a 1:1 representation of today's hardcoded German on-call contract — same 10 sections, same 3 roles + rates currently in production (CHF 50 / 60 / 50).

- [ ] **Step 1: Write the starter file**

```ts
// server/seed/contractTemplateStarters.ts
import type { TemplateBody } from "@shared/contractTemplates/types";

export const ON_CALL_V1_KEY = "on_call_v1";

export const ON_CALL_V1_DE: TemplateBody = {
  variables: {
    simple: [
      { key: "company.name",         type: "text", label: "Firmenname",     source: "auto:hospital.companyName" },
      { key: "company.address",      type: "text", label: "Firmenadresse",  source: "auto:hospital.address" },
      { key: "company.jurisdiction", type: "text", label: "Gerichtsstand",  default: "Zürich" },
      { key: "worker.firstName",     type: "text", label: "Vorname",        required: true },
      { key: "worker.lastName",      type: "text", label: "Nachname",       required: true },
      { key: "worker.street",        type: "text", label: "Strasse",        required: true },
      { key: "worker.postalCode",    type: "text", label: "PLZ",            required: true },
      { key: "worker.city",          type: "text", label: "Ort",            required: true },
      { key: "worker.phone",         type: "phone", label: "Telefon" },
      { key: "worker.email",         type: "email", label: "E-Mail",         required: true },
      { key: "worker.dateOfBirth",   type: "date", label: "Geburtsdatum",   required: true },
      { key: "worker.iban",          type: "iban", label: "IBAN",           required: true },
      { key: "contract.signedAt",    type: "date", label: "Unterzeichnet am", source: "auto:now" },
    ],
    selectableLists: [
      {
        key: "role",
        label: "Rolle / Tarif",
        fields: [
          { key: "title",       type: "text" },
          { key: "rate",        type: "money" },
          { key: "description", type: "text" },
          { key: "roleTitle",   type: "text" },
        ],
        options: [
          {
            id: "awr_nurse",
            title: "Tagesklinik Pflege (AWR-Nurse)",
            rate: "CHF 50.00",
            description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Intensivpflege",
            roleTitle: "IMC-Pfleger im Aufwachraum",
          },
          {
            id: "anesthesia_nurse",
            title: "Pflege-Anästhesist",
            rate: "CHF 60.00",
            description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Anästhesiepflege",
            roleTitle: "Anästhesiepfleger",
          },
          {
            id: "op_nurse",
            title: "OP Pflege/OTA",
            rate: "CHF 50.00",
            description: "diplomierter Pflegefachmann mit Zusatzausbildung OP-Pflege oder Operationstechnischer Assistent (OTA)",
            roleTitle: "OP-Pfleger/OTA",
          },
        ],
      },
    ],
  },
  blocks: [
    { id: "h1", type: "heading", level: 1, text: "Vertrag für Kurzzeiteinsätze auf Abruf" },
    { id: "p_intro", type: "paragraph",
      text: "Zwischen {{company.name}}, {{company.address}} (nachfolgend «Auftraggeber») und {{worker.firstName}} {{worker.lastName}}, {{worker.street}}, {{worker.postalCode}} {{worker.city}} (nachfolgend «Auftragnehmer») wird folgender Vertrag geschlossen." },
    { id: "s_1", type: "section", title: "1. Präambel", children: [
      { id: "p_1", type: "paragraph",
        text: "Die {{company.name}} bietet kurzzeitige Einsätze für {{role.title}} an. Der Auftragnehmer ist {{role.description}} und übernimmt die Funktion {{role.roleTitle}}." },
    ]},
    { id: "s_2", type: "section", title: "2. Vertragsgegenstand", children: [
      { id: "p_2", type: "paragraph",
        text: "Der Auftragnehmer verpflichtet sich, auf Abruf des Auftraggebers kurzzeitige Einsätze als {{role.roleTitle}} zu übernehmen." },
    ]},
    { id: "s_3", type: "section", title: "3. Vergütung", children: [
      { id: "p_3", type: "paragraph",
        text: "Der Auftragnehmer erhält für seine Tätigkeit einen Bruttolohn pro Stunde in Höhe von {{role.rate}}. Die Auszahlung erfolgt monatlich auf das vom Auftragnehmer angegebene Konto (IBAN: {{worker.iban}})." },
    ]},
    { id: "s_4", type: "section", title: "4. Arbeitszeit", children: [
      { id: "p_4", type: "paragraph",
        text: "Die Einsatzzeiten werden im gegenseitigen Einvernehmen festgelegt. Es besteht keine Verpflichtung zur Annahme einzelner Einsätze." },
    ]},
    { id: "s_5", type: "section", title: "5. Verschwiegenheit", children: [
      { id: "p_5", type: "paragraph",
        text: "Der Auftragnehmer verpflichtet sich zur Verschwiegenheit über alle ihm im Rahmen seiner Tätigkeit bekannt gewordenen Geschäfts- und Patientendaten — auch nach Beendigung des Vertragsverhältnisses." },
    ]},
    { id: "s_6", type: "section", title: "6. Versicherung", children: [
      { id: "p_6", type: "paragraph",
        text: "Der Auftragnehmer ist für seine eigene Sozial- und Krankenversicherung selbst verantwortlich, sofern keine anderslautenden gesetzlichen Bestimmungen gelten." },
    ]},
    { id: "s_7", type: "section", title: "7. Beendigung", children: [
      { id: "p_7", type: "paragraph",
        text: "Der Vertrag kann jederzeit von beiden Seiten ohne Angabe von Gründen schriftlich gekündigt werden." },
    ]},
    { id: "s_8", type: "section", title: "8. Schlussbestimmungen", children: [
      { id: "p_8", type: "paragraph",
        text: "Änderungen oder Ergänzungen dieses Vertrages bedürfen der Schriftform. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt." },
    ]},
    { id: "s_9", type: "section", title: "9. Gerichtsstand", children: [
      { id: "p_9", type: "paragraph",
        text: "Gerichtsstand für sämtliche Streitigkeiten aus diesem Vertrag ist {{company.jurisdiction}}." },
    ]},
    { id: "p_signed", type: "paragraph",
      text: "Unterzeichnet am {{contract.signedAt}}." },
    { id: "sig_w", type: "signature", party: "worker",  label: "Auftragnehmer" },
    { id: "sig_m", type: "signature", party: "manager", label: "Auftraggeber" },
  ],
};

export const STARTERS = [
  { key: ON_CALL_V1_KEY, name: "On-Call Worker Contract", language: "de" as const, body: ON_CALL_V1_DE },
];
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/mau/viali && npm run check
```

- [ ] **Step 3: Commit**

```bash
git add server/seed/contractTemplateStarters.ts
git commit -m "feat(contracts): on-call v1 starter template (DE)"
```

---

### Task 7: Storage layer for `contract_templates`

**Files:**
- Create: `server/storage/contractTemplatesStorage.ts`

- [ ] **Step 1: Write the storage module**

```ts
// server/storage/contractTemplatesStorage.ts
import { db } from "../db";
import { contractTemplates, hospitals, type ContractTemplate, type InsertContractTemplate } from "@shared/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import type { TemplateBody } from "@shared/contractTemplates/types";

export async function listForHospital(hospitalId: string): Promise<ContractTemplate[]> {
  // Hospital sees: all chain-owned templates of its chain (if any), plus its own.
  const [hospital] = await db.select({ groupId: hospitals.groupId }).from(hospitals).where(eq(hospitals.id, hospitalId));
  const chainId = hospital?.groupId ?? null;

  return db.select().from(contractTemplates).where(
    and(
      isNull(contractTemplates.archivedAt),
      or(
        eq(contractTemplates.ownerHospitalId, hospitalId),
        chainId ? eq(contractTemplates.ownerChainId, chainId) : undefined,
      )!,
    ),
  );
}

export async function listForChain(chainId: string): Promise<ContractTemplate[]> {
  return db.select().from(contractTemplates).where(
    and(eq(contractTemplates.ownerChainId, chainId), isNull(contractTemplates.archivedAt)),
  );
}

export async function getById(id: string): Promise<ContractTemplate | undefined> {
  const [row] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id));
  return row;
}

export async function create(input: InsertContractTemplate): Promise<ContractTemplate> {
  const [row] = await db.insert(contractTemplates).values(input).returning();
  return row;
}

export async function update(id: string, patch: Partial<InsertContractTemplate>): Promise<ContractTemplate> {
  const [row] = await db.update(contractTemplates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contractTemplates.id, id))
    .returning();
  return row;
}

export async function archive(id: string): Promise<void> {
  await db.update(contractTemplates).set({ archivedAt: new Date(), status: "archived" }).where(eq(contractTemplates.id, id));
}

// Clones a template (chain or hospital owned) into a new hospital-owned row (override),
// returning the new row. Caller decides ownership (hospital or chain).
export async function cloneInto(
  source: ContractTemplate,
  ownership: { ownerHospitalId?: string; ownerChainId?: string },
  newName?: string,
): Promise<ContractTemplate> {
  return create({
    ownerHospitalId: ownership.ownerHospitalId ?? null,
    ownerChainId:    ownership.ownerChainId    ?? null,
    name: newName ?? `${source.name} (copy)`,
    description: source.description,
    language: source.language,
    status: "draft",
    blocks: source.blocks,
    variables: source.variables,
    isStarterClone: source.isStarterClone,
    starterKey: source.starterKey,
  } as InsertContractTemplate);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/mau/viali && npm run check
```

- [ ] **Step 3: Commit**

```bash
git add server/storage/contractTemplatesStorage.ts
git commit -m "feat(contracts): storage layer for contract_templates"
```

---

### Task 8: Seed script + auto-seed on chain/hospital creation

**Files:**
- Create: `server/seed/seedContractTemplates.ts`
- Modify: `server/storage/hospitals.ts` or wherever new hospitals/groups are created (search for `insert(hospitals)` / `insert(hospitalGroups)` and add a post-create call). For minimal scope, keep the seed function exported and *also* run it once on application startup so already-existing chains/hospitals get backfilled.
- Modify: `server/index.ts` (call the seed once on startup, after DB ready)

- [ ] **Step 1: Write the seed function**

```ts
// server/seed/seedContractTemplates.ts
import { db } from "../db";
import { contractTemplates, hospitalGroups, hospitals } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { STARTERS } from "./contractTemplateStarters";

async function ownerHasTemplate(filter: { ownerChainId?: string; ownerHospitalId?: string }): Promise<boolean> {
  const where = filter.ownerChainId
    ? eq(contractTemplates.ownerChainId, filter.ownerChainId)
    : eq(contractTemplates.ownerHospitalId, filter.ownerHospitalId!);
  const [row] = await db.select({ id: contractTemplates.id }).from(contractTemplates).where(where).limit(1);
  return !!row;
}

export async function seedStartersForChain(chainId: string): Promise<void> {
  if (await ownerHasTemplate({ ownerChainId: chainId })) return;
  for (const s of STARTERS) {
    await db.insert(contractTemplates).values({
      ownerChainId: chainId,
      name: s.name,
      language: s.language,
      status: "active",
      blocks: s.body.blocks,
      variables: s.body.variables,
      isStarterClone: true,
      starterKey: s.key,
    });
  }
}

export async function seedStartersForHospital(hospitalId: string): Promise<void> {
  if (await ownerHasTemplate({ ownerHospitalId: hospitalId })) return;
  for (const s of STARTERS) {
    await db.insert(contractTemplates).values({
      ownerHospitalId: hospitalId,
      name: s.name,
      language: s.language,
      status: "active",
      blocks: s.body.blocks,
      variables: s.body.variables,
      isStarterClone: true,
      starterKey: s.key,
    });
  }
}

/** Idempotent: ensures every chain has starters, and every standalone hospital (no group) has starters. */
export async function seedAllOwners(): Promise<{ chainsSeeded: number; hospitalsSeeded: number }> {
  let chainsSeeded = 0;
  let hospitalsSeeded = 0;

  const chains = await db.select({ id: hospitalGroups.id }).from(hospitalGroups);
  for (const c of chains) {
    const before = await ownerHasTemplate({ ownerChainId: c.id });
    await seedStartersForChain(c.id);
    if (!before) chainsSeeded++;
  }

  const standalone = await db.select({ id: hospitals.id }).from(hospitals).where(isNull(hospitals.groupId));
  for (const h of standalone) {
    const before = await ownerHasTemplate({ ownerHospitalId: h.id });
    await seedStartersForHospital(h.id);
    if (!before) hospitalsSeeded++;
  }

  return { chainsSeeded, hospitalsSeeded };
}
```

- [ ] **Step 2: Wire startup call**

In `server/index.ts`, after the DB connection is established (look for the `app.listen` line; insert just before it inside the async startup function):

```ts
import { seedAllOwners } from "./seed/seedContractTemplates";
// …
const seedRes = await seedAllOwners();
console.log(`[seed] contract template starters: ${seedRes.chainsSeeded} chains, ${seedRes.hospitalsSeeded} hospitals`);
```

- [ ] **Step 3: Manual smoke test**

```bash
cd /home/mau/viali && npm run dev
```

In another shell:

```bash
psql $DATABASE_URL -c "SELECT count(*) FROM contract_templates WHERE is_starter_clone = true;"
```

Expected: count > 0 (one per existing chain + one per standalone hospital).

- [ ] **Step 4: Commit**

```bash
git add server/seed/seedContractTemplates.ts server/index.ts
git commit -m "feat(contracts): auto-seed on-call starter on every chain + standalone hospital"
```

---

### Task 9: Backfill existing 4 worker_contracts rows

**Files:**
- Create: `server/seed/backfillExistingContracts.ts`
- Create: `tests/contractTemplates/backfill.test.ts`

- [ ] **Step 1: Write the backfill function**

```ts
// server/seed/backfillExistingContracts.ts
import { db } from "../db";
import { workerContracts, contractTemplates, hospitals, hospitalGroups } from "@shared/schema";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { ON_CALL_V1_KEY } from "./contractTemplateStarters";
import { randomUUID } from "node:crypto";
import type { TemplateBody, ContractData } from "@shared/contractTemplates/types";

interface BackfillResult { migrated: number; skippedNoTemplate: number; }

async function findStarterFor(hospitalId: string) {
  const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId));
  if (!hospital) return undefined;

  if (hospital.groupId) {
    const [tmpl] = await db.select().from(contractTemplates).where(and(
      eq(contractTemplates.ownerChainId, hospital.groupId),
      eq(contractTemplates.starterKey, ON_CALL_V1_KEY),
    ));
    if (tmpl) return { hospital, template: tmpl };
  }
  const [tmpl] = await db.select().from(contractTemplates).where(and(
    eq(contractTemplates.ownerHospitalId, hospitalId),
    eq(contractTemplates.starterKey, ON_CALL_V1_KEY),
  ));
  return tmpl ? { hospital, template: tmpl } : undefined;
}

export async function backfillExistingContracts(opts: { dryRun?: boolean } = {}): Promise<BackfillResult> {
  const rows = await db.select().from(workerContracts).where(isNull(workerContracts.templateSnapshot));

  let migrated = 0;
  let skippedNoTemplate = 0;

  for (const row of rows) {
    const found = await findStarterFor(row.hospitalId);
    if (!found) { skippedNoTemplate++; continue; }
    const { hospital, template } = found;

    const variables = template.variables as TemplateBody["variables"];
    const roleOption = variables.selectableLists
      .find((l) => l.key === "role")
      ?.options.find((o) => o.id === row.role);
    if (!roleOption) { skippedNoTemplate++; continue; }

    const data: ContractData = {
      company:  { name: (hospital as any).companyName ?? "", address: "", jurisdiction: "Zürich" },
      worker: {
        firstName: row.firstName, lastName: row.lastName,
        street: row.street, postalCode: row.postalCode, city: row.city,
        phone: row.phone ?? "", email: row.email,
        dateOfBirth: row.dateOfBirth, iban: row.iban,
      },
      role: { ...roleOption },
      contract: { signedAt: row.workerSignedAt?.toISOString().slice(0, 10) ?? null },
    };

    const snapshot: TemplateBody = { blocks: template.blocks as any, variables };

    if (!opts.dryRun) {
      await db.update(workerContracts).set({
        templateId: template.id,
        templateSnapshot: snapshot as any,
        data: data as any,
        publicToken: row.publicToken ?? randomUUID(),
      }).where(eq(workerContracts.id, row.id));
    }
    migrated++;
  }

  return { migrated, skippedNoTemplate };
}
```

- [ ] **Step 2: Write integration test**

```ts
// tests/contractTemplates/backfill.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../../server/db";
import { workerContracts, contractTemplates } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { backfillExistingContracts } from "../../server/seed/backfillExistingContracts";
import { seedAllOwners } from "../../server/seed/seedContractTemplates";

describe("backfillExistingContracts", () => {
  beforeAll(async () => {
    await seedAllOwners();
  });

  it("populates templateSnapshot + data on legacy rows; idempotent on re-run", async () => {
    // (Test relies on existing seed/test fixtures providing at least one legacy worker_contracts row;
    //  if the test DB is empty, this assertion will report 0 migrated and still pass.)
    const first = await backfillExistingContracts();
    const remaining = await db.select({ id: workerContracts.id })
      .from(workerContracts)
      .where(isNull(workerContracts.templateSnapshot));
    expect(remaining.length).toBe(0);

    const second = await backfillExistingContracts();
    expect(second.migrated).toBe(0); // nothing new to migrate
  });
});
```

- [ ] **Step 3: Run test**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/backfill.test.ts
```

Expected: pass.

- [ ] **Step 4: Run dry-run on production data**

```bash
cd /home/mau/viali && tsx -e 'import("./server/seed/backfillExistingContracts").then(m => m.backfillExistingContracts({ dryRun: true })).then(r => console.log(r))'
```

Expected: prints `{ migrated: 4, skippedNoTemplate: 0 }`. If `skippedNoTemplate > 0`, **STOP** and investigate — a row's role enum has no matching option in the starter.

- [ ] **Step 5: Run for real**

```bash
cd /home/mau/viali && tsx -e 'import("./server/seed/backfillExistingContracts").then(m => m.backfillExistingContracts()).then(r => console.log(r))'
```

- [ ] **Step 6: Commit**

```bash
git add server/seed/backfillExistingContracts.ts tests/contractTemplates/backfill.test.ts
git commit -m "feat(contracts): backfill legacy contracts with template snapshot"
```

---

## Phase C — Backend routes

### Task 10: Template CRUD routes (list/create/clone/update/archive)

**Files:**
- Create: `server/routes/contractTemplates.ts`
- Create: `tests/contractTemplates/templatesCrud.test.ts`
- Modify: `server/routes.ts` (mount the router)

- [ ] **Step 1: Write the integration test**

```ts
// tests/contractTemplates/templatesCrud.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import contractTemplatesRouter from "../../server/routes/contractTemplates";
// fixture helpers — match the project's existing test patterns
import { authedRequestAs, createTestHospital, createTestChain } from "../helpers";

describe("contract template CRUD", () => {
  let app: express.Express;
  beforeAll(() => { app = express().use(express.json()).use(contractTemplatesRouter); });

  it("creates a template scoped to a hospital", async () => {
    const { hospitalId, managerCookie } = await createTestHospital();
    const r = await authedRequestAs(app, managerCookie)
      .post(`/api/business/${hospitalId}/contract-templates`)
      .send({ name: "Test", language: "de" });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe("Test");
    expect(r.body.ownerHospitalId).toBe(hospitalId);
  });

  it("rejects creation by non-manager", async () => {
    const { hospitalId, viewerCookie } = await createTestHospital();
    const r = await authedRequestAs(app, viewerCookie)
      .post(`/api/business/${hospitalId}/contract-templates`).send({ name: "x" });
    expect(r.status).toBe(403);
  });

  it("clones an existing template into a new hospital row", async () => {
    const { hospitalId, managerCookie, sourceTemplateId } = await createTestHospital();
    const r = await authedRequestAs(app, managerCookie)
      .post(`/api/business/${hospitalId}/contract-templates/${sourceTemplateId}/clone`)
      .send({ name: "Cloned" });
    expect(r.status).toBe(201);
    expect(r.body.id).not.toBe(sourceTemplateId);
  });

  it("archives templates rather than hard-deleting", async () => {
    const { hospitalId, managerCookie, sourceTemplateId } = await createTestHospital();
    const r = await authedRequestAs(app, managerCookie)
      .post(`/api/business/${hospitalId}/contract-templates/${sourceTemplateId}/archive`).send();
    expect(r.status).toBe(204);
  });
});
```

- [ ] **Step 2: Implement the router**

```ts
// server/routes/contractTemplates.ts
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated, isBusinessManager } from "../auth/middleware";
import * as storage from "../storage/contractTemplatesStorage";
import { db } from "../db";
import { hospitals } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

const baseInput = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  language: z.enum(["de", "en"]).default("de"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  blocks: z.array(z.any()).default([]),
  variables: z.object({ simple: z.array(z.any()).default([]), selectableLists: z.array(z.any()).default([]) }).default({ simple: [], selectableLists: [] }),
});

// GET — list templates visible to a hospital (its own + its chain's)
router.get("/api/business/:hospitalId/contract-templates", isAuthenticated, isBusinessManager, async (req, res) => {
  const list = await storage.listForHospital(req.params.hospitalId);
  res.json(list);
});

// GET — list chain-owned templates
router.get("/api/chain/:chainId/contract-templates", isAuthenticated, /* TODO: isChainAdmin */ async (req, res) => {
  const list = await storage.listForChain(req.params.chainId);
  res.json(list);
});

// POST — create a hospital-owned template (blank or pre-seeded blocks)
router.post("/api/business/:hospitalId/contract-templates", isAuthenticated, isBusinessManager, async (req, res) => {
  const parsed = baseInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const created = await storage.create({ ownerHospitalId: req.params.hospitalId, ...parsed.data } as any);
  res.status(201).json(created);
});

// POST — create a chain-owned template
router.post("/api/chain/:chainId/contract-templates", isAuthenticated, /* TODO: isChainAdmin */ async (req, res) => {
  const parsed = baseInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const created = await storage.create({ ownerChainId: req.params.chainId, ...parsed.data } as any);
  res.status(201).json(created);
});

// POST — clone an existing template into a new hospital-owned row
router.post("/api/business/:hospitalId/contract-templates/:id/clone", isAuthenticated, isBusinessManager, async (req, res) => {
  const source = await storage.getById(req.params.id);
  if (!source) return res.status(404).end();
  const cloned = await storage.cloneInto(source, { ownerHospitalId: req.params.hospitalId }, req.body?.name);
  res.status(201).json(cloned);
});

// POST — clone for chain
router.post("/api/chain/:chainId/contract-templates/:id/clone", isAuthenticated, /* TODO: isChainAdmin */ async (req, res) => {
  const source = await storage.getById(req.params.id);
  if (!source) return res.status(404).end();
  const cloned = await storage.cloneInto(source, { ownerChainId: req.params.chainId }, req.body?.name);
  res.status(201).json(cloned);
});

// PATCH — update fields
router.patch("/api/business/:hospitalId/contract-templates/:id", isAuthenticated, isBusinessManager, async (req, res) => {
  const parsed = baseInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await storage.update(req.params.id, parsed.data as any);
  res.json(updated);
});

router.patch("/api/chain/:chainId/contract-templates/:id", isAuthenticated, /* TODO: isChainAdmin */ async (req, res) => {
  const parsed = baseInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await storage.update(req.params.id, parsed.data as any);
  res.json(updated);
});

// POST — archive
router.post("/api/business/:hospitalId/contract-templates/:id/archive", isAuthenticated, isBusinessManager, async (req, res) => {
  await storage.archive(req.params.id);
  res.status(204).end();
});

router.post("/api/chain/:chainId/contract-templates/:id/archive", isAuthenticated, /* TODO: isChainAdmin */ async (req, res) => {
  await storage.archive(req.params.id);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 3: Mount the router**

In `server/routes.ts` (look for the existing router registrations, after `business` is mounted):

```ts
import contractTemplatesRouter from "./routes/contractTemplates";
// …
app.use(contractTemplatesRouter);
```

- [ ] **Step 4: Run tests**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/templatesCrud.test.ts
```

Expected: 4 passing. (If your test helpers don't exist yet, copy patterns from `tests/access-control-groups.test.ts`.)

- [ ] **Step 5: Commit**

```bash
git add server/routes/contractTemplates.ts server/routes.ts tests/contractTemplates/templatesCrud.test.ts
git commit -m "feat(contracts): CRUD + clone + archive routes for templates"
```

---

### Task 11: Path A — per-contract single-use link

**Files:**
- Create: `server/routes/contractInstances.ts`
- Create: `tests/contractTemplates/contractSubmit.test.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/contractTemplates/contractSubmit.test.ts (Path A portion)
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import contractInstancesRouter from "../../server/routes/contractInstances";
import contractTemplatesRouter from "../../server/routes/contractTemplates";
import { createTestHospital, authedRequestAs } from "../helpers";

describe("Path A — per-contract single-use link", () => {
  let app: express.Express;
  beforeAll(() => {
    app = express().use(express.json())
      .use(contractTemplatesRouter)
      .use(contractInstancesRouter);
  });

  it("creates a draft contract with a unique single-use token", async () => {
    const { hospitalId, managerCookie, sourceTemplateId } = await createTestHospital();
    const r = await authedRequestAs(app, managerCookie)
      .post(`/api/business/${hospitalId}/contracts`)
      .send({ templateId: sourceTemplateId, prefill: { worker: { email: "a@b.c" } } });
    expect(r.status).toBe(201);
    expect(typeof r.body.publicToken).toBe("string");
  });

  it("rejects a second submission against the same token (410 Gone)", async () => {
    const { hospitalId, managerCookie, sourceTemplateId } = await createTestHospital();
    const created = await authedRequestAs(app, managerCookie)
      .post(`/api/business/${hospitalId}/contracts`)
      .send({ templateId: sourceTemplateId });
    const token = created.body.publicToken;

    const submitOnce = await request(app).post(`/api/public/contracts/c/${token}/submit`).send({
      data: { /* …matches starter schema… */ },
      workerSignature: "data:image/png;base64,iVBORw==",
      workerSignatureLocation: "Zürich",
    });
    expect([200, 201]).toContain(submitOnce.status);

    const submitTwice = await request(app).post(`/api/public/contracts/c/${token}/submit`).send({});
    expect(submitTwice.status).toBe(410);
  });

  it("snapshots the template at submit time; later template edits do not affect the contract", async () => {
    const { hospitalId, managerCookie, sourceTemplateId } = await createTestHospital();
    const created = await authedRequestAs(app, managerCookie)
      .post(`/api/business/${hospitalId}/contracts`)
      .send({ templateId: sourceTemplateId });
    const token = created.body.publicToken;
    await request(app).post(`/api/public/contracts/c/${token}/submit`).send({
      data: { /* … */ },
      workerSignature: "data:image/png;base64,iVBORw==",
      workerSignatureLocation: "Zürich",
    });

    // Edit template
    await authedRequestAs(app, managerCookie).patch(`/api/business/${hospitalId}/contract-templates/${sourceTemplateId}`)
      .send({ name: "Edited" });

    const fetched = await authedRequestAs(app, managerCookie).get(`/api/business/${hospitalId}/contracts/${created.body.id}`);
    // snapshot is independent of current template
    expect(fetched.body.templateSnapshot).toBeTruthy();
    expect(fetched.body.templateSnapshot.blocks).toEqual(created.body.templateSnapshot.blocks);
  });
});
```

- [ ] **Step 2: Implement the router (Path A first)**

```ts
// server/routes/contractInstances.ts
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { workerContracts, contractTemplates, hospitals } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isAuthenticated, isBusinessManager } from "../auth/middleware";
import { buildZodSchema } from "@shared/contractTemplates/buildZodSchema";
import { randomUUID } from "node:crypto";
import type { TemplateBody, ContractData } from "@shared/contractTemplates/types";

const router = Router();

// ───────── Path A: Manager creates draft → single-use token URL ─────────

const createInput = z.object({
  templateId: z.string(),
  prefill: z.record(z.string(), z.any()).optional(),
});

router.post("/api/business/:hospitalId/contracts", isAuthenticated, isBusinessManager, async (req, res) => {
  const parsed = createInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [tmpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, parsed.data.templateId));
  if (!tmpl) return res.status(404).json({ error: "template not found" });

  const [created] = await db.insert(workerContracts).values({
    hospitalId: req.params.hospitalId,
    templateId: tmpl.id,
    publicToken: randomUUID(),
    data: (parsed.data.prefill ?? {}) as any,
    // Old denormalized fields filled later from data on submit; for draft state use placeholders.
    firstName: "", lastName: "", street: "", postalCode: "", city: "",
    email: parsed.data.prefill?.worker?.email ?? "",
    dateOfBirth: "1970-01-01",
    iban: "",
    role: "awr_nurse", // legacy column — value picked from data.role.id at submit
    status: "pending_manager_signature",
  } as any).returning();

  res.status(201).json({ ...created, templateSnapshot: null });
});

// Public — fetch by single-use token (Path A)
router.get("/api/public/contracts/c/:token", async (req, res) => {
  const [row] = await db.select().from(workerContracts).where(eq(workerContracts.publicToken, req.params.token));
  if (!row) return res.status(404).end();
  if (row.workerSignedAt) return res.status(410).json({ error: "token already used" });
  const [tmpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, row.templateId!));
  res.json({
    contractId: row.id,
    template: { id: tmpl.id, name: tmpl.name, language: tmpl.language, blocks: tmpl.blocks, variables: tmpl.variables },
    prefill: row.data ?? {},
    mode: "single-use",
  });
});

// Public — submit by single-use token
const submitInput = z.object({
  data: z.record(z.string(), z.any()),
  workerSignature: z.string().min(1),
  workerSignatureLocation: z.string().min(1),
});

router.post("/api/public/contracts/c/:token/submit", async (req, res) => {
  const [row] = await db.select().from(workerContracts).where(eq(workerContracts.publicToken, req.params.token));
  if (!row) return res.status(404).end();
  if (row.workerSignedAt) return res.status(410).json({ error: "token already used" });

  const [tmpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, row.templateId!));
  if (!tmpl) return res.status(500).json({ error: "template missing" });

  const parsed = submitInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const variables = tmpl.variables as TemplateBody["variables"];
  const dataValidator = buildZodSchema(variables);
  const dataParsed = dataValidator.safeParse(parsed.data.data);
  if (!dataParsed.success) return res.status(400).json({ error: dataParsed.error.flatten() });

  // Inject auto-source variables server-side
  const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, row.hospitalId));
  const finalData: ContractData = injectAuto(parsed.data.data, variables, hospital);

  const snapshot: TemplateBody = { blocks: tmpl.blocks as any, variables };

  await db.update(workerContracts).set({
    templateSnapshot: snapshot as any,
    data: finalData as any,
    workerSignature: parsed.data.workerSignature,
    workerSignatureLocation: parsed.data.workerSignatureLocation,
    workerSignedAt: new Date(),
    // Keep legacy denormalized columns in sync
    firstName: (finalData.worker as any)?.firstName ?? "",
    lastName:  (finalData.worker as any)?.lastName ?? "",
    street:    (finalData.worker as any)?.street ?? "",
    postalCode:(finalData.worker as any)?.postalCode ?? "",
    city:      (finalData.worker as any)?.city ?? "",
    email:     (finalData.worker as any)?.email ?? "",
    phone:     (finalData.worker as any)?.phone ?? null,
    dateOfBirth: (finalData.worker as any)?.dateOfBirth ?? "1970-01-01",
    iban:      (finalData.worker as any)?.iban ?? "",
    role:      ((finalData.role as any)?.id ?? "awr_nurse") as any,
    status: "pending_manager_signature",
    publicToken: null, // invalidate single-use
  } as any).where(eq(workerContracts.id, row.id));

  res.status(200).json({ ok: true });
});

function injectAuto(input: Record<string, any>, vars: TemplateBody["variables"], hospital: any): ContractData {
  const out = structuredClone(input ?? {});
  for (const v of vars.simple) {
    if (!v.source) continue;
    const [, kind, ...rest] = v.source.split(/[:.]/);
    let value: unknown;
    if (v.source === "auto:now") value = new Date().toISOString().slice(0, 10);
    else if (v.source.startsWith("auto:hospital.")) {
      const field = v.source.slice("auto:hospital.".length);
      value = hospital?.[field] ?? "";
    }
    setByPath(out, v.key, value);
  }
  return out;
}

function setByPath(obj: any, key: string, value: unknown) {
  const parts = key.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor[parts[i]] = cursor[parts[i]] ?? {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

export default router;
```

- [ ] **Step 3: Mount + run tests**

In `server/routes.ts`:

```ts
import contractInstancesRouter from "./routes/contractInstances";
app.use(contractInstancesRouter);
```

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/contractSubmit.test.ts
```

Expected: Path A tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/routes/contractInstances.ts server/routes.ts tests/contractTemplates/contractSubmit.test.ts
git commit -m "feat(contracts): Path A — per-contract single-use token + snapshot at submit"
```

---

### Task 12: Path B — per-template shareable link (replaces the existing public flow)

**Files:**
- Modify: `server/routes/contractInstances.ts` (extend with Path B)
- Modify: `server/routes/business.ts` (legacy hospital-token route now resolves to the chain/hospital's on-call template)
- Extend: `tests/contractTemplates/contractSubmit.test.ts`

- [ ] **Step 1: Add Path B test cases to the existing test file**

```ts
// extend tests/contractTemplates/contractSubmit.test.ts
describe("Path B — per-template shareable link", () => {
  it("accepts multiple submissions per template token, rate-limited", async () => {
    const { templateToken } = await createTestHospital();
    const ok = async () => request(app).post(`/api/public/contracts/t/${templateToken}/submit`).send({
      data: { /* … */ },
      workerSignature: "data:image/png;base64,iVBORw==",
      workerSignatureLocation: "Zürich",
    });

    expect((await ok()).status).toBe(200);
    expect((await ok()).status).toBe(200);
    expect((await ok()).status).toBe(200);
    expect((await ok()).status).toBe(429); // 4th in <24h
  });

  it("legacy hospital-level /contract/:token URL still works", async () => {
    const { legacyHospitalToken } = await createTestHospital();
    const r = await request(app).get(`/api/public/contracts/${legacyHospitalToken}/hospital`);
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: Extend `contractInstances.ts` with Path B handlers**

Add to the same router, after Path A definitions:

```ts
// ───────── Path B: per-template shareable token ─────────

// Each contract_templates row has a stable token. We store it on the template row itself.
// (See migration 0238 if you want to add this; alternatively reuse the existing hospital
// `contract_token` and resolve to the seeded on-call template — preserves bookmarks.)

import { rateLimit } from "../middleware/rateLimit"; // existing project helper
const pathBLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 3, keyGenerator: (req) => req.params.token });

router.get("/api/public/contracts/t/:token", async (req, res) => {
  const tmpl = await resolveTemplateByToken(req.params.token);
  if (!tmpl) return res.status(404).end();
  res.json({
    template: { id: tmpl.id, name: tmpl.name, language: tmpl.language, blocks: tmpl.blocks, variables: tmpl.variables },
    mode: "shareable",
  });
});

router.post("/api/public/contracts/t/:token/submit", pathBLimiter, async (req, res) => {
  const tmpl = await resolveTemplateByToken(req.params.token);
  if (!tmpl) return res.status(404).end();

  const parsed = submitInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const variables = tmpl.variables as TemplateBody["variables"];
  const dataParsed = buildZodSchema(variables).safeParse(parsed.data.data);
  if (!dataParsed.success) return res.status(400).json({ error: dataParsed.error.flatten() });

  // Resolve hospitalId from the template (chain templates need extra context — see comment below)
  const hospitalId = tmpl.ownerHospitalId ?? (await resolveDefaultHospitalForChain(tmpl.ownerChainId!));
  if (!hospitalId) return res.status(400).json({ error: "no hospital context for chain template" });

  const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId));
  const finalData = injectAuto(parsed.data.data, variables, hospital);
  const snapshot: TemplateBody = { blocks: tmpl.blocks as any, variables };

  const [created] = await db.insert(workerContracts).values({
    hospitalId,
    templateId: tmpl.id,
    templateSnapshot: snapshot as any,
    data: finalData as any,
    workerSignature: parsed.data.workerSignature,
    workerSignatureLocation: parsed.data.workerSignatureLocation,
    workerSignedAt: new Date(),
    firstName: (finalData.worker as any)?.firstName ?? "",
    lastName:  (finalData.worker as any)?.lastName ?? "",
    street:    (finalData.worker as any)?.street ?? "",
    postalCode:(finalData.worker as any)?.postalCode ?? "",
    city:      (finalData.worker as any)?.city ?? "",
    email:     (finalData.worker as any)?.email ?? "",
    phone:     (finalData.worker as any)?.phone ?? null,
    dateOfBirth: (finalData.worker as any)?.dateOfBirth ?? "1970-01-01",
    iban:      (finalData.worker as any)?.iban ?? "",
    role:      ((finalData.role as any)?.id ?? "awr_nurse") as any,
    status: "pending_manager_signature",
  } as any).returning();

  res.status(200).json({ ok: true, contractId: created.id });
});

async function resolveTemplateByToken(token: string) {
  // For v1 simplicity we resolve the legacy hospital-level token into the chain's on-call starter,
  // so bookmarked URLs continue to work.
  // 1) Try existing hospital-level token table (if any).
  // 2) Fall back to direct template token lookup once we add a `public_token` column to contract_templates (future).
  const { hospitals: hospitalsTable } = await import("@shared/schema");
  // Look up which hospital owns this token under the legacy scheme:
  // (Project-specific — adjust the import path if the existing token store is elsewhere.)
  // For now: assume hospitals.contractToken column stores it (existing field).
  const [row] = await db.select().from(hospitalsTable).where(eq((hospitalsTable as any).contractToken, token)).limit(1);
  if (!row) return undefined;
  const ownerChainId = row.groupId ?? null;
  const [tmpl] = await db.select().from(contractTemplates).where(
    ownerChainId
      ? and(eq(contractTemplates.ownerChainId, ownerChainId), eq(contractTemplates.starterKey, "on_call_v1"), isNull(contractTemplates.archivedAt))
      : and(eq(contractTemplates.ownerHospitalId, row.id), eq(contractTemplates.starterKey, "on_call_v1"), isNull(contractTemplates.archivedAt))
  );
  return tmpl;
}

async function resolveDefaultHospitalForChain(chainId: string): Promise<string | undefined> {
  // For chain-templates accessed via Path B we need a default hospital — pick the first one in the chain.
  const [first] = await db.select({ id: hospitals.id }).from(hospitals).where(eq(hospitals.groupId, chainId)).limit(1);
  return first?.id;
}
```

- [ ] **Step 3: Run tests**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/contractSubmit.test.ts
```

Expected: all paths pass.

- [ ] **Step 4: Commit**

```bash
git add server/routes/contractInstances.ts tests/contractTemplates/contractSubmit.test.ts
git commit -m "feat(contracts): Path B — per-template shareable link with rate limit"
```

---

## Phase D — Frontend renderer (`<ContractDocument>`)

### Task 13: Browser preview renderer (HTML/Tailwind)

**Files:**
- Create: `client/src/lib/contractTemplates/ContractDocument.tsx`
- Create: `tests/contractTemplates/renderer.test.tsx`

- [ ] **Step 1: Write the failing renderer test**

```tsx
// tests/contractTemplates/renderer.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ContractDocument } from "@/lib/contractTemplates/ContractDocument";
import type { Block, ContractData } from "@shared/contractTemplates/types";

const blocks: Block[] = [
  { id: "h", type: "heading", level: 1, text: "Title {{role.title}}" },
  { id: "p", type: "paragraph", text: "Rate: {{role.rate}}" },
  { id: "sw", type: "signature", party: "worker", label: "Signed" },
];

const data: ContractData = { role: { title: "OTA", rate: "CHF 50" } };

describe("<ContractDocument>", () => {
  it("interpolates variables in heading + paragraph", () => {
    const { container } = render(<ContractDocument blocks={blocks} data={data} workerSignaturePng={null} managerSignaturePng={null} />);
    expect(container.textContent).toContain("Title OTA");
    expect(container.textContent).toContain("Rate: CHF 50");
  });

  it("renders signature placeholder when no signature image given", () => {
    const { container } = render(<ContractDocument blocks={blocks} data={data} workerSignaturePng={null} managerSignaturePng={null} />);
    expect(container.querySelector("[data-testid='sig-placeholder-worker']")).toBeTruthy();
  });

  it("renders provided signature PNG inline", () => {
    const { container } = render(
      <ContractDocument blocks={blocks} data={data}
        workerSignaturePng="data:image/png;base64,abc" managerSignaturePng={null} />
    );
    expect(container.querySelector("img[src='data:image/png;base64,abc']")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement the renderer**

```tsx
// client/src/lib/contractTemplates/ContractDocument.tsx
import * as React from "react";
import { resolveText } from "@shared/contractTemplates/resolveText";
import type { Block, ContractData } from "@shared/contractTemplates/types";

interface Props {
  blocks: Block[];
  data: ContractData;
  workerSignaturePng: string | null;  // data: URL or null
  managerSignaturePng: string | null;
}

export function ContractDocument({ blocks, data, workerSignaturePng, managerSignaturePng }: Props) {
  return (
    <div className="contract-document mx-auto max-w-3xl space-y-4 p-8 text-sm leading-relaxed">
      {blocks.map((b) => <RenderedBlock key={b.id} block={b} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
    </div>
  );
}

function RenderedBlock({ block, data, workerSignaturePng, managerSignaturePng }: { block: Block; data: ContractData; workerSignaturePng: string | null; managerSignaturePng: string | null; }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}`) as "h1" | "h2" | "h3";
      const sizeCls = block.level === 1 ? "text-xl font-bold text-center mt-2" : block.level === 2 ? "text-lg font-semibold mt-4" : "text-base font-semibold mt-3";
      return <Tag className={sizeCls}>{resolveText(block.text, data)}</Tag>;
    }
    case "paragraph":
      return <p>{resolveText(block.text, data)}</p>;
    case "list":
      return block.ordered
        ? <ol className="list-decimal pl-6">{block.items.map((it, i) => <li key={i}>{resolveText(it, data)}</li>)}</ol>
        : <ul className="list-disc pl-6">{block.items.map((it, i) => <li key={i}>{resolveText(it, data)}</li>)}</ul>;
    case "section":
      return (
        <section className="space-y-2">
          {block.title && <h2 className="text-base font-semibold mt-4">{resolveText(block.title, data)}</h2>}
          {block.children.map((c) => <RenderedBlock key={c.id} block={c} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
        </section>
      );
    case "signature": {
      const sigSrc = block.party === "worker" ? workerSignaturePng : managerSignaturePng;
      return (
        <div className="mt-8 inline-block">
          <div className="text-xs text-gray-600">{block.label}</div>
          <div className="border-b border-black mt-12 w-64 h-12 flex items-end" data-testid={sigSrc ? `sig-${block.party}` : `sig-placeholder-${block.party}`}>
            {sigSrc && <img src={sigSrc} alt={`${block.party} signature`} className="max-h-12" />}
          </div>
        </div>
      );
    }
    case "pageBreak":
      return <div className="page-break-before" />;
    case "spacer":
      return <div style={{ height: block.height }} />;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd /home/mau/viali && npx vitest run tests/contractTemplates/renderer.test.tsx
```

Expected: 3 passing.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/contractTemplates/ContractDocument.tsx tests/contractTemplates/renderer.test.tsx
git commit -m "feat(contracts): browser-side <ContractDocument> renderer"
```

---

### Task 14: PDF renderer via `@react-pdf/renderer`

**Files:**
- Create: `client/src/lib/contractTemplates/ContractDocumentPdf.tsx`

- [ ] **Step 1: Implement the PDF renderer**

```tsx
// client/src/lib/contractTemplates/ContractDocumentPdf.tsx
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { resolveText } from "@shared/contractTemplates/resolveText";
import type { Block, ContractData } from "@shared/contractTemplates/types";

const styles = StyleSheet.create({
  page:    { padding: 48, fontSize: 10, lineHeight: 1.4, fontFamily: "Helvetica" },
  h1:      { fontSize: 16, textAlign: "center", marginBottom: 12, fontWeight: "bold" },
  h2:      { fontSize: 12, marginTop: 12, marginBottom: 6, fontWeight: "bold" },
  h3:      { fontSize: 11, marginTop: 8,  marginBottom: 4, fontWeight: "bold" },
  p:       { marginBottom: 6 },
  list:    { marginLeft: 12, marginBottom: 6 },
  sigBox:  { marginTop: 32, width: 240, height: 56, borderBottomWidth: 1, borderBottomColor: "black", flexDirection: "row", alignItems: "flex-end" },
  sigLbl:  { fontSize: 9, color: "#555" },
  sigImg:  { maxHeight: 50 },
});

interface Props {
  blocks: Block[];
  data: ContractData;
  workerSignaturePng: string | null;
  managerSignaturePng: string | null;
}

export function ContractDocumentPdf({ blocks, data, workerSignaturePng, managerSignaturePng }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {blocks.map((b) => <PdfBlock key={b.id} block={b} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
      </Page>
    </Document>
  );
}

function PdfBlock({ block, data, workerSignaturePng, managerSignaturePng }: { block: Block; data: ContractData; workerSignaturePng: string | null; managerSignaturePng: string | null; }) {
  switch (block.type) {
    case "heading": {
      const s = block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
      return <Text style={s}>{resolveText(block.text, data)}</Text>;
    }
    case "paragraph":
      return <Text style={styles.p}>{resolveText(block.text, data)}</Text>;
    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((it, i) => (
            <Text key={i}>{block.ordered ? `${i + 1}. ` : "• "}{resolveText(it, data)}</Text>
          ))}
        </View>
      );
    case "section":
      return (
        <View>
          {block.title && <Text style={styles.h2}>{resolveText(block.title, data)}</Text>}
          {block.children.map((c) => <PdfBlock key={c.id} block={c} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
        </View>
      );
    case "signature": {
      const src = block.party === "worker" ? workerSignaturePng : managerSignaturePng;
      return (
        <View>
          <Text style={styles.sigLbl}>{block.label}</Text>
          <View style={styles.sigBox}>{src && <Image src={src} style={styles.sigImg} />}</View>
        </View>
      );
    }
    case "pageBreak":
      return <View break />;
    case "spacer":
      return <View style={{ height: block.height }} />;
  }
}
```

- [ ] **Step 2: Smoke test render-to-buffer**

```bash
cd /home/mau/viali && npx vitest run --reporter=verbose <(echo '
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import { ContractDocumentPdf } from "@/lib/contractTemplates/ContractDocumentPdf";
import { ON_CALL_V1_DE } from "../../server/seed/contractTemplateStarters";
describe("PDF smoke", () => {
  it("produces a non-empty buffer", async () => {
    const blob = await pdf(<ContractDocumentPdf blocks={ON_CALL_V1_DE.blocks as any} data={{ role: ON_CALL_V1_DE.variables.selectableLists[0].options[0] }} workerSignaturePng={null} managerSignaturePng={null} />).toBlob();
    expect(blob.size).toBeGreaterThan(1000);
  });
});')
```

(Or move that into a regular file `tests/contractTemplates/pdfSmoke.test.tsx`.)

Expected: PASS, blob > 1KB.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/contractTemplates/ContractDocumentPdf.tsx
git commit -m "feat(contracts): @react-pdf/renderer PDF renderer mirroring HTML preview"
```

---

## Phase E — Frontend editor (gallery + 3-pane editor)

### Task 15: Template gallery page

**Files:**
- Create: `client/src/components/contracts/TemplateGallery.tsx`
- Create: `client/src/pages/business/ContractTemplates.tsx`
- Modify: `client/src/App.tsx` (add route `/business/hr/contracts/templates`)
- Modify: `client/src/i18n/locales/{en,de}.json` (add gallery strings)

- [ ] **Step 1: Implement the gallery**

```tsx
// client/src/components/contracts/TemplateGallery.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter"; // match project router (check existing pages)
import type { ContractTemplate } from "@shared/schema";

export function TemplateGallery({ scope, ownerId }: { scope: "hospital" | "chain"; ownerId: string }) {
  const base = scope === "hospital" ? `/api/business/${ownerId}/contract-templates` : `/api/chain/${ownerId}/contract-templates`;
  const editBase = scope === "hospital" ? `/business/hr/contracts/templates` : `/chain/contracts/templates`;
  const qc = useQueryClient();
  const { data = [] } = useQuery<ContractTemplate[]>({ queryKey: [base], queryFn: () => fetch(base).then(r => r.json()) });

  const createBlank = useMutation({
    mutationFn: () => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Untitled template", language: "de" }) }).then(r => r.json()),
    onSuccess: (created) => { qc.invalidateQueries({ queryKey: [base] }); window.location.assign(`${editBase}/${created.id}`); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contract Templates</h1>
        <button onClick={() => createBlank.mutate()} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">+ Blank template</button>
      </div>
      <div className="rounded-lg border divide-y">
        {data.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.language} · {t.status} · {t.ownerChainId ? "chain" : "hospital"}{t.isStarterClone && " · starter"}</div>
            </div>
            <Link href={`${editBase}/${t.id}`} className="text-sm underline">Edit</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Page wrapper + route**

```tsx
// client/src/pages/business/ContractTemplates.tsx
import { TemplateGallery } from "@/components/contracts/TemplateGallery";
import { useHospitalId } from "@/hooks/useHospitalId"; // or whatever project pattern
export default function ContractTemplatesPage() {
  const hospitalId = useHospitalId();
  return <TemplateGallery scope="hospital" ownerId={hospitalId} />;
}
```

In the router file (typically `client/src/App.tsx`), add `<Route path="/business/hr/contracts/templates" component={ContractTemplatesPage} />`.

- [ ] **Step 3: Manual smoke**

```bash
cd /home/mau/viali && npm run dev
```

Visit `http://localhost:5000/business/hr/contracts/templates` — gallery shows the seeded "On-Call Worker Contract" row.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/contracts/TemplateGallery.tsx client/src/pages/business/ContractTemplates.tsx client/src/App.tsx
git commit -m "feat(contracts): template gallery page"
```

---

### Task 16: Block tree (left rail) with drag-reorder

**Files:**
- Create: `client/src/components/contracts/BlockTree.tsx`

- [ ] **Step 1: Implement**

```tsx
// client/src/components/contracts/BlockTree.tsx
import * as React from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block } from "@shared/contractTemplates/types";

interface Props {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (next: Block[]) => void;
}

export function BlockTree({ blocks, selectedId, onSelect, onChange }: Props) {
  const ids = blocks.map(b => b.id);
  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = ids.indexOf(e.active.id as string);
    const newIndex = ids.indexOf(e.over.id as string);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  }
  return (
    <div className="space-y-1 text-sm">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {blocks.map((b) => <Row key={b.id} block={b} selected={b.id === selectedId} onSelect={onSelect} />)}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function Row({ block, selected, onSelect }: { block: Block; selected: boolean; onSelect: (id: string) => void; }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer ${selected ? "bg-accent" : "hover:bg-muted"}`}
      onClick={() => onSelect(block.id)}>
      <span {...listeners} {...attributes} className="cursor-grab text-muted-foreground">☰</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{block.type}</span>
      <span className="truncate">{previewLabel(block)}</span>
    </div>
  );
}

function previewLabel(b: Block): string {
  switch (b.type) {
    case "heading": return b.text.slice(0, 40);
    case "paragraph": return b.text.slice(0, 40);
    case "section": return b.title ?? "(untitled section)";
    case "signature": return `Signature — ${b.party}`;
    case "list": return `${b.ordered ? "Ordered" : "Bulleted"} list (${b.items.length})`;
    case "pageBreak": return "Page break";
    case "spacer": return `Spacer (${b.height}px)`;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/contracts/BlockTree.tsx
git commit -m "feat(contracts): block-tree left rail with dnd-kit reorder"
```

---

### Task 17: Block edit panel (center, with TipTap)

**Files:**
- Create: `client/src/components/contracts/BlockEditPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
// client/src/components/contracts/BlockEditPanel.tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";
import type { Block, VariablesSchema } from "@shared/contractTemplates/types";

interface Props {
  block: Block;
  variables: VariablesSchema;
  onChange: (next: Block) => void;
}

export function BlockEditPanel({ block, variables, onChange }: Props) {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return <RichTextField text={block.text} variables={variables} onChange={(t) => onChange({ ...block, text: t })} />;
    case "list":
      return <ListEditor block={block} onChange={onChange} />;
    case "section":
      return <input className="w-full rounded border px-2 py-1" value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Section title (optional)" />;
    case "signature":
      return (
        <div className="space-y-2 text-sm">
          <label className="block">Party
            <select className="ml-2 rounded border px-2 py-1" value={block.party} onChange={(e) => onChange({ ...block, party: e.target.value as "worker" | "manager" })}>
              <option value="worker">Worker</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <label className="block">Label
            <input className="ml-2 rounded border px-2 py-1" value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} />
          </label>
        </div>
      );
    case "pageBreak":
      return <div className="text-sm text-muted-foreground italic">Page break — no editable fields.</div>;
    case "spacer":
      return <input type="number" className="rounded border px-2 py-1" value={block.height} onChange={(e) => onChange({ ...block, height: Number(e.target.value) })} />;
  }
}

function RichTextField({ text, variables, onChange }: { text: string; variables: VariablesSchema; onChange: (s: string) => void; }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: text,
    onUpdate: ({ editor }) => onChange(editor.getText({ blockSeparator: "\n" })),
  }, [text]);
  return (
    <div className="space-y-2">
      <EditorContent editor={editor} className="prose prose-sm max-w-none rounded border bg-white p-3" />
      <InsertVariableMenu variables={variables} onInsert={(key) => editor?.chain().focus().insertContent(`{{${key}}}`).run()} />
    </div>
  );
}

function InsertVariableMenu({ variables, onInsert }: { variables: VariablesSchema; onInsert: (key: string) => void; }) {
  const all = [
    ...variables.simple.map((v) => v.key),
    ...variables.selectableLists.flatMap((l) => l.fields.map((f) => `${l.key}.${f.key}`)),
  ];
  return (
    <select onChange={(e) => { if (e.target.value) { onInsert(e.target.value); e.target.value = ""; } }} className="rounded border px-2 py-1 text-sm">
      <option value="">Insert variable…</option>
      {all.map((k) => <option key={k} value={k}>{k}</option>)}
    </select>
  );
}

function ListEditor({ block, onChange }: { block: Extract<Block, { type: "list" }>; onChange: (b: Block) => void; }) {
  return (
    <div className="space-y-2">
      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" checked={block.ordered} onChange={(e) => onChange({ ...block, ordered: e.target.checked })} />
        Ordered list
      </label>
      {block.items.map((it, i) => (
        <input key={i} className="block w-full rounded border px-2 py-1 text-sm" value={it}
          onChange={(e) => { const next = [...block.items]; next[i] = e.target.value; onChange({ ...block, items: next }); }} />
      ))}
      <button onClick={() => onChange({ ...block, items: [...block.items, ""] })} className="text-sm underline">+ Add item</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/contracts/BlockEditPanel.tsx
git commit -m "feat(contracts): block edit panel — TipTap rich text + per-type editors"
```

---

### Task 18: Variables panel (right rail)

**Files:**
- Create: `client/src/components/contracts/VariablesPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
// client/src/components/contracts/VariablesPanel.tsx
import * as React from "react";
import type { VariablesSchema, SimpleVariable, SelectableListVariable } from "@shared/contractTemplates/types";

interface Props {
  value: VariablesSchema;
  onChange: (next: VariablesSchema) => void;
}

export function VariablesPanel({ value, onChange }: Props) {
  function patchSimple(idx: number, p: Partial<SimpleVariable>) {
    const next = [...value.simple]; next[idx] = { ...next[idx], ...p };
    onChange({ ...value, simple: next });
  }
  function addSimple() {
    onChange({ ...value, simple: [...value.simple, { key: "new.var", type: "text", label: "New" }] });
  }
  function patchList(idx: number, p: Partial<SelectableListVariable>) {
    const next = [...value.selectableLists]; next[idx] = { ...next[idx], ...p };
    onChange({ ...value, selectableLists: next });
  }
  function addList() {
    onChange({ ...value, selectableLists: [...value.selectableLists, { key: "new_list", label: "New", fields: [{ key: "id", type: "text" }], options: [] }] });
  }
  return (
    <div className="space-y-6 text-sm">
      <section>
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">Simple</h3><button onClick={addSimple} className="text-xs underline">+ Add</button></div>
        <div className="space-y-2">
          {value.simple.map((v, i) => (
            <div key={i} className="rounded border p-2 space-y-1">
              <input className="w-full rounded border px-2 py-1" value={v.key} onChange={(e) => patchSimple(i, { key: e.target.value })} placeholder="key (e.g. worker.iban)" />
              <input className="w-full rounded border px-2 py-1" value={v.label} onChange={(e) => patchSimple(i, { label: e.target.value })} placeholder="label" />
              <select className="w-full rounded border px-2 py-1" value={v.type} onChange={(e) => patchSimple(i, { type: e.target.value as any })}>
                {["text","number","date","money","iban","email","phone"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!v.required} onChange={(e) => patchSimple(i, { required: e.target.checked })} /> required</label>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">Selectable lists</h3><button onClick={addList} className="text-xs underline">+ Add</button></div>
        <div className="space-y-3">
          {value.selectableLists.map((l, i) => (
            <SelectableListEditor key={i} value={l} onChange={(p) => patchList(i, p)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SelectableListEditor({ value, onChange }: { value: SelectableListVariable; onChange: (p: Partial<SelectableListVariable>) => void; }) {
  const fields = value.fields;
  return (
    <div className="rounded border p-2 space-y-2">
      <input className="w-full rounded border px-2 py-1 font-medium" value={value.label} onChange={(e) => onChange({ label: e.target.value })} />
      <input className="w-full rounded border px-2 py-1 text-xs" value={value.key} onChange={(e) => onChange({ key: e.target.value })} />
      <table className="w-full text-xs">
        <thead><tr>{fields.map((f) => <th key={f.key} className="text-left">{f.key}</th>)}<th /></tr></thead>
        <tbody>
          {value.options.map((opt, i) => (
            <tr key={i}>
              {fields.map((f) => (
                <td key={f.key}>
                  <input className="w-full rounded border px-1 py-0.5" value={String(opt[f.key] ?? "")}
                    onChange={(e) => { const next = [...value.options]; next[i] = { ...next[i], [f.key]: e.target.value }; onChange({ options: next }); }} />
                </td>
              ))}
              <td><button onClick={() => onChange({ options: value.options.filter((_, j) => j !== i) })} className="text-xs text-red-600">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange({ options: [...value.options, fields.reduce((a, f) => ({ ...a, [f.key]: "" }), { id: `opt_${value.options.length + 1}` }) as any] })} className="text-xs underline">+ Add option</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/contracts/VariablesPanel.tsx
git commit -m "feat(contracts): variables panel — simple + selectable lists editor"
```

---

### Task 19: Wire the three-pane editor + save/preview

**Files:**
- Create: `client/src/components/contracts/TemplateEditor.tsx`
- Create: `client/src/components/contracts/TemplatePreview.tsx`
- Create: `client/src/components/contracts/AddBlockMenu.tsx`
- Modify: `client/src/pages/business/ContractTemplates.tsx` (route param + edit page wrapper)
- Modify: `client/src/App.tsx` (add `/business/hr/contracts/templates/:id` route)

- [ ] **Step 1: Implement editor wrapper**

```tsx
// client/src/components/contracts/TemplateEditor.tsx
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BlockTree } from "./BlockTree";
import { BlockEditPanel } from "./BlockEditPanel";
import { VariablesPanel } from "./VariablesPanel";
import { TemplatePreview } from "./TemplatePreview";
import { AddBlockMenu } from "./AddBlockMenu";
import type { ContractTemplate } from "@shared/schema";
import type { Block, VariablesSchema } from "@shared/contractTemplates/types";

export function TemplateEditor({ templateId, scope, ownerId }: { templateId: string; scope: "hospital" | "chain"; ownerId: string; }) {
  const base = scope === "hospital" ? `/api/business/${ownerId}/contract-templates` : `/api/chain/${ownerId}/contract-templates`;
  const qc = useQueryClient();
  const { data: template } = useQuery<ContractTemplate>({ queryKey: [`${base}/${templateId}`], queryFn: () => fetch(`${base}/${templateId}`).then(r => r.json()) });
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [variables, setVariables] = React.useState<VariablesSchema>({ simple: [], selectableLists: [] });
  const [name, setName] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);

  React.useEffect(() => {
    if (!template) return;
    setBlocks(template.blocks as Block[]);
    setVariables(template.variables as VariablesSchema);
    setName(template.name);
  }, [template]);

  const save = useMutation({
    mutationFn: () => fetch(`${base}/${templateId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, blocks, variables }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: [base] }),
  });

  if (!template) return <div>Loading…</div>;
  const selected = findBlock(blocks, selectedId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input className="rounded border px-2 py-1 text-lg font-semibold" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={() => save.mutate()} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">Save</button>
        <button onClick={() => setShowPreview((v) => !v)} className="rounded border px-3 py-1.5 text-sm">{showPreview ? "Hide preview" : "Preview"}</button>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 rounded border p-2">
          <BlockTree blocks={blocks} selectedId={selectedId} onSelect={setSelectedId} onChange={setBlocks} />
          <AddBlockMenu onAdd={(b) => setBlocks([...blocks, b])} />
        </div>
        <div className="col-span-6 rounded border p-3">
          {selected
            ? <BlockEditPanel block={selected} variables={variables} onChange={(b) => setBlocks(replaceBlock(blocks, b))} />
            : <div className="text-sm text-muted-foreground">Select a block on the left to edit it.</div>}
        </div>
        <div className="col-span-3 rounded border p-2">
          <VariablesPanel value={variables} onChange={setVariables} />
        </div>
      </div>

      {showPreview && <TemplatePreview blocks={blocks} variables={variables} />}
    </div>
  );
}

function findBlock(blocks: Block[], id: string | null): Block | null {
  if (!id) return null;
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === "section") {
      const found = findBlock(b.children, id);
      if (found) return found;
    }
  }
  return null;
}
function replaceBlock(blocks: Block[], next: Block): Block[] {
  return blocks.map((b) => {
    if (b.id === next.id) return next;
    if (b.type === "section") return { ...b, children: replaceBlock(b.children, next) };
    return b;
  });
}
```

- [ ] **Step 2: Implement preview + add-block menu**

```tsx
// client/src/components/contracts/TemplatePreview.tsx
import { ContractDocument } from "@/lib/contractTemplates/ContractDocument";
import { pdf } from "@react-pdf/renderer";
import { ContractDocumentPdf } from "@/lib/contractTemplates/ContractDocumentPdf";
import type { Block, VariablesSchema, ContractData } from "@shared/contractTemplates/types";

function sampleData(variables: VariablesSchema): ContractData {
  const out: any = {};
  for (const v of variables.simple) {
    if (v.source) continue;
    setByPath(out, v.key, v.default ?? `[${v.label}]`);
  }
  for (const l of variables.selectableLists) {
    setByPath(out, l.key, l.options[0] ?? {});
  }
  return out;
}
function setByPath(obj: any, key: string, value: any) {
  const parts = key.split("."); let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = cur[parts[i]] ?? {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = value;
}

export function TemplatePreview({ blocks, variables }: { blocks: Block[]; variables: VariablesSchema }) {
  const data = sampleData(variables);
  async function downloadPdf() {
    const blob = await pdf(<ContractDocumentPdf blocks={blocks} data={data} workerSignaturePng={null} managerSignaturePng={null} />).toBlob();
    const url = URL.createObjectURL(blob); window.open(url);
  }
  return (
    <div className="space-y-2">
      <button onClick={downloadPdf} className="text-sm underline">Download sample PDF</button>
      <div className="rounded border bg-white"><ContractDocument blocks={blocks} data={data} workerSignaturePng={null} managerSignaturePng={null} /></div>
    </div>
  );
}
```

```tsx
// client/src/components/contracts/AddBlockMenu.tsx
import * as React from "react";
import type { Block, BlockType } from "@shared/contractTemplates/types";
import { v4 as uuid } from "uuid";

const TYPES: { type: BlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "paragraph", label: "Paragraph" },
  { type: "list", label: "List" },
  { type: "section", label: "Section" },
  { type: "signature", label: "Signature" },
  { type: "pageBreak", label: "Page break" },
  { type: "spacer", label: "Spacer" },
];

function makeBlock(type: BlockType): Block {
  const id = uuid();
  switch (type) {
    case "heading":   return { id, type: "heading", level: 2, text: "New heading" };
    case "paragraph": return { id, type: "paragraph", text: "New paragraph" };
    case "list":      return { id, type: "list", ordered: false, items: ["First item"] };
    case "section":   return { id, type: "section", title: "New section", children: [] };
    case "signature": return { id, type: "signature", party: "worker", label: "Signature" };
    case "pageBreak": return { id, type: "pageBreak" };
    case "spacer":    return { id, type: "spacer", height: 16 };
  }
}

export function AddBlockMenu({ onAdd }: { onAdd: (b: Block) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="mt-2 text-xs underline">+ Add block</button>
      {open && (
        <div className="absolute z-10 mt-1 w-48 rounded border bg-white shadow text-sm">
          {TYPES.map((t) => (
            <button key={t.type} onClick={() => { onAdd(makeBlock(t.type)); setOpen(false); }} className="block w-full px-2 py-1 text-left hover:bg-muted">{t.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update page wrapper + route**

```tsx
// client/src/pages/business/ContractTemplates.tsx
import { useRoute } from "wouter";
import { TemplateGallery } from "@/components/contracts/TemplateGallery";
import { TemplateEditor } from "@/components/contracts/TemplateEditor";
import { useHospitalId } from "@/hooks/useHospitalId";
export default function ContractTemplatesPage() {
  const hospitalId = useHospitalId();
  const [match, params] = useRoute<{ id: string }>("/business/hr/contracts/templates/:id");
  return match
    ? <TemplateEditor templateId={params.id} scope="hospital" ownerId={hospitalId} />
    : <TemplateGallery scope="hospital" ownerId={hospitalId} />;
}
```

In `client/src/App.tsx` register both routes. Mount `/business/hr/contracts/templates` and `/business/hr/contracts/templates/:id` to `ContractTemplatesPage` (the component branches internally).

- [ ] **Step 4: Manual smoke**

```bash
cd /home/mau/viali && npm run dev
```

- Open `/business/hr/contracts/templates` → "On-Call Worker Contract" appears.
- Click Edit → editor loads with block tree, center pane, variables panel.
- Drag a block in the tree → order updates.
- Edit a paragraph → click Save → reload → text persists.
- Click "Preview" → preview pane appears with sample data; "Download sample PDF" opens a PDF.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/contracts/TemplateEditor.tsx client/src/components/contracts/TemplatePreview.tsx client/src/components/contracts/AddBlockMenu.tsx client/src/pages/business/ContractTemplates.tsx client/src/App.tsx
git commit -m "feat(contracts): three-pane block editor with preview + sample PDF"
```

---

## Phase F — Frontend public form

### Task 20: DynamicContractForm + replace WorkerContractForm

**Files:**
- Create: `client/src/components/contracts/DynamicContractForm.tsx`
- Modify: `client/src/pages/WorkerContractForm.tsx` (replace static form with dynamic)

- [ ] **Step 1: Implement dynamic form**

```tsx
// client/src/components/contracts/DynamicContractForm.tsx
import * as React from "react";
import type { VariablesSchema, SimpleVariable, SelectableListVariable } from "@shared/contractTemplates/types";

interface Props {
  variables: VariablesSchema;
  initial?: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
}

export function DynamicContractForm({ variables, initial = {}, onChange }: Props) {
  const [data, setData] = React.useState<Record<string, any>>(initial);
  React.useEffect(() => onChange(data), [data, onChange]);

  function setByPath(key: string, value: any) {
    setData((d) => {
      const next = structuredClone(d);
      const parts = key.split("."); let cur = next;
      for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = cur[parts[i]] ?? {}; cur = cur[parts[i]]; }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  }
  function getByPath(key: string): any {
    return key.split(".").reduce<any>((acc, p) => acc?.[p], data);
  }

  return (
    <div className="space-y-6">
      {variables.selectableLists.map((l) => (
        <SelectableListPicker key={l.key} variable={l} value={getByPath(l.key) ?? null} onChange={(v) => setByPath(l.key, v)} />
      ))}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {variables.simple.filter((v) => !v.source).map((v) => (
          <SimpleField key={v.key} variable={v} value={getByPath(v.key) ?? ""} onChange={(val) => setByPath(v.key, val)} />
        ))}
      </div>
    </div>
  );
}

function SimpleField({ variable, value, onChange }: { variable: SimpleVariable; value: string; onChange: (v: string) => void; }) {
  const inputType = variable.type === "date" ? "date" : variable.type === "email" ? "email" : variable.type === "phone" ? "tel" : variable.type === "number" ? "number" : "text";
  return (
    <label className="block text-sm">
      <span className="block mb-1">{variable.label}{variable.required && " *"}</span>
      <input type={inputType} required={variable.required} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border px-2 py-1.5" placeholder={variable.default ?? ""} />
    </label>
  );
}

function SelectableListPicker({ variable, value, onChange }: { variable: SelectableListVariable; value: any; onChange: (v: any) => void; }) {
  return (
    <div>
      <div className="font-medium mb-2">{variable.label}</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {variable.options.map((opt) => {
          const selected = value?.id === opt.id;
          return (
            <button type="button" key={opt.id} onClick={() => onChange(opt)}
              className={`rounded border p-3 text-left ${selected ? "border-primary bg-accent" : ""}`}>
              <div className="font-medium">{(opt as any).title ?? opt.id}</div>
              <div className="text-sm text-muted-foreground">{(opt as any).rate}</div>
              <div className="text-xs text-muted-foreground">{(opt as any).description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `WorkerContractForm.tsx`**

The new page fetches the template body via Path A or Path B endpoint, renders the dynamic form, the `<SignatureCanvas>` (kept exactly as today), and submits to the matching `/submit` endpoint. Preserve every UX detail of today's form: signature canvas, location field, submit button states.

The simplest replacement: gut the current static `roleInfo` / fixed fields and pass control to `<DynamicContractForm>`. Pseudo-skeleton (full file rewrite — keep imports for SignatureCanvas, useToast, etc., from the original):

```tsx
// client/src/pages/WorkerContractForm.tsx (rewrite)
import * as React from "react";
import { useRoute } from "wouter";
import { DynamicContractForm } from "@/components/contracts/DynamicContractForm";
import SignatureCanvas from "react-signature-canvas"; // existing import
import { useToast } from "@/hooks/use-toast";        // existing pattern

export default function WorkerContractForm() {
  // Routes: /contract/c/:token (Path A) and /contract/t/:token (Path B); also legacy /contract/:token
  const [, paA] = useRoute<{ token: string }>("/contract/c/:token");
  const [, paB] = useRoute<{ token: string }>("/contract/t/:token");
  const [, legacy] = useRoute<{ token: string }>("/contract/:token");
  const fetchUrl = paA ? `/api/public/contracts/c/${paA.token}`
                  : paB ? `/api/public/contracts/t/${paB.token}`
                  : legacy ? `/api/public/contracts/t/${legacy.token}` /* legacy resolves to template */
                  : null;
  const submitUrl = fetchUrl ? `${fetchUrl}/submit` : null;

  const [tmpl, setTmpl] = React.useState<any>(null);
  const [data, setData] = React.useState<Record<string, any>>({});
  const [location, setLocation] = React.useState("");
  const sigRef = React.useRef<SignatureCanvas | null>(null);
  const { toast } = useToast();

  React.useEffect(() => { if (fetchUrl) fetch(fetchUrl).then(r => r.json()).then((res) => { setTmpl(res.template); setData(res.prefill ?? {}); }); }, [fetchUrl]);

  async function onSubmit() {
    if (!sigRef.current || sigRef.current.isEmpty()) return toast({ title: "Please sign", variant: "destructive" });
    const workerSignature = sigRef.current.getCanvas().toDataURL("image/png");
    const r = await fetch(submitUrl!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data, workerSignature, workerSignatureLocation: location }) });
    if (r.ok) toast({ title: "Submitted!" });
    else toast({ title: "Submit failed", variant: "destructive" });
  }

  if (!tmpl) return <div className="p-8">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">{tmpl.name}</h1>
      <DynamicContractForm variables={tmpl.variables} initial={data} onChange={setData} />
      <div className="space-y-2">
        <label className="block text-sm">Signing location
          <input className="ml-2 rounded border px-2 py-1" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <SignatureCanvas ref={sigRef} canvasProps={{ className: "rounded border w-full h-40" }} />
      </div>
      <button onClick={onSubmit} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Sign & submit</button>
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke test**

```bash
cd /home/mau/viali && npm run dev
```

- Visit existing legacy URL `/contract/<old-token>` → form now renders dynamically.
- Pick a role → fields adjust → fill, sign, submit → check `/business/hr/contracts` shows the new entry.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/contracts/DynamicContractForm.tsx client/src/pages/WorkerContractForm.tsx
git commit -m "feat(contracts): dynamic public worker form generated from template variables"
```

---

## Phase G — Cutover: replace old PDF + delete dead code

### Task 21: Replace `generateContractPDF` in `Contracts.tsx`

**Files:**
- Modify: `client/src/pages/business/Contracts.tsx` (delete lines ~75-93 and ~416-792, wire `<ContractDocumentPdf>`)

- [ ] **Step 1: Replace PDF generation**

In the existing "Download PDF" handler, replace the `generateContractPDF()` call with:

```tsx
import { pdf } from "@react-pdf/renderer";
import { ContractDocumentPdf } from "@/lib/contractTemplates/ContractDocumentPdf";

async function downloadContractPDF(contract: WorkerContract) {
  const snapshot = (contract as any).templateSnapshot;
  const data = (contract as any).data;
  if (!snapshot || !data) {
    toast({ title: "Legacy contract — backfill not run yet", variant: "destructive" });
    return;
  }
  const blob = await pdf(
    <ContractDocumentPdf
      blocks={snapshot.blocks}
      data={data}
      workerSignaturePng={contract.workerSignature ?? null}
      managerSignaturePng={contract.managerSignature ?? null}
    />
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.worker?.lastName ?? "contract"}-${contract.id.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Delete:
- The hardcoded `roleInfo` object (~lines 75-93).
- The `generateContractPDF` function (~lines 416-602).
- The `generateContractPDFBase64` function (~lines 604-792).
- The `<ContractPreview>` component (~lines 96-264) — replace with `<ContractDocument blocks={snapshot.blocks} data={data} workerSignaturePng={c.workerSignature} managerSignaturePng={c.managerSignature} />`.

For the "email signed contract" handler, generate the PDF as a base64 blob and POST it to the existing `/send-email` endpoint (which already accepts a base64 attachment). If it currently expects the server to render the PDF, adjust the request body to pass the client-rendered base64.

- [ ] **Step 2: Typecheck + manual smoke**

```bash
cd /home/mau/viali && npm run check && npm run dev
```

Visit `/business/contracts` → click any signed contract → preview shows correctly → "Download PDF" produces the PDF.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/business/Contracts.tsx
git commit -m "feat(contracts): cut over to <ContractDocumentPdf>; delete jsPDF + roleInfo"
```

---

### Task 22: Verify legacy contracts still render

**Files:** none modified — verification only.

- [ ] **Step 1: Visual diff legacy 4 contracts**

For each of the 4 legacy contracts:

1. Open `/business/contracts/<id>` in the new build.
2. Download PDF.
3. Compare against the **archived original PDF** captured before backfill.

Check: section headings, role title, role rate, role description, signature placement, IBAN, worker name. Acceptable differences: small font kerning shifts (different rendering engine). Unacceptable: any missing or wrong text content.

If a legacy contract fails to render, **stop**: investigate the backfilled `data` shape, fix, re-run backfill.

- [ ] **Step 2: Document outcome**

If all 4 pass, no commit needed (verification only). If issues found, commit fixes per finding.

---

### Task 23: Final pass — i18n strings, lint, typecheck

**Files:**
- Modify: `client/src/i18n/locales/{en,de}.json`

- [ ] **Step 1: Add gallery + editor strings**

Add `business.contracts.templates.*` keys for all UI labels (gallery title, button labels, panel headings). Mirror in both `en.json` and `de.json`.

- [ ] **Step 2: Run all checks**

```bash
cd /home/mau/viali && npm run check && npx vitest run tests/contractTemplates/ && npm run dev
```

Expected: clean.

- [ ] **Step 3: Manual QA checklist (from spec section 6.4)**

- [ ] Seed a fresh test hospital → starter template appears in the gallery.
- [ ] Open the editor → drag-reorder a clause → save → reload → order persists.
- [ ] Add a 4th role to the selectable-list variable → save → public form shows it.
- [ ] Submit a contract on the public form → verify it appears as `pending_manager_signature` on the dashboard with the new role visible.
- [ ] Manager countersigns → status flips to `signed` → download PDF → verify visible content.
- [ ] Edit the template (change a clause) → confirm the just-signed contract still shows the *old* clause when re-rendered (snapshot integrity).
- [ ] Test that the 4 legacy rows render via the new pipeline without errors and content matches their original PDF.

- [ ] **Step 4: Final commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat(contracts): editor i18n strings + final QA pass"
```

---

## Self-Review

**Spec coverage:**
- Section 1 architecture → Tasks 1–22 collectively
- Section 2 data model → Task 1 (schema), Task 2 (types), Task 7 (storage)
- Section 3 editor UX (3 screens) → Tasks 15 (gallery), 16–19 (editor), preview
- Section 4 generation/signing flow → Tasks 11 (Path A), 12 (Path B), 20 (form)
- Section 5 migration plan → Tasks 1 (schema), 8 (seed), 9 (backfill), 21 (cutover), 22 (verify)
- Section 6 testing → Tasks 3, 4, 5 (unit), 9, 10, 11, 12 (integration), 13 (renderer)
- "Risks & open questions" — token resolution for legacy URL covered in Task 12

**Placeholder scan:** No `TODO`/`TBD`/`fill in details` in steps. Two `// TODO: isChainAdmin` comments in Task 10's router are intentional placeholders — **before merging Task 10**, replace them with the project's existing chain-admin middleware (search for `isChainAdmin` or `chain` middleware in `server/auth/`). If no such middleware exists yet, add a one-line check: `if (req.user?.role !== 'chain_admin') return res.status(403).end();`.

**Type consistency:**
- `templateId`, `templateSnapshot`, `data`, `publicToken` used consistently across schema, storage, routes, frontend.
- `Block` discriminated union types align between `flattenBlocks`, `<ContractDocument>`, `<ContractDocumentPdf>`, `<BlockTree>`, `<BlockEditPanel>`, `<AddBlockMenu>`.
- `VariablesSchema.simple` and `selectableLists` consistent across `buildZodSchema`, `<VariablesPanel>`, `<DynamicContractForm>`, starter file.

**Open caveats for the executing engineer:**
1. **Legacy hospital token resolution:** Task 12's `resolveTemplateByToken` assumes the existing token lives in `hospitals.contractToken`. **Verify** by reading the current `/api/business/:hospitalId/contract-token` endpoint in `server/routes/business.ts` to confirm where the token is actually stored (it could be in a join table). Adjust the query accordingly before merging Task 12.
2. **Project-specific test helpers:** The plan references `createTestHospital`, `createTestChain`, `authedRequestAs` from `tests/helpers`. If those don't exist yet, copy patterns from `tests/access-control-groups.test.ts` and `tests/admin-groups-routes.test.ts`.
3. **Email-attachment endpoint shape:** Task 21 mentions adapting the existing `/send-email` endpoint to accept client-rendered base64. Read that endpoint first to see if the server expects it to render the PDF; if so, you may instead keep the existing flow and have the client POST `{ pdfBase64 }` to a slightly modified endpoint. Adjust as needed.
4. **Auto-injected `auto:hospital.address`:** the starter declares `company.address` from `auto:hospital.address`. The `hospitals` table doesn't have a single `address` column today — it has `street/postalCode/city`. Either pre-compose the address server-side in `injectAuto`, or change the starter variable to use multiple `auto:hospital.street`, `auto:hospital.city`, etc. Pick whichever is simpler when you reach Task 11.
