# Intraoperative Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static Drainage card with dynamic multi-drainage list (dropdown type + size + position), and add new X-Ray/Fluoroscopy toggle card.

**Architecture:** Both features store data as JSON fields inside the existing `intraOpData` column — no DB migration needed. Backward-compatible: old `drainage` object is migrated to `drainages` array on first interaction. X-Ray card uses a toggle to show/hide detail fields.

**Tech Stack:** React, shadcn/ui (Select, Switch, Input, Button), Zod schemas, i18next, jsPDF

---

### Task 1: Add schema types and Zod validation

**Files:**
- Modify: `shared/schema.ts:1287-1293` (TypeScript type)
- Modify: `shared/schema.ts:2878-2883` (Zod schema)

**Step 1: Add `drainages` and `xray` to the TypeScript type**

In `shared/schema.ts`, find the intraOp type definition. After the existing `drainage` block (~line 1292), add the new fields:

```typescript
    // Dynamic drainage entries (replaces static drainage fields)
    drainages?: Array<{
      id: string;
      type: string;         // Redon, Jackson-Pratt, Blake, Penrose, T-Tube, Chest Tube, Silicone Drain, Other
      typeOther?: string;    // free text when type === "Other"
      size: string;          // e.g. "CH 10"
      position: string;      // e.g. "right flank"
    }>;
    // Intraoperative X-Ray / Fluoroscopy
    xray?: {
      used: boolean;
      imageCount?: number;
      bodyRegion?: string;
      notes?: string;
    };
```

Keep the old `drainage?` field for backward compatibility — do NOT delete it.

**Step 2: Add Zod schemas for the new fields**

After the existing `drainage` Zod schema (~line 2883), add:

```typescript
  drainages: z.array(z.object({
    id: z.string(),
    type: z.string(),
    typeOther: z.string().optional().nullable(),
    size: z.string().optional().nullable(),
    position: z.string().optional().nullable(),
  })).optional(),
  xray: z.object({
    used: z.boolean(),
    imageCount: z.number().int().min(0).optional().nullable(),
    bodyRegion: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }).optional(),
```

**Step 3: Run TypeScript check**

Run: `npm run check`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: add drainages array and xray schema for intraop enhancements"
```

---

### Task 2: Add i18n translation keys

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

**Step 1: Add English translations**

Find the `surgery.intraop` section. After the existing `drainageOther` key, add:

```json
"addDrainage": "Add Drainage",
"removeDrainage": "Remove",
"drainageSize": "Size",
"drainagePosition": "Position",
"drainageTypes": {
  "redon": "Redon",
  "jacksonPratt": "Jackson-Pratt",
  "blake": "Blake",
  "penrose": "Penrose",
  "tTube": "T-Tube",
  "chestTube": "Chest Tube",
  "siliconeDrain": "Silicone Drain",
  "other": "Other"
},
"drainageTypeOtherPlaceholder": "Specify type...",
"drainageSizePlaceholder": "e.g. CH 10",
"drainagePositionPlaceholder": "e.g. right flank",
"xray": "X-Ray / Fluoroscopy",
"xrayUsed": "X-Ray used",
"xrayImageCount": "Images taken",
"xrayBodyRegion": "Body region",
"xrayBodyRegionPlaceholder": "e.g. left hip",
"xrayNotes": "Notes",
"xrayNotesPlaceholder": "e.g. C-arm, AP + lateral views"
```

**Step 2: Add German translations**

Same location in `de.json`:

```json
"addDrainage": "Drainage hinzufügen",
"removeDrainage": "Entfernen",
"drainageSize": "Grösse",
"drainagePosition": "Position",
"drainageTypes": {
  "redon": "Redon",
  "jacksonPratt": "Jackson-Pratt",
  "blake": "Blake",
  "penrose": "Penrose",
  "tTube": "T-Tube",
  "chestTube": "Thoraxdrainage",
  "siliconeDrain": "Silikondrainage",
  "other": "Andere"
},
"drainageTypeOtherPlaceholder": "Typ angeben...",
"drainageSizePlaceholder": "z.B. CH 10",
"drainagePositionPlaceholder": "z.B. rechte Flanke",
"xray": "Röntgen / Durchleuchtung",
"xrayUsed": "Röntgen verwendet",
"xrayImageCount": "Aufnahmen",
"xrayBodyRegion": "Körperregion",
"xrayBodyRegionPlaceholder": "z.B. linke Hüfte",
"xrayNotes": "Notizen",
"xrayNotesPlaceholder": "z.B. C-Bogen, AP + seitlich"
```

**Step 3: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: add i18n strings for dynamic drainages and X-Ray card"
```

