# Surgeon Summary PDF Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add duration calculations (Schnitt-Naht-Zeit, Anesthesia duration), anesthesia type, and clinic language support to the simplified surgeon summary PDF.

**Architecture:** Extend the existing `surgeonSummaryPdf.ts` generator with new data fields and a language-switching wrapper. Pass `anesthesiaOverview` and `defaultLanguage` from `SendSurgeonSummaryDialog`. Add missing i18n keys for both languages.

**Tech Stack:** jsPDF + jspdf-autotable, i18next, React (useActiveHospital hook)

---

### Task 1: Add translation keys for new PDF content

**Files:**
- Modify: `client/src/i18n/locales/en.json` (anesthesia.pdf section ~line 2340)
- Modify: `client/src/i18n/locales/de.json` (anesthesia.pdf section ~line 2421)

**Step 1: Add new keys to en.json under `anesthesia.pdf`**

Add these keys to the `anesthesia.pdf` object:
```json
"surgeonSummaryTitle": "Surgery Summary",
"durationsAndAnesthesia": "Durations & Anesthesia",
"schnittNahtZeit": "Incision-Suture Time (O1→O2)",
"anesthesiaDuration": "Anesthesia Duration (X1→A2)",
"anesthesiaType": "Anesthesia Type",
"typeGeneral": "General Anesthesia",
"typeSedation": "Sedation",
"typeRegionalSpinal": "Regional - Spinal",
"typeRegionalEpidural": "Regional - Epidural",
"typeRegionalPeripheral": "Regional - Peripheral",
"roleSurgeon": "Surgeon",
"roleSurgicalAssistant": "Surgical Assistant",
"roleInstrumentNurse": "Instrument Nurse",
"roleCirculatingNurse": "Circulating Nurse",
"roleAnesthesiologist": "Anesthesiologist",
"roleAnesthesiaNurse": "Anesthesia Nurse",
"rolePacuNurse": "PACU Nurse"
```

**Step 2: Add corresponding keys to de.json under `anesthesia.pdf`**

```json
"surgeonSummaryTitle": "OP-Zusammenfassung",
"durationsAndAnesthesia": "Zeiten & Anästhesie",
"schnittNahtZeit": "Schnitt-Naht-Zeit (O1→O2)",
"anesthesiaDuration": "Anästhesiedauer (X1→A2)",
"anesthesiaType": "Anästhesieform",
"typeGeneral": "Allgemeinanästhesie",
"typeSedation": "Sedierung",
"typeRegionalSpinal": "Regionalanästhesie - Spinal",
"typeRegionalEpidural": "Regionalanästhesie - Epidural",
"typeRegionalPeripheral": "Regionalanästhesie - Peripher",
"roleSurgeon": "Operateur",
"roleSurgicalAssistant": "Assistenz",
"roleInstrumentNurse": "Instrumentierende",
"roleCirculatingNurse": "Zudienung",
"roleAnesthesiologist": "Anästhesist",
"roleAnesthesiaNurse": "Anästhesiepflege",
"rolePacuNurse": "Aufwachraumkraft"
```

**Step 3: Commit**
```
feat(i18n): add translation keys for surgeon summary PDF enhancements
```

---

### Task 2: Add `defaultLanguage` to useActiveHospital interface

**Files:**
- Modify: `client/src/hooks/useActiveHospital.ts:5-25`

**Step 1: Add `defaultLanguage` to the Hospital interface**

Add to the `Hospital` interface (after `timezone` on line 24):
```typescript
defaultLanguage?: string;
```

The data is already returned by the API (`getUserHospitals` spreads the full hospitals row). We just need the TypeScript interface to expose it.

**Step 2: Commit**
```
feat(hooks): expose defaultLanguage in useActiveHospital
```

---

### Task 3: Enhance surgeonSummaryPdf.ts — interface, language switching, durations, anesthesia type

**Files:**
- Modify: `client/src/lib/surgeonSummaryPdf.ts` (full file)

**Step 1: Extend the SurgeonSummaryData interface**

Add to the `anesthesiaRecord` type (after `timeMarkers`):
```typescript
anesthesiaOverview?: {
  general?: boolean;
  sedation?: boolean;
  regionalSpinal?: boolean;
  regionalEpidural?: boolean;
  regionalPeripheral?: boolean;
} | null;
```

Add a new top-level field:
```typescript
language?: string; // clinic's defaultLanguage ('de' or 'en')
```

**Step 2: Add duration calculation helper**

