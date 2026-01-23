import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from "lucide-react";

interface MedicationItem {
  id: string;
  name: string;
  dose?: string;
  unit?: string;
}

export function SortableMedicationItem({ id, item }: { id: string; item: MedicationItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-background border rounded-md shadow-sm hover:shadow-md transition-shadow"
      data-testid={`sortable-medication-${id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{item.name}</div>
        <div className="text-xs text-muted-foreground">
          {item.dose} {item.unit}
        </div>
      </div>
    </div>
  );
}
