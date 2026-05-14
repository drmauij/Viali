// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerioperativeRiskHeader } from "../PerioperativeRiskHeader";
import type { PerioperativeRiskResult } from "@shared/scoring/perioperativeRisk";

const RISK: PerioperativeRiskResult = {
  domains: {
    cardiac: { band: "med", score: 2, source: "RCRI" }, vte: { band: "low", source: "Caprini" },
    pulmonary: { band: "low", source: "Viali pulmonary v1" }, frailty: { band: "low", source: "mFI-5", partial: false },
    surgery: { band: "low", source: "surgeryRiskClass:minor" },
  },
  worstDomain: "cardiac", ageModifier: 0, grade: "orange",
  drivers: ["Cardiac (RCRI 2 pts, med)"], partial: false, calculatedAt: "2026-05-13T08:00:00.000Z",
};

describe("<PerioperativeRiskHeader />", () => {
  it("renders patient name + risk chip + meta", () => {
    render(<PerioperativeRiskHeader patientName="Keller, Elias" meta="11.01.1967 · ♂ · Dr. Brooks" surgeryStayType="overnight" risk={RISK} ambulant={null} />);
    expect(screen.getByText("Keller, Elias")).toBeTruthy();
    expect(screen.getByText(/MED · CARDIAC/)).toBeTruthy();
    expect(screen.getByText(/Dr. Brooks/)).toBeTruthy();
  });

  it("renders ambulant sub-line only when stayType is ambulant", () => {
    const { rerender, queryByText } = render(<PerioperativeRiskHeader patientName="K" meta="x" surgeryStayType="overnight" risk={RISK} ambulant={{ decision: "green", hardExclusions: [], yellowFactors: [] }} />);
    expect(queryByText(/Outpatient/i)).toBeNull();
    rerender(<PerioperativeRiskHeader patientName="K" meta="x" surgeryStayType="ambulant" risk={RISK} ambulant={{ decision: "green", hardExclusions: [], yellowFactors: [] }} />);
    expect(queryByText(/Outpatient/i)).toBeTruthy();
  });
});
