import { describe, it, expect } from "vitest";
import { snapMedicationRefToInventory } from "../postopOrderAIParser";

const INVENTORY = [
  { name: "NOVALGIN Inj Lös 1 g/2ml i.m./i.v 10 Amp 2 ml" },
  { name: "Kefzol 2g 2 g i.v." },
  { name: "Paracetamol 1g/100ml Amp" },
  { name: "PARACETAMOL 1g" },
];

describe("snapMedicationRefToInventory", () => {
  it("returns the ref unchanged when it already matches an inventory name exactly", () => {
    expect(snapMedicationRefToInventory("Kefzol 2g 2 g i.v.", INVENTORY)).toBe("Kefzol 2g 2 g i.v.");
  });

  it("snaps a normalized-equivalent ref to the canonical name", () => {
    // Same content, different casing/whitespace.
    expect(snapMedicationRefToInventory("kefzol 2g  2 g i v ", INVENTORY)).toBe("Kefzol 2g 2 g i.v.");
  });

  it("snaps a truncated ref (AI dropped packaging suffix) to the canonical full name", () => {
    // The real Novalgin bug: AI emits the short form, inventory has the long
    // form. There is exactly one inventory item that begins with the AI ref.
    expect(
      snapMedicationRefToInventory("NOVALGIN Inj Lös 1 g/2ml i.m./i.v", INVENTORY),
    ).toBe("NOVALGIN Inj Lös 1 g/2ml i.m./i.v 10 Amp 2 ml");
  });

  it("snaps to the case-equivalent canonical when only one matches normalized", () => {
    // "paracetamol 1g" normalizes to "paracetamol 1g" — exactly equal to
    // "PARACETAMOL 1g" but a true prefix of "Paracetamol 1g/100ml Amp".
    // Exact normalized match (length 1) wins over prefix candidates.
    expect(snapMedicationRefToInventory("paracetamol 1g", INVENTORY)).toBe("PARACETAMOL 1g");
  });

  it("leaves the ref alone when truly ambiguous (multiple equal prefix matches, no exact)", () => {
    const inv = [
      { name: "Aspirin 100mg tablet" },
      { name: "Aspirin 100mg capsule" },
    ];
    expect(snapMedicationRefToInventory("Aspirin 100mg", inv)).toBe("Aspirin 100mg");
  });

  it("returns the ref unchanged when no candidate matches", () => {
    expect(snapMedicationRefToInventory("Aspirin 500mg", INVENTORY)).toBe("Aspirin 500mg");
  });

  it("returns the ref unchanged when inventory is empty", () => {
    expect(snapMedicationRefToInventory("Anything", [])).toBe("Anything");
  });

  it("handles empty refs without throwing", () => {
    expect(snapMedicationRefToInventory("", INVENTORY)).toBe("");
  });

  it("snaps when the AI over-padded the canonical (rare reverse case)", () => {
    const inv = [{ name: "Aspirin 100" }];
    expect(snapMedicationRefToInventory("Aspirin 100 mg tablet", inv)).toBe("Aspirin 100");
  });

  it("ignores inventory items with null name", () => {
    const inv = [{ name: null }, { name: "Real Drug 5mg" }];
    expect(snapMedicationRefToInventory("Real Drug 5mg", inv)).toBe("Real Drug 5mg");
  });
});
