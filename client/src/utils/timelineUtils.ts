/**
 * Timeline Utilities
 * 
 * Time calculation, snapping, and coordinate conversion utilities
 * specifically for the UnifiedTimeline component.
 */

// ===== TIME CONSTANTS =====

export const ONE_MINUTE = 60 * 1000;
export const FIVE_MINUTES = 5 * 60 * 1000;
export const TEN_MINUTES = 10 * 60 * 1000;
export const THIRTY_MINUTES = 30 * 60 * 1000;
export const ONE_HOUR = 60 * 60 * 1000;
export const TWO_HOURS = 120 * 60 * 1000;
export const FOUR_HOURS = 240 * 60 * 1000;
export const EIGHT_HOURS = 480 * 60 * 1000;
export const TWENTY_HOURS = 1200 * 60 * 1000;

// ===== ZOOM LEVELS =====

/**
 * Predefined zoom levels (time spans) for timeline viewing
 * Used for zoom in/out functionality
 */
export const ZOOM_LEVELS = [
  FIVE_MINUTES,     // 5 min
  TEN_MINUTES,      // 10 min
  THIRTY_MINUTES,   // 30 min
  50 * 60 * 1000,   // 50 min - DEFAULT
  80 * 60 * 1000,   // 80 min
  TWO_HOURS,        // 120 min (2 hours)
  FOUR_HOURS,       // 240 min (4 hours)
  EIGHT_HOURS,      // 480 min (8 hours)
  TWENTY_HOURS,     // 1200 min (20 hours)
];

/**
 * Find the index of the zoom level closest to the given time span
 */
