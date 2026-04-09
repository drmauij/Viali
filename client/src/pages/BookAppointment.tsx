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
    street?: string | null;
    postalCode?: string | null;
    city?: string | null;
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
  const [slotRevalidated, setSlotRevalidated] = useState(false);

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

  const [services, setServices] = useState<Service[]>([]);
  const [selectedTreatment, setSelectedTreatment] = useState<Service | null>(null);
  const [treatmentSearch, setTreatmentSearch] = useState('');
  const [suggestedProviderId, setSuggestedProviderId] = useState<string | null>(null);

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

  // ─── Service info prefill for ?service= deep links ───────────
  // We never auto-select a provider here — the patient always sees the
  // provider list with the "Nächster Termin" badge on the suggestion
  // (see per-treatment effect below). This effect only fetches the
  // service metadata so the notes field can be prefilled.
  useEffect(() => {
    if (!token || !data) return;
    if (!serviceCode) return;
    fetch(`/api/public/booking/${token}/best-provider?service=${encodeURIComponent(serviceCode)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const result = await res.json();
        if (result.service) {
          setServiceInfo(result.service);
          const serviceName = result.service.name;
          const serviceDesc = result.service.description;
          setNotes(serviceName + (serviceDesc ? ` - ${serviceDesc}` : ''));
        }
      })
      .catch(() => { /* non-fatal */ });
  }, [token, data, serviceCode]);

  // ─── Suggested provider for the selected treatment ───────────
  // Option 2 behavior: don't autoselect — just mark the provider with
  // the next free slot so the user can see the recommendation while
  // keeping full manual choice.
  useEffect(() => {
    if (!token || !data) return;
    if (!selectedTreatment) { setSuggestedProviderId(null); return; }
    if (preselectedProviderId) return;
    const code = selectedTreatment.code;
    const url = code
      ? `/api/public/booking/${token}/best-provider?service=${encodeURIComponent(code)}`
      : `/api/public/booking/${token}/best-provider`;
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) return;
        const result = await res.json();
        if (cancelled) return;
        if (result.provider?.id) setSuggestedProviderId(result.provider.id);
        else setSuggestedProviderId(null);
      })
      .catch(() => { if (!cancelled) setSuggestedProviderId(null); });
    return () => { cancelled = true; };
  }, [token, data, selectedTreatment, preselectedProviderId]);

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
    let list: Provider[];
    if (!selectedTreatment) {
      list = data.providers;
    } else {
      const allowed = new Set(selectedTreatment.providerIds);
      if (allowed.size === 0) {
        list = data.providers;
      } else {
        const filtered = data.providers.filter(p => allowed.has(p.id));
        list = filtered.length > 0 ? filtered : data.providers;
      }
    }
    if (suggestedProviderId && list.some(p => p.id === suggestedProviderId)) {
      return [
        ...list.filter(p => p.id === suggestedProviderId),
        ...list.filter(p => p.id !== suggestedProviderId),
      ];
    }
    return list;
  }, [data, selectedTreatment, suggestedProviderId]);

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
    const priorSlot = selectedSlot;
    fetch(`/api/public/booking/${token}/providers/${selectedProvider.id}/slots?date=${dateStr}`)
      .then(async (res) => {
        if (!res.ok) { setSlots([]); return; }
        const d = await res.json();
        const newSlots: Slot[] = d.slots || [];
        setSlots(newSlots);
        if (priorSlot && !newSlots.some(s => s.startTime === priorSlot.startTime)) {
          setSelectedSlot(null);
          setSlotRevalidated(true);
          setTimeout(() => setSlotRevalidated(false), 4000);
        }
      })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, selectedDate, token]);

  const showReferralStep = data?.enableReferralOnBooking && !autoReferral;

  // ─── Handlers ─────────────────────────────────────────────────

  const handleProviderSelect = useCallback((provider: Provider) => {
    const changed = !selectedProvider || selectedProvider.id !== provider.id;
    setSelectedProvider(provider);
    setStep('date');
    if (changed) {
      setSelectedSlot(null);
      setSlotTaken(false);
      // Only force a loading state when the provider actually changed —
      // otherwise the fetch effect won't re-fire (same dep) and the
      // calendar would stay stuck in "loading" with every day disabled.
      setAvailableDatesLoading(true);
      setSeekingAvailableMonth(true);
    }
  }, [selectedProvider]);

  const handleSlotSelect = useCallback((slot: Slot) => {
    setSelectedSlot(slot);
    setStep("details");
    setSubmitError(null);
    setSlotTaken(false);
  }, []);

  const canGoBackToProviders = (filteredProviders?.length ?? 0) > 1;

  const handleSubmit = useCallback(async () => {
    if (!token || !selectedProvider || !selectedDate || !selectedSlot) return;
    if (!firstName.trim() || !surname.trim() || !email.trim() || !phone.trim() || (!selectedTreatment && !notes.trim())) return;

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

  const handleDetailsContinue = () => {
    if (!firstName.trim() || !surname.trim() || !email.trim() || !phone.trim() || (!selectedTreatment && !notes.trim())) return;
    if (showReferralStep) {
      setStep('referral');
    } else {
      void handleSubmit();
    }
  };

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
      {!isEmbed && <ThemeToggleFab isDark={isDark} onToggle={() => setIsDark(!isDark)} />}
      <div className={cn(
        'grid gap-6 items-start',
        isEmbed ? 'grid-cols-1' : 'lg:grid-cols-[280px_1fr]',
      )}>
        {/* Sticky sidebar on large screens; stacked header on small/medium + embed */}
        {!isEmbed ? (
          <aside className="w-full max-w-[640px] mx-auto lg:max-w-none lg:mx-0 lg:sticky lg:top-4 lg:self-start">
            <ClinicInfoPanel data={data} isDark={isDark} />
          </aside>
        ) : (
          <div className="mb-4 w-full max-w-[640px] mx-auto">
            <ClinicInfoPanel data={data} isDark={isDark} />
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
                label: 'Beratung zu',
                value: selectedTreatment ? selectedTreatment.name : 'Allgemeines Beratungsgespräch',
                onChange: () => setStep('treatment'),
              }}
            >
              <div>
                <h2 className={cn('text-lg font-semibold mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                  Wofür möchten Sie sich beraten lassen?
                </h2>
                <p className={cn('text-sm mb-4', isDark ? 'text-white/50' : 'text-gray-500')}>
                  Dies ist ein unverbindliches Beratungsgespräch, nicht die Behandlung selbst. Wählen Sie das gewünschte Thema oder fahren Sie mit einem allgemeinen Beratungstermin fort.
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
                  Überspringen — allgemeines Beratungsgespräch
                </Button>
              </div>
            </BookingSection>
          )}

          <BookingSection
            status={sectionStatus('provider')}
            isDark={isDark}
            ref={(el) => { sectionRefs.current.provider = el; }}
            summary={selectedProvider ? {
              icon: <ProviderAvatar provider={selectedProvider} isDark={isDark} size="sm" />,
              label: 'Arzt',
              value: selectedProvider.bookingLocation
                ? `${formatProviderName(selectedProvider)} · ${selectedProvider.bookingLocation}`
                : formatProviderName(selectedProvider),
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn('font-medium truncate', isDark ? 'text-white' : 'text-gray-900')}>
                          {formatProviderName(provider)}
                        </p>
                        {provider.id === suggestedProviderId && (
                          <span
                            data-testid={`provider-${provider.id}-suggested`}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0',
                              isDark
                                ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                            )}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            Nächster Termin
                          </span>
                        )}
                      </div>
                      {provider.bookingLocation && (
                        <p className={cn('flex items-center gap-1 text-xs mt-0.5 truncate', isDark ? 'text-white/50' : 'text-gray-500')}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span className="truncate">{provider.bookingLocation}</span>
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </BookingSection>

          <BookingSection
            status={sectionStatus('date')}
            isDark={isDark}
            ref={(el) => { sectionRefs.current.date = el; }}
            summary={selectedDate ? {
              label: 'Datum',
              value: formattedSelectedDate,
              onChange: () => setStep('date'),
            } : undefined}
          >
            <div>
              <h2 className={cn('text-lg font-semibold mb-4', isDark ? 'text-white' : 'text-gray-900')}>
                Datum wählen
              </h2>
              <div className={cn(
                'rounded-2xl p-1 inline-block',
                isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200 shadow-sm',
              )}>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (!d) return; setSelectedDate(d); setStep('time'); }}
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
                    // While the month's available-dates are still loading, block
                    // all clicks so the patient can't race-select a day that
                    // turns out to have no slots.
                    if (availableDatesLoading) return true;
                    return !availableDates.has(formatDateISO(date));
                  }}
                  className={cn(
                    isDark
                      ? "[&_.rdp-day]:text-white/25 [&_.rdp-head_cell]:text-white/50 [&_.rdp-caption_month]:text-white [&_.rdp-caption_year]:text-white/50 [&_.rdp-day_disabled]:text-white/15 [&_.rdp-day_outside]:text-white/10 [&_.day-has-slots]:text-white [&_.day-has-slots]:font-semibold"
                      : "[&_.rdp-day]:text-gray-300 [&_.rdp-day_disabled]:text-gray-200 [&_.rdp-day_outside]:text-gray-200 [&_.day-has-slots]:text-gray-900 [&_.day-has-slots]:font-semibold [&_.day-has-slots]:hover:bg-gray-100 [&_.rdp-day_selected.day-has-slots]:text-white"
                  )}
                />
              </div>
            </div>
          </BookingSection>

          <BookingSection
            status={sectionStatus('time')}
            isDark={isDark}
            ref={(el) => { sectionRefs.current.time = el; }}
            summary={selectedSlot ? {
              label: 'Uhrzeit',
              value: `${selectedSlot.startTime} Uhr`,
              onChange: () => setStep('time'),
            } : undefined}
          >
            <div>
              <h2 className={cn('text-lg font-semibold mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                Uhrzeit wählen
              </h2>
              <p className={cn('text-xs uppercase tracking-wider mb-3', isDark ? 'text-white/40' : 'text-gray-500')}>
                {formattedSelectedDate}
              </p>
              {slotRevalidated && (
                <div className="mb-3 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  Der zuvor gewählte Termin ist mit dem neuen Arzt nicht verfügbar — bitte wählen Sie erneut.
                </div>
              )}
              {slotsLoading ? (
                <div className="flex justify-center py-8">
                  <div className={cn(
                    'h-6 w-6 rounded-full border-2 animate-spin',
                    isDark ? 'border-white/20 border-t-white' : 'border-gray-200 border-t-gray-600',
                  )} />
                </div>
              ) : slots.length === 0 ? (
                <div className={cn('text-center py-8', isDark ? 'text-white/40' : 'text-gray-500')}>
                  <p className="text-sm">Keine freien Termine an diesem Tag.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.startTime}
                      onClick={() => handleSlotSelect(slot)}
                      data-testid={`slot-${slot.startTime}`}
                      className={cn(
                        'py-2.5 px-3 rounded-xl text-sm font-medium transition-all',
                        isDark
                          ? 'bg-white/5 border border-white/10 text-white/80 hover:bg-blue-500/20'
                          : 'bg-white border border-gray-200 text-gray-800 hover:bg-blue-50 hover:border-blue-300',
                      )}
                    >
                      {slot.startTime}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </BookingSection>

          <BookingSection
            status={sectionStatus('details')}
            isDark={isDark}
            ref={(el) => { sectionRefs.current.details = el; }}
            summary={(firstName || surname || email) ? {
              label: 'Ihre Daten',
              value: `${firstName} ${surname}${email ? ' · ' + email : ''}`.trim(),
              onChange: () => setStep('details'),
            } : undefined}
          >
            <div>
              <h2 className={cn('text-lg font-semibold mb-4', isDark ? 'text-white' : 'text-gray-900')}>
                Ihre Daten
              </h2>

              {slotTaken && (
                <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <p className="font-medium mb-1">Termin nicht mehr verfügbar</p>
                  <p className="text-xs">Dieser Zeitpunkt wurde soeben gebucht. Bitte wählen Sie einen anderen.</p>
                  <Button
                    onClick={() => { setSlotTaken(false); setStep("time"); }}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    Anderes Datum wählen
                  </Button>
                </div>
              )}

              {submitError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  {submitError}
                </div>
              )}

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
                    Telefon *
                  </Label>
                  <PhoneInputWithCountry
                    id="phone"
                    value={phone}
                    onChange={(val) => setPhone(val)}
                    placeholder="79 123 45 67"
                    className={cn(
                      "[&_input]:rounded-xl [&_input]:h-11 [&_button]:rounded-xl [&_button]:h-11",
                      isDark
                        ? "[&_input]:bg-white/5 [&_input]:border-white/15 [&_input]:text-white [&_input]:placeholder:text-white/30 [&_button]:bg-white/5 [&_button]:border-white/15 [&_button]:text-white"
                        : "[&_input]:bg-white [&_input]:border-gray-200 [&_input]:text-gray-900 [&_input]:placeholder:text-gray-400 [&_button]:bg-white [&_button]:border-gray-200"
                    )}
                  />
                </div>

                <div>
                  <Label htmlFor="notes" className={cn(
                    "text-xs font-medium mb-1.5 block",
                    isDark ? "text-white/60" : "text-gray-500"
                  )}>
                    {selectedTreatment ? 'Notizen (optional)' : 'Grund der Terminanfrage *'}
                  </Label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={selectedTreatment
                      ? 'Zusätzliche Informationen...'
                      : 'Beschreiben Sie kurz den Grund Ihres Termins...'}
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

                {data?.hospital?.noShowFeeMessage && (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noShowFeeAcknowledged}
                      onChange={(e) => setNoShowFeeAcknowledged(e.target.checked)}
                      className={cn(
                        "mt-0.5 h-4 w-4 rounded border shrink-0 accent-gray-900",
                        isDark ? "border-white/20" : "border-gray-300"
                      )}
                    />
                    <span className={cn(
                      "text-xs leading-relaxed",
                      isDark ? "text-white/50" : "text-gray-500"
                    )}>
                      {data.hospital.noShowFeeMessage} *
                    </span>
                  </label>
                )}

                <Button
                  onClick={handleDetailsContinue}
                  disabled={submitting || !firstName.trim() || !surname.trim() || !email.trim() || !phone.trim() || (!selectedTreatment && !notes.trim()) || !privacyAccepted || (!!data?.hospital?.noShowFeeMessage && !noShowFeeAcknowledged)}
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
                  ) : showReferralStep ? "Weiter" : "Termin buchen"}
                </Button>
              </div>
            </div>
          </BookingSection>

          {showReferralStep && (
            <BookingSection
              status={sectionStatus('referral')}
              isDark={isDark}
              ref={(el) => { sectionRefs.current.referral = el; }}
              summary={referralSource ? {
                label: 'Quelle',
                value: referralSource,
                onChange: () => setStep('referral'),
              } : undefined}
            >
              <div>
                <ReferralSourcePicker
                  value={referralSource}
                  detail={referralDetail}
                  onChange={(source, detail) => { setReferralSource(source); setReferralDetail(detail); }}
                  labels={BOOKING_REFERRAL_LABELS[data?.hospital?.language || "de"]}
                />
                <Button
                  className="mt-4 w-full h-12 rounded-xl text-sm font-semibold"
                  onClick={() => void handleSubmit()}
                  disabled={!referralSource || submitting}
                >
                  {submitting ? 'Wird gebucht...' : 'Termin buchen'}
                </Button>
                {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
              </div>
            </BookingSection>
          )}

          <BookingSection
            status={sectionStatus('done')}
            isDark={isDark}
            ref={(el) => { sectionRefs.current.done = el; }}
          >
            {selectedProvider && selectedDate && selectedSlot && (
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
                  isDark ? "bg-white/5 border border-white/10" : "bg-white border border-gray-200"
                )}>
                  <SummaryRow label="Arzt" value={formatProviderName(selectedProvider)} isDark={isDark} />
                  <SummaryRow label="Datum" value={formattedSelectedDate} isDark={isDark} />
                  <SummaryRow label="Uhrzeit" value={`${selectedSlot.startTime} Uhr`} isDark={isDark} />
                  <SummaryRow label="Klinik" value={data.hospital.name} isDark={isDark} />
                  {(data.hospital.street || data.hospital.city) && (
                    <SummaryRow
                      label="Adresse"
                      value={[data.hospital.street, [data.hospital.postalCode, data.hospital.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                      isDark={isDark}
                    />
                  )}
                  {selectedProvider?.bookingLocation && (
                    <SummaryRow label="Standort" value={selectedProvider.bookingLocation} isDark={isDark} />
                  )}
                </div>

                <p className={cn(
                  "text-xs",
                  isDark ? "text-white/30" : "text-gray-500"
                )}>
                  Zum Absagen nutzen Sie den Link in Ihrer Bestätigungs-E-Mail.
                </p>
              </div>
            )}
          </BookingSection>
        </main>
      </div>
    </PageShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function ClinicInfoPanel({ data, isDark }: { data: BookingData; isDark: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl p-4 lg:p-0 lg:bg-transparent lg:border-0 lg:shadow-none border",
      isDark
        ? "bg-white/[0.03] border-white/10"
        : "bg-white/60 border-gray-200/70 shadow-sm",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-2 min-w-0">
          {data.hospital.logoUrl && (
            <img
              src={data.hospital.logoUrl}
              alt={data.hospital.name}
              className="h-8 w-auto object-contain"
            />
          )}
          <h1 className={cn(
            "text-sm font-semibold truncate",
            isDark ? "text-white" : "text-gray-900"
          )}>
            {data.hospital.name}
          </h1>
          {data.hospital.street && (
            <div className={cn(
              "flex items-start gap-1.5 text-xs",
              isDark ? "text-white/50" : "text-gray-500"
            )}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <div className="leading-tight">
                <div>{data.hospital.street}</div>
                {data.hospital.postalCode && (
                  <div>{data.hospital.postalCode}</div>
                )}
              </div>
            </div>
          )}
        </div>
        {data.hospital.city && (
          <div className={cn(
            "text-right shrink-0",
            isDark ? "text-white" : "text-gray-900"
          )}>
            <div className={cn(
              "text-[9px] uppercase tracking-wider font-semibold",
              isDark ? "text-white/40" : "text-gray-400"
            )}>
              Standort
            </div>
            <div className="text-lg font-bold leading-tight">{data.hospital.city}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeToggleFab({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Zu Hell-Modus wechseln' : 'Zu Dunkel-Modus wechseln'}
      className={cn(
        "fixed top-4 right-4 z-50 inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-300",
        isDark
          ? "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
          : "bg-white/90 text-gray-600 hover:bg-white hover:text-gray-900 shadow-sm border border-gray-200"
      )}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
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
