import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  AnesthesiaInstallation,
  InsertAnesthesiaInstallation,
  AnesthesiaAirwayManagement,
  InsertAnesthesiaAirwayManagement,
  AnesthesiaGeneralTechnique,
  InsertAnesthesiaGeneralTechnique,
  AnesthesiaNeuraxialBlock,
  InsertAnesthesiaNeuraxialBlock,
  AnesthesiaPeripheralBlock,
  InsertAnesthesiaPeripheralBlock,
} from "@shared/schema";

// ==================== INSTALLATIONS ====================

export function useInstallations(recordId: string) {
  return useQuery<AnesthesiaInstallation[] | undefined>({
    queryKey: ["/api/anesthesia/installations", recordId],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/installations/${recordId}`);
      if (!response.ok) throw new Error('Failed to fetch installations');
      return response.json();
    },
    enabled: !!recordId,
  });
}

export function useCreateInstallation(recordId: string) {
  return useMutation({
    mutationFn: async (data: Omit<InsertAnesthesiaInstallation, 'anesthesiaRecordId'>) => {
      // anesthesiaRecordId is added to the payload here since the API expects it in the body
      return await apiRequest("POST", `/api/anesthesia/installations`, { ...data, anesthesiaRecordId: recordId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia/installations", recordId] });
    },
  });
}

export function useUpdateInstallation(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<InsertAnesthesiaInstallation, 'anesthesiaRecordId'>> }) => {
      // anesthesiaRecordId should NOT be in update payload
      return await apiRequest("PATCH", `/api/anesthesia/installations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia/installations", recordId] });
    },
  });
}

export function useDeleteInstallation(recordId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/anesthesia/installations/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia/installations", recordId] });
    },
  });
}

// ==================== AIRWAY MANAGEMENT ====================

export function useAirwayManagement(recordId: string) {
  return useQuery<AnesthesiaAirwayManagement | null>({
    queryKey: [`/api/anesthesia/${recordId}/airway`],
    enabled: !!recordId,
  });
}

export function useUpsertAirwayManagement(recordId: string) {
  return useMutation({
    mutationFn: async (data: Omit<InsertAnesthesiaAirwayManagement, 'anesthesiaRecordId'>) => {
      // anesthesiaRecordId is injected from URL params on the backend
      return await apiRequest("POST", `/api/anesthesia/${recordId}/airway`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/airway`] });
    },
  });
}

export function useDeleteAirwayManagement(recordId: string) {
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/airway`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/airway`] });
    },
  });
}

// ==================== GENERAL TECHNIQUE ====================

export function useGeneralTechnique(recordId: string) {
  return useQuery<AnesthesiaGeneralTechnique | null>({
    queryKey: [`/api/anesthesia/${recordId}/general-technique`],
    enabled: !!recordId,
  });
}

export function useUpsertGeneralTechnique(recordId: string) {
  return useMutation({
    mutationFn: async (data: Omit<InsertAnesthesiaGeneralTechnique, 'anesthesiaRecordId'>) => {
      // anesthesiaRecordId is injected from URL params on the backend
      return await apiRequest("POST", `/api/anesthesia/${recordId}/general-technique`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/general-technique`] });
    },
  });
}

export function useDeleteGeneralTechnique(recordId: string) {
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/general-technique`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/general-technique`] });
    },
  });
}

// ==================== NEURAXIAL BLOCKS ====================

export function useNeuraxialBlocks(recordId: string) {
  return useQuery<AnesthesiaNeuraxialBlock[] | undefined>({
    queryKey: [`/api/anesthesia/${recordId}/neuraxial-blocks`],
    enabled: !!recordId,
  });
}

export function useCreateNeuraxialBlock(recordId: string) {
  return useMutation({
    mutationFn: async (data: Omit<InsertAnesthesiaNeuraxialBlock, 'anesthesiaRecordId'>) => {
      // anesthesiaRecordId is injected from URL params on the backend
      return await apiRequest("POST", `/api/anesthesia/${recordId}/neuraxial-blocks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/neuraxial-blocks`] });
    },
  });
}

export function useUpdateNeuraxialBlock(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<InsertAnesthesiaNeuraxialBlock, 'anesthesiaRecordId'>> }) => {
      // anesthesiaRecordId should NOT be in update payload
      return await apiRequest("PATCH", `/api/anesthesia/${recordId}/neuraxial-blocks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/neuraxial-blocks`] });
    },
  });
}

export function useDeleteNeuraxialBlock(recordId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/neuraxial-blocks/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/neuraxial-blocks`] });
    },
  });
}

// ==================== PERIPHERAL BLOCKS ====================

export function usePeripheralBlocks(recordId: string) {
  return useQuery<AnesthesiaPeripheralBlock[] | undefined>({
    queryKey: [`/api/anesthesia/${recordId}/peripheral-blocks`],
    enabled: !!recordId,
  });
}

export function useCreatePeripheralBlock(recordId: string) {
  return useMutation({
    mutationFn: async (data: Omit<InsertAnesthesiaPeripheralBlock, 'anesthesiaRecordId'>) => {
      // anesthesiaRecordId is injected from URL params on the backend
      return await apiRequest("POST", `/api/anesthesia/${recordId}/peripheral-blocks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/peripheral-blocks`] });
    },
  });
}

export function useUpdatePeripheralBlock(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<InsertAnesthesiaPeripheralBlock, 'anesthesiaRecordId'>> }) => {
      // anesthesiaRecordId should NOT be in update payload
      return await apiRequest("PATCH", `/api/anesthesia/${recordId}/peripheral-blocks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/peripheral-blocks`] });
    },
  });
}

export function useDeletePeripheralBlock(recordId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/peripheral-blocks/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${recordId}/peripheral-blocks`] });
    },
  });
}

// ==================== CHECKLISTS ====================

interface ChecklistPhaseData {
  checklist?: Record<string, boolean>;
  notes?: string;
  signature?: string;
}

export function useUpdateSignInChecklist(recordId: string, surgeryId: string) {
  return useMutation({
    mutationFn: async (data: ChecklistPhaseData) => {
      return await apiRequest("PATCH", `/api/anesthesia/records/${recordId}/checklist/sign-in`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
    },
  });
}

export function useUpdateTimeOutChecklist(recordId: string, surgeryId: string) {
  return useMutation({
    mutationFn: async (data: ChecklistPhaseData) => {
      return await apiRequest("PATCH", `/api/anesthesia/records/${recordId}/checklist/time-out`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
    },
  });
}

export function useUpdateSignOutChecklist(recordId: string, surgeryId: string) {
  return useMutation({
    mutationFn: async (data: ChecklistPhaseData) => {
      return await apiRequest("PATCH", `/api/anesthesia/records/${recordId}/checklist/sign-out`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
    },
  });
}
