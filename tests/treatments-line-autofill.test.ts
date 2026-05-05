import { describe, it, expect } from "vitest";
import {
  pickItemPatch,
  pickServicePatch,
  recomputeTotalPatch,
} from "../client/src/components/treatments/lineAutoFill";

describe("pickItemPatch", () => {
  it("clears item, lot, lotNumber when item is null", () => {
    const patch = pickItemPatch(
      { itemId: "old", lotId: "L1", lotNumber: "abc", unitPrice: "10" },
      null,
    );
    expect(patch).toEqual({
      itemId: undefined,
      lotId: undefined,
      lotNumber: undefined,
    });
  });

  it("sets itemId and clears lot fields when picking new item", () => {
    const patch = pickItemPatch({}, { id: "I1", name: "Botox" });
    expect(patch).toMatchObject({
      itemId: "I1",
      lotId: undefined,
      lotNumber: undefined,
    });
  });

  it("auto-fills unitPrice from item.patientPrice when empty", () => {
    const patch = pickItemPatch(
      {},
      { id: "I1", name: "Botox", patientPrice: "100.00" },
    );
    expect(patch.unitPrice).toBe("100.00");
  });

  it("does not overwrite an existing unitPrice", () => {
    const patch = pickItemPatch(
      { unitPrice: "50.00" },
      { id: "I1", name: "Botox", patientPrice: "100.00" },
    );
    expect(patch.unitPrice).toBeUndefined();
  });

  it("recomputes total when both dose and new unitPrice are numeric", () => {
    const patch = pickItemPatch(
      { dose: "4" },
      { id: "I1", name: "Botox", patientPrice: "100" },
    );
    expect(patch.total).toBe("400.00");
  });
});

describe("pickServicePatch", () => {
  it("auto-fills unitPrice when no item is set and unitPrice is empty", () => {
    const patch = pickServicePatch(
      {},
      { id: "S1", name: "Lifting", price: "250" },
    );
    expect(patch).toMatchObject({ serviceId: "S1", unitPrice: "250" });
  });

  it("does NOT auto-fill unitPrice when an item is already set", () => {
    const patch = pickServicePatch(
      { itemId: "I1" },
      { id: "S1", name: "Lifting", price: "250" },
    );
    expect(patch.unitPrice).toBeUndefined();
  });

  it("does NOT overwrite an existing unitPrice", () => {
    const patch = pickServicePatch(
      { unitPrice: "50" },
      { id: "S1", name: "Lifting", price: "250" },
    );
    expect(patch.unitPrice).toBeUndefined();
  });

  it("clears serviceId when service is null", () => {
    const patch = pickServicePatch({ serviceId: "old" }, null);
    expect(patch).toEqual({ serviceId: undefined });
  });
});

describe("recomputeTotalPatch", () => {
  it("returns total when both dose and unitPrice are numeric", () => {
    expect(recomputeTotalPatch({ dose: "4", unitPrice: "100" })).toEqual({
      total: "400.00",
    });
  });

  it("returns empty patch when dose is missing", () => {
    expect(recomputeTotalPatch({ unitPrice: "100" })).toEqual({});
  });

  it("returns empty patch when unitPrice is non-numeric", () => {
    expect(recomputeTotalPatch({ dose: "4", unitPrice: "abc" })).toEqual({});
  });

  it("formats total to 2 decimals", () => {
    expect(recomputeTotalPatch({ dose: "1", unitPrice: "0.1" })).toEqual({
      total: "0.10",
    });
  });
});
