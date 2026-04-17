import { useState, useCallback } from "react";

export function useFolderTreeState(initial?: { selectedFolderId?: string | null }) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | "none">(
    initial?.selectedFolderId ?? null,
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [dialogName, setDialogName] = useState("");

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openCreate = useCallback(() => {
    setEditingFolderId(null);
    setDialogName("");
    setDialogOpen(true);
  }, []);

  const openRename = useCallback((id: string, currentName: string) => {
    setEditingFolderId(id);
    setDialogName(currentName);
    setDialogOpen(true);
  }, []);

  return {
    selectedFolderId,
    setSelectedFolderId,
    expanded,
    toggleExpanded,
    dialogOpen,
    setDialogOpen,
    editingFolderId,
    dialogName,
    setDialogName,
    openCreate,
    openRename,
  };
}
