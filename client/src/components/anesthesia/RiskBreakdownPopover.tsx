import type { PerioperativeRiskResult, DomainKey } from "@shared/scoring/perioperativeRisk";

const DOMAIN_LABEL: Record<DomainKey, string> = {
  cardiac: "Cardiac", vte: "VTE", pulmonary: "Pulmonary", frailty: "Frailty", surgery: "Surgery",
};
const BAND_DOT: Record<string, string> = { low: "bg-green-500", med: "bg-orange-500", high: "bg-red-500" };

export interface AmbulantSummary {
  decision: "green" | "yellow" | "red";
  hardExclusions: string[];
  yellowFactors: string[];
}

export interface RiskBreakdownPopoverProps {
  risk: PerioperativeRiskResult;
  ambulant: AmbulantSummary | null;
}

export function RiskBreakdownPopover({ risk, ambulant }: RiskBreakdownPopoverProps) {
  return (
    <div className="w-80 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl">
      <div className="text-xs font-semibold text-slate-400 mb-2">DOMAINS</div>
      <div className="space-y-1.5 mb-3">
        {(Object.keys(risk.domains) as DomainKey[]).map((k) => (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${BAND_DOT[risk.domains[k].band]}`} />
              {DOMAIN_LABEL[k]}
            </span>
            <span className="text-slate-400 font-mono uppercase">{risk.domains[k].band}</span>
          </div>
        ))}
      </div>
      {risk.ageModifier === 1 && (
        <div className="text-[11px] text-amber-300 mb-2">Age ≥ 75 — bumped up one band</div>
      )}
      {risk.drivers.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-slate-400 mb-1">DRIVERS</div>
          <ul className="text-xs space-y-0.5">
            {risk.drivers.map((d, i) => <li key={i}>• {d}</li>)}
          </ul>
        </div>
      )}
      {ambulant && (
        <div className="mb-3 pt-2 border-t border-slate-700">
          <div className="text-xs font-semibold text-slate-400 mb-1">OUTPATIENT</div>
          <div className="text-xs">
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${ambulant.decision === "green" ? "bg-green-500" : ambulant.decision === "yellow" ? "bg-amber-500" : "bg-red-500"}`} />
            {ambulant.decision === "green" ? "Eligible" : ambulant.decision === "yellow" ? "Review recommended" : "Not eligible"}
            {[...ambulant.hardExclusions, ...ambulant.yellowFactors].length > 0 && (
              <span className="text-slate-400"> — {[...ambulant.hardExclusions, ...ambulant.yellowFactors].join(" · ")}</span>
            )}
          </div>
        </div>
      )}
      <a href="/risk-methodology" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
        How is this calculated? →
      </a>
    </div>
  );
}
