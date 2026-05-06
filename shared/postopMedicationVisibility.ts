/**
 * Pure helper for deciding whether an anesthesia/medication item should be
 * admitted into the timeline's medication swimlane row inventory.
 *
 * Extracted from `UnifiedTimeline.tsx`'s `anesthesiaItems` filter so the
 * Phase C4 behavior — "ordered medications appear as rows even when never
 * administered intra-op" — can be tested in isolation.
 *
 * Rules:
 *   1. Items without an `administrationGroup` are never admitted (they
 *      have no swimlane to live in).
 *   2. Non-on-demand items are always admitted.
 *   3. On-demand items are admitted only when they have either:
 *        a. been administered (id in `importedItemIds`), OR
 *        b. their name is referenced by the active postop order set
 *           (`orderedMedicationRefs`).
 *
 * `orderedMedicationRefs` is optional for back-compat with callers that
 * don't yet pass it.
 */
export interface MedicationVisibilityItem {
  id: string;
  name: string;
  administrationGroup?: string | null;
  onDemandOnly?: boolean | null;
}

export function shouldAdmitMedicationItem(
  item: MedicationVisibilityItem,
  importedItemIds: ReadonlySet<string>,
  orderedMedicationRefs?: ReadonlySet<string>,
): boolean {
  if (!item.administrationGroup) return false;
  if (item.onDemandOnly) {
    if (importedItemIds.has(item.id)) return true;
    if (orderedMedicationRefs?.has(item.name)) return true;
    return false;
  }
  return true;
}
