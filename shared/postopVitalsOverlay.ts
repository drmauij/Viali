// shared/postopVitalsOverlay.ts

export type PlannedVitalsCheckStatus = 'planned' | 'done' | 'missed' | 'cancelled';

export interface PlannedVitalsCheckLike {
  plannedAt: number;
  status: PlannedVitalsCheckStatus;
}

export interface VitalsMonitoringItemLike {
  min?: number;
  max?: number;
  actionLow?: string;
  actionHigh?: string;
}

export type OverlayClassification = 'upcoming' | 'overdue' | 'done' | 'cancelled';

export function classifyPlannedCheck(
  event: PlannedVitalsCheckLike,
  now: number,
): OverlayClassification {
  if (event.status === 'done' || event.status === 'missed') {
    return event.status === 'done' ? 'done' : 'overdue';
  }
  if (event.status === 'cancelled') return 'cancelled';
  return event.plannedAt < now ? 'overdue' : 'upcoming';
}

export type DeviationKind = 'ok' | 'low' | 'high';

export interface DeviationResult {
  kind: DeviationKind;
  action?: string;
}

export function checkDeviation(value: number, item: VitalsMonitoringItemLike): DeviationResult {
  if (item.min !== undefined && value < item.min) {
    return { kind: 'low', action: item.actionLow };
  }
  if (item.max !== undefined && value > item.max) {
    return { kind: 'high', action: item.actionHigh };
  }
  return { kind: 'ok' };
}

export const PARAM_ROW_ORDER = ['BP', 'pulse', 'temp', 'spo2', 'bz'] as const;
export type VitalsParameter = typeof PARAM_ROW_ORDER[number];
