import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import {
  Loader2,
  Mail,
  MessageSquare,
  Globe,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

type PortalType = "patient" | "worklog" | "surgeon";
type GateState = "checking" | "needs-verification" | "verified";
type Lang = string;

interface PortalVerificationGateProps {
  portalType: PortalType;
  token: string;
  children: ReactNode;
}

// Inline translations — small enough to not need i18n
const gateTranslations: Record<
  string,
  Record<string, string>
> = {
  de: {
    title: "Zugang verifizieren",
    subtitle: "Zum Schutz Ihrer Daten benötigen wir eine kurze Verifizierung.",
    sendEmail: "Zugangslink per E-Mail senden",
    sendSms: "Code per SMS senden",
    emailHint: "Wir senden an: ",
    phoneHint: "SMS an Ihre hinterlegte Nummer",
    codeSent: "Überprüfen Sie Ihre E-Mail oder SMS und klicken Sie auf den Link, oder geben Sie den Code unten ein.",
    codeSentEmail: "Überprüfen Sie Ihre E-Mail und klicken Sie auf den Link, oder geben Sie den Code unten ein.",
    codeSentSms: "Überprüfen Sie Ihre SMS und klicken Sie auf den Link, oder geben Sie den Code unten ein.",
    enterCode: "Code eingeben",
    verify: "Verifizieren",
    resend: "Erneut senden",
    resendIn: "Erneut senden in",
    seconds: "s",
    invalidCode: "Ungültiger Code",
    tooManyAttempts: "Zu viele Versuche. Bitte fordern Sie einen neuen Code an.",
    error: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    noContact: "Keine Kontaktinformationen verfügbar. Bitte kontaktieren Sie das Spital.",
    verifying: "Wird verifiziert...",
    sending: "Wird gesendet...",
    expired: "Code abgelaufen. Bitte fordern Sie einen neuen an.",
  },
  en: {
    title: "Verify access",
    subtitle: "To protect your data, we need a quick verification.",
    sendEmail: "Send access link via Email",
    sendSms: "Send code via SMS",
    emailHint: "We'll send to: ",
    phoneHint: "SMS to your registered number",
    codeSent: "Check your email or SMS and click the link, or enter the code below.",
    codeSentEmail: "Check your email and click the link, or enter the code below.",
    codeSentSms: "Check your SMS and click the link, or enter the code below.",
    enterCode: "Enter code",
    verify: "Verify",
    resend: "Resend",
    resendIn: "Resend in",
    seconds: "s",
    invalidCode: "Invalid code",
    tooManyAttempts: "Too many attempts. Please request a new code.",
    error: "An error occurred. Please try again.",
    noContact: "No contact information available. Please contact the hospital.",
    verifying: "Verifying...",
    sending: "Sending...",
    expired: "Code expired. Please request a new one.",
  },
  fr: {
    title: "Vérifier l'accès",
    subtitle: "Pour protéger vos données, une vérification rapide est nécessaire.",
    sendEmail: "Envoyer le lien d'accès par e-mail",
    sendSms: "Envoyer le code par SMS",
    emailHint: "Nous enverrons à : ",
    phoneHint: "SMS à votre numéro enregistré",
    codeSent: "Vérifiez votre e-mail ou SMS et cliquez sur le lien, ou entrez le code ci-dessous.",
    codeSentEmail: "Vérifiez votre e-mail et cliquez sur le lien, ou entrez le code ci-dessous.",
    codeSentSms: "Vérifiez votre SMS et cliquez sur le lien, ou entrez le code ci-dessous.",
    enterCode: "Entrer le code",
    verify: "Vérifier",
    resend: "Renvoyer",
    resendIn: "Renvoyer dans",
    seconds: "s",
    invalidCode: "Code invalide",
    tooManyAttempts: "Trop de tentatives. Veuillez demander un nouveau code.",
    error: "Une erreur est survenue. Veuillez réessayer.",
    noContact: "Aucune information de contact disponible. Veuillez contacter l'hôpital.",
    verifying: "Vérification en cours...",
    sending: "Envoi en cours...",
    expired: "Code expiré. Veuillez en demander un nouveau.",
  },
  it: {
    title: "Verifica accesso",
    subtitle: "Per proteggere i tuoi dati, è necessaria una rapida verifica.",
    sendEmail: "Invia link di accesso via email",
    sendSms: "Invia codice via SMS",
    emailHint: "Invieremo a: ",
    phoneHint: "SMS al tuo numero registrato",
    codeSent: "Controlla la tua email o SMS e clicca sul link, oppure inserisci il codice qui sotto.",
    codeSentEmail: "Controlla la tua email e clicca sul link, oppure inserisci il codice qui sotto.",
    codeSentSms: "Controlla il tuo SMS e clicca sul link, oppure inserisci il codice qui sotto.",
    enterCode: "Inserisci il codice",
    verify: "Verifica",
    resend: "Reinvia",
    resendIn: "Reinvia tra",
    seconds: "s",
    invalidCode: "Codice non valido",
    tooManyAttempts: "Troppi tentativi. Richiedi un nuovo codice.",
    error: "Si è verificato un errore. Riprova.",
    noContact: "Nessuna informazione di contatto disponibile. Contatta l'ospedale.",
    verifying: "Verifica in corso...",
    sending: "Invio in corso...",
    expired: "Codice scaduto. Richiedine uno nuovo.",
  },
  es: {
    title: "Verificar acceso",
    subtitle: "Para proteger sus datos, necesitamos una verificación rápida.",
    sendEmail: "Enviar enlace de acceso por correo",
    sendSms: "Enviar código por SMS",
    emailHint: "Enviaremos a: ",
    phoneHint: "SMS a su número registrado",
    codeSent: "Revise su correo o SMS y haga clic en el enlace, o ingrese el código a continuación.",
    codeSentEmail: "Revise su correo y haga clic en el enlace, o ingrese el código a continuación.",
    codeSentSms: "Revise su SMS y haga clic en el enlace, o ingrese el código a continuación.",
    enterCode: "Ingresar código",
    verify: "Verificar",
    resend: "Reenviar",
    resendIn: "Reenviar en",
    seconds: "s",
    invalidCode: "Código inválido",
    tooManyAttempts: "Demasiados intentos. Solicite un nuevo código.",
    error: "Ocurrió un error. Inténtelo de nuevo.",
    noContact: "No hay información de contacto disponible. Contacte al hospital.",
    verifying: "Verificando...",
    sending: "Enviando...",
    expired: "Código expirado. Solicite uno nuevo.",
  },
};

// Supported languages per portal type
const PORTAL_LANGUAGES: Record<PortalType, string[]> = {
  patient: ["de", "en", "fr", "it", "es"],
  worklog: ["de", "en"],
  surgeon: ["de", "en"],
};

const LANGUAGE_LABELS: Record<string, string> = {
  de: "DE",
  en: "EN",
  fr: "FR",
  it: "IT",
  es: "ES",
};

function getT(lang: Lang) {
  return gateTranslations[lang] || gateTranslations.de;
}

export default function PortalVerificationGate({
  portalType,
  token,
  children,
}: PortalVerificationGateProps) {
  const [state, setState] = useState<GateState>("checking");
  const [lang, setLang] = useState<Lang>("de");
  const [hint, setHint] = useState<{
    emailHint: string | null;
    hasPhone: boolean;
    hospitalName: string;
  } | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [sentMethod, setSentMethod] = useState<"email" | "sms" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const languages = PORTAL_LANGUAGES[portalType];
  const t = getT(lang);

  // Persist language preference
  useEffect(() => {
    const stored = localStorage.getItem(`portal_lang_${portalType}`);
    if (stored && languages.includes(stored)) {
      setLang(stored);
    }
  }, [portalType, languages]);

  const switchLang = useCallback(
    (newLang: string) => {
      setLang(newLang);
      localStorage.setItem(`portal_lang_${portalType}`, newLang);
    },
    [portalType],
  );

  // Check if we already have a valid session by probing the API
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const apiPath =
          portalType === "patient"
            ? `/api/patient-portal/${token}`
            : `/api/worklog/${token}`;

        const res = await fetch(apiPath);

        if (!cancelled) {
          if (res.ok) {
            setState("verified");
          } else if (res.status === 403) {
            // Needs verification — fetch hint
            const hintRes = await fetch(
              `/api/portal-auth/${portalType}/${token}/hint`,
            );
            if (hintRes.ok) {
              const hintData = await hintRes.json();
              setHint(hintData);
              // Set initial language from hospital default
              if (
                hintData.language &&
                languages.includes(hintData.language) &&
                !localStorage.getItem(`portal_lang_${portalType}`)
              ) {
                setLang(hintData.language);
              }
            }
            setState("needs-verification");
          } else {
            // Link invalid/expired — still show, the portal will handle its own error state
            setState("verified");
          }
        }
      } catch {
        if (!cancelled) setState("verified"); // Let the portal handle network errors
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [portalType, token, languages]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const requestCode = useCallback(
    async (method: "email" | "sms") => {
      setSending(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/portal-auth/${portalType}/${token}/request-code`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method }),
          },
        );

        if (res.ok) {
          setCodeSent(true);
          setSentMethod(method);
          setCooldown(60); // 60 second cooldown for resend
        } else {
          setError(t.error);
        }
      } catch {
        setError(t.error);
      } finally {
        setSending(false);
      }
    },
    [portalType, token, t],
  );

  const verifyCode = useCallback(async () => {
    if (code.length !== 6) return;

    setVerifying(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal-auth/${portalType}/${token}/verify-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );

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
  }, [portalType, token, code, t]);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (code.length === 6 && !verifying) {
      verifyCode();
    }
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

  // needs-verification state
  const hasEmail = !!hint?.emailHint;
  const hasPhone = !!hint?.hasPhone;
  const noContact = !hasEmail && !hasPhone;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Language switcher */}
      {languages.length > 1 && (
        <div className="flex justify-end p-3 gap-1">
          <Globe className="h-4 w-4 text-muted-foreground mt-1.5 mr-1" />
          {languages.map((l) => (
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
      )}

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            {hint?.hospitalName && (
              <p className="text-sm text-muted-foreground mb-1">{hint.hospitalName}</p>
            )}
            <CardTitle className="text-xl">{t.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
          </CardHeader>

          <CardContent className="space-y-4">
            {noContact && (
              <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t.noContact}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!codeSent ? (
              /* Initial state: show send buttons */
              <div className="space-y-3">
                {hasEmail && (
                  <div>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => requestCode("email")}
                      disabled={sending || noContact}
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4 mr-2" />
                      )}
                      {sending ? t.sending : t.sendEmail}
                    </Button>
                    {hint?.emailHint && (
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {t.emailHint}
                        {hint.emailHint}
                      </p>
                    )}
                  </div>
                )}

                {hasPhone && (
                  <Button
                    className="w-full"
                    size="lg"
                    variant={hasEmail ? "outline" : "default"}
                    onClick={() => requestCode("sms")}
                    disabled={sending}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MessageSquare className="h-4 w-4 mr-2" />
                    )}
                    {sending ? t.sending : t.sendSms}
                  </Button>
                )}
              </div>
            ) : (
              /* Code sent: show OTP input */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  {sentMethod === "email"
                    ? t.codeSentEmail
                    : sentMethod === "sms"
                      ? t.codeSentSms
                      : t.codeSent}
                </p>

                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={setCode}
                    disabled={verifying}
                  >
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
                    onClick={() => requestCode(sentMethod || "email")}
                    disabled={cooldown > 0 || sending}
                    className="text-xs"
                  >
                    {cooldown > 0
                      ? `${t.resendIn} ${cooldown}${t.seconds}`
                      : t.resend}
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