export function findClosestZoomLevel(timeSpan: number): number {
  let closestIndex = 0;
  let minDiff = Math.abs(timeSpan - ZOOM_LEVELS[0]);
  
  for (let i = 1; i < ZOOM_LEVELS.length; i++) {
    const diff = Math.abs(timeSpan - ZOOM_LEVELS[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }
  
  return closestIndex;
}

// ===== TIMESTAMP SNAPPING =====

/**
 * Snap a timestamp to the nearest interval
 * @param timestamp - Timestamp in milliseconds
 * @param interval - Snap interval in milliseconds (e.g., 60000 for 1 minute)
 * @returns Snapped timestamp
 */
export function snapToInterval(timestamp: number, interval: number): number {
  return Math.round(timestamp / interval) * interval;
}

/**
 * Calculate appropriate snap interval based on zoom level
 * Rule 1: tick interval <= 2 min → snap to 1 min
 * Rule 2: tick interval > 2 and <= 15 min → snap to 5 min
 * Rule 3: tick interval > 15 min → snap to 10 min
 */
export function calculateSnapInterval(intervalMinutes: number): number {
  if (intervalMinutes <= 2) {
    return ONE_MINUTE;
  } else if (intervalMinutes <= 15) {
    return FIVE_MINUTES;
  } else {
    return TEN_MINUTES;
  }
}

/**
 * Estimate snap interval from visible time range
 * Assumes ECharts typically shows ~15 ticks
 */
export function estimateSnapIntervalFromRange(visibleRangeMs: number): number {
  const estimatedTickCount = 15;
  const estimatedTickInterval = visibleRangeMs / estimatedTickCount;
  const intervalMinutes = estimatedTickInterval / ONE_MINUTE;
  
  return calculateSnapInterval(intervalMinutes);
}

// ===== COORDINATE CONVERSIONS =====

/**
 * Convert screen X coordinate to timestamp
 * @param clientX - Screen X coordinate
 * @param rectLeft - Chart container left offset
 * @param rectWidth - Chart container width
 * @param visibleStart - Visible time range start (ms)
 * @param visibleEnd - Visible time range end (ms)
 * @returns Timestamp in milliseconds
 */
export function screenToTimestamp(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  visibleStart: number,
  visibleEnd: number
): number {
  const x = clientX - rectLeft;
  const xPercent = x / rectWidth;
  const visibleRange = visibleEnd - visibleStart;
  return visibleStart + (xPercent * visibleRange);
}

/**
 * Convert timestamp to percentage within a time range
 * @param timestamp - Timestamp in milliseconds
 * @param rangeStart - Range start timestamp
 * @param rangeEnd - Range end timestamp
 * @returns Percentage (0-100)
 */
export function timestampToPercent(
  timestamp: number,
  rangeStart: number,
  rangeEnd: number
): number {
  const range = rangeEnd - rangeStart;
  return ((timestamp - rangeStart) / range) * 100;
}

/**
 * Convert percentage to timestamp within a time range
 * @param percent - Percentage (0-100)
 * @param rangeStart - Range start timestamp
 * @param rangeEnd - Range end timestamp
 * @returns Timestamp in milliseconds
 */
export function percentToTimestamp(
  percent: number,
  rangeStart: number,
  rangeEnd: number
): number {
  const range = rangeEnd - rangeStart;
  return rangeStart + (percent / 100) * range;
}

/**
 * Calculate zoom percentages for a new time span centered around current view
 * @param currentMin - Current visible start timestamp
 * @param currentMax - Current visible end timestamp
 * @param newSpan - New time span to display (ms)
 * @param dataStart - Full data range start
 * @param dataEnd - Full data range end
 * @returns Object with start and end percentages
 */
export function calculateZoomPercentages(
  currentMin: number,
  currentMax: number,
  newSpan: number,
  dataStart: number,
  dataEnd: number
): { startPercent: number; endPercent: number } {
  const center = (currentMin + currentMax) / 2;
  const fullRange = dataEnd - dataStart;
  
  // Calculate new start and end, constrained to data bounds
  let newStart = center - newSpan / 2;
  let newEnd = center + newSpan / 2;
  
  if (newStart < dataStart) {
    newStart = dataStart;
    newEnd = newStart + newSpan;
  }
  if (newEnd > dataEnd) {
    newEnd = dataEnd;
    newStart = newEnd - newSpan;
  }
  
  // Convert to percentages
  const startPercent = ((newStart - dataStart) / fullRange) * 100;
  const endPercent = ((newEnd - dataStart) / fullRange) * 100;
  
  return { startPercent, endPercent };
}

/**
 * Calculate pan percentages for shifting the view left or right
 * @param start - Current start percentage
 * @param end - Current end percentage
 * @param direction - 'left' or 'right'
 * @param panAmount - Amount to pan as fraction of visible range (default 0.2 = 20%)
 * @returns Object with new start and end percentages
 */
export function calculatePanPercentages(
  start: number,
  end: number,
  direction: 'left' | 'right',
  panAmount: number = 0.2
): { startPercent: number; endPercent: number } {
  const range = end - start;
  const shift = range * panAmount;
  
  let newStart: number;
  let newEnd: number;
  
  if (direction === 'left') {
    newStart = Math.max(0, start - shift);
    newEnd = newStart + range;
  } else {
    newEnd = Math.min(100, end + shift);
    newStart = newEnd - range;
  }
  
  return { startPercent: newStart, endPercent: newEnd };
}

/**
 * Calculate NOW line position as CSS left value
 * @param currentTime - Current timestamp
 * @param visibleStart - Visible range start
 * @param visibleEnd - Visible range end
 * @param chartLeftOffset - Left offset of chart area (e.g., '200px')
 * @param chartWidthCalc - Chart width calculation (e.g., '100% - 210px')
 * @returns CSS left position or '-10px' if out of range
 */
export function calculateNowLinePosition(
  currentTime: number,
  visibleStart: number,
  visibleEnd: number,
  chartLeftOffset: string = '200px',
  chartWidthCalc: string = '100% - 210px'
): string {
  const visibleRange = visibleEnd - visibleStart;
  const xFraction = (currentTime - visibleStart) / visibleRange;
  
  // Only show if in visible range
  if (xFraction >= 0 && xFraction <= 1) {
    return `calc(${chartLeftOffset} + ${xFraction} * (${chartWidthCalc}))`;
  } else {
    return '-10px'; // Off screen
  }
}
