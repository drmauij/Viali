import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";

export function DraggableItem({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {!disabled && (
        <div 
          {...listeners} 
          {...attributes}
          className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10 bg-muted/80 rounded p-1 touch-none"
          data-testid={`drag-handle-${id}`}
          title={t('items.dragToMove')}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className={!disabled ? "pl-8" : ""}>
        {children}
      </div>
    </div>
  );
}

export function DropIndicator({ position }: { position: 'above' | 'below' }) {
  return (
    <div 
      className={`absolute left-0 right-0 h-0.5 bg-primary z-20 ${position === 'above' ? '-top-1' : '-bottom-1'}`}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export function DroppableFolder({ 
  id, 
  children, 
  showDropIndicator 
}: { 
  id: string; 
  children: React.ReactNode;
  showDropIndicator?: 'above' | 'below' | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div 
      ref={setNodeRef} 
      className={`relative ${isOver ? "ring-2 ring-primary rounded-lg bg-primary/5 transition-all" : "transition-all"}`}
    >
      {showDropIndicator && <DropIndicator position={showDropIndicator} />}
      {children}
    </div>
  );
}
