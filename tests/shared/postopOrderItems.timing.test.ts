import { describe, it, expect } from 'vitest';
import { createEmptyItem } from '@shared/postopOrderItems';

describe('createEmptyItem — defaults after subtype collapse', () => {
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
  it('task defaults to one_shot mode + generic subtype + empty title', () => {
    const item = createEmptyItem('task', 't1') as any;
    expect(item.timing).toEqual({ mode: 'one_shot' });
    expect(item.subtype).toBe('generic');
    expect(item.title).toBe('');
  });
  it('vitals_monitoring defaults to scheduled q1h', () => {
    const item = createEmptyItem('vitals_monitoring', 'v1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled', frequency: 'q1h' });
  });
  it('bz_sliding_scale defaults to scheduled q4h', () => {
    const item = createEmptyItem('bz_sliding_scale', 'b1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled', frequency: 'q4h' });
  });
});
