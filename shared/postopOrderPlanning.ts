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

/** Reference to a previously-administered (status='done') planned event. */
export interface DoneEventRef {
  itemId: string;
  plannedAt: number;
}

const FIVE_MIN = 5 * 60 * 1000;

/**
 * Filter newly-planned events to drop ones that fall too close to an existing
 * done event for the same item. "Too close" is `interval/2` for scheduled
 * items (so re-saving a q6h order 5 min after administering doesn't generate
 * a phantom amber pill 5 min into the future), and 5 minutes for
 * one_shot/ad_hoc/conditional.
 *
 * Without this, every re-save of an order with a new `Date.now()` anchor
 * would emit a "first dose" pill immediately after the user just marked the
 * previous dose done, making the timeline look like the administration
 * never happened.
 */
export function filterPlannedAgainstDone(
  planned: PlannedEvent[],
  doneEvents: DoneEventRef[],
  items: PostopOrderItem[],
): PlannedEvent[] {
  if (doneEvents.length === 0) return planned;

  const itemById = new Map(items.map(i => [i.id, i]));
  const doneByItem = new Map<string, DoneEventRef[]>();
  for (const d of doneEvents) {
    const arr = doneByItem.get(d.itemId) ?? [];
    arr.push(d);
    doneByItem.set(d.itemId, arr);
  }

  return planned.filter(p => {
    const dones = doneByItem.get(p.itemId);
    if (!dones || dones.length === 0) return true;

    const item = itemById.get(p.itemId);
    const timing = (item as { timing?: Timing } | undefined)?.timing;
    let bufferMs = FIVE_MIN;
    if (timing?.mode === 'scheduled' && timing.frequency && timing.frequency !== 'continuous') {
      const intervalH = FREQUENCY_INTERVAL_H[timing.frequency];
      if (intervalH) bufferMs = (intervalH * HOUR) / 2;
    }

    return !dones.some(d => Math.abs(p.plannedAt - d.plannedAt) < bufferMs);
  });
}
