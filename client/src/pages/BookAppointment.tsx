import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useSearch } from "wouter";
import { BookingSection } from '@/components/booking/BookingSection';
import { useBookingScrollOnStep } from '@/components/booking/useBookingScrollOnStep';
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { ReferralSourcePicker } from "@/components/ReferralSourcePicker";
import { resolveReferralFromParams } from "@shared/referralMapping";
import { de } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────

type Provider = {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  bookingServiceName: string | null;
  bookingLocation: string | null;
  role: string | null;
};

type BookingData = {
  hospital: {
    name: string;
    logoUrl: string | null;
    timezone: string;
    language: string;
    noShowFeeMessage?: string | null;
    companyWebsite?: string | null;
  };
  bookingSettings: {
    slotDurationMinutes?: number;
    maxAdvanceDays?: number;
    minAdvanceHours?: number;
  };
  providers: Provider[];
  enableReferralOnBooking?: boolean;
};

type Slot = { startTime: string; endTime: string };

type Step = "treatment" | "provider" | "date" | "time" | "details" | "referral" | "done";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  code: string | null;
  sortOrder: number;
  providerIds: string[];
};

// ─── Referral Labels ─────────────────────────────────────────────────

const BOOKING_REFERRAL_LABELS: Record<string, {
  title: string; hint: string; social: string; searchEngine: string; llm: string;
  wordOfMouth: string; belegarzt: string; other: string; whichOne: string;
  facebook: string; instagram: string; tiktok: string; google: string; bing: string;
  wordOfMouthPlaceholder: string; otherPlaceholder: string;
}> = {
  de: {
    title: "Wie haben Sie uns gefunden?",
    hint: "Damit helfen Sie uns, unseren Service zu verbessern.",
    social: "Social Media", searchEngine: "Suchmaschine", llm: "KI-Assistent",
    wordOfMouth: "Empfehlung", belegarzt: "Zuweisender Arzt", other: "Andere",
    whichOne: "Welche Plattform?",
    facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
    google: "Google", bing: "Bing",
    wordOfMouthPlaceholder: "Wer hat uns empfohlen?",
    otherPlaceholder: "Bitte beschreiben...",
  },
  en: {
    title: "How did you find us?",
    hint: "This helps us improve our service.",
    social: "Social Media", searchEngine: "Search Engine", llm: "AI Assistant",
    wordOfMouth: "Word of Mouth", belegarzt: "Referring Doctor", other: "Other",
    whichOne: "Which platform?",
    facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
    google: "Google", bing: "Bing",
    wordOfMouthPlaceholder: "Who recommended us?",
    otherPlaceholder: "Please describe...",
  },
  it: {
    title: "Come ci ha trovati?",
    hint: "Questo ci aiuta a migliorare il servizio.",
    social: "Social Media", searchEngine: "Motore di ricerca", llm: "Assistente IA",
    wordOfMouth: "Passaparola", belegarzt: "Medico referente", other: "Altro",
    whichOne: "Quale piattaforma?",
    facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
    google: "Google", bing: "Bing",
    wordOfMouthPlaceholder: "Chi ci ha raccomandato?",
    otherPlaceholder: "Per favore descrivi...",
  },
  es: {
    title: "¿Cómo nos encontró?",
    hint: "Esto nos ayuda a mejorar nuestro servicio.",
    social: "Redes Sociales", searchEngine: "Buscador", llm: "Asistente IA",
    wordOfMouth: "Recomendación", belegarzt: "Médico referente", other: "Otro",
    whichOne: "¿Qué plataforma?",
    facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
    google: "Google", bing: "Bing",
    wordOfMouthPlaceholder: "¿Quién nos recomendó?",
    otherPlaceholder: "Por favor describa...",
  },
  fr: {
    title: "Comment nous avez-vous trouvés?",
    hint: "Cela nous aide à améliorer notre service.",
    social: "Réseaux Sociaux", searchEngine: "Moteur de recherche", llm: "Assistant IA",
    wordOfMouth: "Bouche à oreille", belegarzt: "Médecin référent", other: "Autre",
    whichOne: "Quelle plateforme?",
    facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
    google: "Google", bing: "Bing",
    wordOfMouthPlaceholder: "Qui nous a recommandés?",
    otherPlaceholder: "Veuillez décrire...",
  },
};

