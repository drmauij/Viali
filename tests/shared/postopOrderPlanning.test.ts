import { describe, it, expect } from 'vitest';
import { planEvents } from '@shared/postopOrderPlanning';
import type { PostopOrderItem } from '@shared/postopOrderItems';

const anchor = new Date('2026-04-08T14:00:00.000Z').getTime();
const horizonH = 24;
const HOUR = 3600_000;

describe('planEvents', () => {
  it('returns empty for ad-hoc tasks', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Verbandwechsel', timing: { mode: 'ad_hoc' } },
    ];
    expect(planEvents(items, anchor, horizonH)).toEqual([]);
  });

  it('returns empty for PRN medications', () => {
    const items: PostopOrderItem[] = [
      { id: 'm1', type: 'medication', medicationRef: 'oxynorm', dose: '10mg', route: 'po',
        timing: { mode: 'ad_hoc' }, prnMaxPerDay: 4 },
    ];
    expect(planEvents(items, anchor, horizonH)).toEqual([]);
  });

  it('plans one-shot lab at startAt', () => {
    const startAt = new Date(anchor + 6 * HOUR).toISOString();
    const items: PostopOrderItem[] = [
      { id: 'l1', type: 'lab', panel: ['Hb','Kreatinin'], timing: { mode: 'one_shot', startAt } },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ itemId: 'l1', kind: 'task', plannedAt: anchor + 6 * HOUR });
  });

  it('plans every-8h medication across horizon', () => {
    const items: PostopOrderItem[] = [
      { id: 'm2', type: 'medication', medicationRef: 'novalgin', dose: '1g', route: 'iv',
        timing: { mode: 'scheduled', frequency: 'q8h' } },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events.map(e => e.plannedAt)).toEqual([anchor, anchor + 8 * HOUR, anchor + 16 * HOUR]);
    expect(events.every(e => e.kind === 'medication')).toBe(true);
  });

  it('plans continuous SpO2 as a single marker', () => {
    const items: PostopOrderItem[] = [
      { id: 'v1', type: 'vitals_monitoring', parameter: 'spo2',
        timing: { mode: 'scheduled', frequency: 'continuous' }, min: 92 },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('vitals_check');
  });

  it('iv_fluid emits plannedEndAt = plannedAt + durationH', () => {
    const items: PostopOrderItem[] = [
      { id: 'iv1', type: 'iv_fluid', solution: 'ringer_lactate', volumeMl: 1000, durationH: 8,
        timing: { mode: 'one_shot' } },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(1);
    expect(events[0].plannedEndAt).toBe(anchor + 8 * HOUR);
  });

  it('end.count caps recurring lab at N events', () => {
    const items: PostopOrderItem[] = [
      { id: 'l2', type: 'lab', panel: ['Hb'],
        timing: { mode: 'scheduled', frequency: 'q6h', end: { kind: 'count', n: 3 } } },
    ];
    const events = planEvents(items, anchor, 72);
    expect(events.map(e => e.plannedAt)).toEqual([anchor, anchor + 6 * HOUR, anchor + 12 * HOUR]);
  });

  it('non-schedulable types produce no events', () => {
    const items: PostopOrderItem[] = [
      { id: 'p1', type: 'positioning', value: 'supine' },
      { id: 'n1', type: 'nutrition', value: 'vollkost' },
      { id: 'f1', type: 'free_text', section: 'general', text: 'note' },
    ];
    expect(planEvents(items, anchor, horizonH)).toEqual([]);
  });
});
