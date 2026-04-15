export type PlannedMedStatus = 'planned' | 'done' | 'missed' | 'cancelled';
export type MedClassification = 'upcoming' | 'overdue' | 'done' | 'cancelled';

export interface PlannedMedEventLike {
  plannedAt: number;
  status: PlannedMedStatus;
}

export interface PrnItemLike {
  id: string;
  prnMaxPerDay?: number;
  prnMaxPerInterval?: { intervalH: number; count: number };
}

export interface PrnAdminLike {
  itemId: string;
  administeredAt: number;
}

export function classifyPlannedMedEvent(event: PlannedMedEventLike, now: number): MedClassification {
  if (event.status === 'done') return 'done';
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'missed') return 'overdue';
  return event.plannedAt < now ? 'overdue' : 'upcoming';
}

export function countPrnAdminsInWindow(
  admins: PrnAdminLike[],
  itemId: string,
  windowMs: number,
  now: number,
): number {
  const windowStart = now - windowMs;
  return admins.filter(
    a => a.itemId === itemId && a.administeredAt >= windowStart && a.administeredAt <= now,
  ).length;
}

export function isPrnCapReached(item: PrnItemLike, admins: PrnAdminLike[], now: number): boolean {
  const DAY_MS = 24 * 3_600_000;
  if (item.prnMaxPerDay !== undefined) {
    const dailyCount = countPrnAdminsInWindow(admins, item.id, DAY_MS, now);
    if (dailyCount >= item.prnMaxPerDay) return true;
  }
  if (item.prnMaxPerInterval) {
    const intervalMs = item.prnMaxPerInterval.intervalH * 3_600_000;
    const intervalCount = countPrnAdminsInWindow(admins, item.id, intervalMs, now);
    if (intervalCount >= item.prnMaxPerInterval.count) return true;
  }
  return false;
}
