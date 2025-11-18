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
    onMutate: async (newEvent) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });

      // Snapshot the previous value
      const previousEvents = queryClient.getQueryData<AnesthesiaEvent[]>([
        `/api/anesthesia/events/${recordId}`,
      ]);

      // Optimistically update to the new value
      if (previousEvents) {
        const optimisticEvent: AnesthesiaEvent = {
          ...newEvent,
          id: `temp-${Date.now()}`, // Temporary ID
          timestamp: newEvent.timestamp,
          createdAt: new Date().toISOString(),
        };

        queryClient.setQueryData<AnesthesiaEvent[]>(
          [`/api/anesthesia/events/${recordId}`],
          [...previousEvents, optimisticEvent]
        );
      }

      return { previousEvents };
    },
    onError: (err, newEvent, context) => {
      // Rollback on error
      if (context?.previousEvents) {
        queryClient.setQueryData(
          [`/api/anesthesia/events/${recordId}`],
          context.previousEvents
        );
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records/surgery'] });
    },
  });
}

export function useUpdateEvent(recordId: string) {
  return useMutation({
    mutationFn: async ({ id, ...event }: Partial<AnesthesiaEvent> & { id: string }) => {
      return apiRequest('PATCH', `/api/anesthesia/events/${id}`, event);
    },
    onMutate: async ({ id, ...updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });

      // Snapshot the previous value
      const previousEvents = queryClient.getQueryData<AnesthesiaEvent[]>([
        `/api/anesthesia/events/${recordId}`,
      ]);

      // Optimistically update to the new value
      if (previousEvents) {
        const updatedEvents = previousEvents.map((event) =>
          event.id === id ? { ...event, ...updates } : event
        );

        queryClient.setQueryData<AnesthesiaEvent[]>(
          [`/api/anesthesia/events/${recordId}`],
          updatedEvents
        );
      }

      return { previousEvents };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousEvents) {
        queryClient.setQueryData(
          [`/api/anesthesia/events/${recordId}`],
          context.previousEvents
        );
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records/surgery'] });
    },
  });
}

export function useDeleteEvent(recordId: string) {
  return useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest('DELETE', `/api/anesthesia/events/${eventId}`);
    },
    onMutate: async (eventId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });

      // Snapshot the previous value
      const previousEvents = queryClient.getQueryData<AnesthesiaEvent[]>([
        `/api/anesthesia/events/${recordId}`,
      ]);

      // Optimistically remove the event
      if (previousEvents) {
        const filteredEvents = previousEvents.filter((event) => event.id !== eventId);

        queryClient.setQueryData<AnesthesiaEvent[]>(
          [`/api/anesthesia/events/${recordId}`],
          filteredEvents
        );
      }

      return { previousEvents };
    },
    onError: (err, eventId, context) => {
      // Rollback on error
      if (context?.previousEvents) {
        queryClient.setQueryData(
          [`/api/anesthesia/events/${recordId}`],
          context.previousEvents
        );
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/events/${recordId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records/surgery'] });
    },
  });
}
