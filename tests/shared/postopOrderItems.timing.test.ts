import { describe, it, expect } from 'vitest';
import { createEmptyItem } from '@shared/postopOrderItems';

describe('createEmptyItem — timing defaults', () => {
  it('medication defaults to scheduled mode', () => {
    const item = createEmptyItem('medication', 'm1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled' });
  });
  it('iv_fluid defaults to one_shot mode', () => {
    const item = createEmptyItem('iv_fluid', 'i1') as any;
    expect(item.timing).toEqual({ mode: 'one_shot' });
  });
  it('lab defaults to one_shot mode', () => {
    const item = createEmptyItem('lab', 'l1') as any;
    expect(item.timing).toEqual({ mode: 'one_shot' });
  });
  it('task defaults to one_shot mode', () => {
    const item = createEmptyItem('task', 't1') as any;
    expect(item.timing).toEqual({ mode: 'one_shot' });
  });
  it('vitals_monitoring defaults to scheduled q1h', () => {
    const item = createEmptyItem('vitals_monitoring', 'v1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled', frequency: 'q1h' });
  });
  it('bz_sliding_scale defaults to scheduled q4h', () => {
    const item = createEmptyItem('bz_sliding_scale', 'b1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled', frequency: 'q4h' });
  });
  it('wound_care defaults to ad_hoc', () => {
    const item = createEmptyItem('wound_care', 'w1') as any;
    expect(item.timing).toEqual({ mode: 'ad_hoc' });
  });
  it('non-schedulable types have no timing field', () => {
    expect((createEmptyItem('mobilization', 'x1') as any).timing).toBeUndefined();
    expect((createEmptyItem('positioning', 'x2') as any).timing).toBeUndefined();
    expect((createEmptyItem('drain', 'x3') as any).timing).toBeUndefined();
    expect((createEmptyItem('nutrition', 'x4') as any).timing).toBeUndefined();
    expect((createEmptyItem('free_text', 'x5') as any).timing).toBeUndefined();
  });
});
