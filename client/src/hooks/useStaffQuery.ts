import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { SurgeryStaffEntry, InsertSurgeryStaffEntry } from '@shared/schema';

export type StaffRole = 'surgeon' | 'surgicalAssistant' | 'instrumentNurse' | 'circulatingNurse' | 'anesthesiologist' | 'anesthesiaNurse' | 'pacuNurse';

export function useCreateStaff(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InsertSurgeryStaffEntry) => {
      return await apiRequest(
        'POST',
        '/api/anesthesia/staff',
        data
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });
    },
  });
}

export function useUpdateStaff(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      role?: StaffRole;
      userId?: string | null;
      name?: string;
    }) => {
      const { id, ...updates } = data;
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/staff/${id}`,
        updates
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });
    },
  });
}

export function useDeleteStaff(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (staffId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/staff/${staffId}`
      );
    },
    onMutate: async (staffId) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });

      const previousStaff = queryClient.getQueryData<SurgeryStaffEntry[]>([
        `/api/anesthesia/staff/${anesthesiaRecordId}`,
      ]);

      if (previousStaff) {
        const filteredStaff = previousStaff.filter(
          (s) => s.id !== staffId
        );

        queryClient.setQueryData<SurgeryStaffEntry[]>(
          [`/api/anesthesia/staff/${anesthesiaRecordId}`],
          filteredStaff
        );
      }

      return { previousStaff };
    },
    onError: (err, staffId, context) => {
      if (context?.previousStaff) {
        queryClient.setQueryData(
          [`/api/anesthesia/staff/${anesthesiaRecordId}`],
          context.previousStaff
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });
    },
  });
}
