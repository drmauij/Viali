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
    queryKey: ["/api/anesthesia", recordId, "installations"],
    enabled: !!recordId,
  });
}

export function useCreateInstallation(recordId: string) {
  return useMutation({
    mutationFn: async (data: InsertAnesthesiaInstallation) => {
      return await apiRequest("POST", `/api/anesthesia/${recordId}/installations`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "installations"] });
    },
  });
}

export function useUpdateInstallation(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertAnesthesiaInstallation> }) => {
      return await apiRequest("PATCH", `/api/anesthesia/${recordId}/installations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "installations"] });
    },
  });
}

export function useDeleteInstallation(recordId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/installations/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "installations"] });
    },
  });
}

// ==================== AIRWAY MANAGEMENT ====================

export function useAirwayManagement(recordId: string) {
  return useQuery<AnesthesiaAirwayManagement | null>({
    queryKey: ["/api/anesthesia", recordId, "airway"],
    enabled: !!recordId,
  });
}

export function useUpsertAirwayManagement(recordId: string) {
  return useMutation({
    mutationFn: async (data: InsertAnesthesiaAirwayManagement) => {
      return await apiRequest("POST", `/api/anesthesia/${recordId}/airway`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "airway"] });
    },
  });
}

export function useDeleteAirwayManagement(recordId: string) {
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/airway`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "airway"] });
    },
  });
}

// ==================== GENERAL TECHNIQUE ====================

export function useGeneralTechnique(recordId: string) {
  return useQuery<AnesthesiaGeneralTechnique | null>({
    queryKey: ["/api/anesthesia", recordId, "general-technique"],
    enabled: !!recordId,
  });
}

export function useUpsertGeneralTechnique(recordId: string) {
  return useMutation({
    mutationFn: async (data: InsertAnesthesiaGeneralTechnique) => {
      return await apiRequest("POST", `/api/anesthesia/${recordId}/general-technique`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "general-technique"] });
    },
  });
}

export function useDeleteGeneralTechnique(recordId: string) {
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/general-technique`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "general-technique"] });
    },
  });
}

// ==================== NEURAXIAL BLOCKS ====================

export function useNeuraxialBlocks(recordId: string) {
  return useQuery<AnesthesiaNeuraxialBlock[] | undefined>({
    queryKey: ["/api/anesthesia", recordId, "neuraxial-blocks"],
    enabled: !!recordId,
  });
}

export function useCreateNeuraxialBlock(recordId: string) {
  return useMutation({
    mutationFn: async (data: InsertAnesthesiaNeuraxialBlock) => {
      return await apiRequest("POST", `/api/anesthesia/${recordId}/neuraxial-blocks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "neuraxial-blocks"] });
    },
  });
}

export function useUpdateNeuraxialBlock(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertAnesthesiaNeuraxialBlock> }) => {
      return await apiRequest("PATCH", `/api/anesthesia/${recordId}/neuraxial-blocks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "neuraxial-blocks"] });
    },
  });
}

export function useDeleteNeuraxialBlock(recordId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/neuraxial-blocks/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "neuraxial-blocks"] });
    },
  });
}

// ==================== PERIPHERAL BLOCKS ====================

export function usePeripheralBlocks(recordId: string) {
  return useQuery<AnesthesiaPeripheralBlock[] | undefined>({
    queryKey: ["/api/anesthesia", recordId, "peripheral-blocks"],
    enabled: !!recordId,
  });
}

export function useCreatePeripheralBlock(recordId: string) {
  return useMutation({
    mutationFn: async (data: InsertAnesthesiaPeripheralBlock) => {
      return await apiRequest("POST", `/api/anesthesia/${recordId}/peripheral-blocks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "peripheral-blocks"] });
    },
  });
}

export function useUpdatePeripheralBlock(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertAnesthesiaPeripheralBlock> }) => {
      return await apiRequest("PATCH", `/api/anesthesia/${recordId}/peripheral-blocks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "peripheral-blocks"] });
    },
  });
}

export function useDeletePeripheralBlock(recordId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/anesthesia/${recordId}/peripheral-blocks/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia", recordId, "peripheral-blocks"] });
    },
  });
}
