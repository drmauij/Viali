import { describe, it, expect } from 'vitest';
import {
  classifyPlannedCheck,
  checkDeviation,
  PARAM_ROW_ORDER,
  type PlannedVitalsCheckLike,
  type VitalsMonitoringItemLike,
} from '@shared/postopVitalsOverlay';

describe('classifyPlannedCheck', () => {
  const mk = (plannedAt: number, status: PlannedVitalsCheckLike['status'] = 'planned'): PlannedVitalsCheckLike => ({
    plannedAt,
    status,
  });

  it('returns "upcoming" when plannedAt is in the future', () => {
    const now = 1_000_000;
    expect(classifyPlannedCheck(mk(now + 10_000), now)).toBe('upcoming');
  });

  it('returns "overdue" when plannedAt is in the past and status is still planned', () => {
    const now = 1_000_000;
    expect(classifyPlannedCheck(mk(now - 10_000), now)).toBe('overdue');
  });

  it('returns "done" when status is done regardless of time', () => {
    const now = 1_000_000;
    expect(classifyPlannedCheck(mk(now - 10_000, 'done'), now)).toBe('done');
    expect(classifyPlannedCheck(mk(now + 10_000, 'done'), now)).toBe('done');
  });

  it('returns "cancelled" when status is cancelled', () => {
    expect(classifyPlannedCheck(mk(0, 'cancelled'), 1_000_000)).toBe('cancelled');
  });

  it('returns "overdue" when status is missed (regardless of time)', () => {
    const now = 1_000_000;
    expect(classifyPlannedCheck(mk(now - 10_000, 'missed'), now)).toBe('overdue');
    expect(classifyPlannedCheck(mk(now + 10_000, 'missed'), now)).toBe('overdue');
  });

  it('returns "upcoming" when plannedAt equals now (strict less-than boundary)', () => {
    const now = 1_000_000;
    expect(classifyPlannedCheck(mk(now), now)).toBe('upcoming');
  });
});

describe('checkDeviation', () => {
  const item = (min?: number, max?: number, actionLow?: string, actionHigh?: string): VitalsMonitoringItemLike => ({
    min, max, actionLow, actionHigh,
  });

  it('returns ok when value is within bounds', () => {
    expect(checkDeviation(120, item(90, 140))).toEqual({ kind: 'ok' });
  });

  it('returns low with actionLow text when value below min', () => {
    expect(checkDeviation(80, item(90, 140, 'Give 500ml Ringer'))).toEqual({
      kind: 'low',
      action: 'Give 500ml Ringer',
    });
  });

  it('returns high with actionHigh text when value above max', () => {
    expect(checkDeviation(160, item(90, 140, undefined, 'Call surgeon'))).toEqual({
      kind: 'high',
      action: 'Call surgeon',
    });
  });

  it('returns ok when bounds undefined', () => {
    expect(checkDeviation(120, item())).toEqual({ kind: 'ok' });
  });

  it('treats min only or max only correctly', () => {
    expect(checkDeviation(80, item(90))).toEqual({ kind: 'low', action: undefined });
    expect(checkDeviation(160, item(undefined, 140))).toEqual({ kind: 'high', action: undefined });
    expect(checkDeviation(120, item(90))).toEqual({ kind: 'ok' });
  });
});

describe('PARAM_ROW_ORDER', () => {
  it('contains all expected vitals parameters in canonical order', () => {
    expect(PARAM_ROW_ORDER).toEqual(['BP', 'pulse', 'temp', 'spo2', 'bz']);
  });
});
