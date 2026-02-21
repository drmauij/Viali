# Personal Settings Dialog

## Summary

Replace the "Timebutler Sync" menu item in the user dropdown with a "Personal Settings" item that opens a dialog containing three fields: phone number, brief signature (multi-line), and Timebutler URL.

## Schema

Add `briefSignature` (text, nullable) to `users` table. `phone` and `timebutlerIcsUrl` already exist.

## API

New endpoint: `PATCH /api/user/profile` accepting `{ phone?, briefSignature?, timebutlerIcsUrl? }`. Replaces existing `PUT /api/user/timebutler-url`.

## UI

- **Menu item**: "Personal Settings" replaces "Timebutler Sync" in the TopBar dropdown
- **Dialog**: `PersonalSettingsDialog` with:
  - Phone: text input
  - Brief Signature: multi-line textarea
  - Timebutler URL: text input with https:// validation
- Remove `TimebutlerUrlDialog` component

## PDF Signing

In `htmlToPdf.ts`, use `briefSignature` (multi-line) below the drawn signature, falling back to the signer's full name if not set. The brief signing route passes the signer's `briefSignature` to the PDF renderer.

## i18n

Add German + English translations for the new dialog labels and the menu item.
