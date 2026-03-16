# Quick-Create Discharge Medications from Template in Brief Wizard

## Problem

Surgeons go to Documents > Generate Brief, select "Prescription" as brief type, but have no patient discharge medications created yet. The `discharge_medications` block is required but empty, so they manually type medication tables in the HTML editor — defeating the purpose of structured medication data.

## Solution

Add a "Create from Template" button inside the compact brief wizard's `discharge_medications` sub-items section, mirroring the existing quick-add appointment pattern. Surgeon picks a discharge medication template, a patient discharge medication slot is auto-created from it, and it's auto-selected for brief generation.

## Flow

1. `discharge_medications` block is expanded (selected or required for prescription)
2. Below sub-items list, a "Create from Template" button appears
3. Click reveals a Select dropdown of hospital discharge medication templates
4. Surgeon picks a template
5. System calls `POST /api/patients/:patientId/discharge-medications` with items copied from template
6. New slot is auto-selected in `selectedMedicationSlotIds`
7. Blocks query invalidated so new slot appears in list
8. Toast confirms creation
9. Surgeon hits Generate Brief with real structured data

## Changes

### Client: `DischargeBriefCompactWizard.tsx`

**New state:**
- `showMedTemplateSelect: boolean` — toggles template dropdown visibility
- `isCreatingFromTemplate: boolean` — loading state during API call

**New query:**
- Fetch discharge medication templates: `GET /api/hospitals/:hospitalId/discharge-medication-templates` (enabled when dialog is open)

**New UI (in `discharge_medications` sub-items section, after existing slot checkboxes):**
- "Create from Template" ghost button (same style as "Add Appointment")
- When clicked, shows a Select dropdown with available templates
- On template selection, immediately creates the medication slot

**Create logic:**
- Map template items to medication items (same mapping as `loadTemplate()` in DischargeMedicationsTab)
- Auto-link to selected surgery if one is selected
- Auto-fill doctor from surgery's surgeon if available
- Call POST endpoint, get created slot back
- Add slot ID to `selectedMedicationSlotIds`
- Invalidate blocks query
- Show toast, collapse the template selector

### Server: No changes

Uses existing endpoints:
- `GET /api/hospitals/:hospitalId/discharge-medication-templates`
- `POST /api/patients/:patientId/discharge-medications`

## Edge Cases

- **Controlled substances in template:** Server validates and returns 400 if signature required. We show error toast. Surgeon must create from Medications tab instead where signature pad is available.
- **No templates exist:** Show "No templates available" disabled state or hide the button entirely.
- **Template with items referencing deleted catalog items:** `itemId` may not resolve — `customName` fallback handles this (existing behavior).
