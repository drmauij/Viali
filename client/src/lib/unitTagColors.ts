import type { UnitType } from "./moduleVisibility";

export type TagKey =
  | "anesthesia"
  | "or"
  | "clinic"
  | "business"
  | "logistic"
  | "platform"
  | "public";

export interface TagToken {
  bg: string;
  text: string;
  ring: string;
}

// Tailwind classes — referenced as plain strings so Tailwind picks them up.
export const UNIT_TAG_COLORS: Record<TagKey, TagToken> = {
  anesthesia: { bg: "bg-rose-400",   text: "text-rose-300",   ring: "ring-rose-400/30" },
  or:         { bg: "bg-sky-400",    text: "text-sky-300",    ring: "ring-sky-400/30" },
  clinic:     { bg: "bg-emerald-400",text: "text-emerald-300",ring: "ring-emerald-400/30" },
  business:   { bg: "bg-amber-400",  text: "text-amber-300",  ring: "ring-amber-400/30" },
  logistic:   { bg: "bg-teal-400",   text: "text-teal-300",   ring: "ring-teal-400/30" },
  platform:   { bg: "bg-violet-400", text: "text-violet-300", ring: "ring-violet-400/30" },
  public:     { bg: "bg-zinc-500",   text: "text-zinc-400",   ring: "ring-zinc-500/30" },
};

export function unitTagClass(unitType: UnitType | string | null | undefined): string {
  switch (unitType) {
    case "anesthesia": return UNIT_TAG_COLORS.anesthesia.bg;
    case "or":         return UNIT_TAG_COLORS.or.bg;
    case "clinic":     return UNIT_TAG_COLORS.clinic.bg;
    case "business":   return UNIT_TAG_COLORS.business.bg;
    case "logistic":   return UNIT_TAG_COLORS.logistic.bg;
    default:           return UNIT_TAG_COLORS.public.bg;
  }
}

// Literal before:bg-* classes for Tailwind JIT (runtime interpolation breaks scanning).
// Keep every value as a complete, unbroken class string so the scanner sees them.
export const RAIL_BEFORE: Record<TagKey, string> = {
  anesthesia: "before:bg-rose-400",
  or:         "before:bg-sky-400",
  clinic:     "before:bg-emerald-400",
  business:   "before:bg-amber-400",
  logistic:   "before:bg-teal-400",
  platform:   "before:bg-violet-400",
  public:     "before:bg-zinc-500",
};

// Soft tinted background used for the per-unit card in the Modules dropdown.
// Keep as complete class strings for Tailwind JIT — runtime interpolation
// breaks the scanner.
export const UNIT_CARD_BG: Record<TagKey, string> = {
  anesthesia: "bg-rose-400/10",
  or:         "bg-sky-400/10",
  clinic:     "bg-emerald-400/10",
  business:   "bg-amber-400/10",
  logistic:   "bg-teal-400/10",
  platform:   "bg-violet-400/10",
  public:     "bg-zinc-500/10",
};

export function unitCardClass(unitType: UnitType | string | null | undefined): string {
  switch (unitType) {
    case "anesthesia": return UNIT_CARD_BG.anesthesia;
    case "or":         return UNIT_CARD_BG.or;
    case "clinic":     return UNIT_CARD_BG.clinic;
    case "business":   return UNIT_CARD_BG.business;
    case "logistic":   return UNIT_CARD_BG.logistic;
    default:           return UNIT_CARD_BG.public;
  }
}

export function unitRailBeforeClass(unitType: UnitType | string | null | undefined): string {
  switch (unitType) {
    case "anesthesia": return RAIL_BEFORE.anesthesia;
    case "or":         return RAIL_BEFORE.or;
    case "clinic":     return RAIL_BEFORE.clinic;
    case "business":   return RAIL_BEFORE.business;
    case "logistic":   return RAIL_BEFORE.logistic;
    default:           return RAIL_BEFORE.public;
  }
}
