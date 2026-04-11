import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-select across row cells (provider × day grid) with mouse + touch support.
 *
 * Mouse:
 *   - mousedown on a cell starts a drag
 *   - mouseenter on another cell extends it
 *   - a global mouseup finalizes (a single cell click still finalizes with start===end)
 *
 * Touch:
 *   - touchstart arms a 400ms long-press. If the finger moves >15px before that
 *     timer fires, we treat it as a native scroll/swipe and bail out.
 *   - Once the long-press fires, drag mode is active: subsequent touchmove hit-tests
 *     via elementFromPoint + data-provider-id / data-day-idx attributes and extends
 *     the range. touchmove calls preventDefault to stop the browser from scrolling.
 *   - If the finger lifts before the long-press fires AND there was no significant
 *     move, we treat it as a tap and finalize with a single-cell selection — so a
 *     short tap on touch behaves like a plain click on desktop.
 *
 * Cells must spread `getCellProps(providerId, dayIdx)` onto the element that should
 * receive the interaction — this adds the listeners and the data attrs used for
 * touchmove hit-testing.
 */

interface DragState {
  providerId: string;
  startIdx: number;
  currentIdx: number;
}

interface UseCellDragSelectionOptions {
  readOnly?: boolean;
  /**
   * Called when a drag or tap finalizes. Always invoked inside a `setTimeout(…, 0)`
   * so that any pending synthetic click (which would toggle a Radix
   * `PopoverTrigger`) runs first.
   */
  onFinalize: (providerId: string, startIdx: number, endIdx: number) => void;
}

const LONG_PRESS_MS = 400;
const SWIPE_THRESHOLD_PX = 15;

export function useCellDragSelection({ readOnly, onFinalize }: UseCellDragSelectionOptions) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  // Stable ref to the latest onFinalize so we don't have to re-attach the window
  // listeners on every render.
  const onFinalizeRef = useRef(onFinalize);
  onFinalizeRef.current = onFinalize;

  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; providerId: string; dayIdx: number } | null>(null);

  const handleDragStart = useCallback((providerId: string, dayIdx: number) => {
    if (readOnlyRef.current) return;
    setDragState({ providerId, startIdx: dayIdx, currentIdx: dayIdx });
  }, []);

  const handleDragEnter = useCallback((providerId: string, dayIdx: number) => {
    if (readOnlyRef.current) return;
    setDragState((prev) => {
      if (!prev || prev.providerId !== providerId) return prev;
      if (prev.currentIdx === dayIdx) return prev;
      return { ...prev, currentIdx: dayIdx };
    });
  }, []);

  useEffect(() => {
    const finalizeDrag = (providerId: string, startIdx: number, endIdx: number) => {
      // Defer to next tick so any synthetic click (which would toggle a Radix
      // PopoverTrigger back closed) lands before we open the popover.
      setTimeout(() => {
        onFinalizeRef.current(providerId, startIdx, endIdx);
      }, 0);
    };

    const handleEnd = () => {
      const pendingTap = touchStartRef.current;
      const dragWasActive = !!dragStateRef.current;

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartRef.current = null;

      if (dragWasActive) {
        const ds = dragStateRef.current!;
        setDragState(null);
        const minIdx = Math.min(ds.startIdx, ds.currentIdx);
        const maxIdx = Math.max(ds.startIdx, ds.currentIdx);
        finalizeDrag(ds.providerId, minIdx, maxIdx);
      } else if (pendingTap) {
        // Short tap on touch — no drag ever started, no significant movement.
        // Treat it as a single-cell selection so tap matches desktop click UX.
        if (readOnlyRef.current) return;
        finalizeDrag(pendingTap.providerId, pendingTap.dayIdx, pendingTap.dayIdx);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      // Long-press still pending: watch for swipe-away so we can let the browser scroll.
      if (touchStartRef.current && !dragStateRef.current) {
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;
        if (Math.abs(dx) > SWIPE_THRESHOLD_PX || Math.abs(dy) > SWIPE_THRESHOLD_PX) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          touchStartRef.current = null;
        }
        return; // Don't preventDefault — allow native scroll.
      }

      // Drag active: consume the gesture and hit-test the cell under the finger.
      if (!dragStateRef.current) return;
      e.preventDefault();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el?.closest('[data-provider-id][data-day-idx]') as HTMLElement | null;
      if (!cell) return;
      const providerId = cell.dataset.providerId;
      const dayIdxStr = cell.dataset.dayIdx;
      const dayIdx = dayIdxStr !== undefined ? parseInt(dayIdxStr, 10) : NaN;
      if (providerId && !Number.isNaN(dayIdx)) {
        handleDragEnter(providerId, dayIdx);
      }
    };

    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchend", handleEnd);
    window.addEventListener("touchcancel", handleEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("touchcancel", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, [handleDragEnter]);

  const isInDragRange = useCallback(
    (providerId: string, dayIdx: number) => {
      if (!dragState || dragState.providerId !== providerId) return false;
      const minIdx = Math.min(dragState.startIdx, dragState.currentIdx);
      const maxIdx = Math.max(dragState.startIdx, dragState.currentIdx);
      return dayIdx >= minIdx && dayIdx <= maxIdx;
    },
    [dragState]
  );

  const getCellProps = useCallback(
    (providerId: string, dayIdx: number) => ({
      "data-provider-id": providerId,
      "data-day-idx": String(dayIdx),
      onMouseDown: (e: React.MouseEvent) => {
        if (readOnlyRef.current) return;
        if (e.button !== 0) return;
        e.preventDefault();
        handleDragStart(providerId, dayIdx);
      },
      onMouseEnter: () => {
        if (dragStateRef.current) {
          handleDragEnter(providerId, dayIdx);
        }
      },
      onTouchStart: (e: React.TouchEvent) => {
        if (readOnlyRef.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, providerId, dayIdx };
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          const ts = touchStartRef.current;
          if (ts) {
            handleDragStart(ts.providerId, ts.dayIdx);
          }
        }, LONG_PRESS_MS);
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [handleDragStart, handleDragEnter]
  );

  return {
    dragState,
    isInDragRange,
    getCellProps,
  };
}
