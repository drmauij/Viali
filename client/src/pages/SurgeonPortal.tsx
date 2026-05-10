import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  SurgeryRequestForm,
  ProgressHeader,
  type AvailableSurgeon,
  type SurgeryRequestFormValues,
  type ProgressState,
  surgeonInitials,
} from "@/components/surgery/SurgeryRequestForm";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Pencil } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import {
  Loader2,
  Mail,
  Globe,
  ShieldCheck,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  XCircle,
  RefreshCw,
  PauseCircle,
  Clock,
  CheckCircle2,
  LogOut,
  Download,
} from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  formatDistanceToNow,
} from "date-fns";
import { de, enUS } from "date-fns/locale";
import { generateSurgeonSummaryPDF } from "@/lib/surgeonSummaryPdf";
import {
  loadDraft,
  saveDraft,
  clearDraft,
  type SurgeonPortalDraft,
} from "@/lib/surgeon-portal-draft";

// ========== TRANSLATIONS ==========

const translations: Record<string, Record<string, string>> = {
  de: {
    // Gate
    title: "Chirurgen-Portal",
    subtitle: "Geben Sie Ihre E-Mail-Adresse ein, um neue Anfragen einzureichen und Ihre OPs zu verwalten.",
    emailLabel: "E-Mail-Adresse",
    emailPlaceholder: "ihre.email@beispiel.ch",
    sendCode: "Zugangslink senden",
    codeSent: "Überprüfen Sie Ihre E-Mail und klicken Sie auf den Link, oder geben Sie den Code unten ein.",
    enterCode: "Code eingeben",
    verifying: "Wird verifiziert...",
    sending: "Wird gesendet...",
    resend: "Erneut senden",
    resendIn: "Erneut senden in",
    seconds: "s",
    invalidCode: "Ungültiger Code",
    error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    invalidEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    // Calendar
    noSurgeries: "Keine OPs in diesem Monat.",
    // Surgery details
    patient: "Patient",
    surgery: "Eingriff",
    room: "Saal",
    time: "Zeit",
    status: "Status",
    slotReservation: "Slot-Reservierung",
    planned: "Geplant",
    inProgress: "In Bearbeitung",
    completed: "Abgeschlossen",
    suspended: "Sistiert",
    // Actions
    requestCancellation: "Absage anfragen",
    requestReschedule: "Verschiebung anfragen",
    requestSuspension: "Sistierung anfragen",
    reason: "Begründung",
    reasonPlaceholder: "Bitte geben Sie eine Begründung an...",
    preferredDate: "Gewünschtes neues Datum",
    preferredTimeFrom: "Von",
    preferredTimeTo: "Bis",
    submit: "Anfrage senden",
    cancel: "Abbrechen",
    requestSent: "Anfrage gesendet",
    pendingRequest: "Anfrage ausstehend",
    cancellationPending: "Absage angefragt",
    reschedulePending: "Verschiebung angefragt",
    suspensionPending: "Sistierung angefragt",
    downloadSummary: "OP-Zusammenfassung herunterladen",
    downloadingSummary: "Wird heruntergeladen...",
    downloadFailed: "Fehler beim Herunterladen. Bitte versuchen Sie es erneut.",
    newRequest: "Neue OP-Anfrage stellen",
    logout: "Abmelden",
    // Surgery request form (in-portal)
    operatingSurgeon: "Operierender Chirurg",
    selectSurgeon: "Chirurg auswählen",
    requestSubmitted: "Anfrage erfolgreich übermittelt",
    requestSubmissionFailed: "Übermittlung fehlgeschlagen",
    surgeonDetails: "Chirurg",
    firstName: "Vorname",
    lastName: "Nachname",
    email: "E-Mail",
    phone: "Telefon",
    reservationOnly: "Nur Slot-Reservierung",
    reservationOnlyDesc: "OP-Slot ohne Patientendetails reservieren — Patientendaten in einer separaten Anfrage nachreichen.",
    surgeryName: "Eingriff",
    wishedDate: "Gewünschtes Datum",
    durationMinutes: "Dauer (Minuten)",
    coverageType: "Kostenträger",
    coverageTypePlaceholder: "Bitte auswählen",
    coverageSelbstzahler: "Selbstzahler",
    coverageKrankenkasse: "Krankenkasse",
    stayType: "Aufenthaltsart",
    stayTypePlaceholder: "Bitte auswählen",
    stayAmbulant: "Ambulant",
    stayOvernight: "Stationär",
    diagnosis: "Diagnose",
    withAnesthesia: "Mit Anästhesie",
    anesthesiaNotes: "Anästhesie-Hinweise",
    surgeryNotes: "Bemerkungen zum Eingriff",
    patientInformation: "Patient",
    birthday: "Geburtsdatum",
    optional: "optional",
    street: "Straße",
    postalCode: "PLZ",
    city: "Ort",
    backToCalendar: "Zurück zur Übersicht",
    calendarTab: "Kalender",
    requestConfirmedTitle: "Anfrage gesendet",
    requestConfirmedDesc: "Ihre Anfrage wurde an die Klinik übermittelt. Sie erhalten eine Antwort, sobald der Termin geprüft wurde.",
    submitAnother: "Weitere Anfrage stellen",
    goToCalendar: "Zum Kalender",
    // Accordion sections
    "accordion.surgeon": "Operierender Chirurg",
    "accordion.surgery": "Eingriff & Termin",
    "accordion.patient": "Patient",
    "accordion.documents": "Dokumente",
    "accordion.continue": "Weiter",
    // CHOP search
    "chopSearch.placeholder": "Eingriff suchen…",
    "chopSearch.empty": "Keine Treffer.",
    "chopSearch.typeMore": "Mindestens 2 Zeichen eingeben.",
    "chopSearch.useCustom": "Oder freien Text eingeben",
    // Surgery side
    "surgerySide.label": "Seite",
    "surgerySide.left": "Links",
    "surgerySide.right": "Rechts",
    "surgerySide.both": "Beidseits",
    // Antibiotic prophylaxis
    "antibioticProphylaxis.label": "Antibiotikaprophylaxe",
    "antibioticProphylaxis.description": "Antibiotikaprophylaxe vor dem Eingriff erforderlich.",
    // Time range
    preferredTimeRange: "Bevorzugte Zeit",
    // Documents
    "documents.dropHint": "Dateien hierhin ziehen oder Datei auswählen",
    "documents.selectFiles": "Dateien auswählen",
    "documents.uploading": "Wird hochgeladen",
    "documents.uploadDisabled": "Datei-Upload ist in dieser Ansicht nicht verfügbar.",
    // Phase 1 UX additions
    "surgeonCard.submittingAs": "absendend als",
    "chopSearch.useFreeText": "Freien Text eingeben",
    "chopSearch.backToSearch": "Zurück zur Suche",
    "validation.required": "Pflichtfeld",
    "missingFields": "Noch erforderlich",
    "subgroup.schedule": "Termin",
    "subgroup.procedure": "Eingriff",
    "subgroup.coverage": "Abrechnung",
    // Phase 2 UX additions
    "progress.stepOfTotal": "Schritt {step} von {total}",
    "draft.banner.title": "Vorherigen Entwurf fortsetzen",
    "draft.banner.savedAgo": "gespeichert vor {when}",
    "draft.banner.restore": "Wiederherstellen",
    "draft.banner.discard": "Verwerfen",
    // Account menu + My Data
    "accountMenu.editProfile": "Profil bearbeiten",
    "myData.title": "Meine Daten",
    "myData.emailHint": "Wird zur Anmeldung verwendet — kann nicht geändert werden",
    "myData.cancel": "Abbrechen",
    "myData.save": "Speichern",
    "myData.saveSuccess": "Profil aktualisiert",
    "myData.saveFailed": "Aktualisierung fehlgeschlagen",
  },
  en: {
    // Gate
    title: "Surgeon Portal",
    subtitle: "Enter your email address to submit new surgery requests and manage your scheduled surgeries.",
    emailLabel: "Email address",
    emailPlaceholder: "your.email@example.com",
    sendCode: "Send access link",
    codeSent: "Check your email and click the link, or enter the code below.",
    enterCode: "Enter code",
    verifying: "Verifying...",
    sending: "Sending...",
    resend: "Resend",
    resendIn: "Resend in",
    seconds: "s",
    invalidCode: "Invalid code",
    error: "An error occurred. Please try again.",
    invalidEmail: "Please enter a valid email address.",
    // Calendar
    noSurgeries: "No surgeries this month.",
    // Surgery details
    patient: "Patient",
    surgery: "Surgery",
    room: "Room",
    time: "Time",
    status: "Status",
    slotReservation: "Slot Reservation",
    planned: "Planned",
    inProgress: "In Progress",
    completed: "Completed",
    suspended: "Suspended",
    // Actions
    requestCancellation: "Request Cancellation",
    requestReschedule: "Request Reschedule",
    requestSuspension: "Request Suspension",
    reason: "Reason",
    reasonPlaceholder: "Please provide a reason...",
    preferredDate: "Preferred new date",
    preferredTimeFrom: "From",
    preferredTimeTo: "To",
    submit: "Submit Request",
    cancel: "Cancel",
    requestSent: "Request sent",
    pendingRequest: "Request pending",
    cancellationPending: "Cancellation requested",
    reschedulePending: "Reschedule requested",
    suspensionPending: "Suspension requested",
    downloadSummary: "Download Surgery Summary",
    downloadingSummary: "Downloading...",
    downloadFailed: "Download failed. Please try again.",
    newRequest: "Submit new surgery request",
    logout: "Logout",
    // Surgery request form (in-portal)
    operatingSurgeon: "Operating surgeon",
    selectSurgeon: "Select surgeon",
    requestSubmitted: "Request submitted successfully",
    requestSubmissionFailed: "Submission failed",
    surgeonDetails: "Surgeon",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    phone: "Phone",
    reservationOnly: "Reserve time slot only",
    reservationOnlyDesc: "Book OR time without patient details — submit patient information in a separate follow-up request.",
    surgeryName: "Surgery",
    wishedDate: "Preferred date",
    durationMinutes: "Duration (minutes)",
    coverageType: "Coverage type",
    coverageTypePlaceholder: "Please select",
    coverageSelbstzahler: "Self-pay",
    coverageKrankenkasse: "Insurance",
    stayType: "Stay type",
    stayTypePlaceholder: "Please select",
    stayAmbulant: "Outpatient",
    stayOvernight: "Inpatient",
    diagnosis: "Diagnosis",
    withAnesthesia: "With anesthesia",
    anesthesiaNotes: "Anesthesia notes",
    surgeryNotes: "Surgery notes",
    patientInformation: "Patient",
    birthday: "Date of birth",
    optional: "optional",
    street: "Street",
    postalCode: "Postal code",
    city: "City",
    backToCalendar: "Back to overview",
    calendarTab: "Calendar",
    requestConfirmedTitle: "Request submitted",
    requestConfirmedDesc: "Your request has been sent to the clinic. You'll get a reply once the slot has been reviewed.",
    submitAnother: "Submit another request",
    goToCalendar: "Go to calendar",
    // Accordion sections
    "accordion.surgeon": "Operating surgeon",
    "accordion.surgery": "Surgery & schedule",
    "accordion.patient": "Patient",
    "accordion.documents": "Documents",
    "accordion.continue": "Continue",
    // CHOP search
    "chopSearch.placeholder": "Search procedure…",
    "chopSearch.empty": "No matches.",
    "chopSearch.typeMore": "Type at least 2 characters.",
    "chopSearch.useCustom": "Or enter free-text",
    // Surgery side
    "surgerySide.label": "Side",
    "surgerySide.left": "Left",
    "surgerySide.right": "Right",
    "surgerySide.both": "Both",
    // Antibiotic prophylaxis
    "antibioticProphylaxis.label": "Antibiotic prophylaxis",
    "antibioticProphylaxis.description": "Pre-operative antibiotic prophylaxis required.",
    // Time range
    preferredTimeRange: "Preferred time",
    // Documents
    "documents.dropHint": "Drop files here or select a file",
    "documents.selectFiles": "Select files",
    "documents.uploading": "Uploading",
    "documents.uploadDisabled": "File upload is not available in this view.",
    // Phase 1 UX additions
    "surgeonCard.submittingAs": "submitting as",
    "chopSearch.useFreeText": "Use custom name",
    "chopSearch.backToSearch": "Back to search",
    "validation.required": "Required",
    "missingFields": "Still required",
    "subgroup.schedule": "Schedule",
    "subgroup.procedure": "Procedure",
    "subgroup.coverage": "Coverage",
    // Phase 2 UX additions
    "progress.stepOfTotal": "Step {step} of {total}",
    "draft.banner.title": "Continuing your previous draft",
    "draft.banner.savedAgo": "saved {when} ago",
    "draft.banner.restore": "Restore",
    "draft.banner.discard": "Discard",
    // Account menu + My Data
    "accountMenu.editProfile": "Edit profile",
    "myData.title": "My Data",
    "myData.emailHint": "Used to log in — cannot be changed",
    "myData.cancel": "Cancel",
    "myData.save": "Save changes",
    "myData.saveSuccess": "Profile updated",
    "myData.saveFailed": "Update failed",
  },
};

