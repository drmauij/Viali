import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearch } from "wouter";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { de } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────

type Provider = {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  bookingServiceName: string | null;
  bookingLocation: string | null;
};

type BookingData = {
  hospital: {
    name: string;
    logoUrl: string | null;
    timezone: string;
    language: string;
  };
  bookingSettings: {
    slotDurationMinutes?: number;
    maxAdvanceDays?: number;
    minAdvanceHours?: number;
  };
  providers: Provider[];
};

type Slot = { startTime: string; endTime: string };

type Step = "provider" | "datetime" | "details" | "done";

// ─── Component ───────────────────────────────────────────────────────

export default function BookAppointment() {
  const { token } = useParams<{ token: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isEmbed = searchParams.get("embed") === "true";
  const preselectedProviderId = searchParams.get("provider");

  // Theme state
  const [isDark, setIsDark] = useState(false);

  // Data state
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Flow state
  const [step, setStep] = useState<Step>("provider");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotTaken, setSlotTaken] = useState(false);

  // ─── Load booking data ────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/booking/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          setError(res.status === 429 ? "rate_limit" : "not_found");
          return;
        }
        const d: BookingData = await res.json();
        setData(d);
        // Auto-skip provider selection if deep-linked or only 1 provider
        const preselected = preselectedProviderId
          ? d.providers.find(p => p.id === preselectedProviderId)
          : null;
        if (preselected) {
          setSelectedProvider(preselected);
          setStep("datetime");
          setAvailableDatesLoading(true);
          setSeekingAvailableMonth(true);
        } else if (d.providers.length === 1) {
          setSelectedProvider(d.providers[0]);
          setStep("datetime");
          setAvailableDatesLoading(true);
          setSeekingAvailableMonth(true);
        }
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [token]);

  // ─── Clinic closures ─────────────────────────────────────────
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/booking/${token}/closures`)
      .then(async (res) => {
        if (!res.ok) return;
        const closures: { startDate: string; endDate: string; name: string }[] = await res.json();
        const dates = new Set<string>();
        for (const c of closures) {
          const start = new Date(c.startDate + "T00:00:00");
          const end = new Date(c.endDate + "T00:00:00");
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.add(formatDateISO(d));
          }
        }
        setClosedDates(dates);
      })
      .catch(() => {});
  }, [token]);

  // ─── Date constraints ─────────────────────────────────────────

  const dateConstraints = useMemo(() => {
    if (!data) return { fromDate: new Date(), toDate: undefined as Date | undefined };
    const now = new Date();
    const minHours = data.bookingSettings.minAdvanceHours || 0;
    const fromDate = new Date(now.getTime() + minHours * 60 * 60 * 1000);
    fromDate.setHours(0, 0, 0, 0);
    if (fromDate < now) fromDate.setDate(fromDate.getDate());

    let toDate: Date | undefined;
    const maxDays = data.bookingSettings.maxAdvanceDays;
    if (maxDays) {
      toDate = new Date();
      toDate.setDate(toDate.getDate() + maxDays);
    }
    return { fromDate, toDate };
  }, [data]);

  // ─── Available dates for calendar highlighting ──────────────
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [availableDatesLoading, setAvailableDatesLoading] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());
  const [seekingAvailableMonth, setSeekingAvailableMonth] = useState(false);

  useEffect(() => {
    if (!selectedProvider || !token) return;
    setAvailableDatesLoading(true);
    const y = visibleMonth.getFullYear();
    const m = String(visibleMonth.getMonth() + 1).padStart(2, "0");
    fetch(`/api/public/booking/${token}/providers/${selectedProvider.id}/available-dates?month=${y}-${m}`)
      .then(async (res) => {
        if (!res.ok) { setAvailableDates(new Set()); return; }
        const d = await res.json();
        setAvailableDates(new Set(d.dates || []));
      })
      .catch(() => setAvailableDates(new Set()))
      .finally(() => setAvailableDatesLoading(false));
  }, [selectedProvider, token, visibleMonth]);

  // ─── Auto-jump to next month with available slots ────────────
  useEffect(() => {
    if (availableDatesLoading || !seekingAvailableMonth) return;
    if (availableDates.size > 0) {
      setSeekingAvailableMonth(false);
      return;
    }
    // Empty month — advance to next, but respect maxAdvanceDays limit
    const maxDate = dateConstraints.toDate;
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    if (maxDate && next > maxDate) {
      setSeekingAvailableMonth(false);
      return;
    }
    // Safety: don't seek more than 12 months ahead
    const now = new Date();
    const monthsAhead = (next.getFullYear() - now.getFullYear()) * 12 + (next.getMonth() - now.getMonth());
    if (monthsAhead > 12) {
      setSeekingAvailableMonth(false);
      return;
    }
    setAvailableDatesLoading(true);
    setVisibleMonth(next);
  }, [availableDates, availableDatesLoading, seekingAvailableMonth, visibleMonth, dateConstraints.toDate]);

  // ─── Clear selectedDate if it becomes unavailable ───────────
  useEffect(() => {
    if (availableDatesLoading || !selectedDate) return;
    if (!availableDates.has(formatDateISO(selectedDate))) {
      setSelectedDate(undefined);
    }
  }, [availableDates, availableDatesLoading, selectedDate]);

  // ─── Load slots when date changes ─────────────────────────────

  useEffect(() => {
    if (!selectedProvider || !selectedDate || !token) return;
    const dateStr = formatDateISO(selectedDate);
    setSlotsLoading(true);
    setSelectedSlot(null);
    fetch(`/api/public/booking/${token}/providers/${selectedProvider.id}/slots?date=${dateStr}`)
      .then(async (res) => {
        if (!res.ok) {
          setSlots([]);
          return;
        }
        const d = await res.json();
        setSlots(d.slots || []);
      })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedProvider, selectedDate, token]);

  // ─── Handlers ─────────────────────────────────────────────────

  const handleProviderSelect = useCallback((provider: Provider) => {
    setSelectedProvider(provider);
    setStep("datetime");
    setSelectedDate(undefined);
    setSlots([]);
    setSelectedSlot(null);
    setAvailableDatesLoading(true);
    setSeekingAvailableMonth(true);
  }, []);

  const handleSlotSelect = useCallback((slot: Slot) => {
    setSelectedSlot(slot);
    setStep("details");
    setSubmitError(null);
    setSlotTaken(false);
  }, []);

  const canGoBackToProviders = data && data.providers.length > 1 && !preselectedProviderId;

  const handleBack = useCallback(() => {
    if (step === "datetime") {
      if (canGoBackToProviders) {
        setStep("provider");
        setSelectedProvider(null);
      }
    } else if (step === "details") {
      setStep("datetime");
      setSubmitError(null);
      setSlotTaken(false);
    }
  }, [step, canGoBackToProviders]);

  const handleSubmit = useCallback(async () => {
    if (!token || !selectedProvider || !selectedDate || !selectedSlot) return;
    if (!firstName.trim() || !surname.trim() || !email.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    setSlotTaken(false);

    try {
      const res = await fetch(`/api/public/booking/${token}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selectedProvider.id,
          date: formatDateISO(selectedDate),
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          firstName: firstName.trim(),
          surname: surname.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.status === 409) {
        setSlotTaken(true);
        return;
      }

      if (!res.ok) {
        setSubmitError("Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
        return;
      }

      setStep("done");
    } catch {
      setSubmitError("Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung.");
    } finally {
      setSubmitting(false);
    }
  }, [token, selectedProvider, selectedDate, selectedSlot, firstName, surname, email, phone, notes]);

  // ─── Render helpers ───────────────────────────────────────────

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return "";
    return selectedDate.toLocaleDateString("de-CH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [selectedDate]);

  // ─── Loading / Error states ───────────────────────────────────

  if (loading) {
    return (
      <PageShell isDark={isDark} isEmbed={isEmbed}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className={cn(
            "h-8 w-8 rounded-full border-2 animate-spin",
            isDark ? "border-white/20 border-t-white" : "border-gray-200 border-t-gray-800"
          )} />
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell isDark={isDark} isEmbed={isEmbed}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className={cn(
            "text-center max-w-sm px-6",
            isDark ? "text-white/70" : "text-gray-500"
          )}>
            <div className="text-5xl mb-4 opacity-40">×</div>
            <p className="text-lg font-medium mb-1">
              {error === "network"
                ? "Verbindungsfehler"
                : error === "rate_limit"
                ? "Zu viele Anfragen"
                : "Seite nicht gefunden"}
            </p>
            <p className="text-sm opacity-70">
              {error === "network"
                ? "Bitte prüfen Sie Ihre Internetverbindung."
                : error === "rate_limit"
                ? "Bitte versuchen Sie es in einigen Minuten erneut."
                : "Dieser Buchungslink ist ungültig oder nicht mehr aktiv."}
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell isDark={isDark} isEmbed={isEmbed}>
      {/* Step indicator only in header area */}

      {/* Step indicator */}
      <StepIndicator
        current={step}
        isDark={isDark}
        hasMultipleProviders={data.providers.length > 1}
      />

      {/* Content */}
      <div className="mt-6 animate-slide-up">

        {/* ── Step 1: Provider Selection ── */}
        {step === "provider" && (
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-0 md:gap-6 items-start">
            {/* Clinic info left column */}
            <ClinicInfoPanel data={data} isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />

            <div>
              <h2 className={cn(
                "text-lg font-semibold mb-1",
                isDark ? "text-white" : "text-gray-900"
              )}>
                Arzt wählen
              </h2>
              <p className={cn(
                "text-sm mb-6",
                isDark ? "text-white/50" : "text-gray-400"
              )}>
                Wählen Sie Ihren behandelnden Arzt
              </p>

              <div className="grid gap-3">
                {data.providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider)}
                    className={cn(
                      "group flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200",
                      isDark
                        ? "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20"
                        : "bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-md"
                    )}
                  >
                    <ProviderAvatar provider={provider} isDark={isDark} />
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium truncate",
                        isDark ? "text-white" : "text-gray-900"
                      )}>
                        {provider.firstName} {provider.lastName}
                      </p>
                    </div>
                    <svg
                      className={cn(
                        "w-5 h-5 transition-transform duration-200 group-hover:translate-x-1",
                        isDark ? "text-white/30" : "text-gray-300"
                      )}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Date & Time Selection ── */}
        {step === "datetime" && selectedProvider && (
          <div>
            {canGoBackToProviders && (
              <button
                onClick={handleBack}
                className={cn(
                  "flex items-center gap-1 text-sm mb-4 transition-colors",
                  isDark ? "text-white/50 hover:text-white/80" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
                Zurück
              </button>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[200px_auto_1fr] gap-0 md:gap-6 items-start">
              {/* Clinic + provider info panel (Cal.com style left column) */}
              <div className={cn(
                "mb-4 md:mb-0 md:border-r md:pr-6",
                isDark ? "border-white/10" : "border-gray-100"
              )}>
                <ClinicInfoPanel data={data} isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />
                <div className="flex md:flex-col items-center md:items-start gap-3 md:gap-2 mt-4 md:mt-5">
                  <ProviderAvatar provider={selectedProvider} isDark={isDark} />
                  <div>
                    <p className={cn(
                      "text-sm font-semibold",
                      isDark ? "text-white/80" : "text-gray-900"
                    )}>
                      {selectedProvider.firstName} {selectedProvider.lastName}
                    </p>
                    {selectedProvider.bookingServiceName && (
                      <p className={cn(
                        "text-xs mt-1",
                        isDark ? "text-white/50" : "text-gray-500"
                      )}>
                        {selectedProvider.bookingServiceName}
                      </p>
                    )}
                    {selectedProvider.bookingLocation && (
                      <p className={cn(
                        "flex items-center gap-1 text-xs mt-1",
                        isDark ? "text-white/40" : "text-gray-400"
                      )}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {selectedProvider.bookingLocation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* Calendar */}
              <div className={cn(
                "rounded-2xl p-1 mx-auto md:mx-0 shrink-0",
                isDark ? "bg-white/5 border border-white/10" : "bg-white border border-gray-100 shadow-sm"
              )}>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  month={visibleMonth}
                  onMonthChange={setVisibleMonth}
                  locale={de}
                  classNames={{
                    nav_button: cn(
                      "inline-flex items-center justify-center rounded-md border h-7 w-7 p-0 transition-colors",
                      isDark
                        ? "border-white/20 text-white/60 hover:bg-white/10 hover:text-white"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    ),
                    day_today: cn(
                      "font-bold underline underline-offset-4 decoration-2",
                      isDark ? "text-white decoration-blue-400" : "text-gray-900 decoration-gray-400"
                    ),
                    day_selected: cn(
                      "hover:!opacity-100",
                      isDark
                        ? "!bg-blue-500 !text-white"
                        : "!bg-gray-900 !text-white hover:!bg-gray-800"
                    ),
                    cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                  }}
                  modifiers={{
                    hasSlots: (date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (date < today) return false;
                      if (dateConstraints.fromDate && date < dateConstraints.fromDate) return false;
                      if (dateConstraints.toDate && date > dateConstraints.toDate) return false;
                      return availableDates.has(formatDateISO(date));
                    },
                  }}
                  modifiersClassNames={{
                    hasSlots: "day-has-slots",
                  }}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (date < today) return true;
                    if (dateConstraints.fromDate && date < dateConstraints.fromDate) return true;
                    if (dateConstraints.toDate && date > dateConstraints.toDate) return true;
                    if (closedDates.has(formatDateISO(date))) return true;
                    if (!availableDatesLoading) {
                      return !availableDates.has(formatDateISO(date));
                    }
                    return false;
                  }}
                  className={cn(
                    isDark
                      ? "[&_.rdp-day]:text-white/25 [&_.rdp-head_cell]:text-white/50 [&_.rdp-caption_month]:text-white [&_.rdp-caption_year]:text-white/50 [&_.rdp-day_disabled]:text-white/15 [&_.rdp-day_outside]:text-white/10 [&_.day-has-slots]:text-white [&_.day-has-slots]:font-semibold"
                      : "[&_.rdp-day]:text-gray-300 [&_.rdp-day_disabled]:text-gray-200 [&_.rdp-day_outside]:text-gray-200 [&_.day-has-slots]:text-gray-900 [&_.day-has-slots]:font-semibold [&_.day-has-slots]:hover:bg-gray-100 [&_.rdp-day_selected.day-has-slots]:text-white"
                  )}
                />
              </div>

              {/* Time slots */}
              <div className="flex-1 w-full min-w-0">
                {!selectedDate ? (
                  <div className={cn(
                    "text-center py-12 text-sm",
                    isDark ? "text-white/40" : "text-gray-400"
                  )}>
                    Bitte wählen Sie ein Datum
                  </div>
                ) : slotsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className={cn(
                      "h-6 w-6 rounded-full border-2 animate-spin",
                      isDark ? "border-white/20 border-t-white" : "border-gray-200 border-t-gray-600"
                    )} />
                  </div>
                ) : slots.length === 0 ? (
                  <div className={cn(
                    "text-center py-12",
                    isDark ? "text-white/40" : "text-gray-400"
                  )}>
                    <p className="text-sm font-medium mb-1">Keine freien Termine</p>
                    <p className="text-xs opacity-70">
                      An diesem Tag sind leider keine Termine verfügbar.
                      <br />Bitte wählen Sie einen anderen Tag.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className={cn(
                      "text-xs font-medium uppercase tracking-wider mb-3",
                      isDark ? "text-white/40" : "text-gray-400"
                    )}>
                      Verfügbare Zeiten — {formattedSelectedDate}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.startTime}
                          onClick={() => handleSlotSelect(slot)}
                          className={cn(
                            "py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-150",
                            isDark
                              ? "bg-white/5 border border-white/10 text-white/80 hover:bg-blue-500/20 hover:border-blue-400/40 hover:text-white"
                              : "bg-white border border-gray-150 text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 shadow-sm"
                          )}
                        >
                          {slot.startTime}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Contact Details ── */}
        {step === "details" && selectedProvider && selectedDate && selectedSlot && (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className={cn(
                "flex items-center gap-1 text-sm mb-4 transition-colors",
                isDark ? "text-white/50 hover:text-white/80" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 19l-7-7 7-7" />
              </svg>
              Zurück
            </button>

            {/* Summary bar */}
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-xl mb-6",
              isDark ? "bg-blue-500/10 border border-blue-400/20" : "bg-blue-50 border border-blue-100"
            )}>
              <ProviderAvatar provider={selectedProvider} isDark={isDark} size="sm" />
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium truncate",
                  isDark ? "text-white/80" : "text-gray-800"
                )}>
                  {selectedProvider.firstName} {selectedProvider.lastName}
                </p>
                <p className={cn(
                  "text-xs",
                  isDark ? "text-white/50" : "text-gray-500"
                )}>
                  {formattedSelectedDate} um {selectedSlot.startTime} Uhr
                </p>
              </div>
            </div>

            {/* Slot taken error */}
            {slotTaken && (
              <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <p className="font-medium mb-1">Termin nicht mehr verfügbar</p>
                <p className="text-xs">Dieser Zeitpunkt wurde soeben gebucht. Bitte wählen Sie einen anderen.</p>
                <Button
                  onClick={() => { setSlotTaken(false); setStep("datetime"); }}
                  variant="outline"
                  size="sm"
                  className="mt-3"
                >
                  Anderes Datum wählen
                </Button>
              </div>
            )}

            {/* Submit error */}
            {submitError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {submitError}
              </div>
            )}

            {/* Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName" className={cn(
                    "text-xs font-medium mb-1.5 block",
                    isDark ? "text-white/60" : "text-gray-500"
                  )}>
                    Vorname *
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Max"
                    className={cn(
                      "rounded-xl h-11",
                      isDark
                        ? "bg-white/5 border-white/15 text-white placeholder:text-white/30"
                        : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                    )}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="surname" className={cn(
                    "text-xs font-medium mb-1.5 block",
                    isDark ? "text-white/60" : "text-gray-500"
                  )}>
                    Nachname *
                  </Label>
                  <Input
                    id="surname"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    placeholder="Muster"
                    className={cn(
                      "rounded-xl h-11",
                      isDark
                        ? "bg-white/5 border-white/15 text-white placeholder:text-white/30"
                        : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                    )}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="email" className={cn(
                  "text-xs font-medium mb-1.5 block",
                  isDark ? "text-white/60" : "text-gray-500"
                )}>
                  E-Mail *
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="max.muster@email.ch"
                  className={cn(
                    "rounded-xl h-11",
                    isDark
                      ? "bg-white/5 border-white/15 text-white placeholder:text-white/30"
                      : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  )}
                  required
                />
              </div>

              <div>
                <Label htmlFor="phone" className={cn(
                  "text-xs font-medium mb-1.5 block",
                  isDark ? "text-white/60" : "text-gray-500"
                )}>
                  Telefon
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+41 79 123 45 67"
                  className={cn(
                    "rounded-xl h-11",
                    isDark
                      ? "bg-white/5 border-white/15 text-white placeholder:text-white/30"
                      : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  )}
                />
              </div>

              <div>
                <Label htmlFor="notes" className={cn(
                  "text-xs font-medium mb-1.5 block",
                  isDark ? "text-white/60" : "text-gray-500"
                )}>
                  Anmerkungen
                </Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Grund des Besuchs, besondere Hinweise..."
                  rows={3}
                  maxLength={1000}
                  className={cn(
                    "flex w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none",
                    isDark
                      ? "bg-white/5 border-white/15 text-white placeholder:text-white/30"
                      : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  )}
                />
              </div>

              {/* Privacy consent */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(e) => setPrivacyAccepted(e.target.checked)}
                  className={cn(
                    "mt-0.5 h-4 w-4 rounded border shrink-0 accent-gray-900",
                    isDark ? "border-white/20" : "border-gray-300"
                  )}
                />
                <span className={cn(
                  "text-xs leading-relaxed",
                  isDark ? "text-white/50" : "text-gray-500"
                )}>
                  Ich stimme der Verarbeitung meiner personenbezogenen Daten zum Zweck der Terminbuchung zu. Meine Daten werden vertraulich behandelt und nicht an Dritte weitergegeben. *
                </span>
              </label>

              <Button
                onClick={handleSubmit}
                disabled={submitting || !firstName.trim() || !surname.trim() || !email.trim() || !privacyAccepted}
                className={cn(
                  "w-full h-12 rounded-xl text-sm font-semibold transition-all duration-200",
                  isDark
                    ? "bg-blue-500 hover:bg-blue-400 text-white disabled:bg-white/10 disabled:text-white/30"
                    : "bg-gray-900 hover:bg-gray-800 text-white disabled:bg-gray-200 disabled:text-gray-400"
                )}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Wird gebucht...
                  </span>
                ) : (
                  "Termin buchen"
                )}
              </Button>

              <p className={cn(
                "text-[11px] text-center leading-relaxed",
                isDark ? "text-white/30" : "text-gray-400"
              )}>
                Sie erhalten eine Bestätigung per E-Mail.
                <br />Der Termin kann jederzeit über den Link in der E-Mail abgesagt werden.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirmation ── */}
        {step === "done" && selectedProvider && selectedDate && selectedSlot && (
          <div className="max-w-sm mx-auto text-center py-8 animate-fade-in">
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6",
              isDark ? "bg-emerald-500/15" : "bg-emerald-50"
            )}>
              <svg
                className={cn("w-8 h-8", isDark ? "text-emerald-400" : "text-emerald-600")}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className={cn(
              "text-xl font-semibold mb-2",
              isDark ? "text-white" : "text-gray-900"
            )}>
              Termin bestätigt
            </h2>
            <p className={cn(
              "text-sm mb-6",
              isDark ? "text-white/50" : "text-gray-500"
            )}>
              Bestätigung wurde an <strong className={isDark ? "text-white/70" : "text-gray-700"}>{email}</strong> gesendet.
            </p>

            <div className={cn(
              "rounded-2xl p-5 text-left space-y-3 mb-6",
              isDark ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-100"
            )}>
              <SummaryRow label="Arzt" value={`${selectedProvider.firstName} ${selectedProvider.lastName}`} isDark={isDark} />
              <SummaryRow label="Datum" value={formattedSelectedDate} isDark={isDark} />
              <SummaryRow label="Uhrzeit" value={`${selectedSlot.startTime} Uhr`} isDark={isDark} />
              <SummaryRow label="Klinik" value={data.hospital.name} isDark={isDark} />
            </div>

            <p className={cn(
              "text-xs",
              isDark ? "text-white/30" : "text-gray-400"
            )}>
              Zum Absagen nutzen Sie den Link in Ihrer Bestätigungs-E-Mail.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {!isEmbed && (
        <footer className={cn(
          "mt-12 pt-4 border-t text-center text-[11px]",
          isDark ? "border-white/5 text-white/20" : "border-gray-100 text-gray-300"
        )}>
          Powered by Viali
        </footer>
      )}
    </PageShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function ClinicInfoPanel({ data, isDark, onToggleTheme }: { data: BookingData; isDark: boolean; onToggleTheme: () => void }) {
  return (
    <div className={cn(
      "mb-4 md:mb-0",
    )}>
      <div className="flex md:flex-col items-center md:items-start gap-3 md:gap-3">
        {data.hospital.logoUrl && (
          <img
            src={data.hospital.logoUrl}
            alt={data.hospital.name}
            className="h-8 w-auto object-contain"
          />
        )}
        <h1 className={cn(
          "text-sm font-semibold",
          isDark ? "text-white" : "text-gray-900"
        )}>
          {data.hospital.name}
        </h1>
      </div>
      {/* Theme toggle — small, tucked under clinic info */}
      <button
        onClick={onToggleTheme}
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-300",
          isDark
            ? "bg-white/10 text-white/50 hover:bg-white/15 hover:text-white/70"
            : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-500"
        )}
      >
        {isDark ? (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            Hell
          </>
        ) : (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            Dunkel
          </>
        )}
      </button>
    </div>
  );
}

