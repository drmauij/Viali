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
