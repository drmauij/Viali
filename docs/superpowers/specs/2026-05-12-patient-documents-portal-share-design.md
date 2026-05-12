# Patient Documents — Portal Share — Design

**Date:** 2026-05-12
**Status:** Approved, implementing

## Problem

The clinic can already share two kinds of media with patients via the patient portal:

- **Discharge briefs** — via a full share dialog (portal + email + SMS notify), built on the `portal_visible` / `portal_shared_at` / `portal_shared_by` trio on `discharge_briefs`.
- **Note-attachment pictures** — via a quiet inline toggle on each image, built on the same trio added to `note_attachments` in migration `0250`.

But the **Documents tab** (`patient_documents` table) — where staff uploads pictures, lab results, imaging, and PDFs via the camera / upload-arrow buttons — has no sharing path. A staff member can upload a wound photo or an imaging report into Documents, but the only way to surface it on the patient portal is to re-upload it as an attachment to a clinical note, which is awkward and silently splits the document trail. The original intent was that anything uploaded into the Documents tab could be made visible in the portal Dateien tab.

## Solution

Extend the existing share-to-portal pattern (trio columns + share/unshare/notify endpoints + portal-side aggregation) to `patient_documents`. Implementation mirrors the discharge-briefs path exactly — same column shape, same dialog UX, same notification templates — so the new surface introduces no new concepts.

## Scope

### Eligibility

A document is share-able if and only if **both** of these are true:

- `mime_type` starts with `image/` **or** equals `application/pdf`
- `source` is `staff_upload` **or** `import`

Documents that fail either filter (e.g. a `.docx`, a `patient_upload`, a questionnaire-imported file) do not render the share button at all — they're invisible to the share path, not greyed-out.

Rationale:
- Images + PDFs cover the realistic "I want to send this to the patient" content (wound photos, lab reports, imaging referrals). Other formats risk exposing internal-only data (DICOM, raw `.csv`, working `.docx`).
- `patient_upload` and `questionnaire` sources came from the patient — sharing them back would be confusing.

### Per-file only

No folder-level share toggle. Documents inside `documentFolderId` or `episodeFolderId` are shared individually. The portal renders a flat list — no folder hierarchy. Matches note-attachments behavior.

### Default state

`portal_visible` defaults to `false`. Sharing is an explicit action.

### Audit trail

On unshare, `portal_visible` flips to `false` but `portal_shared_at` and `portal_shared_by` are **preserved** as audit data. They are overwritten on re-share. Matches the discharge-briefs convention.

## Data model

### Migration `0251_patient_documents_portal_share.sql`

```sql
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS portal_visible BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS portal_shared_at TIMESTAMP;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS portal_shared_by VARCHAR REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_patient_documents_portal_visible
  ON patient_documents (portal_visible);
```

Fully idempotent. `_journal.json` `when` value must be the highest entry after `db:generate`.

### `shared/schema.ts`

Extend the `patientDocuments` table definition with the three new fields, mirroring `noteAttachments` (lines 1341-1343):

```ts
portalVisible: boolean("portal_visible").default(false).notNull(),
portalSharedAt: timestamp("portal_shared_at"),
portalSharedBy: varchar("portal_shared_by").references(() => users.id),
```

And the new index in the `(table) => [...]` block:

```ts
index("idx_patient_documents_portal_visible").on(table.portalVisible),
```

`PatientDocument` type inferred from `$inferSelect` picks the new fields up automatically.

## Server surface (staff-side)

### Routes

Added to `server/routes/anesthesia/patients.ts` next to the existing nested document routes (which use `/api/patients/:id/documents/...`). Three new endpoints:

- `POST /api/patients/:id/documents/:docId/share` — sets `portal_visible=true`, records `portal_shared_at=NOW()` and `portal_shared_by=req.user.id`. Returns the updated doc.
- `POST /api/patients/:id/documents/:docId/unshare` — sets `portal_visible=false`. Preserves `portal_shared_at` / `portal_shared_by`.
- `POST /api/patients/:id/documents/:docId/notify-patient` — body `{ method: "email" | "sms" }`. Matches the brief convention (`/api/discharge-briefs/:id/notify-patient` at `dischargeBriefs.ts:608`). Reuses the brief notify flow: portal-link lookup, hospital/language resolution, render email or SMS via the existing brief share templates. If those templates contain brief-specific language ("your discharge brief is ready"), introduce sibling functions `getDocumentShareEmailTemplate` / `getDocumentShareSmsTemplate` rather than mutating the brief ones. Resolved by reading the brief template during implementation.

All three guarded by `isAuthenticated` + `requireWriteAccess`, matching every other route in this file.

