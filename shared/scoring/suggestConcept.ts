// Heuristic concept suggester. Looks at illness item id + label + translations
// and proposes a ScoringConcept. Used by the admin UI to pre-fill suggestions
// for clinic-customized illness lists; the admin must confirm before scoring
// reads the concept.

import type { ScoringConcept } from "./concepts";

type Suggestable = {
  id?: string;
  label?: string;
  labelTranslations?: Record<string, string> | null;
};

type Pattern = RegExp;

// Patterns are matched against `id`, `label`, and all values of `labelTranslations`,
// after lowercasing and stripping diacritics. Order in this table = priority order;
// the first match wins, so list more specific concepts before more generic ones.
const PATTERNS: ReadonlyArray<readonly [ScoringConcept, Pattern[]]> = [
  // --- Specific stroke flavors (must precede generic STROKE_HISTORY) ---
  ["RECENT_STROKE_30D", [
    /\brecent\s+stroke\b/i,
    /\bstroke\s+(within|in\s+the\s+last)\s*30\s*(d|day)/i,
    /\bschlaganfall\s+(<\s*30|in\s+den\s+letzten\s+30)/i,
    /\bacute\s+stroke\b/i,
  ]],
  ["STROKE_HISTORY", [
    /\bstroke\b/i,
    /\bcva\b/i,
    /\btia\b/i,
    /\bcerebrovasc/i,
    /\bschlaganfall\b/i,
    /\bapoplex/i,
    /\binsult\b/i,
  ]],

  // --- Cardiovascular ---
  ["HYPERTENSION", [
    /\bhypertens/i,
    /\bhtn\b/i,
    /\bhochdruck\b/i,
    /\bbluthochdruck\b/i,
    /\barterielle?\s+hypertonie/i,
    /\baht\b/i,
  ]],
  ["CAD", [
    /\bcoronary\s+(artery|heart)\s+disease\b/i,
    /\bcoronary\s+heart\b/i,
    /\bcad\b/i,
    /\bchd\b/i,
    /\bkhk\b/i,
    /\bkoronar/i,
    /\bischemic\s+heart\b/i,
    /\bischaemic\s+heart\b/i,
    /\bischaemische\s+herzerkrank/i,
    /\bmyocardial\s+infarct/i,
    /\bmyokardinfarkt\b/i,
    /\bherzinfarkt\b/i,
    /\bangina\b/i,
  ]],
  ["CHF", [
    /\bcongestive\s+heart\s+failure\b/i,
    /\bheart\s+failure\b/i,
    /\bchf\b/i,
    /\bherzinsuffizienz\b/i,
    /\bherzversagen\b/i,
    /\bnyha\b/i,
  ]],

  // --- Caprini risk modifiers (must precede generic VTE) ---
  ["FAMILY_THROMBOPHILIA", [
    /\bfamil[a-z]*\s+(thrombo|hypercoag)/i,
    /\bfamilien[a-z]*\s*(thrombo|hypercoag)/i,
    /\bhereditary\s+thrombophilia/i,
    /\bfaktor\s*v\s*leiden/i,
    /\bfactor\s*v\s*leiden/i,
  ]],
  ["VTE_HISTORY", [
    /\bvte\b/i,
    /\bvenous\s+thrombo/i,
    /\bvenose?\s+thrombo/i,
    /\bdvt\b/i,
    /\bdeep\s+vein\s+thrombosis\b/i,
    /\btiefe?\s+(bein)?venenthrombose\b/i,
    /\bpulmonary\s+embol/i,
    /\blungenembol/i,
    /\bpulmonalembolie\b/i,
    /\bthrombosis\s+history\b/i,
    /\bthromboembol/i,
    /\bthromboembolie\b/i,
  ]],

  // --- Metabolic ---
  ["INSULIN_DIABETES", [
    /\binsulin.?(dependent|abhangig|abhängig|pflichtig)/i,
    /\bdiabetes\s+(mellitus\s+)?(type\s*)?(i|1)\b/i,
    /\biddm\b/i,
    /\btyp\s*1\s*diabet/i,
    /\binsulin\s*diabet/i,
    /\bdiabet.*insulin/i,
  ]],

  // --- Renal ---
  ["CKD_OR_DIALYSIS", [
    /\bckd\b/i,
    /\bchronic\s+kidney\b/i,
    /\bdialysis\b/i,
    /\bdialyse\b/i,
    /\bniereninsuffizienz\b/i,
    /\bchronische?\s+nierenerkrank/i,
    /\bend.?stage\s+renal\b/i,
    /\besrd\b/i,
  ]],

  // --- Oncology ---
  ["ACTIVE_CANCER", [
    /\bactive\s+(cancer|malignancy)\b/i,
    /\baktiv.{0,5}(krebs|malignom|tumor)/i,
    /\bmalignancy\b/i,
    /\bmalignom\b/i,
    /\bkrebserkrankung\s+aktiv/i,
    /\bchemotherapy\b/i,
    /\bchemotherapie\s+(aktiv|laufend)/i,
    /\bonkologisch\s+aktiv/i,
  ]],

  // --- Coagulation modifiers ---
  ["LEG_SWELLING", [
    /\bleg\s+swelling\b/i,
    /\bbeinschwellung\b/i,
    /\boedema?\s+(of\s+)?(the\s+)?legs\b/i,
    /\bbein.?odem/i,
    /\blymphedema\b/i,
    /\blymphodem/i,
  ]],
  ["VARICOSE_VEINS", [
    /\bvaricose\s+vein/i,
    /\bkrampfader/i,
    /\bvarizen\b/i,
    /\bvarikose\b/i,
  ]],

  // --- Reproductive ---
  ["PREGNANCY_OR_POSTPARTUM", [
    /\bpregnan/i,
    /\bpostpartum\b/i,
    /\bschwangerschaft\b/i,
    /\bschwanger\b/i,
    /\bpost.?partal/i,
    /\bwochenbett\b/i,
  ]],
  ["OC_OR_HRT", [
    /\boral\s+contracept/i,
    /\bocp?\b/i,
    /\bhormone?\s+replacement\b/i,
    /\bhrt\b/i,
    /\bpille\b/i,
    /\bantibabypille\b/i,
    /\bantikonzep/i,
    /\bhormonersatz/i,
  ]],

  // --- Pulmonary ---
  ["COPD", [
    /\bcopd\b/i,
    /\bchronic\s+obstructive\b/i,
    /\bchronisch.?obstruktiv/i,
    /\bcopd\b/i,
    /\bemphysema\b/i,
    /\bemphysem\b/i,
  ]],
  ["KNOWN_UNTREATED_OSAS", [
    /\buntreated\s+(osa|osas|sleep\s+apnea)/i,
    /\bunbehandelte?\s+(osa|osas|schlafapnoe)/i,
    /\bknown\s+(osa|osas)\s+(no|without)\s+cpap/i,
    /\bosa\s+without\s+cpap/i,
    /\bschlafapnoe\s+(ohne|unbehandelt)/i,
  ]],

  // --- Neuro (kept after stroke flavors) ---
  ["SPINAL_CORD_INJURY", [
    /\bspinal\s+cord\s+injur/i,
    /\bquerschnitt/i,
    /\brückenmarks?verletzung/i,
    /\bruckenmarks?verletzung/i,
    /\bparapleg/i,
    /\btetrapleg/i,
  ]],

  // --- PONV ---
  ["PONV_HISTORY", [
    /\bponv\b/i,
    /\bpost\s*\.?\s*op[a-z]*\s+nausea/i,
    /\bnausea[\s\/]+vomit/i,
    /\bnausea\s+(and|&)\s+vomit/i,
    /\bpost\s*op[a-z]*\s+ubelkeit/i,
    /\bpost\s*op[a-z]*\s+übelkeit/i,
    /\bubelkeit\s+nach\s+narkose/i,
    /\bübelkeit\s+nach\s+narkose/i,
    /\bmotion\s+sickness\b/i,
    /\breisekrankheit\b/i,
    /\bkinetose\b/i,
  ]],
];

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function suggestConcept(item: Suggestable): ScoringConcept | null {
  const haystacks: string[] = [];
  if (item.id) haystacks.push(item.id);
  if (item.label) haystacks.push(item.label);
  if (item.labelTranslations) {
    for (const v of Object.values(item.labelTranslations)) {
      if (typeof v === "string") haystacks.push(v);
    }
  }
  if (haystacks.length === 0) return null;

  // Normalize once for ID-style matches (camelCase, snake_case) — split words.
  const normalized = haystacks
    .map((h) => normalize(h).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-]+/g, " "))
    .join(" | ");

  for (const [concept, patterns] of PATTERNS) {
    for (const p of patterns) {
      if (p.test(normalized)) return concept;
    }
  }
  return null;
}
