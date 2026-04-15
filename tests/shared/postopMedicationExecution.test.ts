import { describe, it, expect } from 'vitest';
import {
  classifyPlannedMedEvent,
  countPrnAdminsInWindow,
  isPrnCapReached,
  type PlannedMedEventLike,
  type PrnItemLike,
  type PrnAdminLike,
} from '@shared/postopMedicationExecution';

const mk = (plannedAt: number, status: PlannedMedEventLike['status'] = 'planned'): PlannedMedEventLike => ({
  plannedAt, status,
});

describe('classifyPlannedMedEvent', () => {
  it('upcoming when plannedAt in future and status planned', () => {
    expect(classifyPlannedMedEvent(mk(2_000_000), 1_000_000)).toBe('upcoming');
  });
  it('overdue when plannedAt in past and status planned', () => {
    expect(classifyPlannedMedEvent(mk(500_000), 1_000_000)).toBe('overdue');
  });
  it('done regardless of time', () => {
    expect(classifyPlannedMedEvent(mk(500_000, 'done'), 1_000_000)).toBe('done');
    expect(classifyPlannedMedEvent(mk(2_000_000, 'done'), 1_000_000)).toBe('done');
  });
  it('cancelled', () => {
    expect(classifyPlannedMedEvent(mk(500_000, 'cancelled'), 1_000_000)).toBe('cancelled');
  });
  it('missed maps to overdue', () => {
    expect(classifyPlannedMedEvent(mk(500_000, 'missed'), 1_000_000)).toBe('overdue');
  });
});

describe('countPrnAdminsInWindow', () => {
  const admins: PrnAdminLike[] = [
    { itemId: 'i1', administeredAt: 900_000 },
    { itemId: 'i1', administeredAt: 950_000 },
    { itemId: 'i1', administeredAt: 500_000 },
    { itemId: 'i2', administeredAt: 950_000 },
  ];
  it('counts admins within window for one item', () => {
    expect(countPrnAdminsInWindow(admins, 'i1', 200_000, 1_000_000)).toBe(2);
  });
  it('filters by itemId', () => {
    expect(countPrnAdminsInWindow(admins, 'i2', 200_000, 1_000_000)).toBe(1);
  });
  it('returns 0 when no admins in window', () => {
    expect(countPrnAdminsInWindow(admins, 'i1', 10_000, 1_000_000)).toBe(0);
  });
});

describe('isPrnCapReached', () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const item = (prnMaxPerDay?: number, intervalH?: number, intervalCount?: number): PrnItemLike => ({
    id: 'i1',
    prnMaxPerDay,
    prnMaxPerInterval: intervalH && intervalCount ? { intervalH, count: intervalCount } : undefined,
  });
  const admin = (ms: number): PrnAdminLike => ({ itemId: 'i1', administeredAt: ms });

  it('returns false when no caps defined', () => {
    expect(isPrnCapReached(item(), [], 1_000_000)).toBe(false);
  });
  it('returns true when prnMaxPerDay reached in past 24h', () => {
    const now = 2 * DAY;
    const admins = [admin(2 * DAY - 1), admin(2 * DAY - 2), admin(2 * DAY - 3)];
    expect(isPrnCapReached(item(3), admins, now)).toBe(true);
  });
  it('returns false when prnMaxPerDay admins fell outside 24h window', () => {
    const now = 2 * DAY;
    const admins = [admin(1), admin(2), admin(3)];
    expect(isPrnCapReached(item(3), admins, now)).toBe(false);
  });
  it('returns true when interval cap reached', () => {
    const now = 10 * HOUR;
    const admins = [admin(10 * HOUR - 1_000)];
    expect(isPrnCapReached(item(undefined, 6, 1), admins, now)).toBe(true);
  });
  it('prefers the strictest cap that is reached', () => {
    const now = 10 * HOUR;
    const admins = [admin(10 * HOUR - 1_000)];
    expect(isPrnCapReached(item(4, 6, 1), admins, now)).toBe(true);
  });
});