```typescript
function formatDuration(startMs: number, endMs: number): string {
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return "–";
  const diffMin = Math.round((endMs - startMs) / 60000);
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${minutes} min`;
}
```

**Step 3: Add anesthesia type label helper**

```typescript
function getAnesthesiaTypeLabels(
  overview: SurgeonSummaryData["anesthesiaRecord"] extends { anesthesiaOverview?: infer T } ? T : never,
  t: (key: string) => string,
): string {
  if (!overview) return t("anesthesia.pdf.na");
  const map: Record<string, string> = {
    general: t("anesthesia.pdf.typeGeneral"),
    sedation: t("anesthesia.pdf.typeSedation"),
    regionalSpinal: t("anesthesia.pdf.typeRegionalSpinal"),
    regionalEpidural: t("anesthesia.pdf.typeRegionalEpidural"),
    regionalPeripheral: t("anesthesia.pdf.typeRegionalPeripheral"),
  };
  const active = Object.entries(overview)
    .filter(([, v]) => v)
    .map(([k]) => map[k] || k);
  return active.length > 0 ? active.join(", ") : t("anesthesia.pdf.na");
}
```

**Step 4: Add language switching in generateSurgeonSummaryPDF**

At the top of `generateSurgeonSummaryPDF`, save and switch language:
```typescript
const originalLang = i18next.language;
if (data.language) {
  i18next.changeLanguage(data.language);
}
```

At the bottom (before `return doc`), restore:
```typescript
if (data.language && data.language !== originalLang) {
  i18next.changeLanguage(originalLang);
}
```

**Step 5: Replace hardcoded title and role labels**

Replace `"Surgery Summary"` with `t("anesthesia.pdf.surgeonSummaryTitle")`.

Replace the hardcoded `roleLabels` object to use i18n:
```typescript
const roleLabels: Record<string, string> = {
  surgeon: t("anesthesia.pdf.roleSurgeon"),
  surgicalAssistant: t("anesthesia.pdf.roleSurgicalAssistant"),
  instrumentNurse: t("anesthesia.pdf.roleInstrumentNurse"),
  circulatingNurse: t("anesthesia.pdf.roleCirculatingNurse"),
  anesthesiologist: t("anesthesia.pdf.roleAnesthesiologist"),
  anesthesiaNurse: t("anesthesia.pdf.roleAnesthesiaNurse"),
  pacuNurse: t("anesthesia.pdf.rolePacuNurse"),
};
```

Move `roleLabels` INSIDE `generateSurgeonSummaryPDF` (after the `t` function definition), since it now depends on `t`.

**Step 6: Add the "Durations & Anesthesia" section**

After the Surgery Information table (after line 158), add a new section:

```typescript
// === Durations & Anesthesia section ===
doc.setFontSize(14);
doc.setFont("helvetica", "bold");
doc.setFillColor(59, 130, 246);
doc.rect(20, yPos - 5, 170, 8, "F");
doc.setTextColor(255, 255, 255);
doc.text(t("anesthesia.pdf.durationsAndAnesthesia"), 22, yPos);
doc.setTextColor(0, 0, 0);
yPos += 8;

const markers = data.anesthesiaRecord?.timeMarkers || [];
const o1 = markers.find(m => m.code === "O1")?.time;
const o2 = markers.find(m => m.code === "O2")?.time;
const x1 = markers.find(m => m.code === "X1")?.time;
const a2 = markers.find(m => m.code === "A2")?.time;

const durationRows: string[][] = [
  [t("anesthesia.pdf.schnittNahtZeit"), o1 && o2 ? formatDuration(o1, o2) : "–"],
  [t("anesthesia.pdf.anesthesiaDuration"), x1 && a2 ? formatDuration(x1, a2) : "–"],
  [t("anesthesia.pdf.anesthesiaType"), getAnesthesiaTypeLabels(data.anesthesiaRecord?.anesthesiaOverview, t)],
];

autoTable(doc, {
  startY: yPos,
  head: [],
  body: durationRows,
  theme: "grid",
  styles: { fontSize: 9, cellPadding: 3 },
  columnStyles: {
    0: { fontStyle: "bold", cellWidth: 50 },
    1: { cellWidth: 120 },
  },
  margin: { left: 20, right: 20 },
});

yPos = (doc as any).lastAutoTable.finalY + 10;
```

**Step 7: Commit**
```
feat(pdf): add durations, anesthesia type, and clinic language to surgeon summary PDF
```

---

### Task 4: Pass new data from SendSurgeonSummaryDialog

**Files:**
- Modify: `client/src/components/anesthesia/SendSurgeonSummaryDialog.tsx:85-119`

**Step 1: Pass anesthesiaOverview and language to PDF generator**

In the `generateSurgeonSummaryPDF` call (line 85), extend the `anesthesiaRecord` object:
```typescript
anesthesiaRecord: anesthesiaRecord ? {
  anesthesiaStartTime: anesthesiaRecord.anesthesiaStartTime,
  anesthesiaEndTime: anesthesiaRecord.anesthesiaEndTime,
  timeMarkers: anesthesiaRecord.timeMarkers,
  anesthesiaOverview: anesthesiaRecord.anesthesiaOverview,
} : null,
```

Add `language` to the top-level data:
```typescript
language: (activeHospital as any)?.defaultLanguage || 'de',
```

**Step 2: Also fix the email language field (line 119)**

Change from browser language to clinic language:
```typescript
language: (activeHospital as any)?.defaultLanguage === 'en' ? 'en' : 'de',
```

**Step 3: Commit**
```
feat(send-summary): pass anesthesia overview and clinic language to surgeon summary PDF
```

---

### Task 5: TypeScript check and verify

**Step 1: Run TypeScript check**
```bash
npm run check
```

**Step 2: Fix any type errors**

**Step 3: Manual verification** — visually confirm the PDF output looks correct by testing with the dev server.

**Step 4: Commit if any fixes needed**
```
fix: resolve type errors from surgeon summary PDF enhancement
```
