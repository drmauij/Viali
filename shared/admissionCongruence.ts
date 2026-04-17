export type AdmissionCongruenceSeverity = "none" | "drifted" | "invalid";
export type AdmissionCongruenceReason = "afterStart" | "wrongDay" | "gapDrifted" | "none";

export interface AdmissionCongruenceInput {
  oldPlannedDate: Date | null;
  oldAdmissionTime: Date | null;
  newPlannedDate: Date;
  defaultOffsetMinutes: number;
  hospitalTimeZone: string;
}

export interface AdmissionCongruenceResult {
  severity: AdmissionCongruenceSeverity;
  reason: AdmissionCongruenceReason;
  suggestedAdmission: Date;
}

export const DRIFT_THRESHOLD_MINUTES = 120;
const DRIFT_THRESHOLD_MS = DRIFT_THRESHOLD_MINUTES * 60 * 1000;

function localDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function checkAdmissionCongruence(
  input: AdmissionCongruenceInput,
): AdmissionCongruenceResult {
  const { oldPlannedDate, oldAdmissionTime, newPlannedDate, defaultOffsetMinutes, hospitalTimeZone } = input;

  const suggestedAdmission = new Date(newPlannedDate.getTime() - defaultOffsetMinutes * 60 * 1000);

  if (!oldAdmissionTime) {
    return { severity: "none", reason: "none", suggestedAdmission };
  }

  if (oldAdmissionTime.getTime() >= newPlannedDate.getTime()) {
    return { severity: "invalid", reason: "afterStart", suggestedAdmission };
  }

  if (localDayKey(oldAdmissionTime, hospitalTimeZone) !== localDayKey(newPlannedDate, hospitalTimeZone)) {
    return { severity: "invalid", reason: "wrongDay", suggestedAdmission };
  }

  if (oldPlannedDate) {
    const moveMs = Math.abs(newPlannedDate.getTime() - oldPlannedDate.getTime());
    if (moveMs > DRIFT_THRESHOLD_MS) {
      return { severity: "drifted", reason: "gapDrifted", suggestedAdmission };
    }
  }

  return { severity: "none", reason: "none", suggestedAdmission };
}
