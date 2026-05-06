import type { PostopOrderItem, Frequency } from './postopOrderItems';

export type PlannedEventKind = 'medication' | 'vitals_check' | 'task' | 'iv_fluid';

export interface PlannedEvent {
  itemId: string;
  kind: PlannedEventKind;
  plannedAt: number;            // epoch ms
  plannedEndAt?: number;        // epoch ms, for iv_fluid bars
  payloadSnapshot: unknown;     // immutable copy of the generating item
}

const HOUR = 3600_000;

function resolveAnchor(itemAnchor: string | undefined, fallback: number): number {
  if (!itemAnchor) return fallback;
  const parsed = Date.parse(itemAnchor);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const FREQUENCY_INTERVAL_H: Record<Exclude<Frequency, 'continuous'>, number> = {
  q15min: 0.25, q30min: 0.5, q1h: 1, q2h: 2, q4h: 4,
  q6h: 6, q8h: 8, q12h: 12, q24h: 24, q48h: 48, weekly: 168,
  '2x_daily': 12, '3x_daily': 8, '4x_daily': 6,
  // Clinical notation — currently identical to their q-equivalents
  oral_1_0_0: 24, oral_1_0_1: 12, oral_1_1_1: 8, oral_1_1_1_1: 6,
};

function slots(anchor: number, horizonH: number, intervalH: number): number[] {
  const out: number[] = [];
  const count = Math.floor(horizonH / intervalH);
  for (let i = 0; i < count; i++) out.push(anchor + i * intervalH * HOUR);
  return out;
}

export function planEvents(
  items: PostopOrderItem[],
  anchor: number,
  horizonH: number,
): PlannedEvent[] {
  const events: PlannedEvent[] = [];

  for (const item of items) {
    switch (item.type) {
      case 'medication': {
        if (item.scheduleMode !== 'scheduled') break;
        const freq = item.frequency as Frequency | undefined;
        if (!freq || freq === 'continuous') break;
        const interval = FREQUENCY_INTERVAL_H[freq as Exclude<Frequency, 'continuous'>];
        if (!interval) break;
        const start = resolveAnchor(item.startAt, anchor);
        const upperBound = anchor + horizonH * HOUR;
        for (let t = start; t < upperBound; t += interval * HOUR) {
          events.push({ itemId: item.id, kind: 'medication', plannedAt: t, payloadSnapshot: item });
        }
        break;
      }
      case 'vitals_monitoring': {
        const start = resolveAnchor(item.startAt, anchor);
        if (item.frequency === 'continuous') {
          events.push({ itemId: item.id, kind: 'vitals_check', plannedAt: start, payloadSnapshot: item });
          break;
        }
        const interval = FREQUENCY_INTERVAL_H[item.frequency];
        if (!interval) break;
        const upperBound = anchor + horizonH * HOUR;
        for (let t = start; t < upperBound; t += interval * HOUR) {
          events.push({ itemId: item.id, kind: 'vitals_check', plannedAt: t, payloadSnapshot: item });
        }
        break;
      }
      case 'lab': {
        const start = item.startAt
          ? resolveAnchor(item.startAt, anchor)
          : (item.when === 'one_shot' ? anchor + (item.oneShotOffsetH ?? 0) * HOUR : anchor);
        const upperBound = anchor + horizonH * HOUR;
        if (start >= upperBound) break;
        if (item.when === 'one_shot') {
          events.push({ itemId: item.id, kind: 'task', plannedAt: start, payloadSnapshot: item });
        } else if (item.when === 'daily') {
          for (let t = start; t < upperBound; t += 24 * HOUR) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: t, payloadSnapshot: item });
          }
        } else if (item.when === 'every_n_hours' && item.everyNHours && item.everyNHours > 0) {
          for (let t = start; t < upperBound; t += item.everyNHours * HOUR) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: t, payloadSnapshot: item });
          }
        }
        break;
      }
      case 'task': {
        if (item.when === 'ad_hoc' || item.when === 'conditional') break;
        const start = item.startAt
          ? resolveAnchor(item.startAt, anchor)
          : (item.when === 'one_shot' && item.oneShotAt ? Date.parse(item.oneShotAt) : anchor);
        const upperBound = anchor + horizonH * HOUR;
        if (start >= upperBound) break;
        if (item.when === 'one_shot') {
          events.push({ itemId: item.id, kind: 'task', plannedAt: start, payloadSnapshot: item });
        } else if (item.when === 'daily') {
          for (let t = start; t < upperBound; t += 24 * HOUR) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: t, payloadSnapshot: item });
          }
        } else if (item.when === 'every_n_hours' && item.everyNHours && item.everyNHours > 0) {
          for (let t = start; t < upperBound; t += item.everyNHours * HOUR) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: t, payloadSnapshot: item });
          }
        }
        break;
      }
      case 'iv_fluid': {
        const start = resolveAnchor(item.startAt, anchor);
        events.push({
          itemId: item.id, kind: 'iv_fluid',
          plannedAt: start,
          plannedEndAt: start + item.durationH * HOUR,
          payloadSnapshot: item,
        });
        break;
      }
      case 'mobilization':
      case 'positioning':
      case 'drain':
      case 'nutrition':
      case 'wound_care':
      case 'bz_sliding_scale':
      case 'free_text':
        break;
    }
  }

  events.sort((a, b) => a.plannedAt - b.plannedAt || a.itemId.localeCompare(b.itemId));
  return events;
}
