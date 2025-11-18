import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';

// Event type matching database schema
export interface AnesthesiaEvent {
  id: string;
  anesthesiaRecordId: string;
  timestamp: string | Date;
  eventType?: string | null;
  description?: string | null;
  createdBy?: string | null;
  createdAt?: string | Date | null;
}

// Mutation hooks for Events CRUD

export function useCreateEvent(recordId: string) {
  return useMutation({
    mutationFn: async (event: Omit<AnesthesiaEvent, 'id' | 'createdAt'>) => {
      return apiRequest('POST', '/api/anesthesia/events', event);
    },
    onSuccess: () => {
      // Invalidate the events query to refetch fresh data
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });
      
      // Also invalidate the anesthesia record query
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records/surgery'] });
    },
  });
}

export function useUpdateEvent(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, ...event }: Partial<AnesthesiaEvent> & { id: string }) => {
      return apiRequest('PATCH', `/api/anesthesia/events/${id}`, event);
    },
    onSuccess: () => {
      // Invalidate the events query to refetch fresh data
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });
      
      // Also invalidate the anesthesia record query
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records/surgery'] });
    },
  });
}

export function useDeleteEvent(recordId: string) {
  return useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest('DELETE', `/api/anesthesia/events/${eventId}`);
    },
    onSuccess: () => {
      // Invalidate the events query to refetch fresh data
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });
      
      // Also invalidate the anesthesia record query
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records/surgery'] });
    },
  });
}
