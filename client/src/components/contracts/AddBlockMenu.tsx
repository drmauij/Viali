import * as React from "react";
import type { Block, BlockType } from "@shared/contractTemplates/types";

const TYPES: { type: BlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "paragraph", label: "Paragraph" },
  { type: "list", label: "List" },
  { type: "section", label: "Section" },
  { type: "signature", label: "Signature" },
  { type: "pageBreak", label: "Page break" },
  { type: "spacer", label: "Spacer" },
];

function makeBlock(type: BlockType): Block {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading":   return { id, type: "heading", level: 2, text: "New heading" };
    case "paragraph": return { id, type: "paragraph", text: "New paragraph" };
    case "list":      return { id, type: "list", ordered: false, items: ["First item"] };
    case "section":   return { id, type: "section", title: "New section", children: [] };
    case "signature": return { id, type: "signature", party: "worker", label: "Signature" };
    case "pageBreak": return { id, type: "pageBreak" };
    case "spacer":    return { id, type: "spacer", height: 16 };
  }
}

export function AddBlockMenu({ onAdd }: { onAdd: (b: Block) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="mt-2 text-xs underline">
        + Add block
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-48 rounded border bg-white shadow text-sm">
          {TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => {
                onAdd(makeBlock(t.type));
                setOpen(false);
              }}
              className="block w-full px-2 py-1 text-left hover:bg-muted"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
