// tests/pharmacokinetics/rate-conversion.test.ts
import { describe, it, expect } from "vitest";
import {
  convertToMassPerMin,
  parseDrugContent,
  parseDrugConcentration,
  deriveBolusUnit,
  convertBolusToSegment,
} from "../../client/src/lib/pharmacokinetics/rate-conversion";

describe("parseDrugContent", () => {
  it("parses mg values", () => {
    expect(parseDrugContent("200 mg")).toBe(200);
    expect(parseDrugContent("200mg")).toBe(200);
    expect(parseDrugContent("10.5 mg")).toBe(10.5);
  });

  it("parses g values → mg", () => {
    expect(parseDrugContent("1 g")).toBe(1000);
    expect(parseDrugContent("0.5g")).toBe(500);
  });

  it("parses μg/mcg/ug values → mg", () => {
    expect(parseDrugContent("5000 μg")).toBeCloseTo(5);
    expect(parseDrugContent("5000 mcg")).toBeCloseTo(5);
    expect(parseDrugContent("5000 ug")).toBeCloseTo(5);
  });

  it("returns null for invalid content", () => {
    expect(parseDrugContent("")).toBeNull();
    expect(parseDrugContent("abc")).toBeNull();
    expect(parseDrugContent("200 ml")).toBeNull();
    expect(parseDrugContent("-10 mg")).toBeNull();
  });
});

describe("parseDrugConcentration", () => {
  it("computes mg/ml from content + volume", () => {
    // 200mg in 20ml syringe = 10 mg/ml
    expect(parseDrugConcentration("200 mg", 20)).toBe(10);
  });

  it("handles gram content", () => {
    // 1g in 50ml = 20 mg/ml
    expect(parseDrugConcentration("1 g", 50)).toBe(20);
  });

  it("returns null for missing content", () => {
    expect(parseDrugConcentration(null, 20)).toBeNull();
    expect(parseDrugConcentration("", 20)).toBeNull();
  });

  it("returns null for zero volume", () => {
    expect(parseDrugConcentration("200 mg", 0)).toBeNull();
  });
});

describe("convertToMassPerMin", () => {
  const weight = 70; // kg

  describe("propofol (expects mg/min)", () => {
    it("converts mg/kg/h → mg/min", () => {
      // 10 mg/kg/h * 70kg / 60 = 11.667 mg/min
      const result = convertToMassPerMin(10, "mg/kg/h", "propofol", weight, null);
      expect(result).toBeCloseTo(11.667, 2);
    });

    it("converts mg/kg/min → mg/min", () => {
      // 0.2 mg/kg/min * 70kg = 14 mg/min
      expect(convertToMassPerMin(0.2, "mg/kg/min", "propofol", weight, null)).toBeCloseTo(14);
    });

    it("converts μg/kg/min → mg/min", () => {
      // 200 μg/kg/min * 70kg / 1000 = 14 mg/min
      expect(convertToMassPerMin(200, "μg/kg/min", "propofol", weight, null)).toBeCloseTo(14);
    });

    it("converts ml/h → mg/min with concentration", () => {
      // 60 ml/h * 10 mg/ml / 60 = 10 mg/min
      expect(convertToMassPerMin(60, "ml/h", "propofol", weight, 10)).toBeCloseTo(10);
    });

    it("returns null for ml/h without concentration", () => {
      expect(convertToMassPerMin(60, "ml/h", "propofol", weight, null)).toBeNull();
    });
  });

  describe("remifentanil (expects μg/min)", () => {
    it("converts μg/kg/min → μg/min", () => {
      // 0.15 μg/kg/min: first to mg/min = 0.15*70/1000 = 0.0105 mg/min
      // then to μg/min = 0.0105 * 1000 = 10.5
      const result = convertToMassPerMin(0.15, "μg/kg/min", "remifentanil", weight, null);
      expect(result).toBeCloseTo(10.5);
    });

    it("converts μg/kg/h → μg/min", () => {
      // 9 μg/kg/h: mg/min = 9*70/1000/60 = 0.0105 → μg/min = 10.5
      expect(convertToMassPerMin(9, "μg/kg/h", "remifentanil", weight, null)).toBeCloseTo(10.5);
    });

    it("converts mg/h → μg/min", () => {
      // 0.63 mg/h: mg/min = 0.63/60 = 0.0105 → μg/min = 10.5
      expect(convertToMassPerMin(0.63, "mg/h", "remifentanil", weight, null)).toBeCloseTo(10.5);
    });
  });

  describe("unicode normalization", () => {
    it("handles µ (micro sign U+00B5)", () => {
      const result = convertToMassPerMin(0.15, "µg/kg/min", "remifentanil", weight, null);
      expect(result).toBeCloseTo(10.5);
    });

    it("handles mcg prefix", () => {
      const result = convertToMassPerMin(0.15, "mcg/kg/min", "remifentanil", weight, null);
      expect(result).toBeCloseTo(10.5);
    });
  });

  describe("edge cases", () => {
    it("returns null for zero rate", () => {
      expect(convertToMassPerMin(0, "mg/kg/h", "propofol", weight, null)).toBeNull();
    });

    it("returns null for negative rate", () => {
      expect(convertToMassPerMin(-5, "mg/kg/h", "propofol", weight, null)).toBeNull();
    });

    it("returns null for unknown unit", () => {
      expect(convertToMassPerMin(10, "drops/min", "propofol", weight, null)).toBeNull();
    });

    it("returns null for TCI unit", () => {
      expect(convertToMassPerMin(3, "TCI", "propofol", weight, null)).toBeNull();
    });
  });
});