function PageShell({ children, isDark, isEmbed }: { children: React.ReactNode; isDark: boolean; isEmbed: boolean }) {
  // Override the global app theme so body bg-background matches the booking page theme
  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.body.style.background = isDark ? "#0c0c14" : "#f9fafb";
    return () => {
      if (prev) document.documentElement.setAttribute("data-theme", prev);
      else document.documentElement.removeAttribute("data-theme");
      document.body.style.background = "";
    };
  }, [isDark]);

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500",
      isDark
        ? "bg-[#0c0c14] text-white"
        : "bg-gradient-to-b from-gray-50 via-white to-gray-50",
      isEmbed && "!min-h-0"
    )}>
      <div className={cn(
        "max-w-4xl mx-auto px-4 py-8",
        isEmbed && "py-4"
      )}>
        {children}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        .animate-slide-up { animation: slideUp 0.35s ease-out; }
      `}</style>
    </div>
  );
}

function ProviderAvatar({ provider, isDark, size = "md" }: { provider: Provider; isDark: boolean; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  if (provider.profileImageUrl) {
    return (
      <img
        src={provider.profileImageUrl}
        alt=""
        className={cn(dim, "rounded-full object-cover shrink-0")}
      />
    );
  }

  const initials = `${(provider.firstName?.[0] || "").toUpperCase()}${(provider.lastName?.[0] || "").toUpperCase()}`;
  return (
    <div className={cn(
      dim, textSize,
      "rounded-full flex items-center justify-center font-semibold shrink-0",
      isDark ? "bg-white/10 text-white/60" : "bg-gray-100 text-gray-500"
    )}>
      {initials}
    </div>
  );
}

function StepIndicator({ current, isDark, hasMultipleProviders }: { current: Step; isDark: boolean; hasMultipleProviders: boolean }) {
  const steps = hasMultipleProviders
    ? [
        { key: "provider", label: "Arzt" },
        { key: "datetime", label: "Termin" },
        { key: "details", label: "Daten" },
      ]
    : [
        { key: "datetime", label: "Termin" },
        { key: "details", label: "Daten" },
      ];

  const currentIdx = current === "done"
    ? steps.length
    : steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium transition-colors duration-300",
            i <= currentIdx
              ? (isDark ? "text-white/80" : "text-gray-800")
              : (isDark ? "text-white/20" : "text-gray-300")
          )}>
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300",
              i < currentIdx
                ? (isDark ? "bg-blue-500 text-white" : "bg-gray-900 text-white")
                : i === currentIdx
                  ? (isDark ? "bg-white/15 text-white" : "bg-gray-200 text-gray-700")
                  : (isDark ? "bg-white/5 text-white/20" : "bg-gray-100 text-gray-300")
            )}>
              {i < currentIdx ? "✓" : i + 1}
            </div>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              "w-8 h-px transition-colors duration-300",
              i < currentIdx
                ? (isDark ? "bg-blue-500/50" : "bg-gray-400")
                : (isDark ? "bg-white/10" : "bg-gray-200")
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className={cn(
        "text-xs shrink-0",
        isDark ? "text-white/40" : "text-gray-400"
      )}>
        {label}
      </span>
      <span className={cn(
        "text-sm font-medium text-right",
        isDark ? "text-white/80" : "text-gray-800"
      )}>
        {value}
      </span>
    </div>
  );
}

// ─── Utils ──────────────────────────────────────────────────────────

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
