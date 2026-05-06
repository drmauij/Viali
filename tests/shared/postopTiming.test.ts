import { describe, it, expect } from 'vitest';
import { expandTiming } from '@shared/postopOrderPlanning';
import type { Timing } from '@shared/postopOrderItems';

const HOUR = 3600_000;
const anchor = new Date('2026-04-08T14:00:00.000Z').getTime();

describe('expandTiming', () => {
  it('returns [] for ad_hoc', () => {
    const t: Timing = { mode: 'ad_hoc' };
    expect(expandTiming(t, anchor, 24)).toEqual([]);
  });

  it('returns [] for conditional', () => {
    const t: Timing = { mode: 'conditional', condition: 'pain > 7' };
    expect(expandTiming(t, anchor, 24)).toEqual([]);
  });

  it('one_shot at startAt before horizon → single event', () => {
    const t: Timing = { mode: 'one_shot', startAt: new Date(anchor + 6 * HOUR).toISOString() };
    expect(expandTiming(t, anchor, 24)).toEqual([anchor + 6 * HOUR]);
  });

  it('one_shot at startAt after horizon → no events', () => {
    const t: Timing = { mode: 'one_shot', startAt: new Date(anchor + 30 * HOUR).toISOString() };
    expect(expandTiming(t, anchor, 24)).toEqual([]);
  });

  it('one_shot without startAt falls back to anchor', () => {
    const t: Timing = { mode: 'one_shot' };
    expect(expandTiming(t, anchor, 24)).toEqual([anchor]);
  });

  it('scheduled q8h indefinite → events at anchor, +8h, +16h within 24h horizon', () => {
    const t: Timing = { mode: 'scheduled', frequency: 'q8h' };
    expect(expandTiming(t, anchor, 24)).toEqual([anchor, anchor + 8 * HOUR, anchor + 16 * HOUR]);
  });

  it('scheduled q8h with startAt offset', () => {
    const t: Timing = { mode: 'scheduled', frequency: 'q8h', startAt: new Date(anchor + 2 * HOUR).toISOString() };
    expect(expandTiming(t, anchor, 24)).toEqual([
      anchor + 2 * HOUR, anchor + 10 * HOUR, anchor + 18 * HOUR,
    ]);
  });

  it('scheduled with end.until clips before horizon', () => {
    const t: Timing = {
      mode: 'scheduled',
      frequency: 'q8h',
      end: { kind: 'until', at: new Date(anchor + 12 * HOUR).toISOString() },
    };
    expect(expandTiming(t, anchor, 48)).toEqual([anchor, anchor + 8 * HOUR]);
  });

  it('scheduled with end.count limits to N events', () => {
    const t: Timing = {
      mode: 'scheduled',
      frequency: 'q8h',
      end: { kind: 'count', n: 2 },
    };
    expect(expandTiming(t, anchor, 48)).toEqual([anchor, anchor + 8 * HOUR]);
  });

  it('scheduled continuous → single anchor marker', () => {
    const t: Timing = { mode: 'scheduled', frequency: 'continuous' };
    expect(expandTiming(t, anchor, 24)).toEqual([anchor]);
  });

  it('scheduled with no frequency → no events', () => {
    const t: Timing = { mode: 'scheduled' };
    expect(expandTiming(t, anchor, 24)).toEqual([]);
  });
});
