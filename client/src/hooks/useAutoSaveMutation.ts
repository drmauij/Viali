import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: unknown[];
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

/**
 * Immediate auto-save mutation hook with request serialization.
 * Queues rapid edits and ensures only the latest value is saved.
 */
export function useAutoSaveMutation<TData = unknown, TVariables = unknown>({
  mutationFn,
  queryKey,
  onSuccess,
  onError,
}: UseAutoSaveMutationOptions<TData, TVariables>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const queuedDataRef = useRef<TVariables | null>(null);
  const isInFlightRef = useRef(false);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const mutation = useMutation({
    mutationFn,
    onMutate: () => {
      // Clear any existing saved status timer
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
      
      isInFlightRef.current = true;
      
      if (isMountedRef.current) {
        setStatus('saving');
      }
    },
    onSuccess: (data) => {
      isInFlightRef.current = false;
      
      if (!isMountedRef.current) return;
      
      // Check if there's a queued request
      const queued = queuedDataRef.current;
      if (queued !== null) {
        // Process queued request
        queuedDataRef.current = null;
        mutation.mutate(queued);
        return;
      }
      
      // No queued request - show saved
      setStatus('saved');
      queryClient.invalidateQueries({ queryKey });
      onSuccess?.(data);
      
      // Auto-reset to idle after 2 seconds
      savedTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setStatus('idle');
        }
      }, 2000);
    },
    onError: (error: Error) => {
      isInFlightRef.current = false;
      queuedDataRef.current = null;
      
      if (!isMountedRef.current) return;
      
      setStatus('error');
      onError?.(error);
      console.error('Auto-save error:', error);
    },
  });

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // Public mutate function with queuing
  const mutate = (variables: TVariables) => {
    // If a mutation is in flight, queue this request
    if (isInFlightRef.current) {
      queuedDataRef.current = variables;
      return;
    }
    
    // Otherwise, execute immediately
    queuedDataRef.current = null;
    mutation.mutate(variables);
  };

  return {
    mutate,
    status,
    isError: mutation.isError,
    error: mutation.error,
  };
}
