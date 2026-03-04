# Surgeon Summary PDF Enhancement

**Date:** 2026-03-04

## Goal

Enhance the simplified surgeon summary PDF (sent to external surgeons via "Send Summary") with:
1. Schnitt-Naht-Zeit (O1→O2) duration calculation in minutes
2. Anesthesia duration (X1→A2) calculation
3. Anesthesia type from `anesthesiaOverview` (high-level categories only)
4. Use clinic's `defaultLanguage` instead of browser language

## Changes

### 1. `surgeonSummaryPdf.ts` — PDF generator

- Add `anesthesiaOverview` and `language` to `SurgeonSummaryData` interface
- Temporarily switch i18next language to clinic language before generating, restore after
- Add new "Durations & Anesthesia" section between Surgery Info and Time Markers:
  - Schnitt-Naht-Zeit (O1→O2) in minutes
  - Anästhesiedauer (X1→A2) in hours+minutes
  - Anästhesieform — mapped from `anesthesiaOverview` booleans to translated labels
- Fix hardcoded English title "Surgery Summary" and role labels to use i18next
- Add helper: `calculateDuration(startMs, endMs)` → formatted string
- Add mapping: `anesthesiaOverview` keys → translated labels

### 2. `SendSurgeonSummaryDialog.tsx` — Data passing

- Pass `anesthesiaOverview` from the already-fetched anesthesia record
- Pass hospital `defaultLanguage` (from auth context or hospital data)
- Also pass clinic language to the email endpoint `language` field

### 3. Translation keys

Add keys for:
- PDF title: "Surgery Summary" / "OP-Zusammenfassung"
- Section header: "Durations & Anesthesia" / "Zeiten & Anästhesie"
- Duration labels: "Schnitt-Naht-Zeit (O1→O2)", "Anästhesiedauer (X1→A2)", "Anästhesieform"
- Anesthesia types: General, Sedation, Regional Spinal, Regional Epidural, Regional Peripheral
- Role labels (currently hardcoded English)

## No changes needed

- No new API endpoints
- No schema changes
- No new dependencies
