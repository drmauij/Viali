import { useState } from "react";
import { RiskChip } from "./RiskChip";
import { RiskBreakdownPopover, type AmbulantSummary } from "./RiskBreakdownPopover";
import type { PerioperativeRiskResult } from "@shared/scoring/perioperativeRisk";
import { isPreliminary } from "@shared/scoring/perioperativeRisk";

export interface PerioperativeRiskHeaderProps {
  patientName: string;
  meta: string;
  surgeryStayType: "ambulant" | "overnight" | null | undefined;
  risk: PerioperativeRiskResult | null | undefined;
  ambulant: AmbulantSummary | null;
}

export function PerioperativeRiskHeader({ patientName, meta, surgeryStayType, risk, ambulant }: PerioperativeRiskHeaderProps) {
  const [open, setOpen] = useState(false);
  const showAmbulant = surgeryStayType === "ambulant" && ambulant;
  return (
    <div className="relative">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="font-semibold text-lg">{patientName}</h3>
        {risk && <RiskChip grade={risk.grade} worstDomain={risk.worstDomain} preliminary={isPreliminary(risk)} onClick={() => setOpen((v) => !v)} />}
      </div>
      <div className="text-xs text-slate-400 mt-0.5">{meta}</div>
      {showAmbulant && (
        <div className="text-xs mt-1.5 text-slate-300">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-2">Outpatient</span>
          <span className={ambulant.decision === "green" ? "text-green-400" : ambulant.decision === "yellow" ? "text-amber-400" : "text-red-400"}>●</span>{" "}
          {ambulant.decision === "green" ? "Eligible" : ambulant.decision === "yellow" ? "Review recommended" : "Not eligible"}
          {[...ambulant.hardExclusions, ...ambulant.yellowFactors].length > 0 && (
            <span className="text-slate-400"> — {[...ambulant.hardExclusions, ...ambulant.yellowFactors].join(", ")}</span>
          )}
        </div>
      )}
      {open && risk && (
        <div className="absolute z-10 top-full mt-2 left-0">
          <RiskBreakdownPopover risk={risk} ambulant={ambulant} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
