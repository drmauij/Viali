import { format } from "date-fns";

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

export function canActOnBanner(status?: string): boolean {
  if (!status) return true;
  return status === "draft" || status === "amended";
}
