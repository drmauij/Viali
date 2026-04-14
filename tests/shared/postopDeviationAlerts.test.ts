import { describe, it, expect } from 'vitest';
import {
  detectDeviations,
  type RecordedVitalLike,
  type PlannedBoundsLike,
  type AcknowledgmentLike,
} from '@shared/postopDeviationAlerts';

const bounds = (parameter: PlannedBoundsLike['parameter'], min?: number, max?: number, actionLow?: string, actionHigh?: string): PlannedBoundsLike => ({
  parameter, min, max, actionLow, actionHigh,
});

describe('detectDeviations', () => {
  it('returns nothing when bounds are absent', () => {
    const recorded: RecordedVitalLike[] = [{ id: 'h1', type: 'hr', timestamp: 1000, value: 200 }];
    expect(detectDeviations(recorded, [], [])).toEqual([]);
  });

  it('flags HR above max as high deviation', () => {
    const recorded: RecordedVitalLike[] = [{ id: 'h1', type: 'hr', timestamp: 1000, value: 200 }];
    const b = [bounds('pulse', 60, 120, 'atropine', 'beta-blocker')];
    const result = detectDeviations(recorded, b, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ recordedId: 'h1', parameter: 'pulse', kind: 'high', value: 200, action: 'beta-blocker' });
  });

  it('flags BP-sys low and ignores BP-dia entirely', () => {
    const recorded: RecordedVitalLike[] = [
      { id: 'b1', type: 'bp-sys', timestamp: 1000, value: 70 },
      { id: 'b2', type: 'bp-dia', timestamp: 1000, value: 40 },
    ];
    const b = [bounds('BP', 90, 140, 'Ringer', 'Call')];
    const result = detectDeviations(recorded, b, []);
    expect(result).toHaveLength(1);
    expect(result[0].recordedId).toBe('b1');
    expect(result[0].kind).toBe('low');
  });

  it('marks an alert as acknowledged and returns the ack reference', () => {
    const recorded: RecordedVitalLike[] = [{ id: 'h1', type: 'hr', timestamp: 1000, value: 200 }];
    const b = [bounds('pulse', 60, 120)];
    const acks: AcknowledgmentLike[] = [{ parameter: 'pulse', recordedAt: 1000, recordedValue: 200, boundKind: 'high', resolvedBy: 'u1' }];
    const result = detectDeviations(recorded, b, acks);
    expect(result).toHaveLength(1);
    expect(result[0].acknowledged).toBe(true);
    expect(result[0].acknowledgedBy).toBe('u1');
  });

  it('does not match ack on wrong bound kind', () => {
    const recorded: RecordedVitalLike[] = [{ id: 'h1', type: 'hr', timestamp: 1000, value: 200 }];
    const b = [bounds('pulse', 60, 120)];
    const acks: AcknowledgmentLike[] = [{ parameter: 'pulse', recordedAt: 1000, recordedValue: 200, boundKind: 'low', resolvedBy: 'u1' }];
    const result = detectDeviations(recorded, b, acks);
    expect(result[0].acknowledged).toBe(false);
  });

  it('skips temp and bz (no swimlane representation)', () => {
    const b = [bounds('temp', 36, 38), bounds('bz', 4, 10)];
    expect(detectDeviations([], b, [])).toEqual([]);
  });

  it('first bounds entry wins when duplicate parameters exist', () => {
    const recorded: RecordedVitalLike[] = [{ id: 'h1', type: 'hr', timestamp: 1000, value: 50 }];
    const b = [bounds('pulse', 60, 120, 'A'), bounds('pulse', 40, 180, 'B')];
    const result = detectDeviations(recorded, b, []);
    expect(result[0].action).toBe('A');
  });
});
