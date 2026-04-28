import type { Block } from "./types";

export function flattenBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  function walk(b: Block) {
    out.push(b);
    if (b.type === "section") b.children.forEach(walk);
  }
  blocks.forEach(walk);
  return out;
}
