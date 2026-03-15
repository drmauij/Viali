import React, { useState, useCallback } from "react";
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
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Loader2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortableMedicationItem } from "./SortableMedicationItem";
import type { AnesthesiaItem, AdministrationGroup } from "./types";
import type { UseMutationResult } from "@tanstack/react-query";
import type { TFunction } from "i18next";

interface MedicationReorderPanelProps {
  isOpen: boolean;
  onClose: () => void;
  anesthesiaItems: AnesthesiaItem[];
  administrationGroups: AdministrationGroup[];
  reorderMedsMutation: UseMutationResult<void, Error, Array<{ itemId: string; sortOrder: number; folderId?: string }>, unknown>;
  t: TFunction;
}

export const MedicationReorderPanel = React.memo(function MedicationReorderPanel({
  isOpen,
  onClose,
  anesthesiaItems,
  administrationGroups,
  reorderMedsMutation,
  t,
}: MedicationReorderPanelProps) {
  const [reorderedItemsByFolder, setReorderedItemsByFolder] = useState<Record<string, AnesthesiaItem[]>>({});
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // DnD Kit sensors for reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Initialize reorder state when dialog opens
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      // Cancel
      setReorderedItemsByFolder({});
      setCollapsedFolders(new Set());
      onClose();
    }
  }, [onClose]);

  // Populate items by folder when the dialog first renders with isOpen=true
  // We use a ref check to re-initialize when items change
  React.useEffect(() => {
    if (isOpen) {
      const itemsByFolder: Record<string, AnesthesiaItem[]> = {};
      anesthesiaItems.forEach(item => {
        const folderId = item.administrationGroup || 'unassigned';
        if (!itemsByFolder[folderId]) {
          itemsByFolder[folderId] = [];
        }
        itemsByFolder[folderId].push(item);
      });
      setReorderedItemsByFolder(itemsByFolder);
      setCollapsedFolders(new Set());
    }
  }, [isOpen, anesthesiaItems]);

  const cancelReorderMode = useCallback(() => {
    setReorderedItemsByFolder({});
    setCollapsedFolders(new Set());
    onClose();
  }, [onClose]);

  const saveReorderChanges = useCallback(async () => {
    const updates: Array<{ itemId: string; sortOrder: number; folderId: string }> = [];

    Object.entries(reorderedItemsByFolder).forEach(([folderId, items]) => {
      items.forEach((item, index) => {
        updates.push({
          itemId: item.id,
          folderId,
          sortOrder: index, // folder-scoped: 0, 1, 2... within each folder
        });
      });
    });

    await reorderMedsMutation.mutateAsync(updates);
    setReorderedItemsByFolder({});
    setCollapsedFolders(new Set());
    onClose();
  }, [reorderedItemsByFolder, reorderMedsMutation, onClose]);

  const handleDragEndInFolder = useCallback((folderId: string) => (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setReorderedItemsByFolder((prev) => {
        const folderItems = prev[folderId] || [];
        const oldIndex = folderItems.findIndex((item) => item.id === active.id);
        const newIndex = folderItems.findIndex((item) => item.id === over.id);

        return {
          ...prev,
          [folderId]: arrayMove(folderItems, oldIndex, newIndex),
        };
      });
    }
  }, []);

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]" data-testid="dialog-reorder-medications">
        <DialogHeader>
          <DialogTitle>{t("anesthesia.timeline.reorderMedications")}</DialogTitle>
          <DialogDescription>
            {t("anesthesia.timeline.reorderMedicationsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[50vh] p-4">
          <div className="space-y-4">
            {Object.entries(reorderedItemsByFolder)
              .sort(([aId], [bId]) => {
                // Sort: put "unassigned" at the end
                if (aId === 'unassigned') return 1;
                if (bId === 'unassigned') return -1;
                // Otherwise maintain order by folder name
                const aFolder = administrationGroups.find(g => g.id === aId);
                const bFolder = administrationGroups.find(g => g.id === bId);
                return (aFolder?.name || '').localeCompare(bFolder?.name || '');
              })
              .map(([folderId, items]) => {
              const folder = administrationGroups.find(g => g.id === folderId);
              const folderName = folder?.name || (folderId === 'unassigned' ? 'Unassigned' : 'Unknown');
              const isCollapsed = collapsedFolders.has(folderId);

              return (
                <div key={folderId} className="border rounded-lg overflow-hidden">
                  {/* Folder Header - Collapsible */}
                  <button
                    onClick={() => toggleFolder(folderId)}
                    className="w-full flex items-center justify-between p-3 bg-muted hover:bg-muted/80 transition-colors"
                    data-testid={`button-toggle-folder-${folderId}`}
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      <span className="font-semibold">{folderName}</span>
                      <Badge variant="secondary">{items.length}</Badge>
                    </div>
                  </button>

                  {/* Folder Items - Drag-and-drop within folder only */}
                  {!isCollapsed && (
                    <div className="p-3">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEndInFolder(folderId)}
                      >
                        <SortableContext
                          items={items.map(item => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {items.map((item) => (
                              <SortableMedicationItem key={item.id} id={item.id} item={item} />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={cancelReorderMode}
            data-testid="button-cancel-reorder"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={saveReorderChanges}
            disabled={reorderMedsMutation.isPending}
            data-testid="button-save-reorder"
          >
            {reorderMedsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t("common.save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
