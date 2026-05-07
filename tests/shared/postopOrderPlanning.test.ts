import { describe, it, expect } from 'vitest';
import { planEvents, filterPlannedAgainstDone, type PlannedEvent } from '@shared/postopOrderPlanning';
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

  it('ad-hoc task subtypes produce no events', () => {
    const items: PostopOrderItem[] = [
      { id: 'p1', type: 'task', subtype: 'positioning', title: 'supine', timing: { mode: 'ad_hoc' } },
      { id: 'n1', type: 'task', subtype: 'nutrition', title: 'vollkost', timing: { mode: 'ad_hoc' } },
      { id: 'f1', type: 'task', subtype: 'note', title: 'general note', timing: { mode: 'ad_hoc' } },
    ];
    expect(planEvents(items, anchor, horizonH)).toEqual([]);
  });
});

describe('filterPlannedAgainstDone', () => {
  const items: PostopOrderItem[] = [
    { id: 'm1', type: 'medication', medicationRef: 'Amoxi', dose: '400', route: 'iv',
      timing: { mode: 'scheduled', frequency: 'q6h' } },
  ];
  const mkPlanned = (plannedAt: number): PlannedEvent => ({
    itemId: 'm1', kind: 'medication', plannedAt, payloadSnapshot: items[0],
  });

  it('returns planned unchanged when there are no done events', () => {
    const planned = [mkPlanned(anchor), mkPlanned(anchor + 6 * HOUR)];
    expect(filterPlannedAgainstDone(planned, [], items)).toEqual(planned);
  });

  it('drops planned events within interval/2 of a done event for the same item', () => {
    // q6h → buffer = 3h
    const doneAt = anchor;
    const planned = [
      mkPlanned(anchor + 2 * HOUR),     // within 3h → drop
      mkPlanned(anchor + 6 * HOUR),     // 6h away → keep
      mkPlanned(anchor + 12 * HOUR),    // far → keep
    ];
    const result = filterPlannedAgainstDone(planned, [{ itemId: 'm1', plannedAt: doneAt }], items);
    expect(result.map(e => e.plannedAt)).toEqual([anchor + 6 * HOUR, anchor + 12 * HOUR]);
  });

  it('keeps a planned event exactly at interval/2 (boundary is inclusive of "kept")', () => {
    // q6h → buffer = 3h. Distance == 3h → kept (not strictly < buffer).
    const doneAt = anchor;
    const planned = [mkPlanned(anchor + 3 * HOUR)];
    const result = filterPlannedAgainstDone(planned, [{ itemId: 'm1', plannedAt: doneAt }], items);
    expect(result).toEqual(planned);
  });

  it('does not filter events for a different item', () => {
    const otherItems: PostopOrderItem[] = [
      ...items,
      { id: 'm2', type: 'medication', medicationRef: 'Paracetamol', dose: '1g', route: 'iv',
        timing: { mode: 'scheduled', frequency: 'q6h' } },
    ];
    const planned: PlannedEvent[] = [
      { itemId: 'm2', kind: 'medication', plannedAt: anchor + 1 * HOUR, payloadSnapshot: otherItems[1] },
    ];
    const doneEvents = [{ itemId: 'm1', plannedAt: anchor }];
    expect(filterPlannedAgainstDone(planned, doneEvents, otherItems)).toEqual(planned);
  });

  it('uses the 5-minute fallback buffer for one_shot items', () => {
    const oneShotItems: PostopOrderItem[] = [
      { id: 'l1', type: 'lab', panel: ['Hb'], timing: { mode: 'one_shot' } },
    ];
    const planned: PlannedEvent[] = [
      { itemId: 'l1', kind: 'task', plannedAt: anchor + 4 * 60 * 1000, payloadSnapshot: oneShotItems[0] },  // 4 min after done
      { itemId: 'l1', kind: 'task', plannedAt: anchor + 10 * 60 * 1000, payloadSnapshot: oneShotItems[0] }, // 10 min after done
    ];
    const result = filterPlannedAgainstDone(planned, [{ itemId: 'l1', plannedAt: anchor }], oneShotItems);
    expect(result.map(e => e.plannedAt)).toEqual([anchor + 10 * 60 * 1000]);
  });
});
