import { useState, useMemo } from "react";
import { Search, ChevronRight, ChevronsRight, ChevronLeft, ChevronsLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  name: string;
  anesthesiaType: string;
};

type ItemTransferListProps = {
  availableItems: Item[];
  selectedItems: Item[];
  onMove: (itemIds: string[], toSelected: boolean) => void;
  onItemClick?: (item: Item) => void;
};

export function ItemTransferList({
  availableItems,
  selectedItems,
  onMove,
  onItemClick,
}: ItemTransferListProps) {
  const [availableSearch, setAvailableSearch] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const [availableChecked, setAvailableChecked] = useState<Set<string>>(new Set());
  const [selectedChecked, setSelectedChecked] = useState<Set<string>>(new Set());

  // Filter items based on search
  const filteredAvailable = useMemo(() => {
    return availableItems.filter((item) =>
      item.name.toLowerCase().includes(availableSearch.toLowerCase())
    );
  }, [availableItems, availableSearch]);

  const filteredSelected = useMemo(() => {
    return selectedItems.filter((item) =>
      item.name.toLowerCase().includes(selectedSearch.toLowerCase())
    );
  }, [selectedItems, selectedSearch]);

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
    <div className="grid grid-cols-[1fr,auto,1fr] gap-4">
      {/* Available Items */}
      <div className="border rounded-lg p-4 bg-card dark:bg-card">
        <div className="mb-3">
          <h3 className="font-semibold mb-2 text-foreground dark:text-foreground">Available Inventory Items</h3>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
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
                {availableSearch ? "No items found" : "All items are configured"}
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
      <div className="flex flex-col items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={moveAllToSelected}
          disabled={availableItems.length === 0}
          title="Move all to anesthesia"
          data-testid="button-move-all-right"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={moveToSelected}
          disabled={availableChecked.size === 0}
          title="Move selected to anesthesia"
          data-testid="button-move-selected-right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={moveToAvailable}
          disabled={selectedChecked.size === 0}
          title="Remove selected from anesthesia"
          data-testid="button-move-selected-left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={moveAllToAvailable}
          disabled={selectedItems.length === 0}
          title="Remove all from anesthesia"
          data-testid="button-move-all-left"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Selected Items (Anesthesia Items) */}
      <div className="border rounded-lg p-4 bg-card dark:bg-card">
        <div className="mb-3">
          <h3 className="font-semibold mb-2 text-foreground dark:text-foreground">Anesthesia Items</h3>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
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
                {selectedSearch ? "No items found" : "No items configured yet"}
              </p>
            ) : (
              filteredSelected.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer transition-colors",
                    selectedChecked.has(item.id) && "bg-accent"
                  )}
                  onClick={(e) => {
                    // If clicking the checkbox, toggle selection
                    if ((e.target as HTMLElement).closest('[role="checkbox"]')) {
                      handleSelectedToggle(item.id);
                    } else {
                      // Otherwise, trigger item click for configuration
                      onItemClick?.(item);
                    }
                  }}
                  data-testid={`item-selected-${item.id}`}
                >
                  <Checkbox
                    checked={selectedChecked.has(item.id)}
                    onCheckedChange={() => handleSelectedToggle(item.id)}
                    data-testid={`checkbox-selected-${item.id}`}
                  />
                  <div className="flex-1">
                    <span className="text-sm">{item.name}</span>
                    {item.anesthesiaType !== 'none' && (
                      <span className={cn(
                        "ml-2 text-xs px-1.5 py-0.5 rounded",
                        item.anesthesiaType === 'medication' 
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                          : "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                      )}>
                        {item.anesthesiaType}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        
        <p className="text-xs text-muted-foreground mt-2">
          {filteredSelected.length} items configured
        </p>
      </div>
    </div>
  );
}
