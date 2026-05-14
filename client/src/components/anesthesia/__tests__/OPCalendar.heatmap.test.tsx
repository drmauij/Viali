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

  it("applies a left-border accent per grade on the event tile inner wrapper", () => {
    expect(SOURCE).toContain("border-l-4 border-red-500");
    expect(SOURCE).toContain("border-l-4 border-orange-500");
    expect(SOURCE).toContain("border-l-4 border-green-500");
  });

  it("overrides the event tile background with the risk color in eventStyleGetter", () => {
    expect(SOURCE).toMatch(/heatmapEnabled\s*&&\s*event\.riskGrade\s*&&[\s\S]*?event\.riskGrade\s*===\s*'red'/);
    expect(SOURCE).toMatch(/heatmapEnabled[\s\S]*?\[heatmapEnabled\]/);
  });

  it("renders a compact RiskChip inline with the title when heatmap is ON", () => {
    expect(SOURCE).toMatch(/heatmapEnabled\s+&&\s+event\.riskGrade\s+&&\s+event\.perioperativeRisk/);
    expect(SOURCE).toMatch(/<RiskChip[\s\S]*?worstDomain=\{event\.perioperativeRisk\.worstDomain\}[\s\S]*?compact/);
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

describe("OPCalendar — month-view micro-dots", () => {
  it("renders heatmap-month-dot classes for each grade in MonthDateHeader", () => {
    // Class name is built via template literal: `heatmap-month-dot-${g}` where g ∈ green/orange/red.
    expect(SOURCE).toMatch(/heatmap-month-dot-\$\{g\}/);
    expect(SOURCE).toMatch(/\["green",\s*"orange",\s*"red"\]\s*as\s*const/);
  });

  it("counts events per grade and skips zero counts", () => {
    expect(SOURCE).toMatch(/dayEvents\.filter\(\(e\)\s*=>\s*e\.riskGrade\s*===\s*g\)\.length/);
    expect(SOURCE).toMatch(/if\s*\(count\s*===\s*0\)\s*return\s+null/);
  });

  it("only renders dots when heatmap is enabled", () => {
    expect(SOURCE).toMatch(/heatmapEnabled\s*&&\s*hasEvents/);
  });

  it("includes heatmapEnabled in the MonthDateHeader useCallback dependency list", () => {
    expect(SOURCE).toMatch(/\[calendarEvents,\s*closures,\s*t,\s*heatmapEnabled\]/);
  });
});