### Guards (applied in order)

1. Authenticated staff session.
2. The doc's `hospital_id` matches the user's active hospital (`requireHospitalAccess`).
3. **Share / notify only**: doc passes the eligibility filter above. Reject with `400 { code: "DOC_NOT_SHAREABLE", reason: "mime" | "source" }` otherwise. Unshare skips this guard (an already-shared ineligible doc must always be revocable — defensive in case eligibility rules tighten later).
4. **Notify only**: `portal_visible === true` on the current row. Reject with `400 { code: "DOC_NOT_SHARED" }` otherwise.

### Storage helpers

- `setPatientDocumentPortalVisible(docId, userId, visible: boolean): Promise<PatientDocument>` — performs the update, returns the new row. Added next to the existing `patient_documents` helpers in `server/storage.ts`.
- `notifyPatientDocumentShared(docId, method: "email" | "sms"): Promise<void>` — looks up patient contact info, renders the chosen template, dispatches via the existing email/SMS services. Symmetric to the brief equivalent in `dischargeBriefs.ts:608-...`. The portal-link lookup and hospital/language resolution logic is duplicated from the brief notify handler; if both flows look identical at implementation time, extract a shared helper rather than copy-pasting.
- `getPortalVisiblePatientDocumentsForPatient(patientId): Promise<PatientDocument[]>` — feeds the new `/shared-documents` portal endpoint. Filters `portal_visible = true` and `patient_id = ?`.

## Client UX — `PatientDocumentsSection.tsx`

### Per-row share button

Inline icon button alongside the existing edit / eye / trash icons. `Share2` from lucide-react. Behavior:

- **Hidden** if doc is ineligible (MIME or source).
- **Hidden** if `!canWrite`.
- **Visible, gray** if `portalVisible === false`.
- **Visible, green** if `portalVisible === true`.
- Tooltip toggles between "Share with patient portal" / "Manage portal sharing".
- Click opens the share dialog (generalized — see below).

### Dialog generalization

The existing `shareDialogBrief` state (lines 1397-1480) is tightly coupled to `DischargeBrief`. Generalize it.

**State refactor:**

```ts
type ShareDialogTarget =
  | { kind: "brief"; item: DischargeBrief }
  | { kind: "document"; item: PatientDocument };

const [shareDialogTarget, setShareDialogTarget] = useState<ShareDialogTarget | null>(null);
```

**Mutation refactor:** the existing `shareMutation` / `unshareMutation` / `notifyMutation` accept a `ShareDialogTarget` and pick the URL by `kind`. URLs have different shapes:

```ts
const buildShareUrl = (target: ShareDialogTarget) =>
  target.kind === "brief"
    ? `/api/discharge-briefs/${target.item.id}/share`
    : `/api/patients/${target.item.patientId}/documents/${target.item.id}/share`;
```

Document URLs require `patientId` from the row (briefs only need brief id). The `PatientDocument` type already carries `patientId`, so no extra plumbing needed.

**Dialog body** stays identical — same copy ("This document will be visible to the patient on their portal"), same Portal / Email / SMS buttons, same confirm / cancel layout. The body never branches on `kind`; only the mutation URLs do.

**Risk containment:** the existing brief share button (line 916) keeps working as long as it now passes `{ kind: "brief", item: brief }` to `setShareDialogTarget`. Tested via an existing brief-share integration test if one exists; if not, add a brief-share regression test alongside the new document-share tests.

### i18n

Reuse existing `dischargeBriefs.shareTitle`, `dischargeBriefs.shareToPortal`, `dischargeBriefs.shareConfirmation`, `dischargeBriefs.notifyEmail`, `dischargeBriefs.notifySms` keys. They are already neutral ("document" / "portal" / "patient"). No new translation keys required for the dialog body.

The new share-button tooltips on the document row use existing keys:
- `anesthesia.patientDetail.sharePicture` ("Share with patient portal") — already added in commit `52a638d0` for note-attachments and is generic.
- `anesthesia.patientDetail.unsharePicture` ("Stop sharing with patient") — same.

## Patient portal — `PatientPortal.tsx`

### New endpoints (in `server/routes/questionnaire.ts`, next to the existing portal endpoints)

- `GET /api/patient-portal/:token/shared-documents` — guarded by `requirePortalVerification("patient")`. Returns `patient_documents WHERE patient_id = link.patientId AND portal_visible = true`. Response shape:

  ```ts
  Array<{
    id: string;
    fileName: string;
    mimeType: string | null;
    category: string;
    fileSize: number | null;
    createdAt: string;
  }>
  ```

  Matches the `/shared-photos` shape with `mimeType` and `category` added so the client can pick the right icon and badge.

