import { describe, it, expect } from 'vitest';
import { planEvents, type PlannedEvent } from '@shared/postopOrderPlanning';
import type { PostopOrderItem } from '@shared/postopOrderItems';

const anchor = new Date('2026-04-08T14:00:00.000Z').getTime();
const horizonH = 24;

describe('planEvents', () => {
  it('returns empty for ad-hoc tasks', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Verbandwechsel', when: 'ad_hoc' },
    ];
    expect(planEvents(items, anchor, horizonH)).toEqual([]);
  });

  it('returns empty for PRN medications', () => {
    const items: PostopOrderItem[] = [
      { id: 'm1', type: 'medication', medicationRef: 'oxynorm', dose: '10mg', route: 'po', scheduleMode: 'prn', prnMaxPerDay: 4 },
    ];
    expect(planEvents(items, anchor, horizonH)).toEqual([]);
  });

  it('plans one-shot lab at anchor + offset', () => {
    const items: PostopOrderItem[] = [
      { id: 'l1', type: 'lab', panel: ['Hb','Kreatinin'], when: 'one_shot', oneShotOffsetH: 6 },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ itemId: 'l1', kind: 'task', plannedAt: anchor + 6 * 3600_000 });
  });

  it('plans every-8h medication across horizon', () => {
    const items: PostopOrderItem[] = [
      { id: 'm2', type: 'medication', medicationRef: 'novalgin', dose: '1g', route: 'iv', scheduleMode: 'scheduled', frequency: 'q8h' },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events.map(e => e.plannedAt)).toEqual([
      anchor, anchor + 8*3600_000, anchor + 16*3600_000,
    ]);
    expect(events.every(e => e.kind === 'medication')).toBe(true);
  });

  it('plans continuous SpO2 as a single marker', () => {
    const items: PostopOrderItem[] = [
      { id: 'v1', type: 'vitals_monitoring', parameter: 'spo2', frequency: 'continuous', min: 92 },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('vitals_check');
  });

  it('plans q1h BP with 24 slots in 24h horizon', () => {
    const items: PostopOrderItem[] = [
      { id: 'v2', type: 'vitals_monitoring', parameter: 'BP', frequency: 'q1h', min: 90, max: 160 },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(24);
  });

  it('plans iv_fluid as a bar with plannedEndAt', () => {
    const items: PostopOrderItem[] = [
      { id: 'iv1', type: 'iv_fluid', solution: 'ringer_lactate', volumeMl: 1000, durationH: 12 },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'iv_fluid',
      plannedAt: anchor,
      plannedEndAt: anchor + 12*3600_000,
    });
  });

  it('is idempotent — same inputs produce same outputs', () => {
    const items: PostopOrderItem[] = [
      { id: 'l1', type: 'lab', panel: ['Hb'], when: 'one_shot', oneShotOffsetH: 6 },
      { id: 'm2', type: 'medication', medicationRef: 'novalgin', dose: '1g', route: 'iv', scheduleMode: 'scheduled', frequency: 'q8h' },
    ];
    const a = planEvents(items, anchor, horizonH);
    const b = planEvents(items, anchor, horizonH);
    expect(a).toEqual(b);
  });
});
