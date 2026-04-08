import { describe, it, expect } from 'vitest';
import { createEmptyItem, isItemType, type PostopOrderItem } from './postopOrderItems';

describe('postopOrderItems', () => {
  it('creates empty items of every type with correct discriminator', () => {
    const types = [
      'mobilization','positioning','drain','nutrition','wound_care',
      'vitals_monitoring','medication','iv_fluid','lab','task','bz_sliding_scale','free_text',
    ] as const;
    for (const t of types) {
      const item = createEmptyItem(t, `id-${t}`);
      expect(item.type).toBe(t);
      expect(item.id).toBe(`id-${t}`);
    }
  });

  it('isItemType narrows correctly', () => {
    const item: PostopOrderItem = createEmptyItem('medication', 'm1');
    if (isItemType(item, 'medication')) {
      expect(item.scheduleMode).toBe('scheduled');
    } else {
      throw new Error('narrowing failed');
    }
  });
});
