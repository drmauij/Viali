import { useState, useMemo } from "react";
import {
  addDays,
  addWeeks,
  addMonths,
  startOfISOWeek,
  startOfMonth,
  endOfMonth,
  format,
  getISOWeek,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Mail } from "lucide-react";
import ShiftsWeekView from "@/components/shifts/ShiftsWeekView";
import ShiftsMonthView from "@/components/shifts/ShiftsMonthView";
import ShiftsDayView from "@/components/shifts/ShiftsDayView";
import ShiftsEmailDialog from "@/components/shifts/ShiftsEmailDialog";
import { generateShiftsMonthPdf } from "@/lib/shiftsMonthPdf";
import type { ShiftType, StaffShift } from "@shared/schema";

type ViewType = "day" | "week" | "month";
const VIEW_KEY = "shifts_view";

function formatDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getStoredView(): ViewType {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    if (v === "day" || v === "week" || v === "month") return v;
  } catch {}
  return "week";
}

export default function ClinicShifts() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    const savedHospitalKey = localStorage.getItem("activeHospital");
    if (savedHospitalKey) {
      const saved = userHospitals.find(
        (h: any) => `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    return userHospitals[0];
  }, [user]);

  const hospitalId: string | undefined = activeHospital?.id;
  const unitId: string | undefined = activeHospital?.unitId;
  const isAdmin = activeHospital?.role === 'admin' || activeHospital?.role === 'group_admin';

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [view, setView] = useState<ViewType>(getStoredView);
  const [emailOpen, setEmailOpen] = useState(false);

  function changeView(v: ViewType) {
    setView(v);
    try {
      sessionStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  // Compute from/to for the current view
  const { from, to } = useMemo(() => {
    if (view === "day") {
      return { from: anchor, to: anchor };
    }
    if (view === "week") {
      const start = startOfISOWeek(anchor);
      return { from: start, to: addDays(start, 6) };
    }
    // month
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }, [anchor, view]);

  const fromStr = formatDateParam(from);
  const toStr = formatDateParam(to);

  // Navigation
  function goBack() {
    if (view === "day") setAnchor((a) => addDays(a, -1));
    else if (view === "week") setAnchor((a) => addWeeks(a, -1));
    else setAnchor((a) => addMonths(a, -1));
  }

  function goForward() {
    if (view === "day") setAnchor((a) => addDays(a, 1));
    else if (view === "week") setAnchor((a) => addWeeks(a, 1));
    else setAnchor((a) => addMonths(a, 1));
  }

  function goToday() {
    setAnchor(new Date());
  }

  // Header label
  const headerLabel = useMemo(() => {
    if (view === "day") {
      return format(anchor, "EEEE, d MMM yyyy");
    }
    if (view === "week") {
      const weekNum = getISOWeek(from);
      const startLabel = format(from, "d");
      const endLabel = format(to, "d MMM yyyy");
      const startMonth = format(from, "MMM");
      const sameMonth = format(from, "MMM") === format(to, "MMM");
      const rangeStr = sameMonth
        ? `${startLabel}–${endLabel}`
        : `${startLabel} ${startMonth} – ${endLabel}`;
      return `Week ${weekNum} · ${rangeStr}`;
    }
    return format(anchor, "MMMM yyyy");
  }, [anchor, from, to, view]);

  // Data fetching
  const { data: shiftTypes = [] } = useQuery<ShiftType[]>({
    queryKey: ["shift-types", hospitalId],
    queryFn: () =>
      apiRequest("GET", `/api/shift-types/${hospitalId}`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const { data: staffShifts = [], refetch: refetchShifts } = useQuery<StaffShift[]>({
    queryKey: ["staff-shifts", hospitalId, fromStr, toStr],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/staff-shifts/${hospitalId}?from=${fromStr}&to=${toStr}`
      ).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const { data: staffPool = [], refetch: refetchPool } = useQuery<
    Array<{ id: string; date: string; userId: string | null; name: string; role: string }>
  >({
    queryKey: ["staff-pool-range", hospitalId, fromStr, toStr],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/staff-pool/${hospitalId}/range?startDate=${fromStr}&endDate=${toStr}`,
      ).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  // NOTE: distinct from the `['bookable-providers', hospitalId, unitId]` key used
  // by Appointments.tsx / PatientDetail.tsx. Those callers cache a flat shape
  // ({id, firstName, lastName}); this page needs the raw nested shape so it can
  // filter by `p.user`. Sharing the same key caused the /shifts calendar to
  // render without providers when navigating from another tab, because React
  // Query returned the cached flat shape and the `p.user` filter dropped everything.
  const { data: providersRaw = [] } = useQuery<
    Array<{ userId: string; user: { firstName: string; lastName: string; email: string | null } }>
  >({
    queryKey: ["bookable-providers-raw", hospitalId, unitId],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/clinic/${hospitalId}/bookable-providers?unitId=${unitId}`
      ).then((r) => r.json()),
    enabled: !!hospitalId && !!unitId,
  });

  const providers = useMemo(
    () =>
      providersRaw
        .filter((p) => p.user)
        .map((p) => ({
          id: p.userId,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
        })),
    [providersRaw]
  );

  const { data: absences = [] } = useQuery<
    Array<{
      id: string;
      providerId: string;
      absenceType: string;
      startDate: string;
      endDate: string;
      notes: string | null;
    }>
  >({
    queryKey: ["absences", hospitalId, fromStr, toStr],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/clinic/${hospitalId}/absences?startDate=${fromStr}&endDate=${toStr}`
      ).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const { data: timeOffs = [] } = useQuery<
    Array<{
      id: string;
      providerId: string;
      startDate: string;
      endDate: string;
      startTime: string | null;
      endTime: string | null;
      reason: string | null;
      notes: string | null;
      approvalStatus?: string;
    }>
  >({
    queryKey: ["time-offs", hospitalId, unitId, fromStr, toStr],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/clinic/${hospitalId}/units/${unitId}/time-off?startDate=${fromStr}&endDate=${toStr}&expand=true`
      ).then((r) => r.json()),
    enabled: !!hospitalId && !!unitId,
  });

  const monthStr = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = format(anchor, "MMMM yyyy");

  const buildPdf = async () => {
    // Resolve a date-fns locale matching the user's UI language so weekday/month
    // names render in the right language. Fall back to en-US if the locale
    // can't be loaded.
    const lang = (i18n.language || "en").toLowerCase().split("-")[0];
    let dateLocale;
    try {
      dateLocale = lang === "de"
        ? (await import("date-fns/locale/de")).de
        : (await import("date-fns/locale/en-US")).enUS;
    } catch {
      dateLocale = undefined;
    }

    return generateShiftsMonthPdf({
      hospitalName: activeHospital?.name ?? "",
      unitName: activeHospital?.unitName ?? null,
      anchor,
      timeZone: activeHospital?.timezone || "Europe/Zurich",
      locale: i18n.language === "de" ? "de-CH" : "en-US",
      dateLocale,
      i18n: {
        title: t("shifts.pdf.title"),
        generated: t("shifts.pdf.generated"),
        legend: t("shifts.pdf.legend"),
        plannedInOp: t("shifts.pdf.plannedInOp"),
      },
      providers,
      shiftTypes,
      staffShifts,
      absences,
      timeOffs,
      staffPool,
    });
  };

  const handleDownload = async () => {
    const { blob, filename } = await buildPdf();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b bg-background flex-shrink-0 flex-wrap">
        {/* Navigation */}
        <Button variant="outline" size="sm" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          {t("common.today", "Today")}
        </Button>
        <Button variant="outline" size="sm" onClick={goForward}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Date range label */}
        <span className="text-sm font-medium ml-2 flex-1 min-w-0 truncate">{headerLabel}</span>

        {/* View switcher + actions */}
        <div className="flex gap-1 ml-auto items-center">
          {view === "month" && isAdmin && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                title="Download PDF"
              >
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEmailOpen(true)}
                title="Email schedule to team"
              >
                <Mail className="h-4 w-4 mr-1" /> Email
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
            </>
          )}
          {(["day", "week", "month"] as ViewType[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "default" : "outline"}
              onClick={() => changeView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!hospitalId ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No hospital selected.
          </div>
        ) : view === "week" ? (
          <ShiftsWeekView
            shiftTypes={shiftTypes}
            staffShifts={staffShifts}
            staffPool={staffPool}
            providers={providers}
            absences={absences}
            timeOffs={timeOffs}
            hospitalId={hospitalId}
            anchor={anchor}
            onSaved={() => { refetchShifts(); refetchPool(); }}
            readOnly={!isAdmin}
          />
        ) : view === "day" ? (
          <ShiftsDayView
            shiftTypes={shiftTypes}
            staffShifts={staffShifts}
            staffPool={staffPool}
            providers={providers}
            absences={absences}
            timeOffs={timeOffs}
            hospitalId={hospitalId}
            unitId={unitId ?? ""}
            anchor={anchor}
            onSaved={() => { refetchShifts(); refetchPool(); }}
            readOnly={!isAdmin}
          />
        ) : (
          <ShiftsMonthView
            shiftTypes={shiftTypes}
            staffShifts={staffShifts}
            staffPool={staffPool}
            providers={providers}
            absences={absences}
            timeOffs={timeOffs}
            hospitalId={hospitalId}
            unitId={unitId ?? ""}
            anchor={anchor}
            onSaved={() => { refetchShifts(); refetchPool(); }}
            readOnly={!isAdmin}
          />
        )}
      </div>

      {hospitalId && unitId && (
        <ShiftsEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          hospitalId={hospitalId}
          unitId={unitId}
          monthStr={monthStr}
          monthLabel={monthLabel}
          generatePdfBase64={async () => (await buildPdf()).base64}
        />
      )}
    </div>
  );
}
