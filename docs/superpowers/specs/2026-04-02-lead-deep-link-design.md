# Lead Deep Link — Design Spec

**Date:** 2026-04-02
**Status:** Approved

## Problem

When a website contact form creates a lead via the webhook, the staff email includes a link to the lead in Viali. Staff need a simple URL that opens the lead directly in the appointments calendar with the leads panel open and the correct lead selected — regardless of which unit type they're logged into.

## Solution

Add a `/leads/:leadId` client-side route that redirects to the correct appointments page with `?leadId=...`, and make the Appointments page + LeadsPanel respond to that parameter.

## Route: `/leads/:leadId`

A `LeadRedirect` component (inline in App.tsx, ~15 lines):

1. Reads the user's active unit type
2. Redirects to the correct appointments path:
   - `clinic` → `/clinic/appointments?leadId=abc`
   - `surgery` → `/surgery/appointments?leadId=abc`
   - `anesthesia` → `/anesthesia/appointments?leadId=abc`
   - `business` / other → `/clinic/appointments?leadId=abc` (fallback, leads panel lives here)
3. Uses `<Redirect>` (client-side, no flash)

## Appointments.tsx Changes

On mount, read `?leadId=` from URL search params:

1. If `leadId` is present, set `leadsPanelOpen = true`
2. Pass `initialLeadId` prop to `LeadsPanel`
3. Clear the `?leadId=` param from the URL after processing (clean URL)

## LeadsPanel.tsx Changes

Accept optional `initialLeadId` prop:

1. When leads are loaded and `initialLeadId` is set, find the matching lead
2. Auto-select it (set as the expanded/active lead)
3. Scroll it into view

## Webhook Response

No change — already returns `{ "status": "received", "id": "uuid" }`. The website form handler builds: `https://use.viali.app/leads/{id}`

## Files

| File | Change |
|------|--------|
| `client/src/App.tsx` | Add `/leads/:leadId` route with `LeadRedirect` component |
| `client/src/pages/clinic/Appointments.tsx` | Read `?leadId=` param, open panel, pass to LeadsPanel |
| `client/src/components/leads/LeadsPanel.tsx` | Accept `initialLeadId`, auto-select + scroll |
