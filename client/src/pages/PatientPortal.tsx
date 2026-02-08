import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Clock, 
  MapPin, 
  FileText, 
  ClipboardList,
  AlertTriangle,
  Loader2,
  Globe,
  Download,
  CheckCircle2,
  Circle,
  Phone,
  Building2,
  Sun,
  Moon,
  ChevronRight,
  UserRound,
  Users,
  Stethoscope,
  Shield,
  PenLine,
  Upload,
  Camera as CameraIcon,
  ArrowLeft
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { CameraCapture } from "@/components/CameraCapture";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PortalData {
  token: string;
  language: string;
  hospital: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  patient: {
    firstName: string;
    surname: string;
  } | null;
  surgery: {
    plannedDate: string;
    admissionTime: string | null;
    procedure: string | null;
    roomName: string | null;
    anesthesiaType: string | null;
    surgeonName: string | null;
  } | null;
  surgeryCompleted: boolean;
  flyers: Array<{
    unitName: string;
    unitType: string | null;
    flyerUrl: string;
    downloadUrl?: string;
  }>;
  questionnaireStatus: 'not_started' | 'in_progress' | 'completed';
  questionnaireUrl: string;
}

const translations = {
  de: {
    title: "Patientenportal",
    welcomePrefix: "Willkommen",
    yourJourney: "Ihre Behandlungsreise",
    yourSurgery: "Ihre Operation",
    date: "Datum",
    arrivalTime: "Ankunftszeit",
    location: "Standort",
    procedure: "Eingriff",
    anesthesiaType: "Narkoseart",
    surgeon: "Chirurg",
    plannedTime: "Geplante OP-Zeit",
    step1Title: "Fragebogen ausfüllen",
    step1Desc: "Bitte füllen Sie den präoperativen Fragebogen aus",
    step1Done: "Fragebogen abgeschlossen",
    step1InProgress: "Fragebogen begonnen",
    step2Title: "Vorbereitung",
    step2Desc: "Lesen Sie die Anweisungen für Ihre Operation",
    fastingTitle: "Nüchternheitsregeln",
    fastingNoFood: "Keine feste Nahrung ab 6 Stunden vor der OP",
    fastingLiquids: "Klare Flüssigkeiten bis 2 Stunden vorher erlaubt",
    fastingNoAlcohol: "Kein Alkohol 24 Stunden vor der OP",
    companionTitle: "Begleitperson erforderlich",
    companionText: "Nach der Operation dürfen Sie nicht selbst fahren. Bitte organisieren Sie eine Begleitperson, die Sie nach Hause bringt.",
    infoDocuments: "Informationsunterlagen",
    downloadFlyer: "Herunterladen",
    step3Title: "Operation",
    step3Pending: "Geplant",
    step3Done: "Abgeschlossen",
    fillQuestionnaire: "Fragebogen ausfüllen",
    continueQuestionnaire: "Fragebogen fortsetzen",
    viewQuestionnaire: "Fragebogen ansehen",
    contactUs: "Kontakt",
    questions: "Bei Fragen erreichen Sie uns unter:",
    linkExpired: "Dieser Link ist abgelaufen",
    linkNotFound: "Link nicht gefunden",
    loading: "Wird geladen...",
    error: "Ein Fehler ist aufgetreten",
    switchToEnglish: "Switch to English",
    switchToGerman: "Auf Deutsch wechseln",
    general: "Allgemeinanästhesie",
    sedation: "Sedierung",
    regional_spinal: "Spinalanästhesie",
    regional_epidural: "Epiduralanästhesie",
    regional_peripheral: "Regionalanästhesie",
    local: "Lokalanästhesie",
    standby: "Standby",
    consentStepTitle: "Einwilligungserklärung unterschreiben",
    consentStepDesc: "Bitte prüfen und unterschreiben Sie die Einwilligungserklärung für die Anästhesie",
    consentStepDone: "Einwilligung erteilt",
    consentStepAction: "Jetzt unterschreiben",
    consentStepView: "Einwilligung ansehen",
    consentAnesthesiaTypes: "Geplante Anästhesieverfahren",
    consentGeneralTitle: "Allgemeinanästhesie",
    consentGeneralDesc: "Vollständiger Bewusstseinsverlust durch intravenöse und/oder inhalierte Medikamente.",
    consentGeneralRisks: "Übelkeit, Erbrechen, Halsschmerzen, Zahnschäden, Wachheit während der Anästhesie (selten), allergische Reaktionen, kardiovaskuläre Komplikationen.",
    consentAnalgosedationTitle: "Analgosedierung (Überwachte Anästhesiebereitschaft)",
    consentAnalgosedationDesc: "Leichte Sedierung für kleinere chirurgische Eingriffe, typischerweise kombiniert mit Lokalanästhesie durch den Chirurgen. Anästhesie-Standby zur Patientenüberwachung und Sicherheit.",
    consentAnalgosedationRisks: "Allergische Reaktionen, Atemdepression, Notwendigkeit der Eskalation zur Allgemeinanästhesie, Übelkeit, paradoxe Reaktionen.",
    consentRegionalTitle: "Regionalanästhesie",
    consentRegionalDesc: "Betäubung einer bestimmten Region durch Lokalanästhetika-Injektionen (Spinal, Epidural, Nervenblockaden).",
    consentRegionalRisks: "Kopfschmerzen, Rückenschmerzen, Nervenschäden (selten), Hypotonie, Blutung, Infektion an der Injektionsstelle.",
    consentInstallationsTitle: "Geplante Installationen (IV-Zugänge, Katheter)",
    consentInstallationsDesc: "Anlage von intravenösen Zugängen, arteriellen Leitungen, zentralen Leitungen oder Blasenkathetern nach Bedarf.",
    consentInstallationsRisks: "Infektion, Blutung, Hämatom, Pneumothorax (bei zentralen Leitungen), Thrombose.",
    consentIcuTitle: "Postoperative Intensivstationsaufnahme",
    consentIcuDesc: "Verlegung auf die Intensivstation zur engmaschigen Überwachung nach der Operation.",
    consentIcuPurpose: "Zweck: Engmaschige hämodynamische Überwachung, Atemunterstützung, Schmerzmanagement und frühzeitige Erkennung von Komplikationen.",
    consentPossibleRisks: "Mögliche unerwünschte Ereignisse:",
    consentDoctorNotes: "Zusätzliche Hinweise des Arztes",
    consentIdRequired: "Identitätsnachweis erforderlich",
    consentIdFront: "Vorderseite",
    consentIdBack: "Rückseite",
    consentUploadId: "Foto hochladen",
    consentTakePhoto: "Foto aufnehmen",
    consentChangePhoto: "Ändern",
    consentSignatureRequired: "Unterschrift",
    consentAddSignature: "Unterschrift hinzufügen",
    consentChangeSignature: "Unterschrift ändern",
    consentProxyCheckbox: "Ich unterschreibe als Vertretung für den Patienten",
    consentProxyName: "Name des Vertreters",
    consentProxyRelation: "Beziehung zum Patienten",
    consentProxyRelationLegalGuardian: "Gesetzlicher Vertreter",
    consentProxyRelationSpouse: "Ehepartner/Partner",
    consentProxyRelationParent: "Elternteil",
    consentProxyRelationChild: "Kind",
    consentProxyRelationOther: "Andere",
    consentSubmit: "Unterschreiben und absenden",
    consentSubmitting: "Wird gesendet...",
    consentSuccess: "Einwilligung erfolgreich unterschrieben",
    consentSuccessDesc: "Ihre Einwilligung wurde erfolgreich registriert.",
    consentBackToPortal: "Zurück zum Portal",
    consentAlreadySigned: "Einwilligung bereits unterschrieben",
    consentAlreadySignedDesc: "Diese Einwilligung wurde bereits am {date} unterschrieben.",
    consentMissingFields: "Bitte füllen Sie alle erforderlichen Felder aus",
    consentMissingIdFront: "Bitte laden Sie die Vorderseite Ihres Ausweises hoch",
    consentMissingIdBack: "Bitte laden Sie die Rückseite Ihres Ausweises hoch",
    consentMissingSignature: "Bitte fügen Sie Ihre Unterschrift hinzu",
    consentMissingProxyName: "Bitte geben Sie den Namen des Vertreters ein",
    callbackStepTitle: "Aufklärungsgespräch",
    callbackStepDesc: "Bitte rufen Sie uns an, um einen Termin für das Aufklärungsgespräch zu vereinbaren.",
    callbackSlotsTimes: "Verfügbare Termine",
  },
  en: {
    title: "Patient Portal",
    welcomePrefix: "Welcome",
    yourJourney: "Your Treatment Journey",
    yourSurgery: "Your Surgery",
    date: "Date",
    arrivalTime: "Arrival Time",
    location: "Location",
    procedure: "Procedure",
    anesthesiaType: "Anesthesia Type",
    surgeon: "Surgeon",
    plannedTime: "Planned Surgery Time",
    step1Title: "Complete Questionnaire",
    step1Desc: "Please fill out the pre-operative questionnaire",
    step1Done: "Questionnaire completed",
    step1InProgress: "Questionnaire in progress",
    step2Title: "Preparation",
    step2Desc: "Review the instructions for your surgery",
    fastingTitle: "Fasting Rules",
    fastingNoFood: "No solid food 6 hours before surgery",
    fastingLiquids: "Clear liquids allowed until 2 hours before",
    fastingNoAlcohol: "No alcohol 24 hours before surgery",
    companionTitle: "Companion Required",
    companionText: "You will not be allowed to drive after surgery. Please arrange for someone to take you home.",
    infoDocuments: "Information Documents",
    downloadFlyer: "Download",
    step3Title: "Surgery",
    step3Pending: "Scheduled",
    step3Done: "Completed",
    fillQuestionnaire: "Fill Questionnaire",
    continueQuestionnaire: "Continue Questionnaire",
    viewQuestionnaire: "View Questionnaire",
    contactUs: "Contact Us",
    questions: "If you have questions, reach us at:",
    linkExpired: "This link has expired",
    linkNotFound: "Link not found",
    loading: "Loading...",
    error: "An error occurred",
    switchToEnglish: "Switch to English",
    switchToGerman: "Auf Deutsch wechseln",
    general: "General Anesthesia",
    sedation: "Sedation",
    regional_spinal: "Spinal Anesthesia",
    regional_epidural: "Epidural Anesthesia",
    regional_peripheral: "Regional Anesthesia",
    local: "Local Anesthesia",
    standby: "Standby",
    consentStepTitle: "Sign Informed Consent",
    consentStepDesc: "Please review and sign the informed consent for anesthesia",
    consentStepDone: "Consent signed",
    consentStepAction: "Sign now",
    consentStepView: "View consent",
    consentAnesthesiaTypes: "Planned Anesthesia Procedures",
    consentGeneralTitle: "General Anesthesia",
    consentGeneralDesc: "Complete loss of consciousness using intravenous and/or inhaled medications.",
    consentGeneralRisks: "Nausea, vomiting, sore throat, dental damage, awareness during anesthesia (rare), allergic reactions, cardiovascular complications.",
    consentAnalgosedationTitle: "Analgosedation (Monitored Anesthesia Care)",
    consentAnalgosedationDesc: "Light sedation for minor surgical procedures, typically combined with local anesthetic administered by the surgeon. Anesthesia stand-by for patient monitoring and safety.",
    consentAnalgosedationRisks: "Allergic reactions, respiratory depression, need to escalate to general anesthesia, nausea, paradoxical reactions.",
    consentRegionalTitle: "Regional Anesthesia",
    consentRegionalDesc: "Numbing of a specific region using local anesthetic injections (spinal, epidural, nerve blocks).",
    consentRegionalRisks: "Headache, back pain, nerve damage (rare), hypotension, bleeding, infection at injection site.",
    consentInstallationsTitle: "Planned Installations (IV lines, catheters)",
    consentInstallationsDesc: "Placement of intravenous lines, arterial lines, central lines, or urinary catheters as needed.",
    consentInstallationsRisks: "Infection, bleeding, hematoma, pneumothorax (for central lines), thrombosis.",
    consentIcuTitle: "Postoperative ICU Admission",
    consentIcuDesc: "Transfer to Intensive Care Unit for close monitoring after surgery.",
    consentIcuPurpose: "Purpose: Close hemodynamic monitoring, respiratory support, pain management, and early detection of complications.",
    consentPossibleRisks: "Possible adverse events:",
    consentDoctorNotes: "Additional notes from the doctor",
    consentIdRequired: "Identity verification required",
    consentIdFront: "Front side",
    consentIdBack: "Back side",
    consentUploadId: "Upload photo",
    consentTakePhoto: "Take photo",
    consentChangePhoto: "Change",
    consentSignatureRequired: "Signature",
    consentAddSignature: "Add signature",
    consentChangeSignature: "Change signature",
    consentProxyCheckbox: "I am signing on behalf of the patient",
    consentProxyName: "Name of the representative",
    consentProxyRelation: "Relationship to patient",
    consentProxyRelationLegalGuardian: "Legal guardian",
    consentProxyRelationSpouse: "Spouse/Partner",
    consentProxyRelationParent: "Parent",
    consentProxyRelationChild: "Child",
    consentProxyRelationOther: "Other",
    consentSubmit: "Sign and submit",
    consentSubmitting: "Submitting...",
    consentSuccess: "Consent signed successfully",
    consentSuccessDesc: "Your informed consent has been recorded successfully.",
    consentBackToPortal: "Back to portal",
    consentAlreadySigned: "Consent already signed",
    consentAlreadySignedDesc: "This consent was already signed on {date}.",
    consentMissingFields: "Please fill in all required fields",
    consentMissingIdFront: "Please upload the front of your ID",
    consentMissingIdBack: "Please upload the back of your ID",
    consentMissingSignature: "Please add your signature",
    consentMissingProxyName: "Please enter the representative's name",
    callbackStepTitle: "Consent Talk",
    callbackStepDesc: "Please call us to schedule your consent talk.",
    callbackSlotsTimes: "Available times",
  }
};