- `GET /api/patient-portal/:token/shared-documents/:docId/download` — same guard. Server-side double-check: row's `portal_visible === true` **and** `patient_id === link.patientId`. Returns a signed URL or streams the file via the same path `/shared-photos/:attachmentId/download` uses. 404 if either check fails.

### Portal client integration

Add a fourth React Query hook in `PatientPortal.tsx`:

```ts
const sharedDocsQuery = useQuery({
  queryKey: ['/api/patient-portal', token, 'shared-documents'],
  queryFn: async () => {
    const res = await fetch(`/api/patient-portal/${token}/shared-documents`);
    if (!res.ok) throw new Error("Failed to load shared documents");
    return res.json();
  },
});
```

The existing "Dateien" tab already concatenates self-uploads + shared-briefs + shared-photos into one grouped list (around line 975). Add shared-documents as a fourth group, rendered with the same card layout used for shared-photos. Category badge maps `patient_documents.category` to the existing translated category labels already used in the questionnaire upload flow.

## Tests — `tests/patient-documents-portal-share.test.ts`

### Storage layer

- `setPatientDocumentPortalVisible(id, userId, true)` flips the flag, records actor + timestamp.
- A second call with `false` clears `portal_visible` but **preserves** `portal_shared_at` and `portal_shared_by`.
- Re-share overwrites timestamp + actor.

### Routes — happy path

- `POST /share` on eligible image → 200, flag set.
- `POST /share` on eligible PDF → 200, flag set.
- `POST /unshare` → 200, flag cleared, audit preserved.
- `POST /notify { method: "email" }` on a shared doc → 200, email delivered (assert via mocked service).
- `POST /notify { method: "sms" }` on a shared doc → 200, SMS delivered.

### Routes — eligibility rejection

- `POST /share` on `.docx` → 400, `code: "DOC_NOT_SHAREABLE"`, `reason: "mime"`.
- `POST /share` on a `source: "patient_upload"` doc → 400, `code: "DOC_NOT_SHAREABLE"`, `reason: "source"`.
- `POST /share` on a `source: "questionnaire"` doc → 400, same error.
- `POST /unshare` on an ineligible doc that's somehow shared → 200 (defensive revocation path).

### Routes — auth + tenancy

- Unauthenticated `POST /share` → 401.
- Staff from hospital B trying to share hospital A's doc → 403.

### Routes — notify guard

- `POST /notify` on a doc with `portal_visible === false` → 400, `code: "DOC_NOT_SHARED"`.

### Portal endpoint

- `GET /shared-documents` returns only shared docs for the linked patient.
- Excludes other patients' shared docs.
- Excludes docs from a different hospital (cross-tenant test).
- Toggle off → endpoint no longer returns it (immediate effect, no caching).

### Portal download

- `GET /shared-documents/:docId/download` returns the file when shared.
- 404 after the doc is unshared.
- 404 when `:docId` belongs to a different patient.

### Brief-share regression

- One smoke test exercising the generalized dialog with `{ kind: "brief", item: brief }` to confirm the existing brief flow still works after the dialog refactor.

## Out of scope

- Folder-level sharing (per-file only, as agreed).
- Other file types (.docx, .xlsx, DICOM) — explicit eligibility filter excludes them.
- Re-sharing patient_upload / questionnaire sources back to the patient.
- Bulk-share / share-all-of-category actions.
- Public API surface (`PUBLIC_API_MD`) — all new endpoints are auth-gated (staff session or portal verification), not part of the public agent/webhook surface.

## Files touched (estimate)

| File | Change |
|---|---|
| `migrations/0251_patient_documents_portal_share.sql` | New, idempotent |
| `migrations/meta/_journal.json` | New entry, highest `when` |
| `shared/schema.ts` | Add trio + index to `patientDocuments` |
| `server/storage.ts` (or patient-documents storage module) | New helpers; portal aggregation update |
| `server/routes/anesthesia/patients.ts` | Add 3 staff routes (share / unshare / notify-patient) |
| `server/routes/questionnaire.ts` | Add 2 portal routes |
| `client/src/components/shared/PatientDocumentsSection.tsx` | Generalize dialog; add per-row Share2 button; new mutations |
| `client/src/pages/PatientPortal.tsx` | New query hook; render fourth group in Dateien tab |
| `tests/patient-documents-portal-share.test.ts` | New |

## Pre-commit checklist (per CLAUDE.md)

- Migration is idempotent.
- `_journal.json` entry has the highest `when` timestamp.
- `npm run check` clean.
- `npx drizzle-kit push` reports no pending diffs.
- All new and existing tests pass.
