# Contract Templates — Design

**Date:** 2026-04-28
**Author:** brainstormed with mau
**Status:** Design approved, awaiting implementation plan
**Surface:** `/business/hr` → Contracts tab; `/chain/...` for chain-level templates; public `/contract/:token`

---

## Problem

The current `/business/hr` → Contracts feature ships one hardcoded contract type ("Vertrag für Kurzzeiteinsätze auf Abruf") with three hardcoded role enum values and rates baked into a TypeScript object. PDF generation is ~200 lines of imperative `jsPDF` pixel math. There is no way to:

- Add new contract types (permanent employment, NDA, service agreement, …)
- Edit clauses without a code deploy
- Adjust role lists or tariffs without a code deploy
- Reuse one set of contract definitions across multiple clinics in a chain

The signing workflow itself (public token → worker fills + signs on canvas → manager countersigns in-app → email signed PDF) works well and is preserved as-is.

## Goals

- Hospital admins (or chain admins) can manage **multiple contract templates** through a UI, not by editing code.
- Each template is a **block-based document** (clauses are reorderable blocks) with **declared variables** the worker fills at signing.
- Templates are owned by either a **chain** (shared across all clinics) or a single **hospital** (standalone or per-location override).
- **Existing signed contracts remain immutable** — editing a template after signing must not change the historical contract.
- The 4 contracts already signed today must continue to render and download with no visible difference.

## Non-Goals

- A bilingual editor that maintains DE+EN translations side-by-side. v1 ships single-language templates; admins clone-and-translate to support a second language. Forward-compatible with adding a `translations` JSONB later.
- Server-side PDF rendering. v1 stays browser-side via `@react-pdf/renderer`. We can add server-side rendering later (the same component runs on Node) without schema changes.
- External e-signature providers (DocuSign / Adobe Sign). v1 keeps the in-app canvas signature pad.
- Template versioning UI (drafts/published/history). Templates are mutable; snapshots provide the immutability guarantee.
- Pixel-archival of signed PDFs (storing the rendered binary alongside the snapshot). Snapshot-and-re-render is sufficient for v1.

## Foundational decisions (locked in during brainstorm)

