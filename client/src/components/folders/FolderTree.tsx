import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Trash2,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Folder } from "./types";

interface Props {
  folders: Folder[];
  selectedFolderId: string | null | "none";
  onSelect: (id: string | null | "none") => void;
  onCreateClick: () => void;
  onRenameClick: (id: string, currentName: string) => void;
  onDeleteClick: (id: string) => void;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  allLabel?: string;
  noneLabel?: string;
  disableDnd?: boolean;
}

function DroppableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded transition-colors",
        isOver && "bg-primary/10 ring-2 ring-primary",
      )}
    >
      {children}
    </div>
  );
}

function DraggableFolderHandle({ id, disabled }: { id: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `folder-${id}`, disabled });
  if (disabled) return null;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
      aria-label="Drag to reorder"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelect,
  onCreateClick,
  onRenameClick,
  onDeleteClick,
  expanded,
  onToggleExpand,
  allLabel,
  noneLabel,
  disableDnd,
}: Props) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...folders].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [folders],
  );

  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-medium text-muted-foreground">
          {t("folders.title", "Folders")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCreateClick}
          aria-label={t("folders.newFolder", "New folder")}
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full text-left px-2 py-1.5 rounded hover:bg-muted",
          selectedFolderId === null && "bg-muted font-medium",
        )}
      >
        {allLabel ?? t("folders.allItems", "All")}
      </button>

      <DroppableRow id="folder-none">
        <button
          onClick={() => onSelect("none")}
          className={cn(
            "w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2",
            selectedFolderId === "none" && "bg-muted font-medium",
          )}
        >
          <FolderIcon className="h-4 w-4 text-muted-foreground" />
          {noneLabel ?? t("folders.noFolder", "No folder")}
        </button>
      </DroppableRow>

      {sorted.map((folder) => {
        const isExpanded = expanded.has(folder.id);
        const isSelected = selectedFolderId === folder.id;
        return (
          <DroppableRow key={folder.id} id={`folder-${folder.id}`}>
            <div
              className={cn(
                "flex items-center gap-1 px-1 py-1 rounded group hover:bg-muted",
                isSelected && "bg-muted",
              )}
            >
              <DraggableFolderHandle id={folder.id} disabled={disableDnd} />
              <button
                type="button"
                onClick={() => onToggleExpand(folder.id)}
                className="p-0.5 text-muted-foreground"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onSelect(folder.id)}
                className="flex-1 text-left flex items-center gap-2 min-w-0"
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
              </button>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => onRenameClick(folder.id, folder.name)}
                  aria-label={t("folders.renameFolder", "Rename folder")}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => onDeleteClick(folder.id)}
                  aria-label={t("folders.deleteFolder", "Delete folder")}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </DroppableRow>
        );
      })}
    </div>
  );
}
