import { describe, it, expect } from 'vitest';
import { buildDisplayRows } from '../../client/src/components/anesthesia/postop/postopTasksLogic';
import type { PostopOrderItem } from '@shared/postopOrderItems';

// Helper to create a planned event
function makeEvent(overrides: Record<string, any>) {
  return {
    id: overrides.id ?? 'e1',
    itemId: overrides.itemId ?? 't1',
    kind: overrides.kind ?? 'task' as const,
    plannedAt: overrides.plannedAt ?? new Date().toISOString(),
    plannedEndAt: overrides.plannedEndAt ?? null,
    payloadSnapshot: overrides.payloadSnapshot ?? {},
    status: overrides.status ?? 'planned' as const,
    doneAt: overrides.doneAt ?? null,
    doneBy: overrides.doneBy ?? null,
    doneValue: overrides.doneValue ?? null,
  };
}

const now = new Date('2026-04-08T17:00:00.000Z').getTime();
const HOUR = 3600_000;
const MINUTE = 60_000;

describe('buildDisplayRows', () => {
  it('classifies an event in the past as overdue', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Labor 6h postop', when: 'one_shot' },
    ];
    const events = [makeEvent({
      id: 'e1', itemId: 't1', kind: 'task',
      plannedAt: new Date(now - 2 * HOUR).toISOString(),
      status: 'planned',
    })];
    const rows = buildDisplayRows(items, events, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].when).toBe('overdue');
    expect(rows[0].done).toBe(false);
  });

  it('classifies an event within 15min window as due_now', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Wundkontrolle', when: 'daily' },
    ];
    const events = [makeEvent({
      id: 'e1', itemId: 't1', kind: 'task',
      plannedAt: new Date(now + 5 * MINUTE).toISOString(),
      status: 'planned',
    })];
    const rows = buildDisplayRows(items, events, now);
    expect(rows[0].when).toBe('due_now');
  });

  it('classifies a future event as upcoming', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Labor daily', when: 'daily' },
    ];
    const events = [makeEvent({
      id: 'e1', itemId: 't1', kind: 'task',
      plannedAt: new Date(now + 3 * HOUR).toISOString(),
      status: 'planned',
    })];
    const rows = buildDisplayRows(items, events, now);
    expect(rows[0].when).toBe('upcoming');
    expect(rows[0].done).toBe(false);
  });

  it('marks done events as done', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Labor', when: 'one_shot' },
    ];
    const events = [makeEvent({
      id: 'e1', itemId: 't1', kind: 'task',
      plannedAt: new Date(now - HOUR).toISOString(),
      status: 'done',
      doneAt: new Date(now - 30 * MINUTE).toISOString(),
    })];
    const rows = buildDisplayRows(items, events, now);
    expect(rows[0].done).toBe(true);
  });

  it('includes ad-hoc tasks without planned events', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Verbandwechsel bei Durchnässung', when: 'ad_hoc' },
    ];
    const rows = buildDisplayRows(items, [], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].when).toBe('ad_hoc');
    expect(rows[0].title).toBe('Verbandwechsel bei Durchnässung');
  });

  it('includes conditional tasks', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Arzt rufen', when: 'conditional', condition: 'VAS > 7' },
    ];
    const rows = buildDisplayRows(items, [], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].subtitle).toBe('VAS > 7');
  });

  it('includes BZ sliding scale as info row', () => {
    const items: PostopOrderItem[] = [
      { id: 'bz1', type: 'bz_sliding_scale', drug: 'Actrapid',
        rules: [{ above: 120, units: 2 }, { above: 180, units: 3 }] },
    ];
    const rows = buildDisplayRows(items, [], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain('Actrapid');
    expect(rows[0].actionHint).toContain('>120: 2 IE');
    expect(rows[0].actionHint).toContain('>180: 3 IE');
  });

  it('ignores medication and vitals_check events (not Group 4)', () => {
    const items: PostopOrderItem[] = [
      { id: 'm1', type: 'medication', medicationRef: 'novalgin', dose: '1g', route: 'iv', scheduleMode: 'scheduled', frequency: 'q8h' },
    ];
    const events = [makeEvent({
      id: 'e1', itemId: 'm1', kind: 'medication',
      plannedAt: new Date(now).toISOString(),
    })];
    const rows = buildDisplayRows(items, events, now);
    expect(rows).toHaveLength(0);
  });

  it('sorts: overdue first, then due_now, then upcoming, then ad_hoc; done items last', () => {
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'A', when: 'one_shot' },
      { id: 't2', type: 'task', title: 'B', when: 'one_shot' },
      { id: 't3', type: 'task', title: 'C', when: 'one_shot' },
      { id: 't4', type: 'task', title: 'D', when: 'ad_hoc' },
    ];
    const events = [
      makeEvent({ id: 'e1', itemId: 't1', kind: 'task', plannedAt: new Date(now + 3*HOUR).toISOString(), status: 'planned' }),
      makeEvent({ id: 'e2', itemId: 't2', kind: 'task', plannedAt: new Date(now - 2*HOUR).toISOString(), status: 'planned' }),
      makeEvent({ id: 'e3', itemId: 't3', kind: 'task', plannedAt: new Date(now - HOUR).toISOString(), status: 'done', doneAt: new Date().toISOString() }),
    ];
    const rows = buildDisplayRows(items, events, now);
    expect(rows.map(r => r.title)).toEqual(['B', 'A', 'D', 'C']);
  });

  it('describes lab items with panel names', () => {
    const items: PostopOrderItem[] = [
      { id: 'l1', type: 'lab', panel: ['Hb', 'Kreatinin'], when: 'one_shot', oneShotOffsetH: 6 },
    ];
    const events = [makeEvent({ id: 'e1', itemId: 'l1', kind: 'task', plannedAt: new Date(now).toISOString() })];
    const rows = buildDisplayRows(items, events, now);
    expect(rows[0].title).toBe('Labor — Hb, Kreatinin');
  });

  it('describes iv_fluid items with solution and volume', () => {
    const items: PostopOrderItem[] = [
      { id: 'iv1', type: 'iv_fluid', solution: 'ringer_lactate', volumeMl: 1000, durationH: 12 },
    ];
    const events = [makeEvent({ id: 'e1', itemId: 'iv1', kind: 'iv_fluid', plannedAt: new Date(now).toISOString() })];
    const rows = buildDisplayRows(items, events, now);
    expect(rows[0].title).toContain('Ringer-Laktat');
    expect(rows[0].title).toContain('1000ml');
  });
});
