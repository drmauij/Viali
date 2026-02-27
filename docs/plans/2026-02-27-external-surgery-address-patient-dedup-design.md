# External Surgery Request — Address Fields + Patient Dedup

**Date:** 2026-02-27
**Status:** Approved

## Problem

The external surgery reservation form (step 3 — patient info) does not collect the patient's address. When the admin schedules the request and auto-creates a patient record, the address is missing. Additionally, if the same patient submits two requests, two duplicate patient records are created.

## Solution

1. Add address fields (street, postal code, city) to the external surgery request form using the existing `AddressAutocomplete` (Mapbox) component.
2. Store those fields in the `externalSurgeryRequests` table.
3. When scheduling, deduplicate patients by `hospitalId + surname + firstName + birthday` before creating a new record. If found, update the patient's address fields if they are blank.

## Changes

### 1. DB Schema (`shared/schema.ts`)
Add 3 nullable varchar columns to `externalSurgeryRequests`:
- `patientStreet`
- `patientPostalCode`
- `patientCity`

### 2. Migration
Idempotent `ADD COLUMN IF NOT EXISTS` for all 3 columns.

### 3. Server — `server/routes/externalSurgery.ts`

**Zod schema:** add `patientStreet`, `patientPostalCode`, `patientCity` (optional/nullable, same pattern as `patientEmail`). Add all 3 to the `.refine()` required check for non-reservation requests.

**Scheduling flow (POST schedule endpoint):**
1. Before `createPatient()`, call `storage.findPatientByDetails(hospitalId, surname, firstName, birthday)`
2. If found:
   - Reuse existing patient ID
   - If `street`, `postalCode`, or `city` is blank on the existing record → `updatePatient()` with the new values
3. If not found: `createPatient()` with address fields included

### 4. Storage (`server/storage.ts`)
Add `findPatientByDetails(hospitalId: string, surname: string, firstName: string, birthday: string): Promise<Patient | null>`

Lookup: exact match on `hospitalId + surname (case-insensitive) + firstName (case-insensitive) + birthday`.

### 5. Client — `client/src/pages/ExternalSurgeryRequest.tsx`

- Add `patientStreet`, `patientPostalCode`, `patientCity` (string) to `FormData` interface and initial state
- Import `AddressAutocomplete`
- Render `AddressAutocomplete` in step 3 below the email field, labeled "Address *"
- Add all 3 fields to step 3 validation (required when `!isReservationOnly`)

## Validation rules

| Field | Reservation-only | Non-reservation |
|---|---|---|
| patientFirstName | optional | required |
| patientLastName | optional | required |
| patientBirthday | optional | required |
| patientPhone | optional | required |
| patientStreet | optional | required |
| patientPostalCode | optional | required |
| patientCity | optional | required |
| patientEmail | optional | optional |

## Dedup behaviour

- Match: `hospitalId` + `surname` (case-insensitive) + `firstName` (case-insensitive) + `birthday` (exact)
- On match: reuse patient; patch `street/postalCode/city` only if currently blank on the patient record
- No match: create new patient including address fields
