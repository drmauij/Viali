import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
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
  Moon
} from "lucide-react";

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
  } | null;
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
    yourSurgery: "Ihre Operation",
    date: "Datum",
    arrivalTime: "Ankunftszeit",
    location: "Standort",
    procedure: "Eingriff",
    anesthesiaType: "Narkoseart",
    fastingRules: "Nüchternheitsregeln",
    fastingTitle: "Wichtige Hinweise zur Nüchternheit",
    fastingNoFood: "Keine feste Nahrung ab 6 Stunden vor der OP",
    fastingLiquids: "Klare Flüssigkeiten (Wasser, Tee ohne Milch) bis 2 Stunden vorher erlaubt",
    fastingNoAlcohol: "Kein Alkohol 24 Stunden vor der OP",
    infoDocuments: "Informationsunterlagen",
    downloadFlyer: "Herunterladen",
    preOpQuestionnaire: "Präoperativer Fragebogen",
    questionnaireNotStarted: "Bitte füllen Sie den Fragebogen vor Ihrem Termin aus",
    questionnaireInProgress: "Fragebogen begonnen - bitte vervollständigen",
    questionnaireCompleted: "Fragebogen abgeschlossen",
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
  },
  en: {
    title: "Patient Portal",
    welcomePrefix: "Welcome",
    yourSurgery: "Your Surgery",
    date: "Date",
    arrivalTime: "Arrival Time",
    location: "Location",
    procedure: "Procedure",
    anesthesiaType: "Anesthesia Type",
    fastingRules: "Fasting Rules",
    fastingTitle: "Important Fasting Instructions",
    fastingNoFood: "No solid food 6 hours before surgery",
    fastingLiquids: "Clear liquids (water, tea without milk) allowed until 2 hours before",
    fastingNoAlcohol: "No alcohol 24 hours before surgery",
    infoDocuments: "Information Documents",
    downloadFlyer: "Download",
    preOpQuestionnaire: "Pre-Operative Questionnaire",
    questionnaireNotStarted: "Please complete the questionnaire before your appointment",
    questionnaireInProgress: "Questionnaire started - please complete",
    questionnaireCompleted: "Questionnaire completed",
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
        throw new Error(err.message || 'Failed to load');
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
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
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500 dark:text-amber-400 mb-4" />
            <p className="text-lg font-medium text-center text-gray-900 dark:text-gray-100">
              {isExpired ? t.linkExpired : isNotFound ? t.linkNotFound : t.error}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const patientName = data.patient 
    ? `${data.patient.firstName} ${data.patient.surname}` 
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
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

        <Card className="border-blue-200 dark:border-blue-800 shadow-md bg-white dark:bg-gray-800">
          <CardHeader className="pb-3 bg-blue-50 dark:bg-blue-900/30 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Building2 className="h-5 w-5" />
              {data.hospital.name}
            </CardTitle>
          </CardHeader>
        </Card>

        {data.surgery && (
          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" data-testid="card-surgery-info">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-gray-100">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t.yourSurgery}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground dark:text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">{t.date}</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(data.surgery.plannedDate)}</p>
                </div>
              </div>
              
              {data.surgery.admissionTime && (
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground dark:text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-gray-400">{t.arrivalTime}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{formatTime(data.surgery.admissionTime)}</p>
                  </div>
                </div>
              )}
              
              {data.surgery.roomName && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground dark:text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-gray-400">{t.location}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{data.surgery.roomName}</p>
                  </div>
                </div>
              )}
              
              {data.surgery.procedure && (
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground dark:text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-gray-400">{t.procedure}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{data.surgery.procedure}</p>
                  </div>
                </div>
              )}
              
              {data.surgery.anesthesiaType && (
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground dark:text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-gray-400">{t.anesthesiaType}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{getAnesthesiaTypeLabel(data.surgery.anesthesiaType)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="shadow-md border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800" data-testid="card-fasting-rules">
          <CardHeader className="pb-2 bg-amber-50 dark:bg-amber-900/30 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-lg text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
              {t.fastingTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mt-2" />
                <span className="text-gray-900 dark:text-gray-100">{t.fastingNoFood}</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mt-2" />
                <span className="text-gray-900 dark:text-gray-100">{t.fastingLiquids}</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mt-2" />
                <span className="text-gray-900 dark:text-gray-100">{t.fastingNoAlcohol}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" data-testid="card-questionnaire">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-gray-100">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t.preOpQuestionnaire}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {data.questionnaireStatus === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
              ) : data.questionnaireStatus === 'in_progress' ? (
                <Circle className="h-5 w-5 text-amber-500 dark:text-amber-400 fill-amber-100 dark:fill-amber-900" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground dark:text-gray-400" />
              )}
              <span className={data.questionnaireStatus === 'completed' ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground dark:text-gray-400'}>
                {data.questionnaireStatus === 'completed' 
                  ? t.questionnaireCompleted 
                  : data.questionnaireStatus === 'in_progress'
                    ? t.questionnaireInProgress
                    : t.questionnaireNotStarted}
              </span>
            </div>
            
            <Button 
              className="w-full"
              variant={data.questionnaireStatus === 'completed' ? 'outline' : 'default'}
              onClick={() => navigate(data.questionnaireUrl)}
              data-testid="button-questionnaire"
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              {data.questionnaireStatus === 'completed' 
                ? t.viewQuestionnaire 
                : data.questionnaireStatus === 'in_progress'
                  ? t.continueQuestionnaire
                  : t.fillQuestionnaire}
            </Button>
          </CardContent>
        </Card>

        {data.flyers.length > 0 && (
          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" data-testid="card-info-flyers">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-gray-100">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t.infoDocuments}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.flyers.map((flyer, index) => (
                <a
                  key={index}
                  href={flyer.downloadUrl || flyer.flyerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-muted/50 dark:hover:bg-gray-700/50 transition-colors"
                  data-testid={`link-flyer-${index}`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                    <span className="text-gray-900 dark:text-gray-100">{flyer.unitName}</span>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                </a>
              ))}
            </CardContent>
          </Card>
        )}

        {data.hospital.phone && (
          <Card className="shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" data-testid="card-contact">
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