describe("deriveBolusUnit", () => {
  it("mg/kg/h → mg", () => expect(deriveBolusUnit("mg/kg/h")).toBe("mg"));
  it("mg/kg/min → mg", () => expect(deriveBolusUnit("mg/kg/min")).toBe("mg"));
  it("μg/kg/min → μg", () => expect(deriveBolusUnit("μg/kg/min")).toBe("μg"));
  it("mcg/kg/min → μg (normalized)", () => expect(deriveBolusUnit("mcg/kg/min")).toBe("μg"));
  it("µg/kg/h → μg (micro sign)", () => expect(deriveBolusUnit("µg/kg/h")).toBe("μg"));
  it("ml/h → ml", () => expect(deriveBolusUnit("ml/h")).toBe("ml"));
  it("ml/min → ml", () => expect(deriveBolusUnit("ml/min")).toBe("ml"));
  it("null → fallback", () => expect(deriveBolusUnit(null, "mg")).toBe("mg"));
  it("null no fallback → ml", () => expect(deriveBolusUnit(null)).toBe("ml"));
  it("unknown → fallback", () => expect(deriveBolusUnit("drops/min", "mg")).toBe("mg"));
});

describe("convertBolusToSegment", () => {
  it("converts mg bolus for propofol", () => {
    const seg = convertBolusToSegment(150, "mg", "propofol", null, 1000);
    expect(seg).not.toBeNull();
    // 150mg / (10/60 min) = 900 mg/min
    expect(seg!.rateMassPerMin).toBeCloseTo(900);
    expect(seg!.endTime - seg!.startTime).toBe(10_000);
    expect(seg!.startTime).toBe(1000);
  });

  it("converts mcg bolus for remifentanil", () => {
    const seg = convertBolusToSegment(50, "mcg", "remifentanil", null, 1000);
    expect(seg).not.toBeNull();
    // 50mcg = 0.05mg → 0.05/(10/60) = 0.3 mg/min → engine: 300 mcg/min
    expect(seg!.rateMassPerMin).toBeCloseTo(300);
  });

  it("converts μg bolus (greek mu)", () => {
    const seg = convertBolusToSegment(50, "μg", "remifentanil", null, 1000);
    expect(seg).not.toBeNull();
    expect(seg!.rateMassPerMin).toBeCloseTo(300);
  });

  it("converts ml bolus using concentration", () => {
    // 20ml * 10mg/ml = 200mg → 200/(10/60) = 1200 mg/min
    const seg = convertBolusToSegment(20, "ml", "propofol", 10, 1000);
    expect(seg).not.toBeNull();
    expect(seg!.rateMassPerMin).toBeCloseTo(1200);
  });

  it("returns null for ml without concentration", () => {
    expect(convertBolusToSegment(20, "ml", "propofol", null, 1000)).toBeNull();
  });

  it("returns null for zero bolus", () => {
    expect(convertBolusToSegment(0, "mg", "propofol", null, 1000)).toBeNull();
  });

  it("returns null for negative bolus", () => {
    expect(convertBolusToSegment(-10, "mg", "propofol", null, 1000)).toBeNull();
  });

  it("returns null for unknown unit", () => {
    expect(convertBolusToSegment(100, "drops", "propofol", null, 1000)).toBeNull();
  });
});
