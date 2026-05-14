import type { RiskGrade, DomainKey } from "@shared/scoring/perioperativeRisk";

const GRADE_LABEL: Record<RiskGrade, string> = { green: "LOW", orange: "MED", red: "HIGH" };
const GRADE_CLASS: Record<RiskGrade, string> = {
  green:  "bg-green-500/20 text-green-300 border-green-500/30",
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  red:    "bg-red-500/25 text-red-200 border-red-500/40",
};
const DOT_CLASS: Record<RiskGrade, string> = { green: "bg-green-500", orange: "bg-orange-500", red: "bg-red-500" };
const DOMAIN_SHORT: Record<DomainKey, string> = {
  cardiac: "CARD", vte: "VTE", pulmonary: "PULM", frailty: "FRAIL", surgery: "SURG",
};

export interface RiskChipProps {
  grade: RiskGrade;
  worstDomain: DomainKey;
  onClick?: () => void;
  size?: "sm" | "md";
  /** Calendar-tile mode: the tile background already conveys grade, so the
   *  chip drops the LOW/MED/HIGH text and dot and shows just the domain. */
  compact?: boolean;
}

export function RiskChip({ grade, worstDomain, onClick, size = "md", compact = false }: RiskChipProps) {
  if (compact) {
    return (
      <span
        className="inline-flex items-center rounded px-1 py-0 text-[9px] font-bold tracking-wide bg-black/30 text-white whitespace-nowrap shrink-0"
        data-testid={`risk-chip-${grade}`}
      >
        {DOMAIN_SHORT[worstDomain]}
      </span>
    );
  }
  const text = `${GRADE_LABEL[grade]} · ${worstDomain.toUpperCase()}`;
  const sizeClass = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold tracking-wide ${sizeClass} ${GRADE_CLASS[grade]} ${onClick ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
      data-testid={`risk-chip-${grade}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[grade]}`} />
      {text}
    </button>
  );
}
