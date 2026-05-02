export const DEFAULT_ADMISSION_OFFSET_MINUTES = 60;

export function computeAdmission(
  plannedDate: Date | string | null | undefined,
  offsetMinutes: number | null | undefined,
): Date | null {
  if (!plannedDate) return null;
  const start = plannedDate instanceof Date ? plannedDate : new Date(plannedDate);
  if (Number.isNaN(start.getTime())) return null;
  const offset = Number.isFinite(offsetMinutes as number) && (offsetMinutes as number) >= 0
    ? (offsetMinutes as number)
    : DEFAULT_ADMISSION_OFFSET_MINUTES;
  return new Date(start.getTime() - offset * 60 * 1000);
}

export function computeAdmissionISO(
  plannedDate: Date | string | null | undefined,
  offsetMinutes: number | null | undefined,
): string | null {
  return computeAdmission(plannedDate, offsetMinutes)?.toISOString() ?? null;
}