---

### Task 3: Update the local TypeScript type in Op.tsx

**Files:**
- Modify: `client/src/pages/anesthesia/Op.tsx:1109` (local intraOpData type)

**Step 1: Add `drainages` and `xray` to local type**

Find the local type at ~line 1109. After the existing `drainage?` line, add:

```typescript
    drainages?: Array<{
      id: string;
      type: string;
      typeOther?: string;
      size: string;
      position: string;
    }>;
    xray?: {
      used: boolean;
      imageCount?: number;
      bodyRegion?: string;
      notes?: string;
    };
```

**Step 2: Add Switch import**

Find the imports at the top of Op.tsx. Add to the existing UI imports:

```typescript
import { Switch } from "@/components/ui/switch";
```

**Step 3: Run TypeScript check**

Run: `npm run check`
Expected: PASS

---

### Task 4: Replace static Drainage card with dynamic list

**Files:**
- Modify: `client/src/pages/anesthesia/Op.tsx:3609-3708` (Drainage Section)

**Step 1: Add backward-compatibility helper**

Just before the Drainage JSX section (~line 3609), or at the top of the component, add a helper to migrate old data:

```typescript
// Helper: get drainages array, migrating old format if needed
const getDrainages = () => {
  if (intraOpData.drainages && intraOpData.drainages.length > 0) {
    return intraOpData.drainages;
  }
  // Migrate old drainage format
  if (intraOpData.drainage && (intraOpData.drainage.redonCH || intraOpData.drainage.other)) {
    return [{
      id: crypto.randomUUID(),
      type: 'Redon',
      size: intraOpData.drainage.redonCH ?? '',
      position: intraOpData.drainage.other ?? '',
    }];
  }
  return [];
};
```

**Step 2: Replace the Drainage card JSX**

Replace the entire `{/* Drainage Section */}` card (lines 3609-3708) with:

```tsx
{/* Drainage Section */}
<Card>
  <CardHeader className="py-3">
    <CardTitle>{t('surgery.intraop.drainage')}</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {getDrainages().map((drain, index) => (
      <div key={drain.id} className="flex items-start gap-2 p-2 border rounded-lg">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('surgery.intraop.drainageType')}</Label>
            <Select
              value={drain.type}
              onValueChange={(value) => {
                const drainages = [...getDrainages()];
                drainages[index] = { ...drainages[index], type: value, typeOther: value === 'Other' ? drainages[index].typeOther : undefined };
                const updated = { ...intraOpData, drainages };
                setIntraOpData(updated);
                intraOpAutoSave.mutate(updated);
              }}
            >
              <SelectTrigger data-testid={`select-drainage-type-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Redon', 'Jackson-Pratt', 'Blake', 'Penrose', 'T-Tube', 'Chest Tube', 'Silicone Drain', 'Other'].map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {t(`surgery.intraop.drainageTypes.${opt === 'Jackson-Pratt' ? 'jacksonPratt' : opt === 'T-Tube' ? 'tTube' : opt === 'Chest Tube' ? 'chestTube' : opt === 'Silicone Drain' ? 'siliconeDrain' : opt.toLowerCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {drain.type === 'Other' && (
              <Input
                data-testid={`input-drainage-type-other-${index}`}
                placeholder={t('surgery.intraop.drainageTypeOtherPlaceholder')}
                value={drain.typeOther ?? ''}
                onChange={(e) => {
                  const drainages = [...getDrainages()];
                  drainages[index] = { ...drainages[index], typeOther: e.target.value };
                  setIntraOpData({ ...intraOpData, drainages });
                }}
                onBlur={() => {
                  const drainages = [...getDrainages()];
                  drainages[index] = { ...drainages[index], typeOther: drainages[index].typeOther };
                  intraOpAutoSave.mutate({ ...intraOpData, drainages });
                }}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('surgery.intraop.drainageSize')}</Label>
            <Input
              data-testid={`input-drainage-size-${index}`}
              placeholder={t('surgery.intraop.drainageSizePlaceholder')}
              value={drain.size ?? ''}
              onChange={(e) => {
                const drainages = [...getDrainages()];
                drainages[index] = { ...drainages[index], size: e.target.value };
                setIntraOpData({ ...intraOpData, drainages });
              }}
              onBlur={() => {
                intraOpAutoSave.mutate({ ...intraOpData, drainages: getDrainages() });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('surgery.intraop.drainagePosition')}</Label>
            <Input
              data-testid={`input-drainage-position-${index}`}
              placeholder={t('surgery.intraop.drainagePositionPlaceholder')}
              value={drain.position ?? ''}
              onChange={(e) => {
                const drainages = [...getDrainages()];
                drainages[index] = { ...drainages[index], position: e.target.value };
                setIntraOpData({ ...intraOpData, drainages });
              }}
              onBlur={() => {
                intraOpAutoSave.mutate({ ...intraOpData, drainages: getDrainages() });
              }}
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="mt-5 text-destructive hover:text-destructive"
          data-testid={`button-remove-drainage-${index}`}
          onClick={() => {
            const drainages = getDrainages().filter((_, i) => i !== index);
            const updated = { ...intraOpData, drainages };
            setIntraOpData(updated);
            intraOpAutoSave.mutate(updated);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ))}
    <Button
      variant="outline"
      size="sm"
      data-testid="button-add-drainage"
      onClick={() => {
        const drainages = [...getDrainages(), {
          id: crypto.randomUUID(),
          type: 'Redon',
          size: '',
          position: '',
        }];
        const updated = { ...intraOpData, drainages };
        setIntraOpData(updated);
        intraOpAutoSave.mutate(updated);
      }}
    >
      <Plus className="h-4 w-4 mr-1" />
      {t('surgery.intraop.addDrainage')}
    </Button>
  </CardContent>
