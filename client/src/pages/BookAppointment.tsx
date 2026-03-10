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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotTaken, setSlotTaken] = useState(false);

  // ─── Load booking data ────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/booking/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          setError("not_found");
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
        } else if (d.providers.length === 1) {
          setSelectedProvider(d.providers[0]);
          setStep("datetime");
        }
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [token]);

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

  // ─── Handlers ─────────────────────────────────────────────────

  const handleProviderSelect = useCallback((provider: Provider) => {
    setSelectedProvider(provider);
    setStep("datetime");
    setSelectedDate(undefined);
    setSlots([]);
    setSelectedSlot(null);
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
                : "Seite nicht gefunden"}
            </p>
            <p className="text-sm opacity-70">
              {error === "network"
                ? "Bitte prüfen Sie Ihre Internetverbindung."
                : "Dieser Buchungslink ist ungültig oder nicht mehr aktiv."}
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell isDark={isDark} isEmbed={isEmbed}>
      {/* Header */}
      <header className="text-center mb-8 animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-3">
          {data.hospital.logoUrl && (
            <img
              src={data.hospital.logoUrl}
              alt={data.hospital.name}
              className="h-10 w-auto object-contain"
            />
          )}
          <h1 className={cn(
            "text-xl font-semibold tracking-tight",
            isDark ? "text-white" : "text-gray-900"
          )}>
            {data.hospital.name}
          </h1>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            isDark
              ? "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80"
              : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          )}
        >
          {isDark ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              Hell
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              Dunkel
            </>
          )}
        </button>
      </header>

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
          <div>
            <h2 className={cn(
              "text-lg font-semibold mb-1 text-center",
              isDark ? "text-white" : "text-gray-900"
            )}>
              Arzt wählen
            </h2>
            <p className={cn(
              "text-sm mb-6 text-center",
              isDark ? "text-white/50" : "text-gray-400"
            )}>
              Wählen Sie Ihren behandelnden Arzt
            </p>

            <div className="grid gap-3 max-w-md mx-auto">
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

            {/* Selected provider compact */}
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-xl mb-6",
              isDark ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-100"
            )}>
              <ProviderAvatar provider={selectedProvider} isDark={isDark} size="sm" />
              <span className={cn(
                "text-sm font-medium",
                isDark ? "text-white/80" : "text-gray-700"
              )}>
                {selectedProvider.firstName} {selectedProvider.lastName}
              </span>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Calendar */}
              <div className={cn(
                "rounded-2xl p-1 mx-auto lg:mx-0 shrink-0",
                isDark ? "bg-white/5 border border-white/10" : "bg-white border border-gray-100 shadow-sm"
              )}>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  locale={de}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (date < today) return true;
                    if (dateConstraints.fromDate && date < dateConstraints.fromDate) return true;
                    if (dateConstraints.toDate && date > dateConstraints.toDate) return true;
                    return false;
                  }}
                  className={cn(
                    isDark && "[&_.rdp-day]:text-white [&_.rdp-head_cell]:text-white/50 [&_.rdp-caption_label]:text-white [&_.rdp-nav_button]:text-white/60 [&_.rdp-nav_button]:border-white/20 [&_.rdp-day_today]:bg-white/10 [&_.rdp-day_selected]:bg-blue-500 [&_.rdp-day_selected]:text-white [&_.rdp-day_disabled]:text-white/20 [&_.rdp-day_outside]:text-white/15"
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
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
                      isDark && "bg-white/5 border-white/15 text-white placeholder:text-white/30"
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
                      isDark && "bg-white/5 border-white/15 text-white placeholder:text-white/30"
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
                    isDark && "bg-white/5 border-white/15 text-white placeholder:text-white/30"
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
                    isDark && "bg-white/5 border-white/15 text-white placeholder:text-white/30"
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
                      : "border-input bg-background placeholder:text-muted-foreground"
                  )}
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitting || !firstName.trim() || !surname.trim() || !email.trim()}
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

function PageShell({ children, isDark, isEmbed }: { children: React.ReactNode; isDark: boolean; isEmbed: boolean }) {
  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500",
      isDark
        ? "bg-[#0c0c14] text-white"
        : "bg-gradient-to-b from-gray-50 via-white to-gray-50",
      isEmbed && "!min-h-0"
    )}>
      <div className={cn(
        "max-w-2xl mx-auto px-4 py-8",
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
