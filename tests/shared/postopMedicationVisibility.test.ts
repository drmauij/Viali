import { describe, it, expect } from 'vitest';
import {
  shouldAdmitMedicationItem,
  type MedicationVisibilityItem,
} from '@shared/postopMedicationVisibility';

describe('shouldAdmitMedicationItem', () => {
  const baseItem: MedicationVisibilityItem = {
    id: 'item-1',
    name: 'Amoxicillin/Clavulanic acid',
    administrationGroup: 'antibiotics',
    onDemandOnly: true,
  };

  it('admits non-on-demand items unconditionally when they have an administrationGroup', () => {
    const item: MedicationVisibilityItem = { ...baseItem, onDemandOnly: false };
    expect(shouldAdmitMedicationItem(item, new Set(), new Set())).toBe(true);
  });

  it('treats null/undefined onDemandOnly as not on-demand', () => {
    const itemNull: MedicationVisibilityItem = { ...baseItem, onDemandOnly: null };
    const itemUndefined: MedicationVisibilityItem = { ...baseItem, onDemandOnly: undefined };
    expect(shouldAdmitMedicationItem(itemNull, new Set(), new Set())).toBe(true);
    expect(shouldAdmitMedicationItem(itemUndefined, new Set(), new Set())).toBe(true);
  });

  it('admits on-demand items that have been administered (imported)', () => {
    expect(
      shouldAdmitMedicationItem(baseItem, new Set(['item-1']), new Set()),
    ).toBe(true);
  });

  it('admits on-demand items referenced by an active postop order (Phase C4)', () => {
    expect(
      shouldAdmitMedicationItem(
        baseItem,
        new Set(),
        new Set(['Amoxicillin/Clavulanic acid']),
      ),
    ).toBe(true);
  });

  it('rejects on-demand items neither administered nor ordered', () => {
    expect(shouldAdmitMedicationItem(baseItem, new Set(), new Set())).toBe(false);
  });

  it('rejects items without administrationGroup even if administered', () => {
    const item: MedicationVisibilityItem = { ...baseItem, administrationGroup: undefined };
    expect(
      shouldAdmitMedicationItem(item, new Set(['item-1']), new Set()),
    ).toBe(false);
  });

  it('rejects items without administrationGroup even if ordered', () => {
    const item: MedicationVisibilityItem = { ...baseItem, administrationGroup: null };
    expect(
      shouldAdmitMedicationItem(
        item,
        new Set(),
        new Set(['Amoxicillin/Clavulanic acid']),
      ),
    ).toBe(false);
  });

  it('handles undefined orderedMedicationRefs gracefully (back-compat for callers pre-C4)', () => {
    expect(shouldAdmitMedicationItem(baseItem, new Set(['item-1']), undefined)).toBe(true);
    expect(shouldAdmitMedicationItem(baseItem, new Set(), undefined)).toBe(false);
  });

  it('matches by exact item.name — does not admit on-demand items whose name differs from any ordered ref', () => {
    expect(
      shouldAdmitMedicationItem(
        baseItem,
        new Set(),
        new Set(['amoxicillin/clavulanic acid']), // different case
      ),
    ).toBe(false);
  });
});
