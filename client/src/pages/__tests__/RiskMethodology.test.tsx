// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskMethodology } from "../RiskMethodology";

describe("/risk-methodology", () => {
  it("renders all 5 domain sections", () => {
    render(<RiskMethodology />);
    expect(screen.getByRole("heading", { name: /cardiac/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /VTE/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /pulmonary/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /frailty/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /surgery/i })).toBeTruthy();
  });

  it("renders version footer", () => {
    render(<RiskMethodology />);
    expect(screen.getByText(/Methodology v1/)).toBeTruthy();
  });
});

describe("RiskMethodology — How calculated section", () => {
  it("renders the 'How the final grade is calculated' heading", () => {
    render(<RiskMethodology />);
    expect(screen.getByTestId("how-calculated-section")).toBeTruthy();
  });

  it("renders all four worked example titles", () => {
    render(<RiskMethodology />);
    expect(screen.getByTestId("example-a")).toBeTruthy();
    expect(screen.getByTestId("example-b")).toBeTruthy();
    expect(screen.getByTestId("example-c")).toBeTruthy();
    expect(screen.getByTestId("example-d")).toBeTruthy();
  });

  it("still renders the five domain sections (regression)", () => {
    render(<RiskMethodology />);
    expect(screen.getAllByText(/RCRI/i).length).toBeGreaterThan(0);        // cardiac
    expect(screen.getAllByText(/Caprini/i).length).toBeGreaterThan(0);     // vte
    expect(screen.getAllByText(/Viali pulmonary/i).length).toBeGreaterThan(0); // pulmonary
    expect(screen.getAllByText(/mFI-5/i).length).toBeGreaterThan(0);       // frailty (in body text)
    expect(screen.getAllByText(/Surgery weight/i).length).toBeGreaterThan(0); // surgery
  });
});