type Lang = 'de' | 'en';

export default function PatientPortal() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [lang, setLang] = useState<Lang>('de');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('patient-portal-theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const t = translations[lang];

  const [showConsentSigning, setShowConsentSigning] = useState(false);
  const [consentSignature, setConsentSignature] = useState<string | null>(null);
  const [idFrontImage, setIdFrontImage] = useState<string | null>(null);
  const [idBackImage, setIdBackImage] = useState<string | null>(null);
  const [signedByProxy, setSignedByProxy] = useState(false);
  const [proxySignerName, setProxySignerName] = useState('');
  const [proxySignerRelation, setProxySignerRelation] = useState('');
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isCameraOpenFront, setIsCameraOpenFront] = useState(false);
  const [isCameraOpenBack, setIsCameraOpenBack] = useState(false);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  const [consentSubmitted, setConsentSubmitted] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const fileInputFrontRef = useRef<HTMLInputElement>(null);
  const fileInputBackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('patient-portal-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ['/api/patient-portal', token],
    queryFn: async () => {
      const res = await fetch(`/api/patient-portal/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error' }));
        const debugStr = err.debug ? ` [${JSON.stringify(err.debug)}]` : '';
        throw new Error((err.message || 'Failed to load') + debugStr);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const { data: consentInfo } = useQuery<{
    consentData: {
      general: boolean;
      analgosedation: boolean;
      regional: boolean;
      installations: boolean;
      icuAdmission: boolean;
      notes: string | null;
      doctorSignature: string | null;
      date: string | null;
    };
    patientSignature: string | null;
    signedByProxy: boolean;
    needsSignature: boolean;
    needsCallbackAppointment: boolean;
    callbackAppointmentSlots: Array<{ date: string; fromTime: string; toTime: string }> | null;
    callbackPhoneNumber: string | null;
    callbackInvitationSentAt: string | null;
    patientName: string | null;
    hospitalName: string | null;
    surgeryDescription: string | null;
    consentRemoteSignedAt: string | null;
  }>({
    queryKey: ['/api/patient-portal', token, 'consent'],
    queryFn: async () => {
      const res = await fetch(`/api/patient-portal/${token}/consent-data`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!token && !!data,
  });

  useEffect(() => {
    if (data?.language) {
      setLang(data.language === 'en' ? 'en' : 'de');
    }
  }, [data?.language]);

  const toggleLanguage = () => {
    setLang(prev => prev === 'de' ? 'en' : 'de');
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString(lang === 'de' ? 'de-CH' : 'en-US', options);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getAnesthesiaTypeLabel = (type: string | null) => {
    if (!type) return null;
    return t[type as keyof typeof t] || type;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmitConsent = async () => {
    setConsentError(null);
    if (!idFrontImage) {
      setConsentError(t.consentMissingIdFront);
      return;
    }
    if (!idBackImage) {
      setConsentError(t.consentMissingIdBack);
      return;
    }
    if (!consentSignature) {
      setConsentError(t.consentMissingSignature);
      return;
    }
    if (signedByProxy && !proxySignerName.trim()) {
      setConsentError(t.consentMissingProxyName);
      return;
    }

    setIsSubmittingConsent(true);
    try {
      const res = await fetch(`/api/patient-portal/${token}/sign-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: consentSignature,
          signedByProxy,
          proxySignerName: proxySignerName || undefined,
          proxySignerRelation: proxySignerRelation || undefined,
          idFrontImage,
          idBackImage,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error' }));
        throw new Error(err.message || 'Failed to submit consent');
      }
      setConsentSubmitted(true);
    } catch (err: any) {
      setConsentError(err.message || t.error);
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
            <p className="text-muted-foreground dark:text-gray-400">{t.loading}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    const errorMessage = (error as Error).message;
    const isExpired = errorMessage.includes('expired');
    const isNotFound = errorMessage.includes('not found');
    const debugMatch = errorMessage.match(/\[(.+)\]$/);
    let debugInfo: any = null;
    if (debugMatch) {
      try { debugInfo = JSON.parse(debugMatch[1]); } catch {}
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500 dark:text-amber-400 mb-4" />
            <p className="text-lg font-medium text-center text-gray-900 dark:text-gray-100">
              {isExpired ? t.linkExpired : isNotFound ? t.linkNotFound : t.error}
            </p>
            {debugInfo && (
              <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs font-mono text-gray-600 dark:text-gray-400 w-full max-w-sm break-all">
                <p>reason: {debugInfo.reason}</p>
                {debugInfo.expiresAt && <p>expiresAt: {debugInfo.expiresAt}</p>}
                {debugInfo.now && <p>now: {debugInfo.now}</p>}
                {debugInfo.status && <p>status: {debugInfo.status}</p>}
                {debugInfo.surgeryId && <p>surgeryId: {debugInfo.surgeryId}</p>}
                {debugInfo.patientId && <p>patientId: {debugInfo.patientId}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const patientName = data.patient 
    ? `${data.patient.firstName} ${data.patient.surname}` 
    : null;

  const step1Complete = data.questionnaireStatus === 'completed';
  const step1InProgress = data.questionnaireStatus === 'in_progress';
  const step3Complete = data.surgeryCompleted;

  const consentStepVisible = !!(consentInfo?.needsSignature || consentInfo?.consentRemoteSignedAt);
  const consentAlreadySigned = !!consentInfo?.consentRemoteSignedAt;
  const callbackStepVisible = !!(consentInfo?.needsCallbackAppointment && consentInfo?.callbackAppointmentSlots && consentInfo.callbackAppointmentSlots.length > 0);
  
  const intermediateSteps = (consentStepVisible ? 1 : 0) + (callbackStepVisible ? 1 : 0);
  const callbackStepNum = consentStepVisible ? 3 : 2;
  const prepStepNum = 2 + intermediateSteps;
  const surgeryStepNum = 3 + intermediateSteps;

  const step1Active = !step1Complete;
  const consentStepActive = consentStepVisible && step1Complete && !consentAlreadySigned;
  const consentStepDone = consentStepVisible && consentAlreadySigned;
  const callbackStepActive = callbackStepVisible && step1Complete && (!consentStepVisible || consentAlreadySigned);
  const prepStepActive = step1Complete && (!consentStepVisible || consentAlreadySigned) && !step3Complete && !callbackStepActive;
  const surgeryStepActive = step1Complete && (!consentStepVisible || consentAlreadySigned) && !step3Complete && !callbackStepActive;

  if (showConsentSigning) {
    if (consentAlreadySigned || consentSubmitted) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
          <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowConsentSigning(false)}
                className="dark:hover:bg-gray-800"
                data-testid="button-consent-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {data.hospital.name}
              </h1>
            </div>
            <Card className="border-green-300 dark:border-green-700 shadow-md bg-white dark:bg-gray-800">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-16 w-16 text-green-500 dark:text-green-400 mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {t.consentAlreadySigned}
                </h2>
                <p className="text-muted-foreground dark:text-gray-400 text-center">
                  {consentInfo?.consentRemoteSignedAt
                    ? t.consentAlreadySignedDesc.replace('{date}', formatDate(consentInfo.consentRemoteSignedAt))
                    : t.consentSuccessDesc}
                </p>
                <Button
                  className="mt-6"
                  onClick={() => setShowConsentSigning(false)}
                  data-testid="button-consent-back-to-portal"
                >
                  {t.consentBackToPortal}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowConsentSigning(false)}
              className="dark:hover:bg-gray-800"
              data-testid="button-consent-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {data.hospital.name}
            </h1>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {t.consentStepTitle}
            </h2>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              {t.consentStepDesc}
            </p>
          </div>

          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-gray-100">
                <Stethoscope className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t.consentAnesthesiaTypes}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {consentInfo?.consentData?.general && (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t.consentGeneralTitle}</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{t.consentGeneralDesc}</p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    <span className="font-medium">{t.consentPossibleRisks}</span> {t.consentGeneralRisks}
                  </p>
                </div>
              )}
              {consentInfo?.consentData?.analgosedation && (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t.consentAnalgosedationTitle}</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{t.consentAnalgosedationDesc}</p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    <span className="font-medium">{t.consentPossibleRisks}</span> {t.consentAnalgosedationRisks}
                  </p>
                </div>
              )}
              {consentInfo?.consentData?.regional && (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t.consentRegionalTitle}</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{t.consentRegionalDesc}</p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    <span className="font-medium">{t.consentPossibleRisks}</span> {t.consentRegionalRisks}
                  </p>
                </div>
              )}
              {consentInfo?.consentData?.installations && (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t.consentInstallationsTitle}</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{t.consentInstallationsDesc}</p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    <span className="font-medium">{t.consentPossibleRisks}</span> {t.consentInstallationsRisks}
                  </p>
                </div>
              )}
              {consentInfo?.consentData?.icuAdmission && (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t.consentIcuTitle}</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{t.consentIcuDesc}</p>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    {t.consentIcuPurpose}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {consentInfo?.consentData?.notes && (
            <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-gray-100">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  {t.consentDoctorNotes}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {consentInfo.consentData.notes}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-gray-100">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t.consentIdRequired}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    {t.consentIdFront}
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-2 aspect-[3/2] flex flex-col items-center justify-center overflow-hidden">
                    {idFrontImage ? (
                      <img src={idFrontImage} alt="ID Front" className="w-full h-full object-cover rounded" />
                    ) : (
                      <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                    )}
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => fileInputFrontRef.current?.click()}
                      data-testid="button-upload-id-front"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {idFrontImage ? t.consentChangePhoto : t.consentUploadId}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setIsCameraOpenFront(true)}
                      data-testid="button-camera-id-front"
                    >
                      <CameraIcon className="h-3 w-3 mr-1" />
                      {idFrontImage ? t.consentChangePhoto : t.consentTakePhoto}
                    </Button>
                  </div>
                  <input
                    ref={fileInputFrontRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, setIdFrontImage)}
                    data-testid="input-file-id-front"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    {t.consentIdBack}
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-2 aspect-[3/2] flex flex-col items-center justify-center overflow-hidden">
                    {idBackImage ? (
                      <img src={idBackImage} alt="ID Back" className="w-full h-full object-cover rounded" />
                    ) : (
                      <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                    )}
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => fileInputBackRef.current?.click()}
                      data-testid="button-upload-id-back"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {idBackImage ? t.consentChangePhoto : t.consentUploadId}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setIsCameraOpenBack(true)}
                      data-testid="button-camera-id-back"
                    >
                      <CameraIcon className="h-3 w-3 mr-1" />
                      {idBackImage ? t.consentChangePhoto : t.consentTakePhoto}
                    </Button>
                  </div>
                  <input
                    ref={fileInputBackRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, setIdBackImage)}
                    data-testid="input-file-id-back"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-4">
              <div className="flex items-center space-x-2 mb-4">
                <Checkbox
                  id="proxy-signing"
                  checked={signedByProxy}
                  onCheckedChange={(checked) => setSignedByProxy(checked === true)}
                  data-testid="checkbox-proxy-signing"
                />
                <Label htmlFor="proxy-signing" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  {t.consentProxyCheckbox}
                </Label>
              </div>
              {signedByProxy && (
                <div className="space-y-3 pl-6 border-l-2 border-blue-200 dark:border-blue-800">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                      {t.consentProxyName}
                    </Label>
                    <Input
                      value={proxySignerName}
                      onChange={(e) => setProxySignerName(e.target.value)}
                      placeholder={t.consentProxyName}
                      className="dark:bg-gray-700 dark:border-gray-600"
                      data-testid="input-proxy-name"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                      {t.consentProxyRelation}
                    </Label>
                    <Select value={proxySignerRelation} onValueChange={setProxySignerRelation}>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600" data-testid="select-proxy-relation">
                        <SelectValue placeholder={t.consentProxyRelation} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="legalGuardian">{t.consentProxyRelationLegalGuardian}</SelectItem>
                        <SelectItem value="spouse">{t.consentProxyRelationSpouse}</SelectItem>
                        <SelectItem value="parent">{t.consentProxyRelationParent}</SelectItem>
                        <SelectItem value="child">{t.consentProxyRelationChild}</SelectItem>
                        <SelectItem value="other">{t.consentProxyRelationOther}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-gray-100">
                <PenLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t.consentSignatureRequired}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {consentSignature ? (
                <div className="space-y-2">
                  <div className="border rounded-lg p-2 bg-gray-50 dark:bg-gray-700">
                    <img src={consentSignature} alt="Signature" className="w-full h-24 object-contain" />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSignaturePad(true)}
                    data-testid="button-change-signature"
                  >
                    <PenLine className="h-4 w-4 mr-1" />
                    {t.consentChangeSignature}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setShowSignaturePad(true)}
                  className="w-full h-24 border-2 border-dashed"
                  data-testid="button-add-signature"
                >
                  <div className="flex flex-col items-center gap-1">
                    <PenLine className="h-6 w-6 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">{t.consentAddSignature}</span>
                  </div>
                </Button>
              )}
            </CardContent>
          </Card>

          {consentError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {consentError}
              </p>
            </div>
          )}

          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleSubmitConsent}
            disabled={isSubmittingConsent}
            data-testid="button-submit-consent"
          >
            {isSubmittingConsent ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t.consentSubmitting}
              </>
            ) : (
              <>
                <PenLine className="h-5 w-5 mr-2" />
                {t.consentSubmit}
              </>
            )}
          </Button>

          <div className="pb-8" />
        </div>

        <SignaturePad
          isOpen={showSignaturePad}
          onClose={() => setShowSignaturePad(false)}
          onSave={(sig) => setConsentSignature(sig)}
          title={t.consentSignatureRequired}
        />

        <CameraCapture
          isOpen={isCameraOpenFront}
          onClose={() => setIsCameraOpenFront(false)}
          onCapture={(photo) => setIdFrontImage(photo)}
          fullFrame
          hint={t.consentIdFront}
        />

        <CameraCapture
          isOpen={isCameraOpenBack}
          onClose={() => setIsCameraOpenBack(false)}
          onCapture={(photo) => setIdBackImage(photo)}
          fullFrame
          hint={t.consentIdBack}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.title}</h1>
            {patientName && (
              <p className="text-muted-foreground dark:text-gray-400">{t.welcomePrefix}, {patientName}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={toggleTheme}
              className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              data-testid="button-toggle-theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              data-testid="button-toggle-language"
            >
              <Globe className="h-4 w-4" />
              {lang === 'de' ? 'EN' : 'DE'}
            </Button>
          </div>
        </div>

        {/* Hospital Card */}
        <Card className="border-blue-200 dark:border-blue-800 shadow-md bg-white dark:bg-gray-800">
          <CardHeader className="pb-3 bg-blue-50 dark:bg-blue-900/30 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Building2 className="h-5 w-5" />
              {data.hospital.name}
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Journey Title */}
        <div className="pt-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t.yourJourney}</h2>
        </div>

        {/* Step 1: Questionnaire */}
        <Card 
          className={`shadow-md bg-white dark:bg-gray-800 border-2 transition-colors ${
            step1Complete 
              ? 'border-green-300 dark:border-green-700' 
              : step1InProgress 
                ? 'border-amber-300 dark:border-amber-700' 
                : step1Active
                  ? 'border-blue-300 dark:border-blue-700'
                  : 'border-gray-200 dark:border-gray-700'
          }`} 
          data-testid="card-step1-questionnaire"
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {/* Step Indicator */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step1Complete 
                    ? 'bg-green-100 dark:bg-green-900/50' 
                    : step1InProgress 
                      ? 'bg-amber-100 dark:bg-amber-900/50' 
                      : 'bg-blue-100 dark:bg-blue-900/50'
                }`}>
                  {step1Complete ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : step1InProgress ? (
                    <Circle className="h-6 w-6 text-amber-600 dark:text-amber-400 fill-amber-200 dark:fill-amber-800" />
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400 font-bold">1</span>
                  )}
                </div>
                {/* Connector Line */}
                <div className="w-0.5 h-full min-h-[20px] bg-gray-200 dark:bg-gray-700 mt-2" />
              </div>
              
              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.step1Title}</h3>
                  <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm text-muted-foreground dark:text-gray-400 mb-3">
                  {step1Complete ? t.step1Done : step1InProgress ? t.step1InProgress : t.step1Desc}
                </p>
                <Button 
                  size="sm"
                  variant={step1Complete ? 'outline' : 'default'}
                  onClick={() => navigate(data.questionnaireUrl)}
                  className="w-full sm:w-auto"
                  data-testid="button-questionnaire"
                >
                  {step1Complete 
                    ? t.viewQuestionnaire 
                    : step1InProgress
                      ? t.continueQuestionnaire
                      : t.fillQuestionnaire}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2 (conditional): Informed Consent */}
        {consentStepVisible && (
          <Card 
            className={`shadow-md bg-white dark:bg-gray-800 border-2 transition-colors ${
              consentAlreadySigned
                ? 'border-green-300 dark:border-green-700' 
                : consentStepActive
                  ? 'border-amber-300 dark:border-amber-700'
                  : 'border-gray-200 dark:border-gray-700'
            }`}
            data-testid="card-step2-consent"
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    consentAlreadySigned
                      ? 'bg-green-100 dark:bg-green-900/50'
                      : 'bg-amber-100 dark:bg-amber-900/50'
                  }`}>
                    {consentAlreadySigned ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-bold">2</span>
                    )}
                  </div>
                  <div className="w-0.5 h-full min-h-[20px] bg-gray-200 dark:bg-gray-700 mt-2" />
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.consentStepTitle}</h3>
                    <Shield className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  </div>
                  <p className="text-sm text-muted-foreground dark:text-gray-400 mb-3">
                    {consentAlreadySigned ? t.consentStepDone : t.consentStepDesc}
                  </p>
                  <Button 
                    size="sm"
                    variant={consentAlreadySigned ? 'outline' : 'default'}
                    onClick={() => setShowConsentSigning(true)}
                    className="w-full sm:w-auto"
                    data-testid="button-consent"
                  >
                    {consentAlreadySigned ? t.consentStepView : t.consentStepAction}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Callback Appointment (for consent talk) */}
        {callbackStepVisible && (
          <Card 
            className={`shadow-md bg-white dark:bg-gray-800 border-2 transition-colors ${
              callbackStepActive
                ? 'border-amber-300 dark:border-amber-700'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            data-testid="card-step-callback"
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    callbackStepActive ? 'bg-amber-100 dark:bg-amber-900/50' : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    <span className={`font-bold ${callbackStepActive ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>{callbackStepNum}</span>
                  </div>
                  <div className="w-0.5 h-full min-h-[20px] bg-gray-200 dark:bg-gray-700 mt-2" />
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.callbackStepTitle}</h3>
                    <Phone className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  </div>
                  <p className="text-sm text-muted-foreground dark:text-gray-400 mb-3">
                    {t.callbackStepDesc}
                  </p>

                  {consentInfo?.callbackPhoneNumber && (
                    <a 
                      href={`tel:${consentInfo.callbackPhoneNumber}`}
                      className="flex items-center gap-3 p-3 mb-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors"
                      data-testid="link-callback-phone"
                    >
                      <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span className="font-semibold text-blue-900 dark:text-blue-100 text-lg">{consentInfo.callbackPhoneNumber}</span>
                    </a>
                  )}

                  {consentInfo?.callbackAppointmentSlots && consentInfo.callbackAppointmentSlots.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {t.callbackSlotsTimes}
                      </p>
                      {consentInfo.callbackAppointmentSlots.map((slot, idx) => {
                        const d = new Date(slot.date + 'T12:00:00');
                        const dayName = d.toLocaleDateString(data.language === 'en' ? 'en-US' : 'de-CH', { weekday: 'long' });
                        const dateStr = d.toLocaleDateString(data.language === 'en' ? 'en-US' : 'de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        return (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700" data-testid={`callback-slot-display-${idx}`}>
                            <Calendar className="h-4 w-4 text-gray-500 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{dayName}, {dateStr}</span>
                            <Clock className="h-4 w-4 text-gray-500 flex-shrink-0 ml-2" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{slot.fromTime} – {slot.toTime}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Preparation */}
        <Card 
          className={`shadow-md bg-white dark:bg-gray-800 border-2 ${
            prepStepActive
              ? 'border-blue-200 dark:border-blue-800'
              : 'border-gray-200 dark:border-gray-700'
          }`}
          data-testid="card-step2-preparation"
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {/* Step Indicator */}
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/50">
                  <span className="font-bold text-blue-600 dark:text-blue-400">{prepStepNum}</span>
                </div>
                {/* Connector Line */}
                <div className="w-0.5 h-full min-h-[20px] bg-gray-200 dark:bg-gray-700 mt-2" />
              </div>
              
              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {t.step2Title}
                  </h3>
                  <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                </div>
                <p className="text-sm mb-4 text-muted-foreground dark:text-gray-400">
                  {t.step2Desc}
                </p>
                
                {/* Fasting Rules */}
                <div className="p-3 rounded-lg mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    {t.fastingTitle}
                  </h4>
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 bg-amber-500" />
                      {t.fastingNoFood}
                    </li>
                    <li className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 bg-amber-500" />
                      {t.fastingLiquids}
                    </li>
                    <li className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 bg-amber-500" />
                      {t.fastingNoAlcohol}
                    </li>
                  </ul>
                </div>

                {/* Companion Reminder */}
                <div className="p-3 rounded-lg mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" data-testid="card-companion-reminder">
                  <h4 className="font-medium text-sm mb-1 flex items-center gap-1.5 text-blue-800 dark:text-blue-300">
                    <Users className="h-4 w-4" />
                    {t.companionTitle}
                  </h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {t.companionText}
                  </p>
                </div>

                {/* Info Flyers */}
                {data.flyers.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2 text-gray-700 dark:text-gray-300">
                      {t.infoDocuments}
                    </h4>
                    <div className="space-y-2">
                      {data.flyers.map((flyer, index) => (
                        <a
                          key={index}
                          href={flyer.downloadUrl || flyer.flyerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2.5 rounded-lg border transition-colors border-gray-200 dark:border-gray-700 hover:bg-muted/50 dark:hover:bg-gray-700/50 cursor-pointer"
                          data-testid={`link-flyer-${index}`}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                            <span className="text-gray-900 dark:text-gray-100">{flyer.unitName}</span>
                          </div>
                          <Download className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step: Surgery */}
        <Card 
          className={`shadow-md bg-white dark:bg-gray-800 border-2 ${
            step3Complete 
              ? 'border-green-300 dark:border-green-700' 
              : surgeryStepActive
                ? 'border-blue-200 dark:border-blue-800'
                : 'border-gray-200 dark:border-gray-700'
          }`}
          data-testid="card-step3-surgery"
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {/* Step Indicator */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step3Complete 
                    ? 'bg-green-100 dark:bg-green-900/50' 
                    : 'bg-blue-100 dark:bg-blue-900/50'
                }`}>
                  {step3Complete ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400 font-bold">{surgeryStepNum}</span>
                  )}
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {t.step3Title}
                  </h3>
                  <Calendar className={`h-5 w-5 ${step3Complete ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
                </div>
                <p className={`text-sm mb-3 ${step3Complete ? 'text-green-700 dark:text-green-400 font-medium' : 'text-muted-foreground dark:text-gray-400'}`}>
                  {step3Complete ? t.step3Done : t.step3Pending}
                </p>

                {data.surgery && (
                  <div className="space-y-2.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground dark:text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground dark:text-gray-400">{t.date}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(data.surgery.plannedDate)}</p>
                      </div>
                    </div>

                    {data.surgery.plannedDate && (
                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground dark:text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400">{t.plannedTime}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatTime(data.surgery.plannedDate)}</p>
                        </div>
                      </div>
                    )}

                    {data.surgery.admissionTime && (
                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground dark:text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400">{t.arrivalTime}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatTime(data.surgery.admissionTime)}</p>
                        </div>
                      </div>
                    )}

                    {data.surgery.procedure && (
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400">{t.procedure}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{data.surgery.procedure}</p>
                        </div>
                      </div>
                    )}

                    {data.surgery.surgeonName && (
                      <div className="flex items-start gap-3">
                        <UserRound className="h-4 w-4 text-muted-foreground dark:text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400">{t.surgeon}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{data.surgery.surgeonName}</p>
                        </div>
                      </div>
                    )}

                    {data.surgery.roomName && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-muted-foreground dark:text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400">{t.location}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{data.surgery.roomName}</p>
                        </div>
                      </div>
                    )}

                    {data.surgery.anesthesiaType && (
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400">{t.anesthesiaType}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{getAnesthesiaTypeLabel(data.surgery.anesthesiaType)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Card */}
        {data.hospital.phone && (
          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mt-6" data-testid="card-contact">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-gray-100">
                <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t.contactUs}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground dark:text-gray-400 mb-2">{t.questions}</p>
              <a 
                href={`tel:${data.hospital.phone}`}
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium hover:underline"
                data-testid="link-phone"
              >
                <Phone className="h-4 w-4" />
                {data.hospital.phone}
              </a>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-sm text-muted-foreground dark:text-gray-500 pt-4 pb-8">
          &copy; {new Date().getFullYear()} {data.hospital.name}
        </div>
      </div>
    </div>
  );
}
