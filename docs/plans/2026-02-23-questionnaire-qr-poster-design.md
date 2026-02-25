# Questionnaire QR Poster PDF — Design

## Goal

Add a "Download QR Poster" button to the admin Open Questionnaire Link card. Generates a printable A4 PDF with the hospital logo, name, and a QR code linking to the patient questionnaire — meant to be placed at the clinic entrance.

## PDF Layout (A4 portrait)

- Hospital logo (centered, ~40mm wide)
- Hospital name (bold, large)
- Subtitle: "Patient Questionnaire" (translated)
- QR code (~80x80mm, centered)
- Instruction text: "Scan to fill out your pre-operative questionnaire" (translated)
- URL in small text for reference

## Implementation

- **New dependency:** `qrcode` npm package
- **New file:** `client/src/lib/questionnairePosterPdf.ts` — PDF generation function
- **Modified file:** `client/src/pages/admin/Hospital.tsx` — add download button in questionnaire link card
- **Modified files:** translation JSON files — add DE/EN keys
- Button only visible when questionnaire token is active

## Tech

- jsPDF (already in project) for PDF generation
- `qrcode` library to generate QR as data URL
- i18next for translated text on the PDF
- Hospital logo from `companyLogoUrl` (base64 in DB)
