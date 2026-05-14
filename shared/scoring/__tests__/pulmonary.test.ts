import { describe, it, expect } from "vitest";
import { calculateVialiPulmonaryV1 } from "../pulmonary";

describe("Viali pulmonary v1", () => {
  it("returns high when COPD is present", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: true, isCurrentSmoker: false, age: 60, plannedDurationMinutes: 60 });
    expect(r.band).toBe("high");
  });

  it("returns med when smoker AND age >= 70", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: true, age: 72, plannedDurationMinutes: 60 });
    expect(r.band).toBe("med");
  });

  it("returns med when smoker AND duration > 180 minutes", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: true, age: 45, plannedDurationMinutes: 240 });
    expect(r.band).toBe("med");
  });

  it("returns low when smoker but young and short surgery", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: true, age: 30, plannedDurationMinutes: 60 });
    expect(r.band).toBe("low");
  });

  it("returns low when no risk factors", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: false, age: 30, plannedDurationMinutes: 60 });
    expect(r.band).toBe("low");
  });

  it("tags result with 'Viali pulmonary v1' source", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: true, isCurrentSmoker: false, age: 60, plannedDurationMinutes: 60 });
    expect(r.source).toBe("Viali pulmonary v1");
  });
});
