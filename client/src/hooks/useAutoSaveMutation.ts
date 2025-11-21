import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: unknown[];
  debounceMs?: number;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

/**
 * Simple, proven auto-save pattern using debounced value + useEffect.
 * Based on React community best practices for 2025.
 */
export function useAutoSaveMutation<TData = unknown, TVariables = unknown>({
  mutationFn,
  queryKey,
  debounceMs = 500,
  onSuccess,
  onError,
}: UseAutoSaveMutationOptions<TData, TVariables>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [pendingData, setPendingData] = useState<TVariables | null>(null);
  const [debouncedData, setDebouncedData] = useState<TVariables | null>(null);
  const isFirstRender = useRef(true);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce the pending data
  useEffect(() => {
    if (pendingData === null) return;

    const timer = setTimeout(() => {
      setDebouncedData(pendingData);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [pendingData, debounceMs]);

  // Underlying mutation
  const mutation = useMutation({
    mutationFn,
    onSuccess: (data) => {
      setStatus('saved');
      queryClient.invalidateQueries({ queryKey });
      onSuccess?.(data);
      
      // Auto-reset to idle after 2 seconds
      savedTimerRef.current = setTimeout(() => {
        setStatus('idle');
      }, 2000);
    },
    onError: (error: Error) => {
      setStatus('error');
      onError?.(error);
      console.error('Auto-save error:', error);
    },
  });

  // Trigger mutation when debounced data changes
  useEffect(() => {
    // Skip initial mount to avoid double-saves in Strict Mode
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (debouncedData === null) return;

    let isCurrent = true;

    const save = async () => {
      setStatus('saving');
      try {
        await mutation.mutateAsync(debouncedData);
      } catch (error) {
        // Error handled in mutation onError
      }
      
      // Clear pending if this is still the current effect
      if (isCurrent) {
        setPendingData(null);
      }
    };

    save();

    return () => {
      isCurrent = false;
    };
  }, [debouncedData, mutation]);

  // Cleanup saved timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // Public mutate function
  const mutate = (variables: TVariables) => {
    // Clear saved status timer
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }

    setPendingData(variables);
  };

  // Cancel pending saves
  const cancel = () => {
    setPendingData(null);
    setDebouncedData(null);
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    setStatus('idle');
  };

  return {
    mutate,
    status,
    cancel,
    isError: mutation.isError,
    error: mutation.error,
  };
}
