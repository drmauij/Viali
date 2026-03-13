import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  Plus,
  LogOut,
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
} from "date-fns";
import { de, enUS } from "date-fns/locale";

// ========== TRANSLATIONS ==========

const translations: Record<string, Record<string, string>> = {
  de: {
    // Gate
    title: "Chirurgen-Portal",
    subtitle: "Geben Sie Ihre E-Mail-Adresse ein, um Ihre OPs einzusehen.",
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
    newRequest: "Neue OP-Anfrage stellen",
    logout: "Abmelden",
  },
  en: {
    // Gate
    title: "Surgeon Portal",
    subtitle: "Enter your email address to view your surgeries.",
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
    newRequest: "Submit new surgery request",
    logout: "Logout",
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
  const dateLocale = lang === "de" ? de : enUS;

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Record<string, ActionRequest[]>>({});
  const [hospitalName, setHospitalName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: "cancellation" | "reschedule" | "suspension";
    surgery: Surgery | null;
  }>({ open: false, type: "cancellation", surgery: null });

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
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
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
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                try {
                  await fetch(`/api/surgeon-portal/${token}/logout`, { method: "POST" });
                } catch {
                  // proceed with reload regardless
                }
                window.location.reload();
              }}
              title={t.logout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Link to surgery request form */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <a
          href={`/external-surgery/${token}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          {t.newRequest}
        </a>
      </div>

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
