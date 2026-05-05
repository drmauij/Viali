import type { TreatmentLine } from "@shared/schema";

type Line = Partial<TreatmentLine>;
type Service = { id: string; name: string; price?: string | null };
type Item = { id: string; name: string; patientPrice?: string | null };

/** Patch returned after the user picks an item in a row's Product cell. */
export function pickItemPatch(line: Line, item: Item | null): Partial<Line> {
  if (!item) {
    return { itemId: undefined, lotId: undefined, lotNumber: undefined };
  }
  const patch: Partial<Line> = {
    itemId: item.id,
    lotId: undefined,
    lotNumber: undefined,
  };
  if (item.patientPrice && !line.unitPrice) {
    patch.unitPrice = item.patientPrice;
  }
  // Recompute total against the merged state (existing dose + new unitPrice).
  const merged = { ...line, ...patch };
  const totalPatch = recomputeTotalPatch(merged);
  return { ...patch, ...totalPatch };
}

/** Patch returned after the user picks a service in a row's Service cell. */
export function pickServicePatch(
  line: Line,
  service: Service | null,
): Partial<Line> {
  if (!service) {
    return { serviceId: undefined };
  }
  const patch: Partial<Line> = { serviceId: service.id };
  // Service price only auto-fills when no item is set AND unitPrice is empty.
  if (service.price && !line.unitPrice && !line.itemId) {
    patch.unitPrice = service.price;
  }
  const merged = { ...line, ...patch };
  const totalPatch = recomputeTotalPatch(merged);
  return { ...patch, ...totalPatch };
}

/** Patch with a recomputed total, or {} if either operand is non-numeric. */
export function recomputeTotalPatch(line: Line): Partial<Line> {
  const dose = parseFloat(line.dose ?? "");
  const unitPrice = parseFloat((line.unitPrice as string) ?? "");
  if (Number.isFinite(dose) && Number.isFinite(unitPrice)) {
    return { total: (dose * unitPrice).toFixed(2) };
  }
  return {};
}
