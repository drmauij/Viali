import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CameraImage {
  key: string;
  timestamp: string;
  size?: number;
  lastModified?: string;
  downloadUrl?: string;
  base64?: string;
}

interface AutoCaptureState {
  isEnabled: boolean;
  isProcessing: boolean;
  lastProcessedTimestamp: string | null;
  lastError: string | null;
  processedCount: number;
}

interface UseAutoCameraCaptureOptions {
  cameraId: string | null;
  intervalSeconds?: number;
  onImageCaptured?: (base64: string, timestamp: number) => Promise<void>;
  autoConfirm?: boolean;
}

export function useAutoCameraCapture({
  cameraId,
  intervalSeconds = 300,
  onImageCaptured,
  autoConfirm = true,
}: UseAutoCameraCaptureOptions) {
  const { toast } = useToast();
  const [state, setState] = useState<AutoCaptureState>({
    isEnabled: false,
    isProcessing: false,
    lastProcessedTimestamp: null,
    lastError: null,
    processedCount: 0,
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRef = useRef<string | null>(null);

  const fetchLatestImage = useCallback(async (): Promise<CameraImage | null> => {
    if (!cameraId) return null;

    try {
      const response = await fetch(`/cameras/${cameraId}/latest`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch latest image');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching latest camera image:', error);
      return null;
    }
  }, [cameraId]);

  const fetchImageBase64 = useCallback(async (cameraId: string, timestamp: string): Promise<string | null> => {
    try {
      const response = await fetch(`/cameras/${cameraId}/images/${timestamp}/base64`);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }
      const data = await response.json();
      return data.base64;
    } catch (error) {
      console.error('Error fetching image base64:', error);
      return null;
    }
  }, []);

  const processImage = useCallback(async () => {
    if (!cameraId || state.isProcessing) return;

    setState(prev => ({ ...prev, isProcessing: true, lastError: null }));

    try {
      const latestImage = await fetchLatestImage();
      
      if (!latestImage) {
        setState(prev => ({ ...prev, isProcessing: false }));
        return;
      }

      if (lastProcessedRef.current === latestImage.timestamp) {
        setState(prev => ({ ...prev, isProcessing: false }));
        return;
      }

      const base64 = await fetchImageBase64(cameraId, latestImage.timestamp);
      
      if (!base64) {
        throw new Error('Failed to load image data');
      }

      const timestampDate = new Date(latestImage.timestamp.replace(/T/g, ' ').replace(/-/g, ':'));
      const timestampMs = timestampDate.getTime() || Date.now();

      if (onImageCaptured) {
        await onImageCaptured(`data:image/jpeg;base64,${base64}`, timestampMs);
      }

      lastProcessedRef.current = latestImage.timestamp;
      setState(prev => ({
        ...prev,
        isProcessing: false,
        lastProcessedTimestamp: latestImage.timestamp,
        processedCount: prev.processedCount + 1,
      }));

      if (!autoConfirm) {
        toast({
          title: 'New vitals captured',
          description: `Image from ${latestImage.timestamp} processed`,
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        lastError: errorMessage 
      }));
      
      toast({
        title: 'Auto-capture error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [cameraId, state.isProcessing, fetchLatestImage, fetchImageBase64, onImageCaptured, autoConfirm, toast]);

  const start = useCallback(() => {
    if (!cameraId) {
      toast({
        title: 'No camera configured',
        description: 'Please select a camera device first',
        variant: 'destructive',
      });
      return;
    }

    setState(prev => ({ ...prev, isEnabled: true }));
    
    processImage();
    
    intervalRef.current = setInterval(() => {
      processImage();
    }, intervalSeconds * 1000);

    toast({
      title: 'Auto-capture started',
      description: `Fetching vitals every ${intervalSeconds / 60} minutes`,
    });
  }, [cameraId, intervalSeconds, processImage, toast]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isEnabled: false }));
    
    toast({
      title: 'Auto-capture stopped',
    });
  }, [toast]);

  const toggle = useCallback(() => {
    if (state.isEnabled) {
      stop();
    } else {
      start();
    }
  }, [state.isEnabled, start, stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (state.isEnabled && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        processImage();
      }, intervalSeconds * 1000);
    }
  }, [intervalSeconds, state.isEnabled, processImage]);

  return {
    ...state,
    start,
    stop,
    toggle,
    processImage,
    fetchLatestImage,
  };
}
