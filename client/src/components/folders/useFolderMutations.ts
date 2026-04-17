import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FolderAdapter, Folder } from "./types";

export function useFolderMutations(adapter: FolderAdapter) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: adapter.foldersQueryKey });
    qc.invalidateQueries({ queryKey: adapter.itemsQueryKey });
  };

  const createFolder = useMutation({
    mutationFn: (name: string) => adapter.createFolder(name),
    onSuccess: invalidate,
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => adapter.updateFolder(id, { name }),
    onSuccess: invalidate,
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => adapter.deleteFolder(id),
    onSuccess: invalidate,
  });

  const bulkSortFolders = useMutation({
    mutationFn: (ordered: Folder[]) =>
      adapter.bulkSortFolders(ordered.map((f, i) => ({ id: f.id, sortOrder: i }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: adapter.foldersQueryKey }),
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, folderId }: { itemId: string; folderId: string | null }) =>
      adapter.moveItemToFolder(itemId, folderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: adapter.itemsQueryKey }),
  });

  const bulkMoveItems = useMutation({
    mutationFn: ({ itemIds, folderId }: { itemIds: string[]; folderId: string | null }) => {
      if (!adapter.bulkMoveItemsToFolder) throw new Error("Adapter does not support bulk move");
      return adapter.bulkMoveItemsToFolder(itemIds, folderId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adapter.itemsQueryKey }),
  });

  return { createFolder, renameFolder, deleteFolder, bulkSortFolders, moveItem, bulkMoveItems };
}
