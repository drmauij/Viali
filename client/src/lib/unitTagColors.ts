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
