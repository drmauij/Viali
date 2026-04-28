import { describe, it, expect } from "vitest";
import { flattenBlocks } from "@shared/contractTemplates/flattenBlocks";
import type { Block } from "@shared/contractTemplates/types";

describe("flattenBlocks", () => {
  it("returns blocks in linear order", () => {
    const blocks: Block[] = [
      { id: "a", type: "heading", level: 1, text: "T" },
      { id: "b", type: "paragraph", text: "X" },
    ];
    expect(flattenBlocks(blocks).map(b => b.id)).toEqual(["a", "b"]);
  });

  it("walks into section children", () => {
    const blocks: Block[] = [
      { id: "a", type: "heading", level: 1, text: "T" },
      { id: "s", type: "section", title: "S", children: [
        { id: "c", type: "paragraph", text: "X" },
        { id: "d", type: "paragraph", text: "Y" },
      ]},
      { id: "e", type: "paragraph", text: "Z" },
    ];
    expect(flattenBlocks(blocks).map(b => b.id)).toEqual(["a", "s", "c", "d", "e"]);
  });
});
