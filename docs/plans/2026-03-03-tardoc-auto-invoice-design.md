# TARDOC Auto-Invoice from Surgery — Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

The current TARDOC invoice form is fully manual — pick a patient, type in every field, search and add TARDOC codes one by one. This makes it impractical for real-world use.

## Solution

A "Generate Invoice from Surgery" flow that auto-extracts all available data from the surgery + anesthesia record, applies a reusable template of TARDOC codes, and presents a pre-filled form for review.

## User Flow

### One-Time Setup

1. **Hospital Settings** — fill in GLN, ZSR, IBAN, default TP value
2. **Staff/User Settings** — fill in GLN/ZSR for each surgeon/anesthesiologist
3. **Import TARDOC Catalog** — upload official Excel from ats-tms.ch (existing feature)
4. **Create Invoice Templates** — reusable sets of TARDOC line items (e.g. "Day Surgery + GA")

### Per-Invoice (Daily Workflow)

1. Click "Generate Insurance Invoice" (from invoice list or surgery detail page)
2. Select a surgery (shows completed surgeries without insurance invoices)
3. System auto-fills patient data, dates, provider GLNs, billing setup
4. Pick a template → TARDOC line items populated
5. Review, adjust if needed
6. Save as draft → validate → export XML/PDF → mark as sent → track payment

## Data Model

### New: `tardoc_invoice_templates`

| Column | Type | Description |
|--------|------|-------------|
| id | varchar PK | UUID |
| hospitalId | varchar FK | Scoped to hospital |
| name | varchar | e.g. "Day Surgery + General Anesthesia" |
| billingModel | varchar | Default TG/TP |
| lawType | varchar | Default KVG/UVG/IVG/MVG/VVG |
| treatmentType | varchar | Default ambulatory/stationary |
| treatmentReason | varchar | Default disease/accident/maternity |
| isDefault | boolean | Quick-pick default template |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### New: `tardoc_invoice_template_items`

| Column | Type | Description |
|--------|------|-------------|
| id | varchar PK | UUID |
| templateId | varchar FK | Cascade delete |
| tardocCode | varchar | TARDOC position code |
| description | varchar | Editable label |
| taxPoints | decimal | Default tax points |
| scalingFactor | decimal | Default 1.00 |
| sideCode | varchar | L/R/B/N or null |
| quantity | integer | Default 1 |
| sortOrder | integer | Line ordering |

## Auto-Extraction Mapping

When a surgery is selected, the system extracts:

| Invoice Field | Source | Table.Column |
|---------------|--------|--------------|
| patientSurname | Patient | patients.surname |
| patientFirstName | Patient | patients.firstName |
| patientBirthday | Patient | patients.birthday |
| patientSex | Patient | patients.sex |
| patientStreet | Patient | patients.street |
| patientPostalCode | Patient | patients.postalCode |
| patientCity | Patient | patients.city |
| ahvNumber | Patient | patients.healthInsuranceNumber |
| insurerGln | Patient | patients.insurerGln |
| insurerName | Patient | patients.insuranceProvider |
| insuranceNumber | Patient | patients.insuranceNumber |
| caseDate | Surgery | surgeries.plannedDate |
| caseDateEnd | Surgery | surgeries.actualEndTime or plannedDate |
| treatmentCanton | Hospital | Derived from hospital address |
| billerGln | Hospital | hospitals.companyGln |
| billerZsr | Hospital | hospitals.companyZsr |
| providerGln | Surgeon | users.gln (via surgeries.surgeonId) |
| providerZsr | Surgeon | users.zsrNumber (via surgeries.surgeonId) |
| referringPhysicianGln | Anesthesiologist | users.gln (via anesthesiaRecords.providerId) |
| tpValue | Hospital | hospitals.defaultTpValue |
| surgeryId | Surgery | surgeries.id |
| patientId | Surgery | surgeries.patientId |

## Revised Invoice Form (Single Page, Sectioned)

### Section 1: Surgery Selection (new)
- Searchable dropdown of completed surgeries without insurance invoices
- Shows: date, patient name, planned procedure, surgeon name
- Selecting auto-fills all sections below
- Warning badges if critical data is missing (no AHV, no insurer GLN, etc.)

### Section 2: Patient & Insurance (auto-filled, mostly read-only)
- Patient name, DOB, sex, address
- AHV number, insurance provider, policy number, insurer GLN
- "Edit Patient" link to update missing fields in the patient record

### Section 3: Billing Setup (partially auto-filled)
- Billing model (TG/TP) — from template, editable
- Law type (KVG/UVG/etc.) — from template, editable
- Treatment type (ambulatory default)
- Case dates — from surgery dates
- Canton — from hospital
- Biller/Provider GLN/ZSR — from hospital/surgeon (read-only)
- TP value — from hospital default, editable

### Section 4: Template & Service Lines
- Template picker dropdown (loads line items)
- Editable table of TARDOC line items
- Each line: code, description, date, qty, tax points, scaling factor, amount
- Add/remove lines, search TARDOC catalog for additional codes
- Auto-calculated totals

### Section 5: Actions
- Save Draft / Cancel
- After save: Validate, Export XML, Export PDF, status transitions

## Status Management UI

Invoice list shows status badge + contextual action buttons:

| Status | Available Actions |
|--------|------------------|
| draft | Edit, Validate, Delete |
| validated | Export XML, Export PDF, Revert to Draft |
| exported | Mark as Sent, Revert to Validated |
| sent | Mark as Paid, Mark as Rejected |
| paid | (terminal — view only) |
| rejected | Revert to Draft (for corrections) |
| cancelled | (terminal — view only) |

## Backend Changes

### New Endpoints

- `GET /api/clinic/:hospitalId/tardoc-templates` — list templates
- `POST /api/clinic/:hospitalId/tardoc-templates` — create template with items
- `PATCH /api/clinic/:hospitalId/tardoc-templates/:id` — update template
- `DELETE /api/clinic/:hospitalId/tardoc-templates/:id` — delete template
- `GET /api/clinic/:hospitalId/tardoc-prefill/:surgeryId` — returns pre-filled invoice data from surgery

### Modified Endpoints

- Invoice creation: accept optional `templateId` to auto-populate items

## Migration

New tables: `tardoc_invoice_templates`, `tardoc_invoice_template_items`
All statements use `IF NOT EXISTS` / `DO $$ BEGIN ... END $$` guards.

## Out of Scope

- Automatic CHOP → TARDOC code resolution (future enhancement)
- Email sending of XML/PDF to insurance
- Batch invoice generation for multiple surgeries
- VAT variations (medical services under KVG are 0%)
- Official TARDOC catalog download (user must upload Excel)
