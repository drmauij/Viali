import { describe, it, expect } from "vitest";
import {
  getQtyForThreshold,
  getStockStatus,
  filterAndSortItems,
  getFilterCounts,
} from "../itemHandlers";
import type { ItemWithStock } from "../types";

const t = (key: string) => key;

function makeItem(overrides: Partial<ItemWithStock> = {}): ItemWithStock {
  return {
    id: "i1",
    hospitalId: "h1",
    unitId: "u1",
    name: "Test item",
    description: null,
    unit: "Pack",
    packSize: 1,
    currentUnits: 0,
    trackExactQuantity: false,
    minThreshold: 0,
    maxThreshold: 0,
    critical: false,
    controlled: false,
    status: "active",
    folderId: null,
    vendorId: null,
    imageUrl: null,
    sortOrder: 0,
    barcodes: null,
    isService: false,
    isInvoiceable: false,
    patientPrice: null,
    defaultOrderQty: null,
    medicationGroup: null,
    administrationRoute: null,
    defaultDose: null,
    ampuleTotalContent: null,
    administrationUnit: null,
    isRateControlled: false,
    rateUnit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ItemWithStock;
}

describe("getQtyForThreshold", () => {
  it("returns ceil(currentUnits/packSize) for trackExact items", () => {
    // 14 units of a 5-pack = 3 packs (ceil)
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 5,
      currentUnits: 14,
    });
    expect(getQtyForThreshold(item)).toBe(3);
  });

  it("returns 0 packs when currentUnits is 0", () => {
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 5,
      currentUnits: 0,
    });
    expect(getQtyForThreshold(item)).toBe(0);
  });

  it("treats a partial pack as a full pack (ceil semantics)", () => {
    // 1 loose vial of a 5-pack still counts as 1 pack remaining
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 5,
      currentUnits: 1,
    });
    expect(getQtyForThreshold(item)).toBe(1);
  });

  it("falls back to stockLevel.qtyOnHand when trackExactQuantity is off", () => {
    const item = makeItem({
      trackExactQuantity: false,
      stockLevel: { itemId: "i1", unitId: "u1", qtyOnHand: 7 } as any,
    });
    expect(getQtyForThreshold(item)).toBe(7);
  });

  it("defaults packSize to 1 when missing on a trackExact item", () => {
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 0 as any,
      currentUnits: 4,
    });
    expect(getQtyForThreshold(item)).toBe(4);
  });
});

describe("getStockStatus for controlled trackExact items", () => {
  it("paints orange (yellow-500) when actual packs <= minThreshold — REMIFENTANIL bug case", () => {
    // The exact scenario from the screenshots:
    // Pack size 5, currentUnits 14, actual stock 3 packs, min 5 packs
    // Before fix: 14 > 5 → green; after fix: 3 ≤ 5 → orange
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 5,
      currentUnits: 14,
      minThreshold: 5,
      maxThreshold: 7,
      controlled: true,
    });
    expect(getStockStatus(item, t).color).toBe("text-yellow-500");
  });

  it("paints green when actual packs > minThreshold", () => {
    // 30 units / 5 = 6 packs, min 5 → 6 > 5 → green
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 5,
      currentUnits: 30,
      minThreshold: 5,
    });
    expect(getStockStatus(item, t).color).toBe("text-green-500");
  });

  it("paints red on true stockout (zero units)", () => {
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 5,
      currentUnits: 0,
      minThreshold: 5,
    });
    expect(getStockStatus(item, t).color).toBe("text-red-500");
  });

  it("does NOT treat one loose vial as stockout", () => {
    // 1 unit of a 5-pack = 1 pack (ceil), below threshold → orange, not red
    const item = makeItem({
      trackExactQuantity: true,
      packSize: 5,
      currentUnits: 1,
      minThreshold: 5,
    });
    expect(getStockStatus(item, t).color).toBe("text-yellow-500");
  });
});

describe("filter counts use pack-based comparison for trackExact items", () => {
  it("counts the REMIFENTANIL scenario as runningLow, not all-good", () => {
    const items = [
      makeItem({
        id: "remi",
        trackExactQuantity: true,
        packSize: 5,
        currentUnits: 14,
        minThreshold: 5,
        maxThreshold: 7,
      }),
    ];
    const counts = getFilterCounts(items);
    expect(counts.runningLow).toBe(1);
    expect(counts.stockout).toBe(0);
  });

  it("filterAndSortItems → runningLow surfaces trackExact items with too-few packs", () => {
    const items = [
      makeItem({
        id: "remi",
        name: "REMIFENTANIL",
        trackExactQuantity: true,
        packSize: 5,
        currentUnits: 14,
        minThreshold: 5,
      }),
      makeItem({
        id: "ok",
        name: "Other",
        trackExactQuantity: true,
        packSize: 5,
        currentUnits: 100,
        minThreshold: 5,
      }),
    ];
    const filtered = filterAndSortItems(items, "", "runningLow", "name", new Map());
    expect(filtered.map((i) => i.id)).toEqual(["remi"]);
  });
});
