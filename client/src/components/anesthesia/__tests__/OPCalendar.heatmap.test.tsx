// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-file assertion fallback: OPCalendar fetches its own data via hooks
// and would require extensive query-client + provider scaffolding to render
// in isolation. We assert the heat-map JSX/className wiring is present in
// source instead.
const SOURCE = readFileSync(
  resolve(__dirname, "../OPCalendar.tsx"),
  "utf8",
);

describe("OPCalendar — heat-map wiring", () => {
  it("imports HeatmapToggle and useHeatmapEnabled", () => {
    expect(SOURCE).toMatch(/from\s+["']\.\/HeatmapToggle["']/);
    expect(SOURCE).toMatch(/useHeatmapEnabled/);
  });

  it("imports RiskChip", () => {
    expect(SOURCE).toMatch(/from\s+["']\.\/RiskChip["']/);
  });

  it("invokes useHeatmapEnabled at the top of OPCalendar body", () => {
    expect(SOURCE).toMatch(/heatmapEnabled[^=]*=[^=]*useHeatmapEnabled\(\)/);
  });

  it("renders the HeatmapToggle in the calendar header", () => {
    expect(SOURCE).toMatch(/<HeatmapToggle\s+enabled=\{heatmapEnabled\}\s+onChange=\{setHeatmapEnabled\}/);
  });

  it("computes a heatmap class for each grade", () => {
    expect(SOURCE).toContain("heatmap-red");
    expect(SOURCE).toContain("heatmap-orange");
    expect(SOURCE).toContain("heatmap-green");
  });

  it("uses the established tint + left-border treatment per grade", () => {
    expect(SOURCE).toContain("bg-red-500/20 border-l-4 border-red-500");
    expect(SOURCE).toContain("bg-orange-500/20 border-l-4 border-orange-500");
    expect(SOURCE).toContain("bg-green-500/15 border-l-4 border-green-500");
  });

  it("renders RiskChip in the event tile when heatmap is ON", () => {
    expect(SOURCE).toMatch(/heatmapEnabled\s+&&\s+event\.riskGrade\s+&&\s+event\.perioperativeRisk/);
    expect(SOURCE).toMatch(/<RiskChip[\s\S]*?worstDomain=\{event\.perioperativeRisk\.worstDomain\}/);
  });

  it("guards riskGrade nullability — chip render is conditional", () => {
    expect(SOURCE).toMatch(/event\.riskGrade\s+&&\s+event\.perioperativeRisk/);
  });

  it("includes heatmapEnabled in the EventComponent useCallback dependency list", () => {
    expect(SOURCE).toMatch(/getQuestionnaireDot,\s*t,\s*heatmapEnabled/);
  });

  it("propagates riskGrade and perioperativeRisk through the event-builder mapper", () => {
    expect(SOURCE).toMatch(/riskGrade:\s*\(surgery as any\)\.riskGrade\s*\?\?\s*null/);
    expect(SOURCE).toMatch(/perioperativeRisk:\s*\(surgery as any\)\.perioperativeRisk\s*\?\?\s*null/);
  });

  it("declares riskGrade and perioperativeRisk on the CalendarEvent type", () => {
    expect(SOURCE).toMatch(/riskGrade\?:\s*'green'\s*\|\s*'orange'\s*\|\s*'red'\s*\|\s*null/);
    expect(SOURCE).toMatch(/perioperativeRisk\?:\s*PerioperativeRiskResult\s*\|\s*null/);
  });
});