| Decision | Choice | Why |
|---|---|---|
| Variability scope | Multiple contract types, hospital clones + edits | Need on-call, permanent, NDA, service agreement |
| Template ownership | Chain OR hospital (XOR), via two nullable FKs | Centralized HR with optional per-location override |
| Standalone clinics (no chain) | Templates own `hospital_id` directly | Single-clinic users never see chain UI |
| Editor model | Block-based (clauses as blocks) | Different contract types need different clause sets |
| Variable model | Simple + selectable lists | Preserves current "worker picks a role → fills role's data" pattern |
| Multilingual | Single-language template, clone-to-translate | YAGNI for v1; layer on later |
| Data integrity | Snapshot at signing | Same model as Stripe invoices, DocuSign envelopes |
| PDF rendering | `@react-pdf/renderer`, browser-side | Eliminates jsPDF pixel math, single component for preview + PDF |
| Initiation flow | Both A (per-contract single-use link) **and** B (per-template shareable link) | A: targeted hiring; B: self-serve onboarding (preserves today's UX) |
| Column cleanup | Deferred to v1.1 | Reduce v1 risk |

## Architecture overview

```
contract_templates  ──clone──▶  contract_templates  ──┐
   (Viali starter,                (chain or hospital   │
    seeded as code)                 owned, editable)   │
                                                       │
                                                       ▼
                                       ┌─────────────────────────┐
                                       │ Public worker form      │
                                       │ (filled + signed)       │
                                       └────────────┬────────────┘
                                                    │ snapshot at signing
                                                    ▼
                                          worker_contracts (instances)
                                       ┌──────────────────────────┐
                                       │ template_snapshot jsonb  │
                                       │ data jsonb               │
                                       │ signatures, status, …    │
                                       └────────────┬─────────────┘
                                                    │
                                       ┌────────────▼─────────────┐
                                       │ <ContractDocument/>      │
                                       │ React component tree     │
                                       │  • In-app preview        │
                                       │  • PDF via @react-pdf    │
                                       └──────────────────────────┘
```

**Three properties this gives us:**

1. **Templates are mutable; contracts are immutable.** Admins edit a template freely — already-signed contracts hold their own snapshot and re-render identically forever.
2. **One renderer, two outputs.** A single `<ContractDocument blocks={...} data={...}/>` React tree drives the on-screen preview *and* the downloadable PDF — eliminating today's duplication between i18n-based preview and hardcoded jsPDF.
3. **No new infrastructure.** Browser-side rendering, JSONB-only storage, no headless Chromium on the VPS, no S3.

## Data model

### New table: `contract_templates`

```ts
contractTemplates {
  id                uuid PK
  ownerHospitalId   uuid?  FK → hospitals.id          // exactly ONE of these two
  ownerChainId      uuid?  FK → hospital_groups.id    // is non-null
  name              varchar          // e.g., "On-Call Worker Contract"
  description       text?            // Internal admin note (not rendered in PDF)
  language          varchar(2)       // 'de' | 'en'
  status            varchar          // 'draft' | 'active' | 'archived'
  blocks            jsonb            // ordered array of clause blocks (see below)
  variables         jsonb            // variable schema (see below)
  isStarterClone    bool             // true if cloned from a Viali starter
  starterKey        varchar?         // which starter, e.g. 'on_call_v1'
  createdAt         timestamp
  updatedAt         timestamp
  archivedAt        timestamp?
}

CHECK ((ownerHospitalId IS NOT NULL)::int + (ownerChainId IS NOT NULL)::int = 1)
INDEX (ownerHospitalId), INDEX (ownerChainId), INDEX (status)
```

### `blocks` JSONB shape

Ordered array. Each block has a stable `id` so the editor can drag-reorder without diff churn:

```jsonc
[
  { "id": "blk_1", "type": "heading", "level": 1, "text": "{{template.title}}" },
  { "id": "blk_2", "type": "paragraph",
    "text": "Die {{company.name}} bietet kurzzeitige Einsätze für {{role.title}} an..." },
  { "id": "blk_3", "type": "section", "title": "Vergütung",
    "children": [
      { "id": "blk_4", "type": "paragraph",
        "text": "Bruttolohn pro Stunde: {{role.rate}}." }
    ] },
  { "id": "blk_5", "type": "signature", "party": "worker", "label": "Auftragnehmer" },
  { "id": "blk_6", "type": "signature", "party": "manager", "label": "Auftraggeber" }
]
```

Block `type` whitelist for v1: `heading`, `paragraph`, `list`, `section`, `signature`, `pageBreak`, `spacer`. Easily extended later.

### `variables` JSONB shape

```jsonc
{
  "simple": [
    { "key": "company.name",         "type": "text",  "label": "Company name",  "source": "auto:hospital.companyName" },
    { "key": "company.jurisdiction", "type": "text",  "label": "Jurisdiction",  "default": "Zürich" },
    { "key": "worker.firstName",     "type": "text",  "label": "First name",    "required": true },
    { "key": "worker.iban",          "type": "text",  "label": "IBAN",          "required": true },
    { "key": "contract.signedAt",    "type": "date",  "source": "auto:now" }
  ],
  "selectableLists": [
    {
      "key":   "role",
      "label": "Role / Tariff",
      "fields": [
        { "key": "title",       "type": "text" },
        { "key": "rate",        "type": "money" },
        { "key": "description", "type": "text" },
        { "key": "roleTitle",   "type": "text" }
      ],
      "options": [
        { "id": "awr",  "title": "Tagesklinik Pflege (AWR-Nurse)", "rate": "CHF 50.00", "description": "...", "roleTitle": "..." },
        { "id": "anes", "title": "Pflege-Anästhesist",              "rate": "CHF 60.00", "description": "...", "roleTitle": "..." },
        { "id": "ota",  "title": "OP Pflege/OTA",                   "rate": "CHF 50.00", "description": "...", "roleTitle": "..." }
      ]
    }
  ]
}
```

Block text uses Handlebars-style `{{role.title}}` / `{{worker.iban}}` interpolation against the resolved data tree.

`source: "auto:..."` variables are filled by the **server at submission time** (not at render time). The `data` JSONB on a signed contract is fully self-contained — the renderer never makes late lookups, and values can never drift after signing.

Variable types in v1: `text`, `number`, `date`, `money` (string-formatted with currency), `iban` (validated), `email`, `phone`. New types added by extending the variable-resolver and form-renderer.

### Modified table: `worker_contracts` (additive)

The table is preserved. Four nullable columns are added:

```ts
workerContracts {
  // ─── NEW columns ──────────────────────────────────────────────
  templateId         uuid?  FK → contract_templates.id  // null for legacy 4 rows pre-backfill
  templateSnapshot   jsonb?                              // {blocks, variables} at sign time
  data               jsonb?                              // {worker:{...}, role:{...}, ...}
  publicToken        varchar UNIQUE                      // per-contract single-use token (Path A)

  // ─── EXISTING columns kept (no drops in v1) ───────────────────
  id, hospitalId, status, workerSignature, workerSignedAt, workerSignatureLocation,
  managerSignature, managerSignedAt, managerId, managerName, archivedAt, createdAt, updatedAt,
  firstName, lastName, street, postalCode, city, phone, email, dateOfBirth, iban, role
  // ↑ kept populated forever for the 4 legacy rows + as denormalized search fields for new rows
}
```

**Why additive:** zero risk to the 4 existing signed contracts — they keep all fields populated and continue rendering through the legacy renderer until the migration script backfills their snapshot. New contracts populate both the old denormalized fields (for listing/search) AND the new `templateSnapshot` / `data` JSONB.

After backfill, rendering uniformly goes through the new pipeline. The old `firstName`/`role`/etc. columns stay readable but the renderer never reads them. Cleanup deferred to v1.1.

### Viali starter templates

Live in code as a TS file (`server/seed/contractTemplateStarters.ts`) — array of `{ key, language, name, blocks, variables }`. On chain or hospital creation they are seeded as `contract_templates` rows with `isStarterClone=true` and `starterKey` set. They are **not** a separate "library" table; they are regular template rows owned by the just-created chain or hospital, identical in shape to a user-created template.

The v1 starter library: one entry — `on_call_v1`, a faithful 1:1 representation of today's hardcoded contract (same 10 sections, same 3 roles + rates as currently configured: CHF 50 / 60 / 50). Additional starters can be added in any release.

## Editor UX

### Screen 1: Template list (gallery)

Located at `/business/hr/contracts/templates` for hospital admins, `/chain/contracts/templates` for chain admins.

```
┌──────────────────────────────────────────────────────────────┐
│ Contract Templates                  [+ New from starter ▾]   │
│                                     [+ Blank template]       │
├──────────────────────────────────────────────────────────────┤
│ ▸ On-Call Worker Contract       (chain)   active     12 used │
│ ▸ Permanent Employment          (chain)   draft       0 used │
│ ▸ NDA – Vendors                 (hospital) active     3 used │
└──────────────────────────────────────────────────────────────┘
```

- **"+ New from starter ▾"** dropdown lists Viali starters that haven't been cloned yet. Click → instant clone into an editable template, opens editor.
- **"Used" column** = count of contracts referencing this template. Templates with usage > 0 can still be edited (snapshot model means existing contracts are unaffected).
- Chain admins see chain-owned templates in their full editor.
- Hospital admins see chain templates as **read-only** with an "Inherited from chain" badge and a **"Clone & override"** action that copies into a hospital-owned row.

### Screen 2: Block editor

Three-pane layout. Left rail = block tree. Center = WYSIWYG editing of selected block. Right rail = variables panel.

```
┌─────────────────┬───────────────────────────────────┬─────────────────────┐
│ BLOCKS          │ Selected: ¶ Compensation          │ VARIABLES           │
│                 │                                   │                     │
│ ☰ Heading       │ ┌──────────────────────────────┐ │ ▾ Simple            │
│ ☰ Preamble      │ │ Bruttolohn pro Stunde:       │ │   • company.name    │
│ ☰ Role          │ │ {{role.rate}}.               │ │   • worker.firstName│
│ ☰ Term          │ │ Auszahlung erfolgt monatlich.│ │   • worker.iban     │
│ ★ Compensation  │ └──────────────────────────────┘ │                     │
│ ☰ Termination   │                                   │ ▾ Selectable: role  │
│ ☰ Jurisdiction  │ [B] [I] [• list]  {{ Insert var ▾]│   ┌─ awr  CHF 50  ─┐│
│ ☰ ── pageBreak  │                                   │   ├─ anes CHF 60  ─┤│
│ ☰ Worker sig    │ Block type: Paragraph             │   └─ ota  CHF 50  ─┘│
│ ☰ Mgr sig       │ [Delete block] [Duplicate]        │   [+ Add option]    │
│                 │                                   │                     │
│ [+ Add block ▾] │                                   │ [+ Add variable]    │
└─────────────────┴───────────────────────────────────┴─────────────────────┘
                                                          [Save]  [Preview ▾]
```

- **Block tree (left):** drag-reorder, indent for nesting (sections wrap children). `+ Add block` opens a small palette.
- **Editing area (center):** rich text on `paragraph` / `heading` / `list` blocks. Special blocks (signature, page break, spacer) render a placeholder card. The `{{ Insert var ▾}}` button opens a dropdown of available variables — clicking inserts `{{key}}` at the cursor.
- **Variables panel (right):** declarative variable management. Adding a `selectableList` opens a sub-form to define fields (title/rate/description) and options. **This is where rates/tariffs are edited** — replacing the hardcoded `roleInfo` object directly.
- **Auto-detect undeclared variables:** if a block contains `{{foo.bar}}` but `foo.bar` isn't declared, the editor flags it as a warning so a typo doesn't silently render literal text.

### Screen 3: Preview

Same `<ContractDocument>` React component used at PDF time, rendered with sample data (auto-filled from defaults + the first option of any selectable list). "Download sample PDF" button uses `@react-pdf/renderer` browser-side.

### Editor implementation

- **TipTap** for rich-text inside `paragraph` / `heading` / `list` blocks. Mature, headless, plays nicely with React.
- **Block tree** is our own React state managed via `react-dnd` or `dnd-kit` for drag-reorder. TipTap is **not** the whole-document editor — it only renders inside individual content blocks. Keeps data shape simple JSONB instead of TipTap's nested ProseMirror JSON.
- BlockNote and Lexical considered and rejected: BlockNote is heavier and opinionated about block schema; Lexical has a steeper learning curve.

## Contract generation & signing flow

Same two-party wet-signature workflow as today, generalized over arbitrary templates.

### Step 1 — Manager initiates (two paths)

**Path A — Per-contract single-use link** (new):

Manager clicks "New contract" on `/business/hr/contracts`, picks a template, optionally pre-fills variables (worker email, role, rate override, start date), saves. System creates a `worker_contracts` row in status `draft` with `templateId` set, `data` partially filled, and a unique `publicToken`. URL: `/contract/c/:publicToken`. Single-use — invalidated after first submit.

Used for: targeted hiring, renegotiated rates, contracts with a specific named counterparty (NDAs, supplier agreements).

**Path B — Per-template shareable link** (preserves today's UX):

Each template exposes a stable URL `/contract/t/:templateToken`. Anyone with the link fills + signs. Multi-use, rate-limited (3 submissions per token per 24h, same as today). Each submission creates a fresh `worker_contracts` row.

Used for: self-onboarding of freelancers (link on careers page, in recruiting blasts).

The existing hospital-level `/contract/:token` URL keeps working — under the hood that token now resolves to the chain/hospital's seeded "On-Call Worker Contract" template's stable Path-B link. Existing bookmarked URLs do not break.

### Step 2 — Worker fills the public form at `/contract/:token`

The form is **dynamically generated from the template's `variables` schema**:

- For each `simple` variable not flagged `auto:`, render the appropriate input (text / number / date / IBAN-formatted / email / phone).
- For each `selectableList` variable, render a card-grid picker (today's role picker UI — kept). Selecting an option fills all related fields at once.
- `auto:hospital.companyName` → server-injected from the token's hospital.
- `auto:contract.signedAt` → server-injected at submit.
- Final block: `<SignatureCanvas>` (kept exactly as today).

On submit, the server:

1. Validates `data` against `variables` schema (zod schema generated at runtime from the template's variable definitions).
2. Stores `data`, `workerSignature`, `workerSignedAt`, `workerSignatureLocation`.
3. **Snapshots:** `templateSnapshot = { blocks, variables }` from the current template row. From this moment, the contract is immutable to template edits.
4. Status → `pending_manager_signature`.

### Step 3 — Manager reviews & countersigns

Same dashboard as today. Opens a contract → renders `<ContractDocument blocks={snapshot.blocks} data={data}/>` for preview using the snapshot. Signs in canvas dialog → server stores `managerSignature`, `managerSignedAt`, `managerId`, `managerName`, status → `signed`.

### Step 4 — PDF & email

Browser-side via `@react-pdf/renderer`:

```ts
import { pdf } from '@react-pdf/renderer';
const blob = await pdf(<ContractDocument blocks={snapshot.blocks} data={data} />).toBlob();
```

For "email signed contract to worker", the same component runs in the browser; the resulting blob (base64) is uploaded to the email-send endpoint, which attaches it. Server-side rendering (Node `renderToBuffer`) is feasible later if email-from-server becomes desirable — no schema change.

### Variable resolution at render time

```ts
function resolveText(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const value = key.split('.').reduce((acc, k) => acc?.[k], data);
    return value == null ? '' : String(value);
  });
}
```

`auto:` variables are resolved at fill-time (server-side, before storing `data`), not at render time. The snapshot is fully self-contained.

## Migration plan

Goal: ship the new system without breaking the 4 existing signed contracts or any bookmarked public URL.

### Step 1 — Schema additions (idempotent migration)

```sql
CREATE TABLE IF NOT EXISTS contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hospital_id uuid REFERENCES hospitals(id),
  owner_chain_id    uuid REFERENCES hospital_groups(id),
  name varchar NOT NULL,
  description text,
  language varchar(2) NOT NULL DEFAULT 'de',
  status varchar NOT NULL DEFAULT 'draft',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '{"simple":[],"selectableLists":[]}'::jsonb,
  is_starter_clone bool NOT NULL DEFAULT false,
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

ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES contract_templates(id);
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS template_snapshot jsonb;
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS data jsonb;
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS public_token varchar UNIQUE;
```

After Step 1: zero behavior change. Existing 4 contracts have `template_id = NULL` and old columns populated. Old code path still works.

### Step 2 — Seed Viali starter template

Server-side seed script (`server/seed/seedContractTemplates.ts`):

1. For each `hospital_groups` row with no contract templates, insert one row: `name = "On-Call Worker Contract"`, `language = "de"`, `status = "active"`, with `blocks` and `variables` matching exactly today's hardcoded German contract — same 10 sections, same 3 roles + rates as currently configured (CHF 50 / 60 / 50).
2. For each `hospitals` row not in a chain (`group_id IS NULL`) with no contract templates, same insert but using `owner_hospital_id` instead of `owner_chain_id`.

**The starter is a faithful 1:1 representation of today's hardcoded contract.** Admins start from "what they have today" and edit incrementally.

### Step 3 — Backfill the 4 existing contracts

One-time data migration:

```ts
for each row in worker_contracts where template_snapshot IS NULL:
  resolve owner-side template (the one seeded for this hospital's chain or the hospital itself)
  contract.template_id = template.id
  contract.template_snapshot = { blocks: template.blocks, variables: template.variables }
  contract.data = {
    company:  { name: hospital.companyName, jurisdiction: 'Zürich' },
    worker:   { firstName, lastName, street, postalCode, city, phone, email, dateOfBirth, iban },
    role:     <lookup based on row.role enum value, fill all 4 fields from starter's role options>,
    contract: { signedAt: workerSignedAt }
  }
  contract.public_token = <generate>
```

**Verification:** capture the legacy PDFs as a one-time export *before* backfilling so we have a reference. After backfilling, render each row's snapshot through the new `<ContractDocument>` and visually diff the PDF output against the captured reference.

### Step 4 — Cutover

- Replace `client/src/pages/business/Contracts.tsx`'s `generateContractPDF` and `generateContractPDFBase64` calls with `<ContractDocument blocks={c.templateSnapshot.blocks} data={c.data}/>` rendered via `@react-pdf/renderer`.
- Replace `client/src/pages/WorkerContractForm.tsx` with the dynamic form generator that reads from the template's `variables`.
- Old hospital-level `/api/business/:hospitalId/contract-token` route now resolves the token to the seeded "On-Call Worker Contract" template's Path-B public link. Existing bookmarked URLs keep working.
- `/api/business/:hospitalId/contracts` listing endpoint unchanged on the wire — still returns rows shaped like today's `WorkerContract`, augmented with template metadata (`templateName`, `templateId`).
- Hardcoded `roleInfo` objects in `WorkerContractForm.tsx` and `Contracts.tsx` deleted — single source of truth is now the template's `variables.selectableLists`.
- Hardcoded German contract clauses in jsPDF code deleted (~200 lines gone).

After Step 4: new system fully in production. Old denormalized columns stay in the schema, written for new rows for backwards-search, never read by the renderer. Cleanup deferred to v1.1.

### Reversibility

Steps 1–3 are pure additions; no code path changes. If anything looks wrong before Step 4, rollback is "delete the new template rows, NULL out the new contract columns" — old rendering keeps working.

Step 4 is the cutover. Reversible by reverting the React/code changes; the data added in Steps 1–3 is harmless to old code.

### Things this migration does not touch

- Signing tokens (other than adding the new per-contract `public_token`), signature canvases, signed-PDF-email flow, archival, rate-limiting — all preserved.
- The `/contract/:token` public URL — preserved.
- Authorization / authentication / RBAC — manager role required to edit templates (same as today's contract management).
- The 4 existing PDFs — they re-render content-identical (not byte-identical, since we're switching renderers, but textual content matches because the snapshot is a faithful clone of today's hardcoded clauses).

## Testing strategy

### 1. Unit tests — variable resolution & schema validation

`shared/contractTemplates/`:

- **Variable interpolation:** `resolveText(text, data)` replaces `{{a.b.c}}` with `data.a.b.c`, leaves literal `{{` outside variables alone, returns empty string for missing keys (with a debug log), handles nested paths.
- **Variable schema → zod schema generator:** `buildZodSchemaFromVariables(variables)` produces a runtime zod schema used to validate worker form submissions. Test cases for every variable type.
- **Block tree walking:** `flattenBlocks(blocks)` traverses sections and returns linear render order. Test nesting, page breaks, signature placement.

### 2. Integration tests — server routes + DB

`tests/contractTemplates.test.ts`:

- **CRUD on `contract_templates`:** create / read / update / archive / clone-from-starter / clone-existing. Verify the chain-vs-hospital ownership XOR check fires.
- **Authorization:** chain admin can edit chain templates; hospital admin can read but only clone+override; non-admin gets 403.
- **Public form submission with snapshot:** POST to `/api/public/contracts/:token/submit` writes `template_snapshot` and `data`, validates against the template's variable schema, rejects malformed data with a 400. Edit the template afterwards → re-fetch the contract → snapshot is unchanged. **This is the data-integrity guarantee, tested explicitly.**
- **Path A vs. Path B:** Path B (per-template) accepts multiple submissions, rate-limited; Path A (per-contract) is single-use and 410-Gone on second submit.
- **Backfill migration:** integration test seeds a legacy 4-row state, runs the backfill script, then asserts every row has `template_snapshot != null`, the snapshot's variable values match the row's old denormalized columns, and rendering produces a non-empty document.
- **Rate-limiting:** preserved from current code; regression test for 3-per-24h cap on Path B.

### 3. Renderer tests — `<ContractDocument>`

`tests/contractRenderer.test.tsx`:

- **Snapshot tests** of rendered React output (not PDF binaries — we don't byte-compare PDFs because tiny font-rendering differences are flaky). Test fixtures: the seeded starter + 3 sample data inputs (one per role).
- **PDF smoke test:** invoke `@react-pdf/renderer`'s `renderToBuffer` for the same fixtures, assert non-empty buffer + correct MIME type.
- **Variable warnings:** rendering a block with an undeclared `{{foo.bar}}` logs a warning and renders empty (not literal `{{foo.bar}}`).

### 4. Visual / manual checklist (one-time pre-merge)

Not in CI, but written here — a manager runs through this once before merging:

- Seed a fresh test hospital → starter template appears in the gallery.
- Open the editor → drag-reorder a clause → save → reload → order persists.
- Add a 4th role to the selectable-list variable → save → public form shows it.
- Submit a contract on the public form → verify it appears as `pending_manager_signature` on the dashboard with the new role visible.
- Manager countersigns → status flips to `signed` → download PDF → verify visible content.
- Edit the template (change a clause) → confirm the just-signed contract still shows the *old* clause when re-rendered (snapshot integrity).
- Test that the 4 legacy rows render via the new pipeline without errors and content matches their original PDF.

### Test data isolation

All tests use the project's existing per-test transactional rollback pattern. The migration backfill script is testable by running it against a seeded "legacy state" snapshot in the test DB.

## Risks & open questions

| Risk / question | Mitigation |
|---|---|
| `@react-pdf/renderer` may render fonts/spacing differently than jsPDF, so legacy PDFs look subtly different | Capture legacy PDFs before backfill as reference; visually diff. Acceptable if textual content matches; not aiming for pixel-identical. |
| TipTap nested HTML inside JSONB `text` might leak markup into the PDF | Block content is stored as Markdown-flavored plain text with a constrained subset (bold, italic, lists). Renderer parses Markdown subset on output, not raw HTML. |
| Admins paste rich content from Word with unsupported markup | Editor strips unsupported markup on paste (TipTap supports paste rules). |
| A chain template is edited while a worker is filling the form (race condition) | Snapshot at submit, not at form-load. Worker sees latest version up to the moment they submit; once submitted, they see what they signed. |
| Single-use Path A token leaked / reused | Token is invalidated server-side at first successful submit; second submit returns 410-Gone. |
| Variable typo (`{{role.titel}}`) silently renders empty | Editor flags undeclared variable references with a warning before save. PDF renderer logs in production for ops visibility. |
| Existing 4 rows backfill produces wrong data shape | Backfill runs in dry-run mode first (logs only); manual review before executing for real. |

## Out of scope (future work)

- Bilingual templates (per-block `translations` JSONB)
- Server-side PDF rendering with binary archival
- Template versioning UI (`v1`, `v2`)
- External e-signature provider integration
- Drop denormalized legacy columns (`firstName`, `iban`, `role` enum, etc.) on `worker_contracts` (v1.1)
- Public template marketplace / sharing across chains
- Attachment / file upload variables
- Conditional blocks (e.g., "show this clause only if role == anesthesia_doctor")