const LANGUAGE_LABELS: Record<string, string> = { de: "Deutsch", en: "English" };

// ========== SURGEON PORTAL GATE ==========

interface SurgeonPortalGateProps {
  token: string;
  children: ReactNode;
}

function SurgeonPortalGate({ token, children }: SurgeonPortalGateProps) {
  const [state, setState] = useState<"checking" | "enter-email" | "verify-code" | "verified">("checking");
  const [lang, setLang] = useState("de");
  const [hospitalName, setHospitalName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const t = translations[lang] || translations.de;

  // Persist language
  useEffect(() => {
    const stored = localStorage.getItem("portal_lang_surgeon");
    if (stored && ["de", "en"].includes(stored)) setLang(stored);
  }, []);

  const switchLang = (l: string) => {
    setLang(l);
    localStorage.setItem("portal_lang_surgeon", l);
  };

  // Check existing session
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/api/surgeon-portal/${token}/surgeries?month=${format(new Date(), "yyyy-MM")}`);
        if (!cancelled) {
          if (res.ok) {
            setState("verified");
          } else {
            // Fetch hint for hospital name
            const hintRes = await fetch(`/api/portal-auth/surgeon/${token}/hint`);
            if (hintRes.ok) {
              const data = await hintRes.json();
              setHospitalName(data.hospitalName || "");
              if (data.language && ["de", "en"].includes(data.language) && !localStorage.getItem("portal_lang_surgeon")) {
                setLang(data.language);
              }
            }
            setState("enter-email");
          }
        }
      } catch {
        if (!cancelled) setState("enter-email");
      }
    }
    check();
    return () => { cancelled = true; };
  }, [token]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const requestCode = useCallback(async () => {
    if (!email || !email.includes("@")) {
      setError(t.invalidEmail);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal-auth/surgeon/${token}/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "email", email }),
      });
      if (res.ok) {
        setState("verify-code");
        setCooldown(60);
      } else {
        setError(t.error);
      }
    } catch {
      setError(t.error);
    } finally {
      setSending(false);
    }
  }, [email, token, t]);

  const verifyCode = useCallback(async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal-auth/surgeon/${token}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email }),
      });
      if (res.ok) {
        setState("verified");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || t.invalidCode);
        setCode("");
      }
    } catch {
      setError(t.error);
    } finally {
      setVerifying(false);
    }
  }, [token, code, t]);

  // Auto-submit on 6 digits
  useEffect(() => {
    if (code.length === 6 && !verifying) verifyCode();
  }, [code, verifying, verifyCode]);

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state === "verified") {
    return <>{children}</>;
  }

  // Gate UI: enter-email or verify-code
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Language switcher */}
      <div className="flex justify-end p-3 gap-1">
        <Globe className="h-4 w-4 text-muted-foreground mt-1.5 mr-1" />
        {["de", "en"].map((l) => (
          <Button
            key={l}
            variant={l === lang ? "default" : "ghost"}
            size="sm"
            className="px-2 py-1 h-7 text-xs"
            onClick={() => switchLang(l)}
          >
            {LANGUAGE_LABELS[l]}
          </Button>
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            {hospitalName && (
              <p className="text-sm text-muted-foreground mb-1">{hospitalName}</p>
            )}
            <CardTitle className="text-xl">{t.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {state === "enter-email" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="surgeon-email">{t.emailLabel}</Label>
                  <Input
                    id="surgeon-email"
                    type="email"
                    placeholder={t.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && requestCode()}
                  />
                </div>
                <Button className="w-full" size="lg" onClick={requestCode} disabled={sending}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  {sending ? t.sending : t.sendCode}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">{t.codeSent}</p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={code} onChange={setCode} disabled={verifying}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {verifying && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t.verifying}
                  </div>
                )}
                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={requestCode}
                    disabled={cooldown > 0 || sending}
                    className="text-xs"
                  >
                    {cooldown > 0 ? `${t.resendIn} ${cooldown}${t.seconds}` : t.resend}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ========== SURGERY INTERFACES ==========

interface Surgery {
  id: string;
  plannedDate: string;
  plannedSurgery: string | null;
  chopCode: string | null;
  status: string;
  isSuspended: boolean;
  isArchived: boolean;
  patientPosition: string | null;
  surgeon: string | null;
  roomName: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  actualEndTime: string | null;
}

interface ActionRequest {
  id: string;
  type: string;
  status: string;
  reason: string;
}

// ========== ACTION REQUEST DIALOG ==========

interface ActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "cancellation" | "reschedule" | "suspension";
  surgery: Surgery;
  token: string;
  lang: string;
  onSuccess: () => void;
}

function ActionRequestDialog({ open, onOpenChange, type, surgery, token, lang, onSuccess }: ActionDialogProps) {
  const t = translations[lang] || translations.de;
  const [reason, setReason] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTimeFrom, setProposedTimeFrom] = useState<number | null>(null);
  const [proposedTimeTo, setProposedTimeTo] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closures, setClosures] = useState<{ startDate: string; endDate: string; name: string }[]>([]);

  useEffect(() => {
    if (open && type === "reschedule" && token) {
      fetch(`/public/external-surgery/${token}/closures`)
        .then(res => res.ok ? res.json() : [])
        .then(setClosures)
        .catch(() => setClosures([]));
    }
  }, [open, type, token]);

  const proposedDateClosure = proposedDate
    ? closures.find(c => proposedDate >= c.startDate && proposedDate <= c.endDate)
    : null;

  const titleMap = {
    cancellation: t.requestCancellation,
    reschedule: t.requestReschedule,
    suspension: t.requestSuspension,
  };

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        surgeryId: surgery.id,
        type,
        reason: reason.trim(),
      };
      if (type === "reschedule") {
        if (proposedDate) body.proposedDate = proposedDate;
        if (proposedTimeFrom != null) body.proposedTimeFrom = proposedTimeFrom;
        if (proposedTimeTo != null) body.proposedTimeTo = proposedTimeTo;
      }
      const res = await fetch(`/api/surgeon-portal/${token}/action-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSuccess();
        onOpenChange(false);
        setReason("");
        setProposedDate("");
        setProposedTimeFrom(null);
        setProposedTimeTo(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || t.error);
      }
    } catch {
      setError(t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimeInput = (minutes: number | null) => {
    if (minutes == null) return "";
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };

  const parseTimeInput = (value: string): number | null => {
    if (!value) return null;
    const [h, m] = value.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleMap[type]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Surgery info */}
          <div className="text-sm p-3 bg-muted rounded-lg space-y-1">
            <p><strong>{t.patient}:</strong> {surgery.patientFirstName && surgery.patientLastName ? `${surgery.patientLastName} ${surgery.patientFirstName}` : t.slotReservation}</p>
            {surgery.plannedSurgery && <p><strong>{t.surgery}:</strong> {surgery.plannedSurgery}</p>}
            <p><strong>{t.time}:</strong> {format(new Date(surgery.plannedDate), "dd.MM.yyyy HH:mm")}{surgery.actualEndTime && ` (${Math.round((new Date(surgery.actualEndTime).getTime() - new Date(surgery.plannedDate).getTime()) / 60000)} min)`}</p>
            {surgery.roomName && <p><strong>{t.room}:</strong> {surgery.roomName}</p>}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>{t.reason} *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.reasonPlaceholder}
              rows={3}
            />
          </div>

          {/* Reschedule: proposed date/time */}
          {type === "reschedule" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t.preferredDate}</Label>
                <DateInput
                  value={proposedDate}
                  onChange={(isoDate) => setProposedDate(isoDate)}
                />
                {proposedDateClosure && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-3 w-3 inline mr-1" />
                    {lang === "de"
                      ? `Die Klinik ist an diesem Datum geschlossen (${proposedDateClosure.name}). Bitte wählen Sie ein anderes Datum.`
                      : `The clinic is closed on this date (${proposedDateClosure.name}). Please select a different date.`
                    }
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t.preferredTimeFrom}</Label>
                  <Input
                    type="time"
                    value={formatTimeInput(proposedTimeFrom)}
                    onChange={(e) => setProposedTimeFrom(parseTimeInput(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.preferredTimeTo}</Label>
                  <Input
                    type="time"
                    value={formatTimeInput(proposedTimeTo)}
                    onChange={(e) => setProposedTimeTo(parseTimeInput(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !reason.trim() || !!proposedDateClosure}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ========== SURGEON PORTAL CONTENT ==========

function SurgeonPortalContent({ token }: { token: string }) {
  const [lang, setLang] = useState(() => localStorage.getItem("portal_lang_surgeon") || "de");
  const t = translations[lang] || translations.de;
  // Stable t() helper passed down to the shared form (which expects a
  // function). Falls back to the German map (which holds every key) so a
  // missing EN translation never crashes the form.
  const tFn = useCallback(
    (key: string) => t[key] ?? translations.de[key] ?? key,
    [t],
  );
  const dateLocale = lang === "de" ? de : enUS;
  const { toast } = useToast();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Record<string, ActionRequest[]>>({});
  const [hospitalName, setHospitalName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [view, setView] = useState<"calendar" | "newRequest">("calendar");
  // Captures the values of the most-recently-submitted request so we can show
  // a confirmation card on the New Request tab. Cleared by "Submit another"
  // (resets form) or by clicking the Calendar tab.
  const [submittedSummary, setSubmittedSummary] =
    useState<SurgeryRequestFormValues | null>(null);

  // /me + /children for the in-portal surgery request form
  const { data: me } = useQuery<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    isPraxis: boolean;
  }>({
    queryKey: [`/api/surgeon-portal/${token}/me`],
  });

  // Draft persistence
  const [progressState, setProgressState] = useState<ProgressState | null>(null);
  // Tracks whether the in-flow progress header has scrolled out of view.
  // When true, render a fixed copy pinned to the viewport top — gives us a
  // reliable "sticky" effect that doesn't depend on the surrounding overflow
  // chain (Radix Tabs / Card / etc. were trapping `position: sticky`).
  const [progressPinned, setProgressPinned] = useState(false);
  const progressInFlowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = progressInFlowRef.current;
    if (!el || !progressState) return;
    const obs = new IntersectionObserver(
      ([entry]) => setProgressPinned(!entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [progressState !== null]);

  const [myDataOpen, setMyDataOpen] = useState(false);

  const [draftBanner, setDraftBanner] = useState<SurgeonPortalDraft | null>(null);
  const [restoredInitialValues, setRestoredInitialValues] = useState<
    SurgeryRequestFormValues | undefined
  >(undefined);

  useEffect(() => {
    if (!me?.email) return;
    const existing = loadDraft(token, me.email);
    if (existing) {
      setDraftBanner(existing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.email]);

  const { data: children = [] } = useQuery<AvailableSurgeon[]>({
    queryKey: [`/api/surgeon-portal/${token}/children`],
    enabled: !!me?.isPraxis,
  });

  // Operating-surgeon options:
  //   non-praxis           → just me (picker hidden by parent)
  //   praxis, no children  → just me as a fallback so a fresh praxis can still submit
  //   praxis with children → children only (the praxis user is an org, not the operator)
  const availableSurgeons = useMemo<AvailableSurgeon[]>(() => {
    if (!me) return [];
    if (!me.isPraxis) {
      return [{ id: me.id, firstName: me.firstName, lastName: me.lastName }];
    }
    if (children.length === 0) {
      return [{ id: me.id, firstName: me.firstName, lastName: me.lastName }];
    }
    return children;
  }, [me, children]);

  const showSurgeonPicker = !!me?.isPraxis && children.length > 0;

  const [selectedSurgeonId, setSelectedSurgeonId] = useState("");
  useEffect(() => {
    // Reset if the current selection isn't in the list (e.g. praxis added/removed children).
    if (
      availableSurgeons.length > 0 &&
      !availableSurgeons.some((s) => s.id === selectedSurgeonId)
    ) {
      setSelectedSurgeonId(availableSurgeons[0].id);
    }
  }, [availableSurgeons, selectedSurgeonId]);

  // Debounced draft save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleFormChange = useCallback(
    (values: SurgeryRequestFormValues) => {
      if (!me?.email) return;
      if (draftBanner) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDraft(token, me.email!, values as unknown as Record<string, unknown>);
      }, 800);
    },
    [me?.email, token, draftBanner],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Upload one file: requests presigned PUT URL, uploads, returns metadata.
  // The form stages files locally; the actual /documents row is only created
  // post-submit (we need the requestId), so this just gets the file into S3.
  const uploadFile = async (
    file: File,
  ): Promise<{ fileName: string; fileUrl: string; mimeType?: string; fileSize?: number; key?: string } | null> => {
    try {
      const presignRes = await fetch(`/api/surgeon-portal/${token}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!presignRes.ok) throw new Error("presign failed");
      const { uploadUrl, fileUrl, key } = (await presignRes.json()) as {
        uploadUrl: string;
        fileUrl: string;
        key: string;
      };

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("upload failed");

      return {
        fileName: file.name,
        fileUrl,
        mimeType: file.type,
        fileSize: file.size,
        key,
      };
    } catch (e) {
      toast({
        title: tFn("requestSubmissionFailed"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      return null;
    }
  };

  const submitRequest = useMutation({
    mutationFn: async (values: SurgeryRequestFormValues) => {
      // Split UI-only fields from request body. attachedFiles are persisted
      // separately via /documents once we know the new request id.
      const { attachedFiles, ...requestBody } = values;
      // Enum-constrained columns ("ambulant"/"overnight", "left"/"right"/"both",
      // patient/arm positions) reject "" — convert empty strings to null so the
      // server-side Zod schema accepts the payload. Same goes for date columns
      // (Postgres rejects "" for `date`) — patientBirthday is nullable, so we
      // send null when the patient block is unfilled (reservation-only mode).
      const cleaned = {
        ...requestBody,
        stayType: requestBody.stayType || null,
        surgerySide: requestBody.surgerySide || null,
        patientPosition: requestBody.patientPosition || null,
        leftArmPosition: requestBody.leftArmPosition || null,
        rightArmPosition: requestBody.rightArmPosition || null,
        coverageType: requestBody.coverageType || null,
        patientBirthday: requestBody.patientBirthday || null,
      };
      const res = await fetch(`/api/surgeon-portal/${token}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...cleaned, surgeonId: selectedSurgeonId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Surface field-level Zod errors when present so 400s say what's wrong.
        const fieldErrors = err.errors?.fieldErrors
          ? Object.entries(err.errors.fieldErrors)
              .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
              .join("; ")
          : null;
        const detail = fieldErrors || err.message || tFn("requestSubmissionFailed");
        throw new Error(detail);
      }
      const created = (await res.json()) as { id: string };

      // Attach uploaded documents to the new request (best-effort; failures
      // surface as toasts but don't undo the submission).
      for (const f of attachedFiles) {
        if (f.isUploading || !f.fileUrl) continue;
        try {
          await fetch(`/api/surgeon-portal/${token}/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              requestId: created.id,
              fileName: f.fileName,
              fileUrl: f.fileUrl,
              mimeType: f.mimeType,
              fileSize: f.fileSize,
            }),
          });
        } catch {
          /* noop — toast below would shadow the real submit success */
        }
      }
      return created;
    },
    onSuccess: (_data, variables) => {
      // No more auto-switch + toast — the New Request tab now shows a
      // confirmation card and lets the surgeon either start another or
      // jump to the calendar. The list query still refreshes in the
      // background so the calendar tab is up-to-date when they click over.
      setSubmittedSummary(variables);
      if (me?.email) {
        clearDraft(token, me.email);
      }
      queryClient.invalidateQueries({
        queryKey: [`/api/surgeon-portal/${token}/surgeries`],
      });
    },
    onError: (e: Error) => {
      toast({
        title: tFn("requestSubmissionFailed"),
        description: e.message,
        variant: "destructive",
      });
    },
  });

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: "cancellation" | "reschedule" | "suspension";
    surgery: Surgery | null;
  }>({ open: false, type: "cancellation", surgery: null });

  const [downloadingSurgeryId, setDownloadingSurgeryId] = useState<string | null>(null);

  const handleDownloadSummary = async (surgery: Surgery) => {
    setDownloadingSurgeryId(surgery.id);
    try {
      const res = await fetch(`/api/surgeon-portal/${token}/surgeries/${surgery.id}/summary-data`);
      if (!res.ok) throw new Error("Failed to fetch summary data");
      const data = await res.json();

      if (!data.patient) throw new Error("Patient data not available");

      const doc = await generateSurgeonSummaryPDF({
        patient: data.patient,
        surgery: data.surgery,
        anesthesiaRecord: data.anesthesiaRecord,
        staffMembers: data.staffMembers,
        noPreOpRequired: data.surgery.noPreOpRequired,
        language: data.language,
      });

      const dateStr = new Date(surgery.plannedDate).toLocaleDateString("de-CH", {
        day: "2-digit", month: "2-digit", year: "numeric",
      }).replace(/\//g, "-");
      doc.save(`Surgery_Summary_${surgery.patientLastName || "Unknown"}_${dateStr}.pdf`);
    } catch (error) {
      console.error("Failed to download surgery summary:", error);
      alert(t.downloadFailed);
    } finally {
      setDownloadingSurgeryId(null);
    }
  };

  const fetchSurgeries = useCallback(async (month: Date) => {
    setIsLoading(true);
    try {
      const monthParam = format(month, "yyyy-MM");
      const res = await fetch(`/api/surgeon-portal/${token}/surgeries?month=${monthParam}`);
      if (res.ok) {
        const data = await res.json();
        setSurgeries(data.surgeries || []);
        setPendingRequests(data.pendingRequests || {});
        setHospitalName(data.hospitalName || "");
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSurgeries(currentMonth);
  }, [currentMonth, fetchSurgeries]);

  // Calendar computation
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = eachDayOfInterval({
    start: calendarStart,
    end: new Date(calendarStart.getTime() + 6 * 24 * 60 * 60 * 1000),
  });

  const getSurgeriesForDay = (day: Date): Surgery[] => {
    const dateStr = format(day, "yyyy-MM-dd");
    return surgeries.filter((s) => {
      const surgeryDate = format(new Date(s.plannedDate), "yyyy-MM-dd");
      return surgeryDate === dateStr;
    });
  };

  const selectedDaySurgeries = selectedDay ? getSurgeriesForDay(selectedDay) : [];

  const getStatusBadge = (surgery: Surgery) => {
    if (surgery.isSuspended) {
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700 text-xs">{t.suspended}</Badge>;
    }
    switch (surgery.status) {
      case "planned":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 text-xs">{t.planned}</Badge>;
      case "in-progress":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700 text-xs">{t.inProgress}</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700 text-xs">{t.completed}</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{surgery.status}</Badge>;
    }
  };

  const getPendingRequestLabel = (surgeryId: string): string | null => {
    const requests = pendingRequests[surgeryId];
    if (!requests || requests.length === 0) return null;
    const req = requests[0];
    switch (req.type) {
      case "cancellation": return t.cancellationPending;
      case "reschedule": return t.reschedulePending;
      case "suspension": return t.suspensionPending;
      default: return t.pendingRequest;
    }
  };

  const openActionDialog = (type: "cancellation" | "reschedule" | "suspension", surgery: Surgery) => {
    setActionDialog({ open: true, type, surgery });
  };

  const switchLang = (l: string) => {
    setLang(l);
    localStorage.setItem("portal_lang_surgeon", l);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t.title}</h1>
            {hospitalName && <p className="text-sm text-muted-foreground">{hospitalName}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold hover:opacity-90 transition-opacity"
                data-testid="account-menu-trigger"
              >
                {surgeonInitials(me?.firstName ?? null, me?.lastName ?? null)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="font-medium leading-tight">
                  {[me?.firstName, me?.lastName].filter(Boolean).join(" ") || "—"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {me?.email ?? ""}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setMyDataOpen(true)}
                data-testid="menu-item-edit-profile"
              >
                <Pencil className="h-4 w-4 mr-2" />
                {tFn("accountMenu.editProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => switchLang(lang === "de" ? "en" : "de")}
                data-testid="menu-item-toggle-language"
              >
                <Globe className="h-4 w-4 mr-2" />
                {lang === "de" ? "English" : "Deutsch"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={async () => {
                  try {
                    await fetch(`/api/surgeon-portal/${token}/logout`, { method: "POST" });
                  } catch {
                    // proceed with reload regardless
                  }
                  window.location.reload();
                }}
                data-testid="menu-item-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t.logout}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs
        value={view}
        onValueChange={(v) => {
          // Leaving the New Request tab clears the confirmation card so
          // returning later opens a fresh form instead of stale success state.
          setSubmittedSummary(null);
          setView(v as "calendar" | "newRequest");
        }}
        className="w-full"
      >
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="calendar" data-testid="tab-calendar">{t.calendarTab}</TabsTrigger>
            <TabsTrigger value="newRequest" data-testid="tab-new-request">{t.newRequest}</TabsTrigger>
          </TabsList>
        </div>

        {progressState && !submittedSummary && progressPinned && (
          <div className="fixed top-0 left-0 right-0 z-30 border-b border-border bg-card shadow-md">
            <div className="max-w-2xl mx-auto px-4 py-2">
              <ProgressHeader
                visibleSections={progressState.visibleSections}
                openSection={progressState.openSection}
                completed={progressState.completed}
                t={tFn}
              />
            </div>
          </div>
        )}

        <TabsContent value="newRequest" className="mt-0">
          <div className="max-w-2xl mx-auto px-4 py-6">
            {progressState && !submittedSummary && (
              <div ref={progressInFlowRef} className="mb-3">
                <ProgressHeader
                  visibleSections={progressState.visibleSections}
                  openSection={progressState.openSection}
                  completed={progressState.completed}
                  t={tFn}
                />
              </div>
            )}
            {draftBanner && !submittedSummary && (
              <div
                className="mb-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-3"
                data-testid="draft-restore-banner"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{tFn("draft.banner.title")}</div>
                  <div className="text-xs opacity-80">
                    {tFn("draft.banner.savedAgo").replace(
                      "{when}",
                      formatDistanceToNow(new Date(draftBanner.savedAt), {
                        locale: lang === "de" ? de : enUS,
                      }),
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRestoredInitialValues(
                      draftBanner.values as unknown as SurgeryRequestFormValues,
                    );
                    setDraftBanner(null);
                  }}
                  data-testid="button-draft-restore"
                >
                  {tFn("draft.banner.restore")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (me?.email) clearDraft(token, me.email);
                    setDraftBanner(null);
                  }}
                  data-testid="button-draft-discard"
                >
                  {tFn("draft.banner.discard")}
                </Button>
              </div>
            )}
            {submittedSummary ? (
              <Card data-testid="card-request-confirmation">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    {tFn("requestConfirmedTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {tFn("requestConfirmedDesc")}
                  </p>
                  <dl className="text-sm space-y-1">
                    {submittedSummary.surgeryName && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{tFn("surgeryName")}</dt>
                        <dd className="font-medium text-right truncate">
                          {submittedSummary.surgeryName}
                        </dd>
                      </div>
                    )}
                    {submittedSummary.wishedDate && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{tFn("wishedDate")}</dt>
                        <dd className="font-medium">{submittedSummary.wishedDate}</dd>
                      </div>
                    )}
                    {submittedSummary.isReservationOnly && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{tFn("reservationOnly")}</dt>
                        <dd className="font-medium">✓</dd>
                      </div>
                    )}
                  </dl>
                  <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSubmittedSummary(null);
                        setRestoredInitialValues(undefined);
                        setView("calendar");
                      }}
                      data-testid="button-go-to-calendar"
                    >
                      {tFn("goToCalendar")}
                    </Button>
                    <Button
                      onClick={() => {
                        setSubmittedSummary(null);
                        setRestoredInitialValues(undefined);
                      }}
                      data-testid="button-submit-another"
                    >
                      {tFn("submitAnother")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t.newRequest}</CardTitle>
                </CardHeader>
                <CardContent>
                  <SurgeryRequestForm
                    availableSurgeons={availableSurgeons}
                    selectedSurgeonId={selectedSurgeonId}
                    onSelectedSurgeonIdChange={setSelectedSurgeonId}
                    showSurgeonPicker={showSurgeonPicker}
                    showSurgeonDetailsBlock={false}
                    currentSurgeon={
                      me
                        ? {
                            firstName: me.firstName,
                            lastName: me.lastName,
                            email: me.email,
                            phone: me.phone,
                          }
                        : undefined
                    }
                    t={tFn}
                    locale={lang === "de" ? "de" : "en"}
                    onSubmit={(values) => submitRequest.mutate(values)}
                    isSubmitting={submitRequest.isPending}
                    uploadFile={uploadFile}
                    initialValues={restoredInitialValues}
                    onValuesChange={handleFormChange}
                    onProgressChange={setProgressState}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            onClick={() => { setSelectedDay(null); setCurrentMonth((m) => subMonths(m, 1)); }}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h3 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy", { locale: dateLocale })}
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={() => { setSelectedDay(null); setCurrentMonth((m) => addMonths(m, 1)); }}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className="bg-gray-50 dark:bg-gray-800 text-center text-xs font-medium text-muted-foreground py-2"
                >
                  {format(day, "EEE", { locale: dateLocale })}
                </div>
              ))}
              {calendarDays.map((day) => {
                const daySurgeries = getSurgeriesForDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const isTodayDate = isToday(day);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => isCurrentMonth && setSelectedDay(isSelected ? null : day)}
                    className={`
                      relative min-h-[3rem] sm:min-h-[3.5rem] p-1 text-sm transition-colors
                      bg-white dark:bg-gray-900
                      ${!isCurrentMonth ? "text-gray-300 dark:text-gray-600" : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"}
                      ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                    `}
                  >
                    <span className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-full ${isTodayDate ? "bg-primary text-primary-foreground font-bold" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {daySurgeries.length > 0 && isCurrentMonth && (
                      <div className="flex gap-0.5 justify-center mt-0.5 flex-wrap">
                        {daySurgeries.map((_, i) => (
                          <span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedDay && (
              <div className="space-y-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h4 className="font-medium text-sm">
                  {format(selectedDay, "EEEE, d MMMM yyyy", { locale: dateLocale })}
                </h4>

                {selectedDaySurgeries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noSurgeries}</p>
                ) : (
                  <div className="space-y-3">
                    {selectedDaySurgeries.map((surgery) => {
                      const pendingLabel = getPendingRequestLabel(surgery.id);
                      const canRequestAction = surgery.status === "planned" && !surgery.isSuspended && !pendingLabel;

                      return (
                        <div key={surgery.id} className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                          {/* Surgery info */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">
                                  {surgery.patientFirstName && surgery.patientLastName
                                    ? `${surgery.patientLastName} ${surgery.patientFirstName}`
                                    : t.slotReservation}
                                </span>
                                {getStatusBadge(surgery)}
                              </div>
                              {surgery.plannedSurgery && (
                                <p className="text-sm text-muted-foreground">{surgery.plannedSurgery}</p>
                              )}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(surgery.plannedDate), "HH:mm")}
                                  {surgery.actualEndTime && (
                                    <span className="text-muted-foreground">({Math.round((new Date(surgery.actualEndTime).getTime() - new Date(surgery.plannedDate).getTime()) / 60000)} min)</span>
                                  )}
                                </span>
                                {surgery.roomName && <span>{surgery.roomName}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Pending request indicator */}
                          {pendingLabel && (
                            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-2 py-1.5">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {pendingLabel}
                            </div>
                          )}

                          {/* Action buttons */}
                          {canRequestAction && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                                onClick={() => openActionDialog("cancellation", surgery)}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                {t.requestCancellation}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                                onClick={() => openActionDialog("reschedule", surgery)}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                {t.requestReschedule}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                                onClick={() => openActionDialog("suspension", surgery)}
                              >
                                <PauseCircle className="w-3 h-3 mr-1" />
                                {t.requestSuspension}
                              </Button>
                            </div>
                          )}

                          {/* Download summary */}
                          <div className="pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleDownloadSummary(surgery)}
                                disabled={downloadingSurgeryId === surgery.id}
                              >
                                {downloadingSurgeryId === surgery.id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    {t.downloadingSummary}
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3 mr-1" />
                                    {t.downloadSummary}
                                  </>
                                )}
                              </Button>
                            </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {surgeries.length === 0 && !selectedDay && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t.noSurgeries}</p>
              </div>
            )}
          </>
        )}
      </div>
        </TabsContent>
      </Tabs>

      {/* Action dialog */}
      {actionDialog.surgery && (
        <ActionRequestDialog
          open={actionDialog.open}
          onOpenChange={(open) => setActionDialog((prev) => ({ ...prev, open }))}
          type={actionDialog.type}
          surgery={actionDialog.surgery}
          token={token}
          lang={lang}
          onSuccess={() => fetchSurgeries(currentMonth)}
        />
      )}
    </div>
  );
}

// ========== MAIN COMPONENT ==========

export default function SurgeonPortal() {
  const { token } = useParams<{ token: string }>();

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid link</p>
      </div>
    );
  }

  return (
    <SurgeonPortalGate token={token}>
      <SurgeonPortalContent token={token} />
    </SurgeonPortalGate>
  );
}
