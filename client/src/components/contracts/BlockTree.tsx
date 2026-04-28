import * as React from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block } from "@shared/contractTemplates/types";

interface Props {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (next: Block[]) => void;
}

export function BlockTree({ blocks, selectedId, onSelect, onChange }: Props) {
  const ids = blocks.map((b) => b.id);
  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = ids.indexOf(e.active.id as string);
    const newIndex = ids.indexOf(e.over.id as string);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  }
  return (
    <div className="space-y-1 text-sm">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {blocks.map((b) => (
            <Row key={b.id} block={b} selected={b.id === selectedId} onSelect={onSelect} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function Row({ block, selected, onSelect }: { block: Block; selected: boolean; onSelect: (id: string) => void; }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer ${selected ? "bg-accent" : "hover:bg-muted"}`}
      onClick={() => onSelect(block.id)}
    >
      <span {...listeners} {...attributes} className="cursor-grab text-muted-foreground">☰</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{block.type}</span>
      <span className="truncate">{previewLabel(block)}</span>
    </div>
  );
}

function previewLabel(b: Block): string {
  switch (b.type) {
    case "heading": return b.text.slice(0, 40);
    case "paragraph": return b.text.slice(0, 40);
    case "section": return b.title ?? "(untitled section)";
    case "signature": return `Signature — ${b.party}`;
    case "list": return `${b.ordered ? "Ordered" : "Bulleted"} list (${b.items.length})`;
    case "pageBreak": return "Page break";
    case "spacer": return `Spacer (${b.height}px)`;
  }
}
