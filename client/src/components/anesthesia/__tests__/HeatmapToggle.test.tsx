// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeatmapToggle, useHeatmapEnabled } from "../HeatmapToggle";

describe("HeatmapToggle", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts OFF and toggles ON", () => {
    function Wrap() {
      const { enabled, setEnabled } = useHeatmapEnabled();
      return <HeatmapToggle enabled={enabled} onChange={setEnabled} />;
    }
    render(<Wrap />);
    const btn = screen.getByRole("button", { name: /risk heat-map/i });
    expect(btn.getAttribute("data-state")).toBe("off");
    fireEvent.click(btn);
    expect(btn.getAttribute("data-state")).toBe("on");
    expect(localStorage.getItem("opCalendar.heatmapEnabled")).toBe("true");
  });

  it("reads initial state from localStorage", () => {
    localStorage.setItem("opCalendar.heatmapEnabled", "true");
    function Wrap() {
      const { enabled, setEnabled } = useHeatmapEnabled();
      return <HeatmapToggle enabled={enabled} onChange={setEnabled} />;
    }
    render(<Wrap />);
    expect(
      screen.getByRole("button", { name: /risk heat-map/i }).getAttribute("data-state"),
    ).toBe("on");
  });
});
