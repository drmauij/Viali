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
 * don't yet pass it. The set's keys are produced by `medRefKey(name, route)`
 * so the matching is route-aware: an order for "Amoxi p.o." admits the
 * p.o. row but not the i.v. row.
 */
export interface MedicationVisibilityItem {
  id: string;
  name: string;
  administrationGroup?: string | null;
  administrationRoute?: string | null;
  onDemandOnly?: boolean | null;
  medicationConfigId?: string | null;
}

/** Normalize "i.v." / "I.V." / "iv" / null → "iv" / null. */
function normalizeRoute(r: string | null | undefined): string | null {
  if (!r) return null;
  return r.trim().toLowerCase().replace(/\./g, '') || null;
}

/**
 * Build the lookup key for `orderedMedicationRefs`. Combines a medication
 * name with its normalized route so the swimlane only flags rows whose
 * route matches the order. An order with no route resolves to an empty
 * route segment, which won't match any row that has a defined route.
 */
export function medRefKey(name: string, route: string | null | undefined): string {
  return `${name}|${normalizeRoute(route) ?? ''}`;
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
    if (orderedMedicationRefs?.has(medRefKey(item.name, item.administrationRoute))) return true;
    return false;
  }
  return true;
}
