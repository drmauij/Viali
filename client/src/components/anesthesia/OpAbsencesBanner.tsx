import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserX } from "lucide-react";

/**
 * Compact day-view banner listing OR-relevant staff who are OFF on the
 * selected date (vacation / sick / training / other). Reuses the same
 * `/api/clinic/:id/staff-availability` endpoint that PlanStaffDialog uses,
 * so no new backend work — just surfaces the info above the OP grid.
 *
 * Positioned next to DayNotesBanner in OPCalendar so planners see
 * absences at a glance before scheduling a surgery.
 */

interface OpAbsencesBannerProps {
  hospitalId: string;
  selectedDate: Date;
}

interface StaffOption {
  id: string;
  name: string;
}

type AbsenceType = "vacation" | "sick" | "training" | "other" | string;

interface AvailabilityEntry {
  status: "available" | "warning" | "busy" | "absent";
  absenceType?: AbsenceType;
}

export interface AbsentStaff {
  id: string;
  name: string;
  reason: string;
}

function formatDateKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function absenceLabel(t: (k: string, d?: string) => string, type?: AbsenceType): string {
  switch (type) {
    case "vacation":
      return t("absences.vacation", "Urlaub");
    case "sick":
      return t("absences.sick", "Krank");
    case "training":
      return t("absences.training", "Weiterbildung");
    default:
      return t("absences.other", "Abwesend");
  }
}

/**
 * Hook form — lets the parent (OPCalendar) know how many staff are absent
 * so it can choose a one-column vs two-column layout dynamically based on
 * whether the banner has anything to render at all.
 */
export function useAbsentStaff(
  hospitalId: string | undefined,
  selectedDate: Date,
): AbsentStaff[] {
  const { t } = useTranslation();
  const dateString = useMemo(() => formatDateKey(selectedDate), [selectedDate]);

  const { data: staffOptions = [] } = useQuery<StaffOption[]>({
    queryKey: ["/api/anesthesia/all-staff-options", hospitalId],
    queryFn: async () => {
      const res = await fetch(
        `/api/anesthesia/all-staff-options/${hospitalId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch staff options");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const staffIds = useMemo(
    () => staffOptions.map((s) => s.id).join(","),
    [staffOptions],
  );

  const { data: availability = {} } = useQuery<
    Record<string, AvailabilityEntry>
  >({
    queryKey: [
      "/api/clinic/staff-availability",
      hospitalId,
      dateString,
      staffIds,
    ],
    queryFn: async () => {
      if (!staffIds) return {};
      const res = await fetch(
        `/api/clinic/${hospitalId}/staff-availability?date=${dateString}&staffIds=${staffIds}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled: !!hospitalId && staffOptions.length > 0,
  });

  return useMemo(() => {
    return staffOptions
      .filter((s) => availability[s.id]?.status === "absent")
      .map((s) => ({
        id: s.id,
        name: s.name,
        reason: absenceLabel(
          t as (k: string, d?: string) => string,
          availability[s.id]?.absenceType,
        ),
      }));
  }, [staffOptions, availability, t]);
}

export default function OpAbsencesBanner({
  hospitalId,
  selectedDate,
}: OpAbsencesBannerProps) {
  const { t } = useTranslation();
  const absentStaff = useAbsentStaff(hospitalId, selectedDate);

  if (absentStaff.length === 0) return null;

  return (
    <div
      className="flex items-start gap-2 p-2 px-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg"
      data-testid="op-absences-banner"
    >
      <UserX className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-rose-900 dark:text-rose-200 min-w-0">
        <span className="font-medium">
          {t("absences.bannerLabel", "Heute abwesend")} ({absentStaff.length}):
        </span>
        {absentStaff.map((s, i) => (
          <span
            key={s.id}
            className="inline-flex items-center"
            data-testid={`absent-staff-${s.id}`}
          >
            <span>{s.name}</span>
            <span className="text-rose-700/70 dark:text-rose-300/70 ml-1">
              · {s.reason}
            </span>
            {i < absentStaff.length - 1 && <span className="ml-1">,</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
