# Referral UI Redesign — Design Spec

## Problem

The pre-op questionnaire includes a "How did you hear about us?" referral question buried at the bottom of the Personal Info step. Despite being optional to avoid friction, zero patients have filled it out. The referral data is important for tracking marketing channels and referral promotions.

## Goals

1. Increase referral completion rate without making the field mandatory
2. Make the referral question visually engaging and easy to interact with
3. Keep it skippable — zero friction for patients who don't want to answer
4. Additionally: move height/weight fields to immediately below date of birth in Personal Info

## Design

### Change 1: Move height/weight in Personal Info

Move the height/weight grid from its current position (below address fields, above referral section) to **immediately below the date of birth field**, before the separator that precedes email/phone.

**New Personal Info field order:**
1. First Name, Last Name (required)
2. Date of Birth (required)
3. Height, Weight (required)
4. *Separator*
5. Email (optional), Phone (required)
6. SMS Consent (conditional on phone)
7. Address: Street, Postal Code, City (optional)

The referral section is **removed entirely** from Personal Info.

### Change 2: New "Referral Source" wizard step

**Position in wizard:** Step 2 of 10 (currently 9 steps; adding referral makes 10). Inserted after Personal Info (index 0), before Allergies. All hardcoded step indices in the rendering block and SummaryStep "Edit" buttons shift by +1.

**Step definition:**
```typescript
{ id: "referral", icon: Megaphone, labelKey: "questionnaire.steps.referral" }
```

**New icon imports needed:** `Megaphone`, `Share2`, `Search`, `Bot`, `Users`, `Stethoscope`, `MoreHorizontal` from `lucide-react`.

**Step validation:** Always returns `true` (everything is optional). The step is always "completable" — pressing Next without selecting anything is the skip mechanism.

**Selection behavior:** Tapping a card selects it (single-select, no toggle/deselect). Tapping a different card switches the selection and clears `referralSourceDetail`. This matches the current radio group behavior.

#### Layout

**Header area (centered):**
- Icon: `Megaphone` in a blue-tinted rounded container (44×44px, `bg-blue-50`, `rounded-xl`)
- Title: "How did you hear about us?" (translated)
- Subtitle: "Tap one — you can always skip this" (translated, muted color)

**Selection grid:**
- 2-column CSS grid, `gap-3`, max-width constrained (~360px), centered
- 6 option cards, each containing:
  - Lucide icon in a soft gray container (40×40px, `bg-slate-100`, `rounded-lg`)
  - Label text below the icon (13px, medium weight)

**Option cards:**

| Value | Label | Icon | Sub-options |
|-------|-------|------|-------------|
| `social` | Social Media | `Share2` | Pills: Facebook, Instagram, TikTok |
| `search_engine` | Search Engine | `Search` | Pills: Google, Bing |
| `llm` | AI Assistant | `Bot` | None |
| `word_of_mouth` | Recommendation | `Users` | Text input: "Recommended by..." |
| `belegarzt` | My Doctor | `Stethoscope` | None |
| `other` | Other | `MoreHorizontal` | Text input: "Please specify..." |

**Card states:**
- **Default:** `border-2 border-slate-200 rounded-xl bg-white` — icon in `text-slate-600`
- **Selected:** `border-2 border-primary rounded-xl bg-blue-50` — icon in `text-primary`, label in `text-primary font-semibold`
- **Hover:** subtle background shift (`hover:bg-slate-50`)

**Sub-options panel:**
- Appears below the grid when a source with sub-options is selected
- Contained in a card: `border rounded-xl p-3 bg-white`
- Header: "Which one?" (uppercase, small, muted — translated)
- **Pills** (for Social Media and Search Engine): inline-flex buttons with icon + label, same selected/default styling as main cards but smaller (pill-shaped, `rounded-lg`)
- **Text input** (for Recommendation and Other): standard `Input` component with placeholder text

**Skip hint (bottom, centered):**
- Muted text: "Press Next to skip"
- Small arrow icon (`ChevronRight`)

**Test IDs:** Add `data-testid` attributes: `referral-card-social`, `referral-card-search_engine`, `referral-card-llm`, `referral-card-word_of_mouth`, `referral-card-belegarzt`, `referral-card-other`.

### Change 3: No data model changes

The existing database fields are reused as-is:
- `referralSource: varchar` — stores: `social`, `search_engine`, `llm`, `word_of_mouth`, `belegarzt`, `other`
- `referralSourceDetail: varchar` — stores: `facebook`, `instagram`, `tiktok`, `google`, `bing`, or free text

No schema migration needed. Server validation unchanged (both fields optional strings).

### Change 4: Translations

Add new translation keys for all 5 languages (en, de, it, es, fr):
- `questionnaire.steps.referral` — step label in sidebar
- `questionnaire.referral.title` — "How did you hear about us?"
- `questionnaire.referral.subtitle` — "Tap one — you can always skip this"
- `questionnaire.referral.whichOne` — "Which one?"
- `questionnaire.referral.skipHint` — "Press Next to skip"

Existing translation keys under `questionnaire.personal.referral.*` are reused for option labels, platform names, and placeholders — no namespace change needed.

### Change 5: Step index updates (critical)

The rendering block uses hardcoded `currentStep === N` checks (lines 1813-1891). After inserting `referral` at index 1:

| Step | Old index | New index |
|------|-----------|-----------|
| personal | 0 | 0 |
| **referral** | — | **1** |
| allergies | 1 | 2 |
| conditions | 2 | 3 |
| medications | 3 | 4 |
| lifestyle | 4 | 5 |
| uploads | 5 | 6 |
| notes | 6 | 7 |
| summary | 7 | 8 |
| submit | 8 | 9 |

The `SummaryStep` component has hardcoded `stepIndex` values in `SectionHeader` "Edit" buttons (lines 3265-3418). These **must** all shift by +1.

### What stays the same

- **Summary step:** Still displays referral info using the same formatting (now from its own step instead of personal info)
- **QuestionnaireTab (staff view):** Unchanged — reads the same DB fields
- **Server validation:** Both fields remain optional strings
- **completedSteps logic:** The referral step follows the same pattern — pressing Next marks it completed even if skipped (acceptable: shows progress)

## Files to modify

1. `client/src/pages/PatientQuestionnaire.tsx`:
   - Add new icon imports (`Megaphone`, `Share2`, `Search`, `Bot`, `Users`, `Stethoscope`, `MoreHorizontal`)
   - Insert `referral` step into `STEPS` array at index 1
   - Create `ReferralStep` component with icon grid UI
   - Move height/weight fields in `PersonalInfoStep` to below date of birth
   - Remove referral section from `PersonalInfoStep`
   - Update all `currentStep === N` checks in the rendering block (+1 for indices 1-8)
   - Insert `ReferralStep` rendering at `currentStep === 1`
   - Update all `SummaryStep` "Edit" button `stepIndex` values (+1 for all)
   - Add `case 'referral': return true` to `isStepValid` (for clarity, though `default` already returns `true`)
   - Add translation keys to all 5 language blocks
2. No backend changes needed
3. No schema changes needed