</Card>
```

**Step 3: Verify `Trash2` and `Plus` icons are imported**

Check existing imports. `Plus` is likely already imported. Add `Trash2` if missing:

```typescript
import { Plus, Trash2, ... } from "lucide-react";
```

**Step 4: Run TypeScript check**

Run: `npm run check`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/pages/anesthesia/Op.tsx
git commit -m "feat: replace static drainage with dynamic multi-drainage list"
```

---

### Task 5: Add X-Ray / Fluoroscopy card

**Files:**
- Modify: `client/src/pages/anesthesia/Op.tsx` (after Drainage card, before Intraoperative Notes)

**Step 1: Add X-Ray card JSX**

Insert after the Drainage `</Card>` and before `{/* Intraoperative Notes Section */}`:

```tsx
{/* X-Ray / Fluoroscopy Section */}
<Card>
  <CardHeader className="py-3">
    <div className="flex items-center justify-between">
      <CardTitle>{t('surgery.intraop.xray')}</CardTitle>
      <div className="flex items-center gap-2">
        <Label htmlFor="xray-used" className="text-sm font-normal">
          {t('surgery.intraop.xrayUsed')}
        </Label>
        <Switch
          id="xray-used"
          data-testid="switch-xray-used"
          checked={intraOpData.xray?.used ?? false}
          onCheckedChange={(checked) => {
            const updated = {
              ...intraOpData,
              xray: { ...intraOpData.xray, used: checked }
            };
            setIntraOpData(updated);
            intraOpAutoSave.mutate(updated);
          }}
        />
      </div>
    </div>
  </CardHeader>
  {intraOpData.xray?.used && (
    <CardContent className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">{t('surgery.intraop.xrayImageCount')}</Label>
          <Input
            data-testid="input-xray-image-count"
            type="number"
            min="0"
            value={intraOpData.xray?.imageCount ?? ''}
            onChange={(e) => {
              const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
              const updated = {
                ...intraOpData,
                xray: { ...intraOpData.xray, used: true, imageCount: value }
              };
              setIntraOpData(updated);
            }}
            onBlur={() => {
              intraOpAutoSave.mutate(intraOpData);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('surgery.intraop.xrayBodyRegion')}</Label>
          <Input
            data-testid="input-xray-body-region"
            placeholder={t('surgery.intraop.xrayBodyRegionPlaceholder')}
            value={intraOpData.xray?.bodyRegion ?? ''}
            onChange={(e) => {
              const updated = {
                ...intraOpData,
                xray: { ...intraOpData.xray, used: true, bodyRegion: e.target.value }
              };
              setIntraOpData(updated);
            }}
            onBlur={() => {
              intraOpAutoSave.mutate(intraOpData);
            }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('surgery.intraop.xrayNotes')}</Label>
        <Input
          data-testid="input-xray-notes"
          placeholder={t('surgery.intraop.xrayNotesPlaceholder')}
          value={intraOpData.xray?.notes ?? ''}
          onChange={(e) => {
            const updated = {
              ...intraOpData,
              xray: { ...intraOpData.xray, used: true, notes: e.target.value }
            };
            setIntraOpData(updated);
          }}
          onBlur={() => {
            intraOpAutoSave.mutate(intraOpData);
          }}
        />
      </div>
    </CardContent>
  )}
</Card>
```

