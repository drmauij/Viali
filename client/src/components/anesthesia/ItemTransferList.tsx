import { useState, useMemo } from "react";
import { Search, ChevronRight, ChevronsRight, ChevronLeft, ChevronsLeft, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Item = {
  id: string;
  name: string;
  rateUnit?: string | null; // null = bolus, "free" = free-flow, actual unit = rate-controlled
  medicationSortOrder?: number;
};

type ItemTransferListProps = {
  availableItems: Item[];
  selectedItems: Item[];
  onMove: (itemIds: string[], toSelected: boolean) => void;
  onItemClick?: (item: Item) => void;
  onReorder?: (items: Item[]) => void;
};

function SortableItem({
  item,
  isSelected,
  onToggle,
  onClick,
}: {
  item: Item;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer transition-colors",
        isSelected && "bg-accent"
      )}
      data-testid={`item-selected-${item.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-accent rounded"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        data-testid={`checkbox-selected-${item.id}`}
      />
      <div
        className="flex-1"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('[role="checkbox"]')) {
            onClick();
          }
        }}
      >
        <span className="text-sm">{item.name}</span>
        {item.rateUnit && (
          <span className={cn(
            "ml-2 text-xs px-1.5 py-0.5 rounded",
            item.rateUnit === 'free' 
              ? "bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300"
              : "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
          )}>
            {item.rateUnit === 'free' ? 'Free-flow' : 'Rate-controlled'}
          </span>
        )}
      </div>
    </div>
  );
}

export function ItemTransferList({
  availableItems,
  selectedItems,
  onMove,
  onItemClick,
  onReorder,
}: ItemTransferListProps) {
  const { t } = useTranslation();
  const [availableSearch, setAvailableSearch] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const [availableChecked, setAvailableChecked] = useState<Set<string>>(new Set());
  const [selectedChecked, setSelectedChecked] = useState<Set<string>>(new Set());

  // Sort selected items by medicationSortOrder
  const sortedSelectedItems = useMemo(() => {
    return [...selectedItems].sort((a, b) => {
      const orderA = a.medicationSortOrder ?? 0;
      const orderB = b.medicationSortOrder ?? 0;
      if (orderA === orderB) {
        return a.name.localeCompare(b.name);
      }
      return orderA - orderB;
    });
  }, [selectedItems]);

  // Filter items based on search
  const filteredAvailable = useMemo(() => {
    return availableItems.filter((item) =>
      item.name.toLowerCase().includes(availableSearch.toLowerCase())
    );
  }, [availableItems, availableSearch]);

  const filteredSelected = useMemo(() => {
    return sortedSelectedItems.filter((item) =>
      item.name.toLowerCase().includes(selectedSearch.toLowerCase())
    );
  }, [sortedSelectedItems, selectedSearch]);

  // Setup drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedSelectedItems.findIndex((item) => item.id === active.id);
      const newIndex = sortedSelectedItems.findIndex((item) => item.id === over.id);

      const reorderedItems = arrayMove(sortedSelectedItems, oldIndex, newIndex);
      
      // Call onReorder callback with the newly ordered items
      if (onReorder) {
        onReorder(reorderedItems);
      }
    }
  };

  // Handle checkbox toggle
  const handleAvailableToggle = (itemId: string) => {
    const newSet = new Set(availableChecked);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setAvailableChecked(newSet);
  };

  const handleSelectedToggle = (itemId: string) => {
    const newSet = new Set(selectedChecked);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setSelectedChecked(newSet);
  };

  // Move selected items
  const moveToSelected = () => {
    if (availableChecked.size > 0) {
      onMove(Array.from(availableChecked), true);
      setAvailableChecked(new Set());
    }
  };

  const moveToAvailable = () => {
    if (selectedChecked.size > 0) {
      onMove(Array.from(selectedChecked), false);
      setSelectedChecked(new Set());
    }
  };

  // Move all items
  const moveAllToSelected = () => {
    onMove(availableItems.map(item => item.id), true);
    setAvailableChecked(new Set());
  };

  const moveAllToAvailable = () => {
    onMove(selectedItems.map(item => item.id), false);
    setSelectedChecked(new Set());
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4">
      {/* Available Items */}
      <div className="border rounded-lg p-4 bg-card dark:bg-card">
        <div className="mb-3">
          <h3 className="font-semibold mb-2 text-foreground dark:text-foreground">{t("anesthesia.settings.availableItems")}</h3>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("anesthesia.settings.searchItems")}
              value={availableSearch}
              onChange={(e) => setAvailableSearch(e.target.value)}
              className="pl-8"
              data-testid="input-available-search"
            />
          </div>
        </div>
        
        <ScrollArea className="h-[400px] border rounded bg-background dark:bg-background">
          <div className="p-2 space-y-1">
            {filteredAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {availableSearch ? t("anesthesia.settings.noItemsFound") : t("anesthesia.settings.allItemsConfigured")}
              </p>
            ) : (
              filteredAvailable.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer transition-colors",
                    availableChecked.has(item.id) && "bg-accent"
                  )}
                  onClick={() => handleAvailableToggle(item.id)}
                  data-testid={`item-available-${item.id}`}
                >
                  <Checkbox
                    checked={availableChecked.has(item.id)}
                    onCheckedChange={() => handleAvailableToggle(item.id)}
                    data-testid={`checkbox-available-${item.id}`}
                  />
                  <span className="text-sm flex-1">{item.name}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        
        <p className="text-xs text-muted-foreground mt-2">
          {filteredAvailable.length} items
        </p>
      </div>

      {/* Move Buttons */}
      <div className="flex flex-row md:flex-col items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={moveAllToSelected}
          disabled={availableItems.length === 0}
          title={t("anesthesia.settings.moveAllToAnesthesia")}
          data-testid="button-move-all-right"
        >
          <ChevronsRight className="h-4 w-4 md:rotate-0 rotate-90" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={moveToSelected}
          disabled={availableChecked.size === 0}
          title={t("anesthesia.settings.moveSelectedToAnesthesia")}
          data-testid="button-move-selected-right"
        >
          <ChevronRight className="h-4 w-4 md:rotate-0 rotate-90" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={moveToAvailable}
          disabled={selectedChecked.size === 0}
          title={t("anesthesia.settings.removeSelectedFromAnesthesia")}
          data-testid="button-move-selected-left"
        >
          <ChevronLeft className="h-4 w-4 md:rotate-0 rotate-90" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={moveAllToAvailable}
          disabled={selectedItems.length === 0}
          title={t("anesthesia.settings.removeAllFromAnesthesia")}
          data-testid="button-move-all-left"
        >
          <ChevronsLeft className="h-4 w-4 md:rotate-0 rotate-90" />
        </Button>
      </div>

      {/* Selected Items (Anesthesia Items) - with Drag and Drop */}
      <div className="border rounded-lg p-4 bg-card dark:bg-card">
        <div className="mb-3">
          <h3 className="font-semibold mb-2 text-foreground dark:text-foreground">{t("anesthesia.settings.anesthesiaItems")}</h3>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("anesthesia.settings.searchItems")}
              value={selectedSearch}
              onChange={(e) => setSelectedSearch(e.target.value)}
              className="pl-8"
              data-testid="input-selected-search"
            />
          </div>
        </div>
        
        <ScrollArea className="h-[400px] border rounded bg-background dark:bg-background">
          <div className="p-2 space-y-1">
            {filteredSelected.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {selectedSearch ? t("anesthesia.settings.noItemsFound") : t("anesthesia.settings.noItemsConfigured")}
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredSelected.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredSelected.map((item) => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      isSelected={selectedChecked.has(item.id)}
                      onToggle={() => handleSelectedToggle(item.id)}
                      onClick={() => onItemClick?.(item)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </ScrollArea>
        
        <p className="text-xs text-muted-foreground mt-2">
          {filteredSelected.length} {t("anesthesia.settings.itemsConfigured")} {t("anesthesia.settings.dragToReorder")}
        </p>
      </div>
    </div>
  );
}
