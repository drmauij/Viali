/**
 * Calculate net work minutes from start/end times and pause.
 * Handles overnight shifts (end < start → adds 24h).
 */
export function calculateWorkMinutes(timeStart: string, timeEnd: string, pauseMinutes: number): number {
  if (!timeStart || !timeEnd) return 0;

  const [startH, startM] = timeStart.split(":").map(Number);
  const [endH, endM] = timeEnd.split(":").map(Number);

  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  // Handle overnight shift
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  totalMinutes -= pauseMinutes;
  if (totalMinutes < 0) totalMinutes = 0;

  return totalMinutes;
}

/**
 * Calculate net work hours as a formatted "H:MM" string.
 */
export function calculateWorkHours(timeStart: string, timeEnd: string, pauseMinutes: number): string {
  const totalMinutes = calculateWorkMinutes(timeStart, timeEnd, pauseMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}
