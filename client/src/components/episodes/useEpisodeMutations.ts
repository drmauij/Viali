import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useEpisodeMutations(patientId: string) {
  const { toast } = useToast();

  const invalidateEpisodes = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/episodes`] });
  };

  const invalidateEpisodeDetail = (episodeId: string) => {
    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/episodes/${episodeId}`] });
  };

  const invalidateEpisodeDocs = (episodeId: string) => {
    queryClient.invalidateQueries({ queryKey: [`/api/episodes/${episodeId}/documents`] });
  };

  const createEpisode = useMutation({
    mutationFn: async (data: { title: string; description?: string; referenceDate?: string }) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/episodes`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateEpisodes();
      toast({ title: "Episode created" });
    },
    onError: () => {
      toast({ title: "Failed to create episode", variant: "destructive" });
    },
  });

  const updateEpisode = useMutation({
    mutationFn: async ({ episodeId, ...data }: { episodeId: string; title?: string; description?: string; referenceDate?: string }) => {
      const res = await apiRequest("PATCH", `/api/patients/${patientId}/episodes/${episodeId}`, data);
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodes();
      invalidateEpisodeDetail(vars.episodeId);
      toast({ title: "Episode updated" });
    },
    onError: () => {
      toast({ title: "Failed to update episode", variant: "destructive" });
    },
  });

  const closeEpisode = useMutation({
    mutationFn: async (episodeId: string) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/episodes/${episodeId}/close`);
      return res.json();
    },
    onSuccess: (_, episodeId) => {
      invalidateEpisodes();
      invalidateEpisodeDetail(episodeId);
      toast({ title: "Episode closed" });
    },
    onError: () => {
      toast({ title: "Failed to close episode", variant: "destructive" });
    },
  });

  const reopenEpisode = useMutation({
    mutationFn: async (episodeId: string) => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/episodes/${episodeId}/reopen`);
      return res.json();
    },
    onSuccess: (_, episodeId) => {
      invalidateEpisodes();
      invalidateEpisodeDetail(episodeId);
      toast({ title: "Episode reopened" });
    },
    onError: () => {
      toast({ title: "Failed to reopen episode", variant: "destructive" });
    },
  });

  const createFolder = useMutation({
    mutationFn: async ({ episodeId, name }: { episodeId: string; name: string }) => {
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/folders`, { name });
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodeDetail(vars.episodeId);
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/folders`] });
      toast({ title: "Folder created" });
    },
    onError: () => {
      toast({ title: "Failed to create folder", variant: "destructive" });
    },
  });

  const updateFolder = useMutation({
    mutationFn: async ({ episodeId, folderId, ...data }: { episodeId: string; folderId: string; name?: string; sortOrder?: number }) => {
      const res = await apiRequest("PATCH", `/api/episodes/${episodeId}/folders/${folderId}`, data);
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodeDetail(vars.episodeId);
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/folders`] });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async ({ episodeId, folderId }: { episodeId: string; folderId: string }) => {
      const res = await apiRequest("DELETE", `/api/episodes/${episodeId}/folders/${folderId}`);
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodeDetail(vars.episodeId);
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/folders`] });
      invalidateEpisodeDocs(vars.episodeId);
      toast({ title: "Folder deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete folder", variant: "destructive" });
    },
  });

  const reorderFolders = useMutation({
    mutationFn: async ({ episodeId, folderIds }: { episodeId: string; folderIds: string[] }) => {
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/folders/reorder`, { folderIds });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/folders`] });
    },
  });

  const assignDocumentToEpisode = useMutation({
    mutationFn: async ({ docId, episodeId, folderId }: { docId: string; episodeId?: string; folderId?: string }) => {
      const res = await apiRequest("PATCH", `/api/patients/${patientId}/documents/${docId}/episode`, { episodeId, folderId });
      return res.json();
    },
    onSuccess: () => {
      invalidateEpisodes();
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
    },
  });

  const moveDocumentToFolder = useMutation({
    mutationFn: async ({ docId, folderId }: { docId: string; folderId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/patients/${patientId}/documents/${docId}/folder`, { folderId });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all episode document queries
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0] as string;
        return key?.includes('/episodes/') && key?.includes('/documents');
      }});
    },
  });

  const linkSurgery = useMutation({
    mutationFn: async ({ episodeId, surgeryId }: { episodeId: string; surgeryId: string }) => {
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/link/surgery/${surgeryId}`);
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodeDetail(vars.episodeId);
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/surgeries`] });
      toast({ title: "Surgery linked" });
    },
    onError: () => {
      toast({ title: "Failed to link surgery", variant: "destructive" });
    },
  });

  const unlinkSurgery = useMutation({
    mutationFn: async ({ episodeId, surgeryId }: { episodeId: string; surgeryId: string }) => {
      const res = await apiRequest("DELETE", `/api/episodes/${episodeId}/link/surgery/${surgeryId}`);
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodeDetail(vars.episodeId);
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/surgeries`] });
      toast({ title: "Surgery unlinked" });
    },
  });

  const linkNote = useMutation({
    mutationFn: async ({ episodeId, noteId }: { episodeId: string; noteId: string }) => {
      const res = await apiRequest("POST", `/api/episodes/${episodeId}/link/note/${noteId}`);
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodeDetail(vars.episodeId);
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/notes`] });
      toast({ title: "Note linked" });
    },
    onError: () => {
      toast({ title: "Failed to link note", variant: "destructive" });
    },
  });

  const unlinkNote = useMutation({
    mutationFn: async ({ episodeId, noteId }: { episodeId: string; noteId: string }) => {
      const res = await apiRequest("DELETE", `/api/episodes/${episodeId}/link/note/${noteId}`);
      return res.json();
    },
    onSuccess: (_, vars) => {
      invalidateEpisodeDetail(vars.episodeId);
      queryClient.invalidateQueries({ queryKey: [`/api/episodes/${vars.episodeId}/notes`] });
      toast({ title: "Note unlinked" });
    },
  });

  return {
    createEpisode,
    updateEpisode,
    closeEpisode,
    reopenEpisode,
    createFolder,
    updateFolder,
    deleteFolder,
    reorderFolders,
    assignDocumentToEpisode,
    moveDocumentToFolder,
    linkSurgery,
    unlinkSurgery,
    linkNote,
    unlinkNote,
  };
}
