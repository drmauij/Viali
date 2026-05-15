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

  it("in compact mode, renders the explicit grade label", () => {
    const { rerender } = render(<RiskChip grade="green" worstDomain="cardiac" compact />);
    expect(screen.getByText("LOW")).toBeTruthy();
    rerender(<RiskChip grade="orange" worstDomain="cardiac" compact />);
    expect(screen.getByText("MEDIUM")).toBeTruthy();
    rerender(<RiskChip grade="red" worstDomain="cardiac" compact />);
    expect(screen.getByText("HIGH")).toBeTruthy();
  });

  it("in compact mode with insufficient=true, renders NOT DEFINED", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" compact insufficient />);
    expect(screen.getByText("NOT DEFINED")).toBeTruthy();
    expect(screen.queryByText("LOW")).toBeNull();
  });

  it("in compact mode with no grade, renders NOT DEFINED", () => {
    render(<RiskChip compact />);
    expect(screen.getByText("NOT DEFINED")).toBeTruthy();
  });
});

describe("RiskChip preliminary state", () => {
  it("preliminary=false renders solid border and no tilde suffix", () => {
    render(<RiskChip grade="orange" worstDomain="vte" preliminary={false} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.className).not.toContain("border-dashed");
    expect(chip.textContent).not.toContain("~");
  });

  it("preliminary=true renders dashed border and ' · ~' suffix", () => {
    render(<RiskChip grade="orange" worstDomain="vte" preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.className).toContain("border-dashed");
    expect(chip.textContent).toContain("~");
  });

  it("preliminary=true sets aria-label to the preliminary tooltip", () => {
    render(<RiskChip grade="orange" worstDomain="vte" preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.getAttribute("aria-label")).toMatch(/preliminary/i);
  });

  it("compact + preliminary renders dashed wrapper and leading tilde", () => {
    render(<RiskChip grade="orange" compact={true} preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.className).toContain("border-dashed");
    expect(chip.textContent?.trim().startsWith("~")).toBe(true);
  });

  it("insufficient overrides preliminary — NOT DEFINED has no marker", () => {
    render(<RiskChip compact={true} insufficient={true} preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-unknown");
    expect(chip.className).not.toContain("border-dashed");
    expect(chip.textContent).toBe("NOT DEFINED");
  });
});
