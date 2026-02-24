import { useQuery } from "@tanstack/react-query";

export type PatientEpisode = {
  id: string;
  hospitalId: string;
  patientId: string;
  episodeNumber: string;
  title: string;
  description?: string | null;
  referenceDate?: string | null;
  status: "open" | "closed";
  createdBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EpisodeFolder = {
  id: string;
  episodeId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

export type EpisodeDocument = {
  id: string;
  hospitalId: string;
  patientId: string;
  category: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  description?: string | null;
  uploadedBy?: string | null;
  episodeId?: string | null;
  episodeFolderId?: string | null;
  createdAt: string;
};

export type EpisodeDetail = {
  episode: PatientEpisode;
  folders: EpisodeFolder[];
  documentCount: number;
  surgeryCount: number;
  noteCount: number;
};

export function usePatientEpisodes(patientId: string | undefined) {
  return useQuery<PatientEpisode[]>({
    queryKey: [`/api/patients/${patientId}/episodes`],
    enabled: !!patientId,
  });
}

export function useEpisodeDetail(patientId: string | undefined, episodeId: string | undefined) {
  return useQuery<EpisodeDetail>({
    queryKey: [`/api/patients/${patientId}/episodes/${episodeId}`],
    enabled: !!patientId && !!episodeId,
  });
}

export function useEpisodeDocuments(episodeId: string | undefined) {
  return useQuery<EpisodeDocument[]>({
    queryKey: [`/api/episodes/${episodeId}/documents`],
    enabled: !!episodeId,
  });
}

export function useEpisodeFolders(episodeId: string | undefined) {
  return useQuery<EpisodeFolder[]>({
    queryKey: [`/api/episodes/${episodeId}/folders`],
    enabled: !!episodeId,
  });
}

export function useEpisodeSurgeries(episodeId: string | undefined) {
  return useQuery<any[]>({
    queryKey: [`/api/episodes/${episodeId}/surgeries`],
    enabled: !!episodeId,
  });
}

export function useEpisodeNotes(episodeId: string | undefined) {
  return useQuery<any[]>({
    queryKey: [`/api/episodes/${episodeId}/notes`],
    enabled: !!episodeId,
  });
}
