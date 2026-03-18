# Referral UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase referral question completion by extracting it into its own visually engaging wizard step with an icon grid UI, and move height/weight below date of birth in Personal Info.

**Architecture:** Single-file change in `PatientQuestionnaire.tsx`. Add a new `ReferralStep` component with a 2-column icon grid using Lucide icons. Insert a new step in the `STEPS` array and shift all hardcoded step indices. No backend or schema changes.

**Tech Stack:** React, Tailwind CSS, Lucide React icons, existing questionnaire component patterns.

**Spec:** `docs/superpowers/specs/2026-03-18-referral-ui-redesign-design.md`

---

### Task 1: Add icon imports and referral step to STEPS array

**Files:**
- Modify: `client/src/pages/PatientQuestionnaire.tsx:18-49` (icon imports)
- Modify: `client/src/pages/PatientQuestionnaire.tsx:210-220` (STEPS array)

- [ ] **Step 1: Add new Lucide icon imports**

At line 18, add `Megaphone`, `Share2`, `Search`, `Bot`, `Users`, `MoreHorizontal` to the existing lucide-react import block. Note: `Stethoscope` and `ChevronRight` are already imported.

- [ ] **Step 2: Insert referral step into STEPS array**

In the `STEPS` array (line 210-220), insert at index 1 (after `personal`):

```typescript
{ id: "referral", icon: Megaphone, labelKey: "questionnaire.steps.referral" },
```

- [ ] **Step 3: Verify the file still compiles**

