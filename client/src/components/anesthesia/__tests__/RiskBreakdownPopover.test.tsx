// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskBreakdownPopover } from "../RiskBreakdownPopover";
import type { PerioperativeRiskResult } from "@shared/scoring/perioperativeRisk";

const SAMPLE: PerioperativeRiskResult = {
  domains: {
    cardiac:   { band: "med", score: 2, source: "RCRI" },
    vte:       { band: "low", source: "Caprini" },
    pulmonary: { band: "low", source: "Viali pulmonary v1" },
    frailty:   { band: "med", score: 2, source: "mFI-5", partial: false },
    surgery:   { band: "med", source: "surgeryRiskClass:large" },
  },
  worstDomain: "cardiac",
  ageModifier: 0,
  ageEligible: false,
  ageModifierSuppressed: false,
  grade: "orange",
  drivers: ["Cardiac (RCRI 2 pts, med)", "Large surgery class", "mFI-5 = 2"],
  partial: false,
  inputSource: "assessment",
  calculatedAt: "2026-05-13T08:00:00.000Z",
};

describe("<RiskBreakdownPopover />", () => {
  it("renders all 5 domain rows", () => {
    render(<RiskBreakdownPopover risk={SAMPLE} ambulant={null} />);
    expect(screen.getByText("Cardiac")).toBeTruthy();
    expect(screen.getByText("VTE")).toBeTruthy();
    expect(screen.getByText("Pulmonary")).toBeTruthy();
    expect(screen.getByText("Frailty")).toBeTruthy();
    expect(screen.getByText("Surgery")).toBeTruthy();
  });

  it("shows 'How is this calculated?' link to /risk-methodology", () => {
    render(<RiskBreakdownPopover risk={SAMPLE} ambulant={null} />);
    const link = screen.getByRole("link", { name: /how is this calculated/i });
    expect(link.getAttribute("href")).toBe("/risk-methodology");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders ambulant verdict when provided", () => {
    render(<RiskBreakdownPopover risk={SAMPLE} ambulant={{ decision: "yellow", hardExclusions: [], yellowFactors: ["BMI high"] }} />);
    expect(screen.getByText(/BMI high/)).toBeTruthy();
  });
});

function baseRisk(overrides: Partial<PerioperativeRiskResult> = {}): PerioperativeRiskResult {
  return {
    domains: {
      cardiac:   { band: "low", source: "RCRI 0 pt" },
      vte:       { band: "med", source: "Caprini" },
      pulmonary: { band: "med", source: "smoker + age" },
      frailty:   { band: "low", source: "mFI-5 = 0" },
      surgery:   { band: "low", source: "surgeryRiskClass:minor" },
    },
    worstDomain: "vte",
    ageModifier: 0,
    ageEligible: true,
    ageModifierSuppressed: true,
    grade: "orange",
    drivers: ["VTE (Caprini 3, med)", "Pulmonary (med)"],
    partial: false,
    inputSource: "assessment",
    calculatedAt: "2026-05-14T00:00:00Z",
    ...overrides,
  };
}

describe("RiskBreakdownPopover preliminary + suppressed-bump", () => {
  it("renders the preliminary header when inputSource is 'questionnaire'", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ inputSource: "questionnaire", partial: true })} ambulant={null} />);
    expect(screen.getByText(/preliminary/i)).toBeTruthy();
  });

  it("does NOT render the preliminary header when inputSource is 'assessment'", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ inputSource: "assessment" })} ambulant={null} />);
    expect(screen.queryByText(/preliminary/i)).toBeNull();
  });

  it("renders the suppressed-bump line when ageModifierSuppressed is true", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ ageModifierSuppressed: true, ageModifier: 0 })} ambulant={null} />);
    expect(screen.getByText(/suppressed/i)).toBeTruthy();
  });

  it("renders the existing 'bumped up' line when ageModifier === 1", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ ageModifier: 1, ageModifierSuppressed: false })} ambulant={null} />);
    expect(screen.getByText(/bumped/i)).toBeTruthy();
  });

  it("never renders both age lines together", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ ageModifier: 1, ageModifierSuppressed: false })} ambulant={null} />);
    expect(screen.queryByText(/suppressed/i)).toBeNull();
  });

  it("backwards-compat: snapshot without inputSource but with partial=true → preliminary", () => {
    const r = baseRisk();
    delete (r as any).inputSource;
    r.partial = true;
    render(<RiskBreakdownPopover risk={r} ambulant={null} />);
    expect(screen.getByText(/preliminary/i)).toBeTruthy();
  });
});
