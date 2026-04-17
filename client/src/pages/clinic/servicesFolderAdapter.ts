import type { FolderAdapter, Folder } from "@/components/folders";
import { apiRequest } from "@/lib/queryClient";

export function buildServicesFolderAdapter(hospitalId: string, unitId: string): FolderAdapter {
  const foldersQueryKey = ["service-folders", hospitalId, unitId] as const;
  const itemsQueryKey = [`/api/clinic/${hospitalId}/services`, unitId] as const;
  return {
    foldersQueryKey,
    itemsQueryKey,
    listFolders: async () => {
      const res = await apiRequest("GET", `/api/clinic/${hospitalId}/service-folders?unitId=${unitId}`);
      return (await res.json()) as Folder[];
    },
    createFolder: async (name) => {
      const res = await apiRequest("POST", `/api/clinic/${hospitalId}/service-folders`, { unitId, name });
      return res.json();
    },
    updateFolder: async (id, patch) => {
      const res = await apiRequest("PATCH", `/api/clinic/${hospitalId}/service-folders/${id}`, patch);
      return res.json();
    },
    deleteFolder: async (id) => {
      await apiRequest("DELETE", `/api/clinic/${hospitalId}/service-folders/${id}`);
    },
    bulkSortFolders: async (ordered) => {
      await apiRequest("PATCH", `/api/clinic/${hospitalId}/service-folders/bulk-sort`, { folders: ordered });
    },
    moveItemToFolder: async (serviceId, folderId) => {
      await apiRequest("PATCH", `/api/clinic/${hospitalId}/services/${serviceId}`, { folderId });
    },
    bulkMoveItemsToFolder: async (serviceIds, folderId) => {
      await apiRequest("POST", `/api/clinic/${hospitalId}/services/bulk-move-to-folder`, { serviceIds, folderId });
    },
  };
}
