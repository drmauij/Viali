# Intraoperative Enhancements - Design

**Date:** 2026-03-06
**Location:** Surgery Documentation > Intraoperative tab

---

## Feature 1: Dynamic Multiple Drainages

### Problem

The current Drainage card has static fields (Redon CH, Count, Other). Surgeons need to document multiple drainages per surgery, each with its own type, size, and position.

### Data Model

Change `drainage` from a single object to an array of drainage entries:

```typescript
// New field alongside existing drainage:
drainages?: Array<{
  id: string;       // unique ID for React keys
  type: string;     // dropdown: Redon, Jackson-Pratt, Blake, Penrose, T-Tube, Chest Tube, Silicone Drain, Other
  typeOther?: string; // free text when type === "Other"
  size: string;     // free text: "CH 10", "CH 15"
  position: string; // free text: "right flank", "left abdomen"
}>
```

### Drainage Type Options

Predefined dropdown list:
- Redon
- Jackson-Pratt
- Blake
- Penrose
- T-Tube
- Chest Tube
- Silicone Drain
- Other (shows free text input)

### Migration / Backward Compatibility

- Keep reading old `drainage` field if `drainages` is absent — convert on first save
- Old data maps to: `[{ id: uuid, type: "Redon", size: redonCH, position: other }]`

### UI

- Each drainage entry: 3 free text inputs in a row (Type, Size, Position) + trash icon to remove
- "+ Add Drainage" button at the bottom
- Compact layout, consistent with existing card styling

---

## Feature 2: Intraoperative X-Ray / Fluoroscopy Card

### Problem

Surgeons need to document intraoperative X-Ray/fluoroscopy usage for legal, safety, and billing purposes. Currently no card exists for this.

### Data Model

```typescript
xray?: {
  used: boolean;       // toggle: was X-Ray used during surgery?
  imageCount?: number; // number of images taken
  bodyRegion?: string; // free text: "left hip", "thorax"
  notes?: string;      // free text: "C-arm, AP + lateral views"
}
```

### UI

- Card title: "X-Ray / Fluoroscopy"
- Shows a toggle switch "X-Ray used"
- When toggled ON, detail fields expand: Images taken (number), Body region (text), Notes (text)
- When toggled OFF, detail fields are hidden — keeps UI clean

### Affected Files (both features)

1. `shared/schema.ts` — add `drainages` array + `xray` object to intraOp type + zod schema
2. `client/src/pages/anesthesia/Op.tsx` — replace static drainage fields with dynamic list, add X-Ray card
3. `client/src/lib/anesthesiaRecordPdf.ts` — update PDF generation for both features
4. i18n files — add translation keys for new fields

No DB migration needed — both stored as JSON inside existing column.
