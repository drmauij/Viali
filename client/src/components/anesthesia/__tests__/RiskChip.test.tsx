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

  it("renders 'LOW' (no domain) for grade green — domain is just tiebreaker noise when nothing is elevated", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" />);
    const chip = screen.getByTestId("risk-chip-green");
    expect(chip.textContent?.trim()).toBe("LOW");
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

describe("RiskChip green grade hides worstDomain", () => {
  it("green + preliminary renders 'LOW · ~' (no domain, tilde only)", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-green");
    expect(chip.textContent).toContain("LOW");
    expect(chip.textContent).toContain("~");
    expect(chip.textContent?.toUpperCase()).not.toContain("CARDIAC");
  });

  it("orange grade still renders the worstDomain suffix", () => {
    render(<RiskChip grade="orange" worstDomain="vte" />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.textContent).toContain("MED");
    expect(chip.textContent?.toUpperCase()).toContain("VTE");
  });

  it("red grade still renders the worstDomain suffix", () => {
    render(<RiskChip grade="red" worstDomain="cardiac" />);
    const chip = screen.getByTestId("risk-chip-red");
    expect(chip.textContent).toContain("HIGH");
    expect(chip.textContent?.toUpperCase()).toContain("CARDIAC");
  });
});

describe("RiskChip full-mode insufficient renders NOT DEFINED", () => {
  it("insufficient=true in full mode renders NOT DEFINED (not LOW)", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" insufficient={true} />);
    const chip = screen.getByTestId("risk-chip-unknown");
    expect(chip.textContent).toBe("NOT DEFINED");
  });

  it("insufficient=true in full mode renders a static span, not a button", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" insufficient={true} onClick={() => {}} />);
    const chip = screen.getByTestId("risk-chip-unknown");
    expect(chip.tagName.toLowerCase()).toBe("span");
  });

  it("insufficient=true overrides preliminary in full mode too", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" insufficient={true} preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-unknown");
    expect(chip.textContent).toBe("NOT DEFINED");
    expect(chip.className).not.toContain("border-dashed");
  });
});
