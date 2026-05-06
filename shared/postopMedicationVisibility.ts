/**
 * Pure helper for deciding whether an anesthesia/medication item should be
 * admitted into the timeline's medication swimlane row inventory.
 *
 * Rules:
 *   1. Items without an anesthesia config (`medicationConfigId`) are never
 *      admitted — they're inventory-only and have no place on the chart.
 *   2. Items with a config but no `administrationGroup` ARE admitted — they
 *      surface under the virtual "Needs Configuration" group so the user
 *      can spot and fix them.
 *   3. Items with a config AND an admin group:
 *        - non-on-demand: always admitted
 *        - on-demand: admitted only when administered (id in
 *          `importedItemIds`) OR referenced by the active postop order
 *          set (`orderedMedicationRefs`).
 *
 * `orderedMedicationRefs` is optional for back-compat with callers that
 * don't yet pass it.
 */
export interface MedicationVisibilityItem {
  id: string;
  name: string;
  administrationGroup?: string | null;
  onDemandOnly?: boolean | null;
  medicationConfigId?: string | null;
}

export function shouldAdmitMedicationItem(
  item: MedicationVisibilityItem,
  importedItemIds: ReadonlySet<string>,
  orderedMedicationRefs?: ReadonlySet<string>,
): boolean {
  if (!item.medicationConfigId) return false;
  if (!item.administrationGroup) return true; // orphan → virtual "Needs Configuration" group
  if (item.onDemandOnly) {
    if (importedItemIds.has(item.id)) return true;
    if (orderedMedicationRefs?.has(item.name)) return true;
    return false;
  }
  return true;
}
