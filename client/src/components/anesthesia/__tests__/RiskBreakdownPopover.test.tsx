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
