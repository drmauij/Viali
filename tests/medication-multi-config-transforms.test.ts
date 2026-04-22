import { describe, it, expect } from "vitest";
import {
  buildConfigToSwimlaneMap,
  transformMedicationDoses,
  transformRateInfusions,
  transformFreeFlowInfusions,
  transformManualTotals,
} from "../client/src/services/timelineTransform";

const perfGroup = { id: "grp-perf", name: "Perfusor", hospitalId: "h", sortOrder: 0, createdAt: "" };
const bolusGroup = { id: "grp-bolus", name: "Bolus", hospitalId: "h", sortOrder: 1, createdAt: "" };

describe("buildConfigToSwimlaneMap", () => {
  it("returns one entry per config, keyed by medicationConfigId", () => {
    const items = [
      { id: "itm-A", medicationConfigId: "cfg-perf", name: "Nora", administrationGroup: "grp-perf", rateUnit: "μg/min" },
      { id: "itm-A", medicationConfigId: "cfg-bolus", name: "Nora", administrationGroup: "grp-bolus", rateUnit: null },
    ];
    const map = buildConfigToSwimlaneMap(items as any, [perfGroup, bolusGroup] as any);
    expect(map.get("cfg-perf")).toBe("admingroup-grp-perf-item-itm-A");
    expect(map.get("cfg-bolus")).toBe("admingroup-grp-bolus-item-itm-A");
  });

  it("mono-config item maps correctly", () => {
    const items = [
      { id: "itm-mono", medicationConfigId: "cfg-mono", name: "Atropin", administrationGroup: "grp-bolus", rateUnit: null },
    ];
    const map = buildConfigToSwimlaneMap(items as any, [bolusGroup] as any);
    expect(map.get("cfg-mono")).toBe("admingroup-grp-bolus-item-itm-mono");
  });
});

describe("transformMedicationDoses routes by medicationConfigId", () => {
  it("a bolus with medicationConfigId=bolus-config lands in the bolus lane", () => {
    const items = [
      { id: "itm-A", medicationConfigId: "cfg-perf", name: "Nora", administrationGroup: "grp-perf", rateUnit: "μg/min" },
      { id: "itm-A", medicationConfigId: "cfg-bolus", name: "Nora", administrationGroup: "grp-bolus", rateUnit: null },
    ];
    const map = buildConfigToSwimlaneMap(items as any, [perfGroup, bolusGroup] as any);
    const meds = [
      { id: "m1", type: "bolus", itemId: "itm-A", medicationConfigId: "cfg-bolus", timestamp: "2026-04-22T10:00:00Z", dose: "10 μg" },
    ];
    const doses = transformMedicationDoses(meds, map, items as any);
    expect(Object.keys(doses)).toEqual(["admingroup-grp-bolus-item-itm-A"]);
    expect(doses["admingroup-grp-bolus-item-itm-A"]).toHaveLength(1);
  });

  it("falls back to itemId lookup when medicationConfigId is missing (legacy row)", () => {
    const items = [
      { id: "itm-mono", medicationConfigId: "cfg-mono", name: "Atropin", administrationGroup: "grp-bolus", rateUnit: null },
    ];
    const map = buildConfigToSwimlaneMap(items as any, [bolusGroup] as any);
    const meds = [
      { id: "m1", type: "bolus", itemId: "itm-mono", timestamp: "2026-04-22T10:00:00Z", dose: "0.5 mg" }, // no medicationConfigId
    ];
    const doses = transformMedicationDoses(meds, map, items as any);
    expect(Object.keys(doses)).toEqual(["admingroup-grp-bolus-item-itm-mono"]);
  });
});

describe("transformRateInfusions routes by medicationConfigId", () => {
  it("an infusion_start with the perfusor-config id lands in the perfusor lane", () => {
    const items = [
      { id: "itm-A", medicationConfigId: "cfg-perf", name: "Nora", administrationGroup: "grp-perf", rateUnit: "μg/min" },
      { id: "itm-A", medicationConfigId: "cfg-bolus", name: "Nora", administrationGroup: "grp-bolus", rateUnit: null },
    ];
    const map = buildConfigToSwimlaneMap(items as any, [perfGroup, bolusGroup] as any);
    const meds = [
      { id: "m1", type: "infusion_start", itemId: "itm-A", medicationConfigId: "cfg-perf", timestamp: "2026-04-22T10:00:00Z", rate: "0.05", dose: "50ml" },
    ];
    const sessions = transformRateInfusions(meds, map, items as any);
    expect(Object.keys(sessions)).toEqual(["admingroup-grp-perf-item-itm-A"]);
  });
});

describe("transformFreeFlowInfusions routes by medicationConfigId", () => {
  it("a free-flow infusion on a dual-config item routes to the primary (configured) lane", () => {
    const items = [
      { id: "itm-dual", medicationConfigId: "cfg-free", name: "Propofol", administrationGroup: "grp-perf", rateUnit: "free" },
    ];
    const map = buildConfigToSwimlaneMap(items as any, [perfGroup] as any);
    const meds = [
      { id: "m1", type: "infusion_start", itemId: "itm-dual", medicationConfigId: "cfg-free", timestamp: "2026-04-22T10:00:00Z", rate: "free", dose: "500 mg" },
    ];
    const sessions = transformFreeFlowInfusions(meds, map, items as any);
    expect(Object.keys(sessions)).toEqual(["admingroup-grp-perf-item-itm-dual"]);
  });
});

describe("transformManualTotals routes by medicationConfigId", () => {
  it("a manual_total entry lands in the configured lane", () => {
    const items = [
      { id: "itm-A", medicationConfigId: "cfg-perf", name: "Nora", administrationGroup: "grp-perf", rateUnit: "μg/min" },
    ];
    const map = buildConfigToSwimlaneMap(items as any, [perfGroup] as any);
    const meds = [
      { id: "m1", type: "manual_total", itemId: "itm-A", medicationConfigId: "cfg-perf", timestamp: "2026-04-22T10:00:00Z", dose: "150 mg" },
    ];
    const totals = transformManualTotals(meds, map, items as any);
    expect(Object.keys(totals)).toEqual(["admingroup-grp-perf-item-itm-A"]);
    expect(totals["admingroup-grp-perf-item-itm-A"].dose).toBe(150);
  });
});
