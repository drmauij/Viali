import type { RiskGrade, DomainKey } from "@shared/scoring/perioperativeRisk";

const GRADE_LABEL: Record<RiskGrade, string> = { green: "LOW", orange: "MED", red: "HIGH" };
const GRADE_LABEL_FULL: Record<RiskGrade, string> = { green: "LOW", orange: "MEDIUM", red: "HIGH" };
const GRADE_CLASS: Record<RiskGrade, string> = {
  green:  "bg-green-500/20 text-green-300 border-green-500/30",
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  red:    "bg-red-500/25 text-red-200 border-red-500/40",
};
const DOT_CLASS: Record<RiskGrade, string> = { green: "bg-green-500", orange: "bg-orange-500", red: "bg-red-500" };

export interface RiskChipProps {
  grade?: RiskGrade | null;
  worstDomain?: DomainKey;
  onClick?: () => void;
  size?: "sm" | "md";
  /** Calendar-tile mode: tile background conveys grade, so the chip is a
   *  compact pill showing the explicit grade label (LOW / MEDIUM / HIGH /
   *  NOT DEFINED). Use insufficient=true to render the gray NOT DEFINED state. */
  compact?: boolean;
  /** When true (or when grade is missing), the chip renders NOT DEFINED. */
  insufficient?: boolean;
}

export function RiskChip({ grade, worstDomain, onClick, size = "md", compact = false, insufficient = false }: RiskChipProps) {
  if (compact) {
    const unknown = insufficient || !grade;
    return (
      <span
        className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide bg-black/35 text-white whitespace-nowrap shrink-0"
        data-testid={`risk-chip-${unknown ? "unknown" : grade}`}
      >
        {unknown ? "NOT DEFINED" : GRADE_LABEL_FULL[grade!]}
      </span>
    );
  }
  // Full chip — used in headers + popovers. Requires grade + worstDomain.
  if (!grade || !worstDomain) return null;
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