Run: `npm run check`
Expected: No TypeScript errors (the new step ID won't be rendered yet, but the array change is safe).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PatientQuestionnaire.tsx
git commit -m "feat(questionnaire): add referral step to STEPS array and icon imports"
```

---

### Task 2: Add translation keys for all 5 languages

**Files:**
- Modify: `client/src/pages/PatientQuestionnaire.tsx` — all 5 language blocks in `translations` object (en, de, it, es, fr). Add keys after `questionnaire.steps.submit` in each block.

- [ ] **Step 1: Add English translation keys**

Add after `"questionnaire.steps.submit"` (around line 360) in the `en` block:

```typescript
"questionnaire.steps.referral": "Referral",
"questionnaire.referral.title": "How did you hear about us?",
"questionnaire.referral.subtitle": "Tap one — you can always skip this",
"questionnaire.referral.whichOne": "Which one?",
"questionnaire.referral.skipHint": "Press Next to skip",
```

- [ ] **Step 2: Add German translation keys**

Add in the `de` block:

```typescript
"questionnaire.steps.referral": "Empfehlung",
"questionnaire.referral.title": "Wie haben Sie von uns erfahren?",
"questionnaire.referral.subtitle": "Tippen Sie auf eine Option — Sie können diesen Schritt überspringen",
"questionnaire.referral.whichOne": "Welche?",
"questionnaire.referral.skipHint": "Weiter drücken zum Überspringen",
```

- [ ] **Step 3: Add Italian translation keys**

Add in the `it` block:

```typescript
"questionnaire.steps.referral": "Referral",
"questionnaire.referral.title": "Come ha saputo di noi?",
"questionnaire.referral.subtitle": "Tocca un'opzione — puoi saltare questo passaggio",
"questionnaire.referral.whichOne": "Quale?",
"questionnaire.referral.skipHint": "Premi Avanti per saltare",
```

- [ ] **Step 4: Add Spanish translation keys**

Add in the `es` block:

```typescript
"questionnaire.steps.referral": "Referencia",
"questionnaire.referral.title": "¿Cómo nos conoció?",
"questionnaire.referral.subtitle": "Toque una opción — puede omitir este paso",
"questionnaire.referral.whichOne": "¿Cuál?",
"questionnaire.referral.skipHint": "Presione Siguiente para omitir",
```

- [ ] **Step 5: Add French translation keys**

Add in the `fr` block:

```typescript
"questionnaire.steps.referral": "Recommandation",
"questionnaire.referral.title": "Comment avez-vous entendu parler de nous ?",
"questionnaire.referral.subtitle": "Appuyez sur une option — vous pouvez passer cette étape",
"questionnaire.referral.whichOne": "Lequel ?",
"questionnaire.referral.skipHint": "Appuyez sur Suivant pour passer",
```

- [ ] **Step 6: Verify compilation**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/PatientQuestionnaire.tsx
git commit -m "feat(questionnaire): add referral step translation keys for all 5 languages"
```

---

### Task 3: Create the ReferralStep component

**Files:**
- Modify: `client/src/pages/PatientQuestionnaire.tsx` — add new component function after `PersonalInfoStep` (after line 2238)

- [ ] **Step 1: Create the ReferralStep component**

Add after the closing `}` of `PersonalInfoStep` (line 2238):

```tsx
function ReferralStep({ formData, updateField, t }: StepProps) {
  const sources = [
    { value: "social", labelKey: "questionnaire.personal.referral.social", icon: Share2 },
    { value: "search_engine", labelKey: "questionnaire.personal.referral.searchEngine", icon: Search },
    { value: "llm", labelKey: "questionnaire.personal.referral.llm", icon: Bot },
    { value: "word_of_mouth", labelKey: "questionnaire.personal.referral.wordOfMouth", icon: Users },
    { value: "belegarzt", labelKey: "questionnaire.personal.referral.belegarzt", icon: Stethoscope },
    { value: "other", labelKey: "questionnaire.personal.referral.other", icon: MoreHorizontal },
  ];

  const handleSourceSelect = (value: string) => {
    updateField("referralSource", value);
    updateField("referralSourceDetail", "");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-11 h-11 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
          <Megaphone className="w-5 h-5 text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold">{t("questionnaire.referral.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("questionnaire.referral.subtitle")}</p>
      </div>

      {/* Icon Grid */}
      <div className="grid grid-cols-2 gap-3 max-w-[360px] mx-auto">
        {sources.map(({ value, labelKey, icon: Icon }) => {
          const isSelected = formData.referralSource === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleSourceSelect(value)}
              data-testid={`referral-card-${value}`}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors cursor-pointer ${
                isSelected
                  ? "border-primary bg-blue-50 dark:bg-blue-900/20"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                isSelected
                  ? "bg-blue-100 dark:bg-blue-800/40"
                  : "bg-slate-100 dark:bg-slate-700"
              }`}>
                <Icon className={`w-5 h-5 ${
                  isSelected ? "text-primary" : "text-slate-600 dark:text-slate-400"
                }`} />
              </div>
              <span className={`text-sm font-medium ${
                isSelected ? "text-primary font-semibold" : "text-slate-700 dark:text-slate-300"
              }`}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-options panel */}
      {formData.referralSource === "social" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t("questionnaire.referral.whichOne")}
          </p>
          <div className="flex flex-wrap gap-2">
            {["facebook", "instagram", "tiktok"].map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => updateField("referralSourceDetail", platform)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border-2 transition-colors ${
                  formData.referralSourceDetail === platform
                    ? "border-primary bg-blue-50 dark:bg-blue-900/20 text-primary font-medium"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                {t(`questionnaire.personal.referral.${platform}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {formData.referralSource === "search_engine" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t("questionnaire.referral.whichOne")}
          </p>
          <div className="flex flex-wrap gap-2">
            {["google", "bing"].map((engine) => (
              <button
                key={engine}
                type="button"
                onClick={() => updateField("referralSourceDetail", engine)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border-2 transition-colors ${
                  formData.referralSourceDetail === engine
                    ? "border-primary bg-blue-50 dark:bg-blue-900/20 text-primary font-medium"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                {t(`questionnaire.personal.referral.${engine}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {formData.referralSource === "word_of_mouth" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <Input
            value={formData.referralSourceDetail}
            onChange={(e) => updateField("referralSourceDetail", e.target.value)}
            placeholder={t("questionnaire.personal.referral.wordOfMouthPlaceholder")}
          />
        </div>
      )}

      {formData.referralSource === "other" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <Input
            value={formData.referralSourceDetail}
            onChange={(e) => updateField("referralSourceDetail", e.target.value)}
            placeholder={t("questionnaire.personal.referral.otherPlaceholder")}
          />
        </div>
      )}

      {/* Skip hint */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5" />
          {t("questionnaire.referral.skipHint")}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npm run check`
Expected: No errors (component defined but not rendered yet).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/PatientQuestionnaire.tsx
git commit -m "feat(questionnaire): create ReferralStep component with icon grid UI"
```

---

### Task 4: Move height/weight and remove referral from PersonalInfoStep

**Files:**
- Modify: `client/src/pages/PatientQuestionnaire.tsx:1992-2238` (PersonalInfoStep)

- [ ] **Step 1: Move height/weight block below date of birth**

In `PersonalInfoStep`, move the height/weight grid (currently at lines 2106-2129, between `<Separator />` markers) to immediately after the date of birth field (after line 2024, before the `<Separator />` at line 2026).

The height/weight block to move:

```tsx
<div className="grid grid-cols-2 gap-4">
  <div>
    <Label htmlFor="height">{t("questionnaire.personal.height")} <span className="text-red-500">*</span></Label>
    <Input
      id="height"
      type="number"
      value={formData.height}
      onChange={(e) => updateField("height", e.target.value)}
      placeholder="170"
      data-testid="input-height"
    />
  </div>
  <div>
    <Label htmlFor="weight">{t("questionnaire.personal.weight")} <span className="text-red-500">*</span></Label>
    <Input
      id="weight"
      type="number"
      value={formData.weight}
      onChange={(e) => updateField("weight", e.target.value)}
      placeholder="70"
      data-testid="input-weight"
    />
  </div>
</div>
```

- [ ] **Step 2: Remove the referral section**

Delete the entire referral section from `PersonalInfoStep` — the block from `<Separator />` (line 2131) through the closing `</RadioGroup>` and `</div>` (lines 2133-2235). This includes the `<Separator />` before it.

- [ ] **Step 3: Verify compilation**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PatientQuestionnaire.tsx
git commit -m "refactor(questionnaire): move height/weight below DOB, remove referral from PersonalInfoStep"
```

---

### Task 5: Update step index rendering and SummaryStep

**Files:**
- Modify: `client/src/pages/PatientQuestionnaire.tsx:1813-1891` (step rendering block)
- Modify: `client/src/pages/PatientQuestionnaire.tsx:3265-3418` (SummaryStep section headers)

- [ ] **Step 1: Add referral case to isStepValid**

In the `isStepValid` function (around line 1506), add a case for the referral step before the `default`:

```typescript
case 'referral':
  return true;
```

- [ ] **Step 2: Insert ReferralStep rendering and shift all step indices**

In the rendering block (currently lines 1813-1891), update all `currentStep === N` conditions. The new block should be:

```tsx
{currentStep === 0 && (
  <PersonalInfoStep formData={formData} updateField={updateField} t={t} />
)}
{currentStep === 1 && (
  <ReferralStep formData={formData} updateField={updateField} t={t} />
)}
{currentStep === 2 && config && (
  <AllergiesStep formData={formData} updateField={updateField} allergyList={config.allergyList} t={t} language={language} onNoneChecked={() => handleAutoAdvance()} />
)}
{currentStep === 3 && config && (
  <ConditionsStep formData={formData} updateField={updateField} conditions={config.conditionsList} t={t} language={language} onNoneChecked={() => handleAutoAdvance()} />
)}
{currentStep === 4 && (
  <MedicationsStep formData={formData} updateField={updateField} t={t} medicationsList={config?.medicationsList} onNoneChecked={() => handleAutoAdvance()} />
)}
{currentStep === 5 && (
  <LifestyleStep formData={formData} updateField={updateField} t={t} onNoneChecked={() => handleAutoAdvance()} />
)}
{currentStep === 6 && (
  <UploadsStep uploads={uploads} uploadError={uploadError} onUpload={handleFileUpload} onDelete={handleDeleteUpload} t={t} />
)}
{currentStep === 7 && (
  <NotesStep formData={formData} updateField={updateField} t={t} />
)}
{currentStep === 8 && (
  <SummaryStep formData={formData} t={t} uploads={uploads} onEditStep={(stepIndex: number) => setCurrentStep(stepIndex)} allergyList={config?.allergyList} conditionsList={config?.conditionsList} language={language} />
)}
{currentStep === 9 && (
  <SubmitStep formData={formData} updateField={updateField} t={t} onOpenSignature={() => setSignatureOpen(true)} />
)}
```

- [ ] **Step 3: Update SummaryStep section header stepIndex values**

In the `SummaryStep` component, update all `stepIndex` values in `SectionHeader` calls (+1 for each):

| Section | Old stepIndex | New stepIndex |
|---------|--------------|---------------|
| Personal Info | 0 | 0 (unchanged) |
| Allergies | 1 | 2 |
| Conditions | 2 | 3 |
| Medications | 3 | 4 |
| Lifestyle | 4 | 5 |
| Documents | 5 | 6 |
| Additional Notes | 6 | 7 |

Also move the referral source display from the Personal Info summary section into its own section for the referral step. Add after the Personal Info section (after line ~3287):

```tsx
{formData.referralSource && (
  <div className="border rounded-lg p-3 space-y-1">
    <SectionHeader title={t("questionnaire.steps.referral")} stepIndex={1} />
    <p className="text-sm text-gray-500">
      {t("questionnaire.summary.referralSource")}: {t(`questionnaire.personal.referral.${
        formData.referralSource === "search_engine" ? "searchEngine" :
        formData.referralSource === "word_of_mouth" ? "wordOfMouth" :
        formData.referralSource
      }`)}{formData.referralSourceDetail && ` — ${
        formData.referralSource === "other" || formData.referralSource === "word_of_mouth"
          ? formData.referralSourceDetail
          : t(`questionnaire.personal.referral.${formData.referralSourceDetail}`)
      }`}
    </p>
  </div>
)}
```

And remove the referral display from inside the Personal Info summary section (the `{formData.referralSource && (...)}` block at lines 3274-3286).

- [ ] **Step 4: Verify compilation**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 5: Visual test**

Run: `npm run dev`
Open the questionnaire, verify:
1. Personal Info shows height/weight right after date of birth
2. No referral question in Personal Info
3. Step 2 shows the referral icon grid
4. Tapping a card selects it with blue highlight
5. Sub-options appear for Social Media, Search Engine, Recommendation, Other
6. Pressing Next without selecting anything skips the step
7. Summary shows referral info in its own section
8. All "Edit" buttons in Summary navigate to the correct step

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/PatientQuestionnaire.tsx
git commit -m "feat(questionnaire): wire up ReferralStep rendering and update step indices"
```

---

### Task 6: Final lint and typecheck

**Files:**
- All changes in: `client/src/pages/PatientQuestionnaire.tsx`

- [ ] **Step 1: Run TypeScript check**

Run: `npm run check`
Expected: Clean pass, no errors.

- [ ] **Step 2: Run dev server and do full walkthrough**

Run: `npm run dev`
Walk through the entire questionnaire end-to-end:
1. Personal Info — height/weight below DOB, no referral section
2. Referral — icon grid displays, selection works, sub-options work, skip works
3. Allergies through Submit — all steps render at correct indices
4. Summary — all "Edit" buttons go to correct steps, referral shows in own section
5. Test in both English and German

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add client/src/pages/PatientQuestionnaire.tsx
git commit -m "fix(questionnaire): address lint/typecheck issues from referral UI redesign"
```
