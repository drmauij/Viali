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

const FREQUENCY_INTERVAL_H: Record<Exclude<Frequency, 'continuous'>, number> = {
  q15min: 0.25, q30min: 0.5, q1h: 1, q2h: 2, q4h: 4,
  q6h: 6, q8h: 8, q12h: 12, q24h: 24,
  '2x_daily': 12, '4x_daily': 6,
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
        for (const t of slots(anchor, horizonH, interval)) {
          events.push({ itemId: item.id, kind: 'medication', plannedAt: t, payloadSnapshot: item });
        }
        break;
      }
      case 'vitals_monitoring': {
        if (item.frequency === 'continuous') {
          events.push({ itemId: item.id, kind: 'vitals_check', plannedAt: anchor, payloadSnapshot: item });
          break;
        }
        const interval = FREQUENCY_INTERVAL_H[item.frequency];
        if (!interval) break;
        for (const t of slots(anchor, horizonH, interval)) {
          events.push({ itemId: item.id, kind: 'vitals_check', plannedAt: t, payloadSnapshot: item });
        }
        break;
      }
      case 'lab': {
        if (item.when === 'one_shot') {
          const offset = (item.oneShotOffsetH ?? 0) * HOUR;
          events.push({ itemId: item.id, kind: 'task', plannedAt: anchor + offset, payloadSnapshot: item });
        } else if (item.when === 'daily') {
          const count = Math.max(1, Math.floor(horizonH / 24));
          for (let i = 0; i < count; i++) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: anchor + i * 24 * HOUR, payloadSnapshot: item });
          }
        } else if (item.when === 'every_n_hours' && item.everyNHours && item.everyNHours > 0) {
          for (const t of slots(anchor, horizonH, item.everyNHours)) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: t, payloadSnapshot: item });
          }
        }
        break;
      }
      case 'task': {
        if (item.when === 'ad_hoc' || item.when === 'conditional') break;
        if (item.when === 'one_shot') {
          const t = item.oneShotAt ? Date.parse(item.oneShotAt) : anchor;
          events.push({ itemId: item.id, kind: 'task', plannedAt: t, payloadSnapshot: item });
        } else if (item.when === 'daily') {
          const count = Math.max(1, Math.floor(horizonH / 24));
          for (let i = 0; i < count; i++) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: anchor + i * 24 * HOUR, payloadSnapshot: item });
          }
        } else if (item.when === 'every_n_hours' && item.everyNHours && item.everyNHours > 0) {
          for (const t of slots(anchor, horizonH, item.everyNHours)) {
            events.push({ itemId: item.id, kind: 'task', plannedAt: t, payloadSnapshot: item });
          }
        }
        break;
      }
      case 'iv_fluid': {
        const start = item.startAt ? Date.parse(item.startAt) : anchor;
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
