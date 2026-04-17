import { format } from "date-fns";

export const APPOINTMENT_FETCH_STALE_MS = 30_000;

export type ApiAppointment = {
  id: string;
  startTime: string;
  status: string;
  // joined fields (leftJoin results from the existing endpoint)
  providerFirstName?: string | null;
  providerLastName?: string | null;
  users?: { firstName?: string | null; lastName?: string | null } | null;
  clinic_services?: { name?: string | null } | null;
};

export type NormalizedAppointmentRow = {
  id: string;
  startTime: string;
  status: string;
  providerName: string | null;
  serviceName: string | null;
};

export function normalizeApptRow(a: ApiAppointment): NormalizedAppointmentRow {
  const first = a.users?.firstName ?? a.providerFirstName ?? null;
  const last = a.users?.lastName ?? a.providerLastName ?? null;
  const providerName = [first, last].filter(Boolean).join(" ") || null;
  return {
    id: a.id,
    startTime: a.startTime,
    status: a.status,
    providerName,
    serviceName: a.clinic_services?.name ?? null,
  };
}

export const LINKABLE_APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
] as const;

export type LinkableAppointment = {
  id: string;
  startTime: string;
  status: string;
};

export function isLinkableAppointmentStatus(status: string): boolean {
  return (LINKABLE_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}

export function filterLinkableAppointments<T extends { status: string }>(
  appointments: T[],
): T[] {
  return appointments.filter((a) => isLinkableAppointmentStatus(a.status));
}

function parseStartTimeOnDate(startTime: string, reference: Date): Date {
  const [hh, mm] = startTime.split(":").map(Number);
  const d = new Date(reference);
  d.setHours(hh, mm ?? 0, 0, 0);
  return d;
}

export function pickNearestToNow<T extends LinkableAppointment>(
  appointments: T[],
  now: Date,
): T | null {
  if (appointments.length === 0) return null;
  let best = appointments[0];
  let bestDelta = Math.abs(
    parseStartTimeOnDate(best.startTime, now).getTime() - now.getTime(),
  );
  for (let i = 1; i < appointments.length; i++) {
    const candidate = appointments[i];
    const delta = Math.abs(
      parseStartTimeOnDate(candidate.startTime, now).getTime() - now.getTime(),
    );
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

export function todayLocalDateString(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export const BANNER_ACTIONABLE_STATUSES = ["draft", "amended"] as const;

export function canActOnBanner(status?: string): boolean {
  if (!status) return true;
  return (BANNER_ACTIONABLE_STATUSES as readonly string[]).includes(status);
}

export function isTreatmentLocked(status?: string): boolean {
  return status === "signed" || status === "invoiced";
}
