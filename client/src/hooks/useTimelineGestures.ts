import { useEffect, useRef, useCallback } from 'react';

interface GestureCallbacks {
  onPanLeft: () => void;
  onPanRight: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startDistance: number;
  isPinching: boolean;
  isPanning: boolean;
  isDirectionLocked: boolean;
  isHorizontal: boolean;
}

export function useTimelineGestures(
  containerRef: React.RefObject<HTMLElement>,
  callbacks: GestureCallbacks,
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options ?? {};
  const touchStateRef = useRef<TouchState>({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startDistance: 0,
    isPinching: false,
    isPanning: false,
    isDirectionLocked: false,
    isHorizontal: false,
  });
  
  const lastPinchDistanceRef = useRef<number>(0);
  const lastPanXRef = useRef<number>(0);
  const accumulatedPanRef = useRef<number>(0);
  const accumulatedPinchRef = useRef<number>(1);

  const getDistance = useCallback((touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    
    const state = touchStateRef.current;
    
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getDistance(e.touches[0], e.touches[1]);
      state.startDistance = distance;
      state.isPinching = true;
      state.isPanning = false;
      lastPinchDistanceRef.current = distance;
      accumulatedPinchRef.current = 1;
    } else if (e.touches.length === 1) {
      state.startX = e.touches[0].clientX;
      state.startY = e.touches[0].clientY;
      state.lastX = e.touches[0].clientX;
      state.lastY = e.touches[0].clientY;
      state.isPanning = false;
      state.isPinching = false;
      state.isDirectionLocked = false;
      state.isHorizontal = false;
      lastPanXRef.current = e.touches[0].clientX;
      accumulatedPanRef.current = 0;
    }
  }, [enabled, getDistance]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    
    const state = touchStateRef.current;
    
    if (e.touches.length === 2 && state.isPinching) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const pinchRatio = currentDistance / lastPinchDistanceRef.current;
      
      accumulatedPinchRef.current *= pinchRatio;
      lastPinchDistanceRef.current = currentDistance;
      
      if (accumulatedPinchRef.current > 1.15) {
        callbacks.onZoomIn();
        accumulatedPinchRef.current = 1;
      } else if (accumulatedPinchRef.current < 0.85) {
        callbacks.onZoomOut();
        accumulatedPinchRef.current = 1;
      }
    } else if (e.touches.length === 1 && !state.isPinching) {
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      
      if (!state.isDirectionLocked) {
        const deltaX = Math.abs(currentX - state.startX);
        const deltaY = Math.abs(currentY - state.startY);
        const directionThreshold = 10;
        
        if (deltaX > directionThreshold || deltaY > directionThreshold) {
          state.isDirectionLocked = true;
          state.isHorizontal = deltaX > deltaY;
          
          if (state.isHorizontal) {
            state.isPanning = true;
            lastPanXRef.current = currentX;
            accumulatedPanRef.current = 0;
          }
        }
      }
      
      if (state.isPanning && state.isHorizontal) {
        e.preventDefault();
        
        const deltaX = currentX - lastPanXRef.current;
        accumulatedPanRef.current += deltaX;
        lastPanXRef.current = currentX;
        
        const panThreshold = 40;
        
        if (accumulatedPanRef.current > panThreshold) {
          callbacks.onPanLeft();
          accumulatedPanRef.current = 0;
        } else if (accumulatedPanRef.current < -panThreshold) {
          callbacks.onPanRight();
          accumulatedPanRef.current = 0;
        }
      }
    }
  }, [enabled, getDistance, callbacks]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    
    const state = touchStateRef.current;
    
    if (e.touches.length < 2) {
      state.isPinching = false;
      accumulatedPinchRef.current = 1;
    }
    
    if (e.touches.length === 0) {
      state.isPanning = false;
      state.isDirectionLocked = false;
      state.isHorizontal = false;
      accumulatedPanRef.current = 0;
    } else if (e.touches.length === 1) {
      state.lastX = e.touches[0].clientX;
      state.lastY = e.touches[0].clientY;
      lastPanXRef.current = e.touches[0].clientX;
    }
  }, [enabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    
    const touchMoveHandler = (e: TouchEvent) => {
      handleTouchMove(e);
    };
    
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', touchMoveHandler, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', touchMoveHandler);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [containerRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
