import type { PostopOrderItem, Frequency, Timing } from './postopOrderItems';
import { SCHEDULABLE_ITEM_TYPES } from './postopOrderItems';

export type PlannedEventKind = 'medication' | 'vitals_check' | 'task' | 'iv_fluid';

export interface PlannedEvent {
  itemId: string;
  kind: PlannedEventKind;
  plannedAt: number;
  plannedEndAt?: number;
  payloadSnapshot: unknown;
}

const HOUR = 3600_000;

const FREQUENCY_INTERVAL_H: Record<Exclude<Frequency, 'continuous'>, number> = {
  q15min: 0.25, q30min: 0.5, q1h: 1, q2h: 2, q4h: 4,
  q6h: 6, q8h: 8, q12h: 12, q24h: 24, q48h: 48, weekly: 168,
  '2x_daily': 12, '3x_daily': 8, '4x_daily': 6,
  oral_1_0_0: 24, oral_1_0_1: 12, oral_1_1_1: 8, oral_1_1_1_1: 6,
};

function parseStart(startAt: string | undefined, fallback: number): number {
  if (!startAt) return fallback;
  const parsed = Date.parse(startAt);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function expandTiming(timing: Timing, anchor: number, horizonH: number): number[] {
  if (timing.mode === 'ad_hoc' || timing.mode === 'conditional') return [];

  const start = parseStart(timing.startAt, anchor);
  const upperBound = anchor + horizonH * HOUR;

  if (timing.mode === 'one_shot') {
    return start < upperBound ? [start] : [];
  }

  // mode === 'scheduled'
  if (!timing.frequency) return [];
  if (timing.frequency === 'continuous') {
    return start < upperBound ? [start] : [];
  }
  const interval = FREQUENCY_INTERVAL_H[timing.frequency];
  if (!interval) return [];

  const end = timing.end ?? { kind: 'indefinite' };
  let stopAt = upperBound;
  let maxCount = Infinity;

  if (end.kind === 'until') {
    const untilMs = Date.parse(end.at);
    if (!Number.isNaN(untilMs)) stopAt = Math.min(upperBound, untilMs);
  } else if (end.kind === 'count' && Number.isFinite(end.n) && end.n > 0) {
    maxCount = end.n;
  }

  const out: number[] = [];
  for (let t = start; t < stopAt && out.length < maxCount; t += interval * HOUR) {
    out.push(t);
  }
  return out;
}

const KIND_BY_TYPE: Record<string, PlannedEventKind> = {
  medication: 'medication',
  iv_fluid: 'iv_fluid',
  vitals_monitoring: 'vitals_check',
  bz_sliding_scale: 'vitals_check',
  lab: 'task',
  task: 'task',
  wound_care: 'task',
};

export function planEvents(
  items: PostopOrderItem[],
  anchor: number,
  horizonH: number,
): PlannedEvent[] {
  const events: PlannedEvent[] = [];

  for (const item of items) {
    if (!SCHEDULABLE_ITEM_TYPES.has(item.type)) continue;
    const timing = (item as { timing?: Timing }).timing;
    if (!timing) continue;
    const kind = KIND_BY_TYPE[item.type];
    if (!kind) continue;

    for (const t of expandTiming(timing, anchor, horizonH)) {
      const event: PlannedEvent = { itemId: item.id, kind, plannedAt: t, payloadSnapshot: item };
      if (item.type === 'iv_fluid') {
        event.plannedEndAt = t + item.durationH * HOUR;
      }
      events.push(event);
    }
  }

  events.sort((a, b) => a.plannedAt - b.plannedAt || a.itemId.localeCompare(b.itemId));
  return events;
}
