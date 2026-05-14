// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskChip } from "../RiskChip";

describe("<RiskChip />", () => {
  it("renders 'MED · CARDIAC' for grade orange + worstDomain cardiac", () => {
    render(<RiskChip grade="orange" worstDomain="cardiac" />);
    expect(screen.getByText(/MED · CARDIAC/)).toBeTruthy();
  });

  it("renders 'HIGH · FRAILTY' for grade red + worstDomain frailty", () => {
    render(<RiskChip grade="red" worstDomain="frailty" />);
    expect(screen.getByText(/HIGH · FRAILTY/)).toBeTruthy();
  });

  it("renders 'LOW · CARDIAC' for grade green + worstDomain cardiac", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" />);
    expect(screen.getByText(/LOW · CARDIAC/)).toBeTruthy();
  });

  it("applies the correct color class for each grade", () => {
    const { rerender, container } = render(<RiskChip grade="green" worstDomain="cardiac" />);
    expect(container.querySelector(".bg-green-500\\/20")).toBeTruthy();
    rerender(<RiskChip grade="orange" worstDomain="cardiac" />);
    expect(container.querySelector(".bg-orange-500\\/20")).toBeTruthy();
    rerender(<RiskChip grade="red" worstDomain="cardiac" />);
    expect(container.querySelector(".bg-red-500\\/25")).toBeTruthy();
  });

  it("in compact mode, renders the abbreviated worst-domain only (no LOW/MED/HIGH)", () => {
    render(<RiskChip grade="orange" worstDomain="surgery" compact />);
    expect(screen.getByText("SURG")).toBeTruthy();
    expect(screen.queryByText(/MED · SURGERY/)).toBeNull();
  });

  it("in compact mode, maps each domain to a short label", () => {
    const { rerender } = render(<RiskChip grade="red" worstDomain="cardiac" compact />);
    expect(screen.getByText("CARD")).toBeTruthy();
    rerender(<RiskChip grade="red" worstDomain="pulmonary" compact />);
    expect(screen.getByText("PULM")).toBeTruthy();
    rerender(<RiskChip grade="red" worstDomain="frailty" compact />);
    expect(screen.getByText("FRAIL")).toBeTruthy();
    rerender(<RiskChip grade="red" worstDomain="vte" compact />);
    expect(screen.getByText("VTE")).toBeTruthy();
  });
});
