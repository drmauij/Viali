import { useTranslation } from "react-i18next";
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
  /** When true, the snapshot was computed without an anesthesia pre-op
   *  assessment. The chip renders with a dashed border and a tilde marker. */
  preliminary?: boolean;
}

export function RiskChip({
  grade,
  worstDomain,
  onClick,
  size = "md",
  compact = false,
  insufficient = false,
  preliminary = false,
}: RiskChipProps) {
  const { t } = useTranslation();

  if (compact) {
    const unknown = insufficient || !grade;
    // Preliminary marker doesn't apply to NOT DEFINED — different state.
    const showPreliminary = preliminary && !unknown;
    const baseClass = "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide bg-black/35 text-white whitespace-nowrap shrink-0";
    const borderClass = showPreliminary ? "border border-dashed border-white/60" : "";
    const ariaLabel = showPreliminary ? t("chip.preliminaryTooltip") : undefined;
    return (
      <span
        className={`${baseClass} ${borderClass}`}
        data-testid={`risk-chip-${unknown ? "unknown" : grade}`}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {unknown ? "NOT DEFINED" : `${showPreliminary ? "~" : ""}${GRADE_LABEL_FULL[grade!]}`}
      </span>
    );
  }

  // Full chip — used in headers + popovers.
  // - When insufficient (no inputs at all) or grade is missing, render a
  //   static NOT DEFINED chip — clicking it would show an empty popover.
  // - On a green grade, hide worstDomain (every band is LOW, the "driver"
  //   is just the tiebreaker's first pick and would mislead).
  const unknown = insufficient || !grade;
  if (unknown) {
    const sizeClass = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
    return (
      <span
        className={`inline-flex items-center rounded-full border font-bold tracking-wide ${sizeClass} bg-slate-700/40 text-slate-400 border-slate-600/50 whitespace-nowrap`}
        data-testid="risk-chip-unknown"
      >
        NOT DEFINED
      </span>
    );
  }
  if (grade !== "green" && !worstDomain) return null;
  const suffix = preliminary ? " · ~" : "";
  const text = grade === "green"
    ? `${GRADE_LABEL[grade!]}${suffix}`
    : `${GRADE_LABEL[grade!]} · ${worstDomain!.toUpperCase()}${suffix}`;
  const sizeClass = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  const borderStyle = preliminary ? "border-dashed" : "";
  const ariaLabel = preliminary ? t("chip.preliminaryTooltip") : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold tracking-wide ${sizeClass} ${GRADE_CLASS[grade]} ${borderStyle} ${onClick ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
      data-testid={`risk-chip-${grade}`}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[grade]}`} />
      {text}
    </button>
  );
}