function formatProviderName(provider: Provider): string {
  const prefix = provider.role === 'doctor' ? 'Dr. ' : '';
  return `${prefix}${provider.firstName} ${provider.lastName}`;
}

// ─── Component ───────────────────────────────────────────────────────

export default function BookAppointment() {
  const { token } = useParams<{ token: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isEmbed = searchParams.get("embed") === "true";
  const preselectedProviderId = searchParams.get("provider");
  const serviceCode = searchParams.get("service");
  const prefillFirstName = searchParams.get("firstName");
  const prefillSurname = searchParams.get("surname");
  const prefillEmail = searchParams.get("email");
  const prefillPhone = searchParams.get("phone");
  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");
  const utmCampaign = searchParams.get("utm_campaign");
  const utmTerm = searchParams.get("utm_term");
  const utmContent = searchParams.get("utm_content");
  const refParam = searchParams.get("ref");
  // Ad platform click IDs
  const gclid = searchParams.get("gclid");
  const gbraid = searchParams.get("gbraid");
  const wbraid = searchParams.get("wbraid");
  const fbclid = searchParams.get("fbclid");
  const ttclid = searchParams.get("ttclid");
  const msclkid = searchParams.get("msclkid");
  const igshid = searchParams.get("igshid");
  const li_fat_id = searchParams.get("li_fat_id");
  const twclid = searchParams.get("twclid");

  const autoReferral = useMemo(() => resolveReferralFromParams({
    utmSource, utmMedium, utmCampaign, utmTerm, utmContent, ref: refParam,
    gclid, gbraid, wbraid, fbclid, ttclid, msclkid, igshid, li_fat_id, twclid,
  }), [utmSource, utmMedium, utmCampaign, utmTerm, utmContent, refParam, gclid, gbraid, wbraid, fbclid, ttclid, msclkid, igshid, li_fat_id, twclid]);

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
  const [firstName, setFirstName] = useState(prefillFirstName || "");
  const [surname, setSurname] = useState(prefillSurname || "");
  const [email, setEmail] = useState(prefillEmail || "");
  const [phone, setPhone] = useState(prefillPhone || "");
  const [notes, setNotes] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [noShowFeeAcknowledged, setNoShowFeeAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotTaken, setSlotTaken] = useState(false);
  const [referralSource, setReferralSource] = useState("");
  const [referralDetail, setReferralDetail] = useState("");

  // Service-based booking state
  const [serviceInfo, setServiceInfo] = useState<{ id: string; name: string; description: string | null; durationMinutes: number | null } | null>(null);
  const [bestProviderLoading, setBestProviderLoading] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [selectedTreatment, setSelectedTreatment] = useState<Service | null>(null);
  const [treatmentSearch, setTreatmentSearch] = useState('');

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
        // Auto-skip provider selection if deep-linked
        const preselected = preselectedProviderId
          ? d.providers.find(p => p.id === preselectedProviderId)
          : null;
        if (preselected) {
          setSelectedProvider(preselected);
          setStep("date");
          setAvailableDatesLoading(true);
          setSeekingAvailableMonth(true);
        }
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/booking/${token}/services`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        const list: Service[] = body.services ?? [];
        setServices(list);
        if (serviceCode) {
          const match = list.find(s => s.code === serviceCode);
          if (match) {
            setSelectedTreatment(match);
            return;
          }
        }
        if (list.length > 0) {
          setStep('treatment');
        }
      })
      .catch(() => { /* non-fatal */ });
  }, [token, serviceCode]);

  // ─── Auto-select best provider (service-based or default) ───
  useEffect(() => {
    if (!token || !data) return;
    if (preselectedProviderId) return;
    if (selectedProvider) return;

    const autoSelect = (provider: Provider) => {
      setSelectedProvider(provider);
      setStep("date");
      setAvailableDatesLoading(true);
      setSeekingAvailableMonth(true);
    };

    setBestProviderLoading(true);
    const url = serviceCode
      ? `/api/public/booking/${token}/best-provider?service=${encodeURIComponent(serviceCode)}`
      : `/api/public/booking/${token}/best-provider`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          // API error — fall back to first provider in list
          if (data.providers.length >= 1) autoSelect(data.providers[0]);
          return;
        }
        const result = await res.json();
        if (result.service) {
          setServiceInfo(result.service);
          const serviceName = result.service.name;
          const serviceDesc = result.service.description;
          setNotes(serviceName + (serviceDesc ? ` - ${serviceDesc}` : ''));
        }
        if (result.provider) {
          const provider = data.providers.find(p => p.id === result.provider.id) || result.provider;
          autoSelect(provider);
        } else if (data.providers.length >= 1) {
          // No available slots found — fall back to first provider
          autoSelect(data.providers[0]);
        }
      })
      .catch(() => {
        // Network failure — fall back to first provider
        if (data.providers.length >= 1) autoSelect(data.providers[0]);
      })
      .finally(() => setBestProviderLoading(false));
  }, [token, data, preselectedProviderId]);

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

  const filteredProviders = useMemo(() => {
    if (!data) return [] as Provider[];
    if (!selectedTreatment) return data.providers;
    const allowed = new Set(selectedTreatment.providerIds);
    if (allowed.size === 0) return data.providers;
    const filtered = data.providers.filter(p => allowed.has(p.id));
    return filtered.length > 0 ? filtered : data.providers;
  }, [data, selectedTreatment]);

  const treatmentFilterHadNoMatches = useMemo(() => {
    if (!data || !selectedTreatment) return false;
    const allowed = new Set(selectedTreatment.providerIds);
    if (allowed.size === 0) return false;
    return data.providers.filter(p => allowed.has(p.id)).length === 0;
  }, [data, selectedTreatment]);

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

  const showReferralStep = data?.enableReferralOnBooking && !autoReferral;

  // ─── Handlers ─────────────────────────────────────────────────

  const handleProviderSelect = useCallback((provider: Provider) => {
    const changed = selectedProvider && selectedProvider.id !== provider.id;
    setSelectedProvider(provider);
    setStep('date');
    if (changed) {
      setSelectedSlot(null);
      setSlotTaken(false);
    }
    setAvailableDatesLoading(true);
    setSeekingAvailableMonth(true);
  }, [selectedProvider]);

  const handleSlotSelect = useCallback((slot: Slot) => {
    setSelectedSlot(slot);
    setStep("details");
    setSubmitError(null);
    setSlotTaken(false);
  }, []);

  const canGoBackToProviders = (filteredProviders?.length ?? 0) > 1;

  const handleBack = useCallback(() => {
    if (step === "date") {
      if (canGoBackToProviders) {
        setStep("provider");
        setSelectedProvider(null);
      }
    } else if (step === "details") {
      setStep("date");
      setSubmitError(null);
      setSlotTaken(false);
    } else if (step === "referral") {
      setStep("details");
      setSubmitError(null);
    }
  }, [step, canGoBackToProviders]);

  const handleSubmit = useCallback(async () => {
    if (!token || !selectedProvider || !selectedDate || !selectedSlot) return;
    if (!firstName.trim() || !surname.trim() || !email.trim() || !phone.trim() || !notes.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    setSlotTaken(false);

    const referral = autoReferral || (referralSource ? {
      source: referralSource,
      sourceDetail: referralDetail || null,
      captureMethod: "manual" as const,
    } : null);

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
          phone: phone.trim(),
          notes: notes.trim(),
          referralSource: referral?.source,
          referralSourceDetail: referral?.sourceDetail,
          captureMethod: referral?.captureMethod,
          utmSource,
          utmMedium,
          utmCampaign,
          utmTerm,
          utmContent,
          refParam,
          gclid,
          gbraid,
          wbraid,
          fbclid,
          ttclid,
          msclkid,
          igshid,
          li_fat_id,
          twclid,
          noShowFeeAcknowledged: noShowFeeAcknowledged || undefined,
          serviceId: serviceInfo?.id || undefined,
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

      // Notify parent iframe (e.g. clinic website) for GA4 tracking
      // Send to both www and non-www variants since they are different origins
      const clinicWebsite = data?.hospital?.companyWebsite;
      if (clinicWebsite && window.parent !== window) {
        try {
          const url = new URL(clinicWebsite);
          const origins = [url.origin];
          if (url.hostname.startsWith('www.')) {
            origins.push(url.origin.replace('://www.', '://'));
          } else {
            origins.push(url.origin.replace('://', '://www.'));
          }
          for (const origin of origins) {
            window.parent.postMessage({ event: 'booking_submitted' }, origin);
          }
        } catch {
          // Cross-origin postMessage may silently fail — that's OK
        }
      }

      setStep("done");
    } catch {
      setSubmitError("Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung.");
    } finally {
      setSubmitting(false);
    }
  }, [token, selectedProvider, selectedDate, selectedSlot, firstName, surname, email, phone, notes, autoReferral, referralSource, referralDetail, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, refParam, gclid, gbraid, wbraid, fbclid, ttclid, msclkid, igshid, li_fat_id, twclid, noShowFeeAcknowledged, data]);

  // ─── Section refs and status helpers ─────────────────────────
  const sectionRefs = useRef<Partial<Record<Step, HTMLDivElement | null>>>({});

  const hasTreatments = services.length > 0;

  const sectionOrder: Step[] = useMemo(() => {
    const list: Step[] = [];
    if (hasTreatments) list.push('treatment');
    list.push('provider', 'date', 'time', 'details');
    if (showReferralStep) list.push('referral');
    list.push('done');
    return list;
  }, [hasTreatments, showReferralStep]);

  const sectionStatus = useCallback((s: Step): 'hidden' | 'active' | 'summary' => {
    const currentIdx = sectionOrder.indexOf(step);
    const thisIdx = sectionOrder.indexOf(s);
    if (thisIdx === -1) return 'hidden';
    if (thisIdx > currentIdx) return 'hidden';
    if (thisIdx === currentIdx) return 'active';
    return 'summary';
  }, [step, sectionOrder]);

  useBookingScrollOnStep<Step>(step, (s) => sectionRefs.current[s] ?? null);

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

  if (loading || bestProviderLoading) {
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
      <div className={cn(
        'grid gap-6',
        isEmbed ? 'grid-cols-1' : 'lg:grid-cols-[320px_1fr]',
      )}>
        {/* Sticky sidebar (desktop) / header (mobile + embed) */}
        {!isEmbed && (
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <ClinicInfoPanel data={data} isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />
          </aside>
        )}
        {isEmbed && (
          <div className="mb-4">
            <ClinicInfoPanel data={data} isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />
          </div>
        )}

        {/* Stacked sections column */}
        <main className="flex flex-col gap-4 max-w-[640px] w-full mx-auto">
          {hasTreatments && (
            <BookingSection
              status={sectionStatus('treatment')}
              isDark={isDark}
              ref={(el) => { sectionRefs.current.treatment = el; }}
              summary={{
                label: 'Behandlung',
                value: selectedTreatment ? selectedTreatment.name : 'Allgemeiner Termin',
                onChange: () => setStep('treatment'),
              }}
            >
              <div>
                <h2 className={cn('text-lg font-semibold mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                  Behandlung wählen
                </h2>
                <p className={cn('text-sm mb-4', isDark ? 'text-white/50' : 'text-gray-500')}>
                  Wählen Sie die gewünschte Behandlung oder fahren Sie mit einem allgemeinen Termin fort.
                </p>
                <Input
                  value={treatmentSearch}
                  onChange={(e) => setTreatmentSearch(e.target.value)}
                  placeholder="Suchen..."
                  className={cn(
                    'mb-3 rounded-xl h-11',
                    isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/30' : '',
                  )}
                />
                <div className="grid gap-2 max-h-80 overflow-y-auto">
                  {services
                    .filter(s => s.name.toLowerCase().includes(treatmentSearch.toLowerCase()))
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedTreatment(s); setStep('provider'); }}
                        data-testid={`treatment-${s.code ?? s.id}`}
                        className={cn(
                          'text-left p-3 rounded-xl border transition-colors',
                          isDark
                            ? 'bg-white/5 border-white/10 hover:bg-white/10'
                            : 'bg-white border-gray-200 hover:bg-gray-50',
                        )}
                      >
                        <p className={cn('font-medium', isDark ? 'text-white' : 'text-gray-900')}>
                          {s.name}
                        </p>
                        {s.description && (
                          <p className={cn('text-xs mt-0.5', isDark ? 'text-white/50' : 'text-gray-500')}>
                            {s.description}
                          </p>
                        )}
                      </button>
                    ))}
                </div>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => { setSelectedTreatment(null); setStep('provider'); }}
                  data-testid="treatment-skip"
                >
                  Überspringen — allgemeiner Termin
                </Button>
              </div>
            </BookingSection>
          )}

          <BookingSection
            status={sectionStatus('provider')}
            isDark={isDark}
            ref={(el) => { sectionRefs.current.provider = el; }}
            summary={selectedProvider ? {
              label: 'Arzt',
              value: formatProviderName(selectedProvider),
              onChange: canGoBackToProviders ? () => setStep('provider') : undefined,
            } : undefined}
          >
            <div>
              <h2 className={cn('text-lg font-semibold mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                Arzt wählen
              </h2>
              <p className={cn('text-sm mb-4', isDark ? 'text-white/50' : 'text-gray-500')}>
                Wählen Sie Ihren behandelnden Arzt
              </p>
              {treatmentFilterHadNoMatches && (
                <div
                  className={cn(
                    'mb-3 p-3 rounded-xl text-xs',
                    isDark
                      ? 'bg-amber-500/10 border border-amber-400/30 text-amber-200'
                      : 'bg-amber-50 border border-amber-200 text-amber-800',
                  )}
                >
                  Für diese Behandlung sind keine spezifischen Ärzte hinterlegt — alle verfügbaren Ärzte werden angezeigt.
                </div>
              )}
              <div className="grid gap-3">
                {filteredProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider)}
                    data-testid={`provider-${provider.id}`}
                    className={cn(
                      'group flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-200',
                      isDark
                        ? 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20'
                        : 'bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md',
                    )}
                  >
                    <ProviderAvatar provider={provider} isDark={isDark} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium truncate', isDark ? 'text-white' : 'text-gray-900')}>
                        {formatProviderName(provider)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </BookingSection>
        </main>
      </div>
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
            : "bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-600"
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
    document.body.style.background = isDark ? "#0c0c14" : "#f0f1f3";
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
        : "bg-[#f0f1f3]",
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
      isDark ? "bg-white/10 text-white/60" : "bg-gray-200 text-gray-600"
    )}>
      {initials}
    </div>
  );
}

function StepIndicator({ current, isDark, hasMultipleProviders, showReferralStep }: { current: Step; isDark: boolean; hasMultipleProviders: boolean; showReferralStep: boolean }) {
  const baseSteps = hasMultipleProviders
    ? [
        { key: "provider", label: "Arzt" },
        { key: "date", label: "Termin" },
        { key: "details", label: "Daten" },
      ]
    : [
        { key: "date", label: "Termin" },
        { key: "details", label: "Daten" },
      ];
  const steps = showReferralStep
    ? [...baseSteps, { key: "referral", label: "Referenz" }]
    : baseSteps;

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
              : (isDark ? "text-white/20" : "text-gray-400")
          )}>
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300",
              i < currentIdx
                ? (isDark ? "bg-blue-500 text-white" : "bg-gray-900 text-white")
                : i === currentIdx
                  ? (isDark ? "bg-white/15 text-white" : "bg-gray-200 text-gray-700")
                  : (isDark ? "bg-white/5 text-white/20" : "bg-gray-200 text-gray-400")
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
                : (isDark ? "bg-white/10" : "bg-gray-300")
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
        isDark ? "text-white/40" : "text-gray-500"
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