**Step 2: Run TypeScript check**

Run: `npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add client/src/pages/anesthesia/Op.tsx
git commit -m "feat: add X-Ray / Fluoroscopy toggle card to intraoperative tab"
```

---

### Task 6: Update PDF generation

**Files:**
- Modify: `client/src/lib/anesthesiaRecordPdf.ts:3025-3040` (Drainage PDF section)

**Step 1: Replace the drainage PDF section**

Replace lines 3025-3040 (the `// Drainage` block) with:

```typescript
      // Drainage (new dynamic format)
      const drainages = intraOpData.drainages && intraOpData.drainages.length > 0
        ? intraOpData.drainages
        : intraOpData.drainage && (intraOpData.drainage.redonCH || intraOpData.drainage.other)
          ? [{ id: '0', type: 'Redon', size: intraOpData.drainage.redonCH ?? '', position: intraOpData.drainage.other ?? '' }]
          : [];

      if (drainages.length > 0) {
        yPos = checkPageBreak(doc, yPos, 10 + drainages.length * 5);
        doc.setFont("helvetica", "bold");
        doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.drainage", "Drainage")}:`, 25, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        drainages.forEach((drain: any) => {
          const typeName = drain.type === 'Other' && drain.typeOther ? drain.typeOther : drain.type;
          const parts = [typeName, drain.size, drain.position].filter(Boolean);
          doc.text(`• ${parts.join(' — ')}`, 28, yPos);
          yPos += 4.5;
        });
        yPos += 2;
      }

      // X-Ray / Fluoroscopy
      if (intraOpData.xray?.used) {
        yPos = checkPageBreak(doc, yPos, 15);
        doc.setFont("helvetica", "bold");
        doc.text(`${i18next.t("surgery.intraop.xray", "X-Ray / Fluoroscopy")}:`, 25, yPos);
        doc.setFont("helvetica", "normal");
        const xrayParts: string[] = [];
        if (intraOpData.xray.imageCount) xrayParts.push(`${i18next.t("surgery.intraop.xrayImageCount", "Images")}: ${intraOpData.xray.imageCount}`);
        if (intraOpData.xray.bodyRegion) xrayParts.push(intraOpData.xray.bodyRegion);
        if (intraOpData.xray.notes) xrayParts.push(intraOpData.xray.notes);
        if (xrayParts.length > 0) {
          doc.text(xrayParts.join(", "), 75, yPos);
        }
        yPos += 6;
      }
```

**Step 2: Run TypeScript check**

Run: `npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add client/src/lib/anesthesiaRecordPdf.ts
git commit -m "feat: update PDF generation for dynamic drainages and X-Ray"
```

---

### Task 7: Manual verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test Drainage card**

1. Open a surgery > Intraoperative tab
2. Click "+ Add Drainage" — a new row should appear with Type dropdown, Size, Position inputs
3. Select different types from dropdown (Redon, Blake, etc.)
4. Select "Other" — a free text input should appear below the dropdown
5. Add a second drainage — verify both rows persist
6. Click trash icon — row should be removed
7. Refresh page — verify data persists (auto-save)

**Step 3: Test backward compatibility**

1. Find a surgery with existing old-format drainage data (Redon CH + count)
2. Open Intraoperative tab — should show migrated data as a single drainage entry
3. Edit and save — should convert to new format

**Step 4: Test X-Ray card**

1. Find the X-Ray card between Drainage and Intraoperative Notes
2. Toggle "X-Ray used" ON — detail fields should expand
3. Fill in image count, body region, notes
4. Toggle OFF — fields should hide
5. Toggle back ON — values should be preserved
6. Refresh — verify data persists

**Step 5: Test PDF**

1. Download the surgery PDF
2. Verify drainages appear as bullet points with type, size, position
3. Verify X-Ray info appears when used

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: dynamic drainages and X-Ray fluoroscopy card for intraoperative tab"
```
