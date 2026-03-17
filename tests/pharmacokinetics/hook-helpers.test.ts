// tests/pharmacokinetics/hook-helpers.test.ts
import { describe, it, expect } from "vitest";
import { extractTCITargets, identifyTCIDrug } from "../../client/src/hooks/usePKSimulation";

describe("extractTCITargets", () => {
  it("extracts start event from infusion session", () => {
    const sessions = [{
      id: "s1", swimlaneId: "lane1", label: "Propofol 1%",
      syringeQuantity: "1", startDose: "4.0",
      segments: [{ startTime: 1000, rate: "4.0", rateUnit: "TCI" }],
      state: "running" as const, startTime: 1000,
    }];
    const targets = extractTCITargets(sessions, 0);
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe("start");
    expect(targets[0].targetConcentration).toBe(4.0);
  });

  it("extracts rate change events from segments", () => {
    const sessions = [{
      id: "s1", swimlaneId: "lane1", label: "Propofol",
      syringeQuantity: "1", startDose: "4.0",
      segments: [
        { startTime: 1000, rate: "4.0", rateUnit: "TCI" },
        { startTime: 5000, rate: "3.0", rateUnit: "TCI" },
      ],
      state: "running" as const, startTime: 1000,
    }];
    const targets = extractTCITargets(sessions, 0);
    expect(targets).toHaveLength(2);
    expect(targets[1].type).toBe("rate_change");
    expect(targets[1].targetConcentration).toBe(3.0);
  });

  it("extracts stop event", () => {
    const sessions = [{
      id: "s1", swimlaneId: "lane1", label: "Propofol",
      syringeQuantity: "1", startDose: "4.0",
      segments: [{ startTime: 1000, rate: "4.0", rateUnit: "TCI" }],
      state: "stopped" as const, startTime: 1000, endTime: 10000,
    }];
    const targets = extractTCITargets(sessions, 0);
    expect(targets).toHaveLength(2);
    expect(targets[1].type).toBe("stop");
  });
});

describe("identifyTCIDrug", () => {
  it("identifies propofol by name", () => {
    expect(identifyTCIDrug("Propofol 1%")).toBe("propofol");
    expect(identifyTCIDrug("propofol")).toBe("propofol");
  });

  it("identifies propofol by brand name (Diprivan)", () => {
    expect(identifyTCIDrug("Diprivan")).toBe("propofol");
  });

  it("identifies remifentanil by name", () => {
    expect(identifyTCIDrug("Remifentanil")).toBe("remifentanil");
    expect(identifyTCIDrug("Remi 2mg")).toBe("remifentanil");
  });

  it("identifies remifentanil by brand name (Ultiva)", () => {
    expect(identifyTCIDrug("Ultiva")).toBe("remifentanil");
  });

  it("returns null for unknown drugs", () => {
    expect(identifyTCIDrug("Rocuronium")).toBeNull();
  });
});
