import { applyServerAdmissionFallback } from "@shared/admissionCongruence";
import type { Hospital, Surgery } from "@shared/schema";

export interface MaybeShiftAdmissionTimeInput {
  reqBody: Record<string, any>;
  updateData: Record<string, any>;
  storedSurgery: Pick<Surgery, "admissionTime">;
  hospital: Pick<Hospital, "timezone" | "defaultAdmissionOffsetMinutes">;
}

/**
 * Mutates updateData.admissionTime in place when plannedDate is moving to a
 * new local day without an explicit admissionTime in the request body.
 * Returns { shifted: Date | null } where shifted is the new admission time
 * (or null if no change was needed).
 */
export function maybeShiftAdmissionTime(params: MaybeShiftAdmissionTimeInput): { shifted: Date | null } {
  const { reqBody, updateData, storedSurgery, hospital } = params;
  if (!(updateData.plannedDate instanceof Date)) return { shifted: null };

  const shifted = applyServerAdmissionFallback({
    bodyHasAdmissionTimeKey: Object.prototype.hasOwnProperty.call(reqBody, "admissionTime"),
    newPlannedDate: updateData.plannedDate,
    storedAdmissionTime: storedSurgery.admissionTime ? new Date(storedSurgery.admissionTime as any) : null,
    defaultOffsetMinutes: hospital.defaultAdmissionOffsetMinutes ?? 60,
    hospitalTimeZone: hospital.timezone || "Europe/Zurich",
  });
  if (shifted) updateData.admissionTime = shifted;
  return { shifted };
}
