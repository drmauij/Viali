# ASPSMS Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ASPSMS as an alternative SMS provider alongside Vonage, with per-hospital configuration and explicit provider selection.

**Architecture:** New `hospital_aspsms_configs` table + `sms_provider` column on hospitals. SMS service refactored to resolve provider per hospital. ASPSMS JSON API (`json.aspsms.com`) called via `fetch()`. New admin UI tab mirrors Vonage pattern.

**Tech Stack:** PostgreSQL/Drizzle, Express routes, React + shadcn/ui, ASPSMS JSON API

---

## Design

Add ASPSMS (json.aspsms.com) as an alternative SMS provider to Vonage. Configurable per hospital under Admin > Integrations as a separate tab. Includes explicit provider selection and a fallback chain.

## API Choice

**JSON API** (`https://json.aspsms.com/`) — all POST + JSON, credentials in body (not query strings), per-message originator support, built-in credit checking.

Key endpoints:
- `POST /SendSimpleTextSMS` — send SMS
- `POST /CheckCredits` — check account balance
- `POST /CheckCredentials` — validate credentials (mapped from WebAPI's CheckUserCredentials)

### SendSimpleTextSMS Request

```json
{
  "UserName": "<userkey>",
  "Password": "<api-password>",
  "Originator": "ClinicName",
  "Recipients": ["+41780000000"],
  "MessageText": "Your message here"
}
```

### Response Format

```json
{
  "StatusCode": "1",
  "StatusInfo": "OK"
}
```

StatusCode "1" = success. Anything else = error.

## Provider Priority Chain

When sending SMS for a hospital, resolve provider in this order:

1. **Hospital ASPSMS** (own credentials) — originator = clinic name
2. **Default ASPSMS** (env vars: `ASPSMS_USERKEY`, `ASPSMS_PASSWORD`) — originator = clinic name
3. **Hospital Vonage** (own credentials) — fromNumber from config
4. **Default Vonage** (env vars) — fromNumber from env

Admin can override with explicit "Active SMS Provider" selector per hospital.

### Originator Logic

ASPSMS supports per-message originator (up to 11 alphanumeric chars). Even when using default/shared ASPSMS credentials, each SMS displays the clinic's name as sender. The originator is derived from:
1. Hospital's configured ASPSMS originator field (if set)
2. Hospital name truncated to 11 chars (fallback)

## Database

### New table: `hospital_aspsms_configs`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| hospital_id | VARCHAR | UNIQUE FK to hospitals, CASCADE delete |
| encrypted_user_key | VARCHAR | AES-256-CBC encrypted |
| encrypted_password | VARCHAR | AES-256-CBC encrypted |
| originator | VARCHAR(11) | Sender name (alphanumeric, max 11 chars) |
| is_enabled | BOOLEAN | Default true |
| last_tested_at | TIMESTAMP | Nullable |
| last_test_status | VARCHAR | 'success' or 'failed' |
| last_test_error | TEXT | Nullable |
| created_at | TIMESTAMP | Default now() |
| updated_at | TIMESTAMP | Default now() |

### Alter table: `hospitals`

Add column:
- `sms_provider` VARCHAR — values: `'aspsms'`, `'vonage'`, `'auto'` (default `'auto'`)

When `'auto'`, the priority chain above applies. When explicitly set, that provider is used (with fallback to the chain if not configured).

### New env vars

- `ASPSMS_USERKEY` — default account userkey
- `ASPSMS_PASSWORD` — default account API password
- `ASPSMS_DEFAULT_ORIGINATOR` — default originator (e.g. "ViALI"), used when no hospital originator is set and hospital name exceeds 11 chars

## Backend

### New routes: `/api/admin/:hospitalId/integrations/aspsms`

Mirror the Vonage route pattern:

- `GET` — returns config status (hasUserKey, hasPassword, originator, isEnabled, test status, credits)
- `PUT` — upsert config (encrypts credentials)
- `POST /test` — send test SMS via ASPSMS
- `DELETE` — clear config

### New route: Provider selection

- `PUT /api/admin/:hospitalId/integrations/sms-provider` — set `sms_provider` on hospital

### SMS service changes (`server/sms.ts`)

- New `sendSmsViaAspsms(to, message, originator, credentials)` function
- Update `sendSms()` to resolve provider via `getPreferredProvider(hospitalId)`:
  1. Check `hospital.sms_provider` setting
  2. If `'auto'`, follow priority chain
  3. Call appropriate provider function
- New `getAspsmsCredentials(hospitalId?)` — hospital config -> env vars fallback
- New `resolveOriginator(hospitalId)` — hospital ASPSMS originator -> hospital name (truncated) -> env default

### Storage layer

- `getHospitalAspsmsConfig(hospitalId)`
- `upsertHospitalAspsmsConfig(config)`
- `updateHospitalAspsmsTestStatus(hospitalId, status, error?)`

## Frontend

### Admin > Hospital > Integrations tab

Current structure: single "Vonage SMS" content area.

New structure with sub-tabs:

```
Integrations
  [SMS Provider: (auto) v ]     ← dropdown at top
  ┌──────────┬──────────┐
  │ ASPSMS   │ Vonage   │      ← sub-tabs
  └──────────┴──────────┘

  ASPSMS tab:
  - Enabled toggle
  - UserKey field (password, toggleable)
  - Password field (password, toggleable)
  - Originator field (text, max 11 chars, placeholder: clinic name)
  - Credits display (fetched on tab load)
  - Test SMS button + dialog
  - Save / Delete buttons
  - Setup instructions

  Vonage tab:
  - (existing UI, unchanged)
```

The SMS Provider dropdown shows:
- **Automatic** (default) — follows priority chain
- **ASPSMS** — use ASPSMS only (greyed out if not configured)
- **Vonage** — use Vonage only (greyed out if not configured)

## Testing

- Integration tests for ASPSMS CRUD routes
- Unit tests for provider resolution logic
- Unit tests for originator resolution
- Test SMS functionality (manual, via UI)
