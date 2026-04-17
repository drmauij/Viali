export type Folder = {
  id: string;
  name: string;
  sortOrder: number;
};

export type FolderItem = {
  id: string;
  folderId: string | null;
  name: string;
};

export type FolderAdapter = {
  /** Stable query key identifying the folders query for react-query caching */
  foldersQueryKey: readonly unknown[];
  /** Stable query key identifying the items query (used to invalidate on moves) */
  itemsQueryKey: readonly unknown[];
  listFolders: () => Promise<Folder[]>;
  createFolder: (name: string) => Promise<Folder>;
  updateFolder: (id: string, patch: { name?: string; sortOrder?: number }) => Promise<Folder>;
  deleteFolder: (id: string) => Promise<void>;
  bulkSortFolders: (ordered: { id: string; sortOrder: number }[]) => Promise<void>;
  moveItemToFolder: (itemId: string, folderId: string | null) => Promise<void>;
  bulkMoveItemsToFolder?: (itemIds: string[], folderId: string | null) => Promise<void>;
};
