import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface UseDebouncedAutoSaveOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: unknown[];
  debounceMs?: number;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

/**
 * Debounced auto-save mutation hook.
 * Waits for a pause in edits before saving, reducing server load.
 * Shows "pending" status while waiting for debounce, "saving" during API call.
 */
export function useDebouncedAutoSave<TData = unknown, TVariables = unknown>({
  mutationFn,
  queryKey,
  debounceMs = 800,
  onSuccess,
  onError,
}: UseDebouncedAutoSaveOptions<TData, TVariables>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDataRef = useRef<TVariables | null>(null);
  const isMountedRef = useRef(true);

  const mutation = useMutation({
    mutationFn,
    onMutate: () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
      if (isMountedRef.current) {
        setStatus('saving');
      }
    },
    onSuccess: (data) => {
      if (!isMountedRef.current) return;
      
      setStatus('saved');
      queryClient.invalidateQueries({ queryKey });
      onSuccess?.(data);
      
      savedTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setStatus('idle');
        }
      }, 2000);
    },
    onError: (error: Error) => {
      if (!isMountedRef.current) return;
      
      setStatus('error');
      onError?.(error);
      console.error('Auto-save error:', error);
    },
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const mutate = useCallback((variables: TVariables) => {
    latestDataRef.current = variables;
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    if (isMountedRef.current) {
      setStatus('pending');
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && latestDataRef.current !== null) {
        mutation.mutate(latestDataRef.current);
      }
    }, debounceMs);
  }, [mutation, debounceMs]);

  const flush = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (latestDataRef.current !== null && isMountedRef.current) {
      mutation.mutate(latestDataRef.current);
      latestDataRef.current = null;
    }
  }, [mutation]);

  return {
    mutate,
    flush,
    status,
    isError: mutation.isError,
    error: mutation.error,
    isPending: status === 'pending' || status === 'saving',
  };
}
