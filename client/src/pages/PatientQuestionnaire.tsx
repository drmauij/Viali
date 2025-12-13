import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Heart, 
  Pill, 
  AlertTriangle, 
  Cigarette, 
  Wine, 
  Stethoscope, 
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Check,
  Save,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  Info
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";

interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  reason?: string;
}

interface ConditionState {
  checked: boolean;
  notes?: string;
}

interface QuestionnaireConfig {
  linkId: string;
  language: string;
  patientFirstName?: string;
  patientSurname?: string;
  patientBirthday?: string;
  hospitalId: string;
  surgeryId?: string;
  existingResponse?: {
    id: string;
    patientFirstName?: string;
    patientLastName?: string;
    patientBirthday?: string;
    patientEmail?: string;
    patientPhone?: string;
    allergies?: string[];
    allergiesNotes?: string;
    medications?: Medication[];
    medicationsNotes?: string;
    conditions?: Record<string, ConditionState>;
    smokingStatus?: string;
    smokingDetails?: string;
    alcoholStatus?: string;
    alcoholDetails?: string;
    height?: string;
    weight?: string;
    previousSurgeries?: string;
    previousAnesthesiaProblems?: string;
    pregnancyStatus?: string;
    breastfeeding?: boolean;
    womanHealthNotes?: string;
    additionalNotes?: string;
    questionsForDoctor?: string;
    currentStep?: number;
    completedSteps?: string[];
  } | null;
  conditionsList: Array<{
    id: string;
    label: string;
    helpText?: string;
    category: string;
  }>;
  allergyList: Array<{
    id: string;
    label: string;
    helpText?: string;
  }>;
}

interface FormData {
  patientFirstName: string;
  patientLastName: string;
  patientBirthday: string;
  patientEmail: string;
  patientPhone: string;
  height: string;
  weight: string;
  allergies: string[];
  allergiesNotes: string;
  medications: Medication[];
  medicationsNotes: string;
  conditions: Record<string, ConditionState>;
  smokingStatus: string;
  smokingDetails: string;
  alcoholStatus: string;
  alcoholDetails: string;
  previousSurgeries: string;
  previousAnesthesiaProblems: string;
  pregnancyStatus: string;
  breastfeeding: boolean;
  womanHealthNotes: string;
  additionalNotes: string;
  questionsForDoctor: string;
  currentStep: number;
  completedSteps: string[];
}

const STEPS = [
  { id: "personal", icon: User, labelKey: "questionnaire.steps.personal" },
  { id: "conditions", icon: Heart, labelKey: "questionnaire.steps.conditions" },
  { id: "medications", icon: Pill, labelKey: "questionnaire.steps.medications" },
  { id: "allergies", icon: AlertTriangle, labelKey: "questionnaire.steps.allergies" },
  { id: "lifestyle", icon: Cigarette, labelKey: "questionnaire.steps.lifestyle" },
  { id: "history", icon: Stethoscope, labelKey: "questionnaire.steps.history" },
  { id: "notes", icon: MessageSquare, labelKey: "questionnaire.steps.notes" },
];

const translations: Record<string, Record<string, string>> = {
  en: {
    "questionnaire.title": "Pre-Operative Questionnaire",
    "questionnaire.subtitle": "Please complete this form before your surgery",
    "questionnaire.steps.personal": "Personal Info",
    "questionnaire.steps.conditions": "Medical Conditions",
    "questionnaire.steps.medications": "Medications",
    "questionnaire.steps.allergies": "Allergies",
    "questionnaire.steps.lifestyle": "Lifestyle",
    "questionnaire.steps.history": "Medical History",
    "questionnaire.steps.notes": "Additional Notes",
    "questionnaire.personal.firstName": "First Name",
    "questionnaire.personal.lastName": "Last Name",
    "questionnaire.personal.birthday": "Date of Birth",
    "questionnaire.personal.email": "Email (optional)",
    "questionnaire.personal.phone": "Phone (optional)",
    "questionnaire.personal.height": "Height (cm)",
    "questionnaire.personal.weight": "Weight (kg)",
    "questionnaire.conditions.title": "Do you have any of the following conditions?",
    "questionnaire.conditions.notes": "Additional details",
    "questionnaire.medications.title": "Current Medications",
    "questionnaire.medications.subtitle": "List all medications you are currently taking",
    "questionnaire.medications.name": "Medication Name",
    "questionnaire.medications.dosage": "Dosage",
    "questionnaire.medications.frequency": "How often",
    "questionnaire.medications.reason": "Reason/Condition",
    "questionnaire.medications.add": "Add Medication",
    "questionnaire.medications.notes": "Additional notes about medications",
    "questionnaire.allergies.title": "Allergies",
    "questionnaire.allergies.subtitle": "Do you have any allergies to medications, foods, or other substances?",
    "questionnaire.allergies.none": "No known allergies",
    "questionnaire.allergies.notes": "Please describe your allergies and reactions",
    "questionnaire.lifestyle.smoking.title": "Smoking",
    "questionnaire.lifestyle.smoking.never": "Never smoked",
    "questionnaire.lifestyle.smoking.former": "Former smoker",
    "questionnaire.lifestyle.smoking.current": "Current smoker",
    "questionnaire.lifestyle.smoking.details": "How much/how long?",
    "questionnaire.lifestyle.alcohol.title": "Alcohol Consumption",
    "questionnaire.lifestyle.alcohol.never": "Never",
    "questionnaire.lifestyle.alcohol.occasional": "Occasional (1-2 drinks/week)",
    "questionnaire.lifestyle.alcohol.moderate": "Moderate (3-7 drinks/week)",
    "questionnaire.lifestyle.alcohol.heavy": "Heavy (more than 7 drinks/week)",
    "questionnaire.lifestyle.alcohol.details": "Additional details",
    "questionnaire.history.surgeries": "Previous Surgeries",
    "questionnaire.history.surgeriesHint": "Please list any previous surgeries with approximate dates",
    "questionnaire.history.anesthesia": "Previous Anesthesia Problems",
    "questionnaire.history.anesthesiaHint": "Have you or any family members had problems with anesthesia?",
    "questionnaire.history.pregnancy": "Pregnancy Status",
    "questionnaire.history.pregnancy.notApplicable": "Not applicable",
    "questionnaire.history.pregnancy.no": "Not pregnant",
    "questionnaire.history.pregnancy.possible": "Possibly pregnant",
    "questionnaire.history.pregnancy.yes": "Pregnant",
    "questionnaire.history.breastfeeding": "Currently breastfeeding",
    "questionnaire.history.womanNotes": "Additional information",
    "questionnaire.notes.additional": "Additional Notes",
    "questionnaire.notes.additionalHint": "Any other information you think is important",
    "questionnaire.notes.questions": "Questions for Your Doctor",
    "questionnaire.notes.questionsHint": "Do you have any questions or concerns about your procedure?",
    "questionnaire.nav.back": "Back",
    "questionnaire.nav.next": "Next",
    "questionnaire.nav.submit": "Submit Questionnaire",
    "questionnaire.nav.submitting": "Submitting...",
    "questionnaire.saving": "Saving...",
    "questionnaire.saved": "Saved",
    "questionnaire.error.load": "Failed to load questionnaire",
    "questionnaire.error.expired": "This questionnaire link has expired",
    "questionnaire.error.submitted": "This questionnaire has already been submitted",
    "questionnaire.error.notFound": "Questionnaire not found",
    "questionnaire.error.save": "Failed to save progress",
    "questionnaire.error.submit": "Failed to submit questionnaire",
    "questionnaire.success.title": "Thank You!",
    "questionnaire.success.message": "Your questionnaire has been submitted successfully. Your medical team will review your information before your procedure.",
    "questionnaire.success.close": "You can close this page now.",
    "questionnaire.review.title": "Review Your Information",
    "questionnaire.review.edit": "Edit",
  },
  de: {
    "questionnaire.title": "Präoperativer Fragebogen",
    "questionnaire.subtitle": "Bitte füllen Sie dieses Formular vor Ihrer Operation aus",
    "questionnaire.steps.personal": "Persönliche Daten",
    "questionnaire.steps.conditions": "Erkrankungen",
    "questionnaire.steps.medications": "Medikamente",
    "questionnaire.steps.allergies": "Allergien",
    "questionnaire.steps.lifestyle": "Lebensstil",
    "questionnaire.steps.history": "Krankengeschichte",
    "questionnaire.steps.notes": "Zusätzliche Hinweise",
    "questionnaire.personal.firstName": "Vorname",
    "questionnaire.personal.lastName": "Nachname",
    "questionnaire.personal.birthday": "Geburtsdatum",
    "questionnaire.personal.email": "E-Mail (optional)",
    "questionnaire.personal.phone": "Telefon (optional)",
    "questionnaire.personal.height": "Größe (cm)",
    "questionnaire.personal.weight": "Gewicht (kg)",
    "questionnaire.conditions.title": "Haben Sie eine der folgenden Erkrankungen?",
    "questionnaire.conditions.notes": "Zusätzliche Details",
    "questionnaire.medications.title": "Aktuelle Medikamente",
    "questionnaire.medications.subtitle": "Listen Sie alle Medikamente auf, die Sie derzeit einnehmen",
    "questionnaire.medications.name": "Medikamentenname",
    "questionnaire.medications.dosage": "Dosierung",
    "questionnaire.medications.frequency": "Wie oft",
    "questionnaire.medications.reason": "Grund/Erkrankung",
    "questionnaire.medications.add": "Medikament hinzufügen",
    "questionnaire.medications.notes": "Zusätzliche Hinweise zu Medikamenten",
    "questionnaire.allergies.title": "Allergien",
    "questionnaire.allergies.subtitle": "Haben Sie Allergien gegen Medikamente, Nahrungsmittel oder andere Substanzen?",
    "questionnaire.allergies.none": "Keine bekannten Allergien",
    "questionnaire.allergies.notes": "Bitte beschreiben Sie Ihre Allergien und Reaktionen",
    "questionnaire.lifestyle.smoking.title": "Rauchen",
    "questionnaire.lifestyle.smoking.never": "Nie geraucht",
    "questionnaire.lifestyle.smoking.former": "Ehemaliger Raucher",
    "questionnaire.lifestyle.smoking.current": "Aktueller Raucher",
    "questionnaire.lifestyle.smoking.details": "Wie viel/wie lange?",
    "questionnaire.lifestyle.alcohol.title": "Alkoholkonsum",
    "questionnaire.lifestyle.alcohol.never": "Nie",
    "questionnaire.lifestyle.alcohol.occasional": "Gelegentlich (1-2 Getränke/Woche)",
    "questionnaire.lifestyle.alcohol.moderate": "Mäßig (3-7 Getränke/Woche)",
    "questionnaire.lifestyle.alcohol.heavy": "Viel (mehr als 7 Getränke/Woche)",
    "questionnaire.lifestyle.alcohol.details": "Zusätzliche Details",
    "questionnaire.history.surgeries": "Frühere Operationen",
    "questionnaire.history.surgeriesHint": "Bitte listen Sie frühere Operationen mit ungefährem Datum auf",
    "questionnaire.history.anesthesia": "Frühere Narkoseprobleme",
    "questionnaire.history.anesthesiaHint": "Hatten Sie oder Familienmitglieder Probleme mit der Narkose?",
    "questionnaire.history.pregnancy": "Schwangerschaftsstatus",
    "questionnaire.history.pregnancy.notApplicable": "Nicht zutreffend",
    "questionnaire.history.pregnancy.no": "Nicht schwanger",
    "questionnaire.history.pregnancy.possible": "Möglicherweise schwanger",
    "questionnaire.history.pregnancy.yes": "Schwanger",
    "questionnaire.history.breastfeeding": "Stillt derzeit",
    "questionnaire.history.womanNotes": "Zusätzliche Informationen",
    "questionnaire.notes.additional": "Zusätzliche Hinweise",
    "questionnaire.notes.additionalHint": "Sonstige Informationen, die Sie für wichtig halten",
    "questionnaire.notes.questions": "Fragen an Ihren Arzt",
    "questionnaire.notes.questionsHint": "Haben Sie Fragen oder Bedenken zu Ihrem Eingriff?",
    "questionnaire.nav.back": "Zurück",
    "questionnaire.nav.next": "Weiter",
    "questionnaire.nav.submit": "Fragebogen absenden",
    "questionnaire.nav.submitting": "Wird gesendet...",
    "questionnaire.saving": "Speichern...",
    "questionnaire.saved": "Gespeichert",
    "questionnaire.error.load": "Fragebogen konnte nicht geladen werden",
    "questionnaire.error.expired": "Dieser Fragebogenlink ist abgelaufen",
    "questionnaire.error.submitted": "Dieser Fragebogen wurde bereits eingereicht",
    "questionnaire.error.notFound": "Fragebogen nicht gefunden",
    "questionnaire.error.save": "Fortschritt konnte nicht gespeichert werden",
    "questionnaire.error.submit": "Fragebogen konnte nicht gesendet werden",
    "questionnaire.success.title": "Vielen Dank!",
    "questionnaire.success.message": "Ihr Fragebogen wurde erfolgreich übermittelt. Ihr medizinisches Team wird Ihre Informationen vor Ihrem Eingriff überprüfen.",
    "questionnaire.success.close": "Sie können diese Seite jetzt schließen.",
    "questionnaire.review.title": "Überprüfen Sie Ihre Angaben",
    "questionnaire.review.edit": "Bearbeiten",
  },
};

export default function PatientQuestionnaire() {
  const { token } = useParams<{ token: string }>();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [language, setLanguage] = useState<string>("de");

  const t = useCallback((key: string) => {
    return translations[language]?.[key] || translations["en"]?.[key] || key;
  }, [language]);

  const [formData, setFormData] = useState<FormData>({
    patientFirstName: "",
    patientLastName: "",
    patientBirthday: "",
    patientEmail: "",
    patientPhone: "",
    height: "",
    weight: "",
    allergies: [],
    allergiesNotes: "",
    medications: [],
    medicationsNotes: "",
    conditions: {},
    smokingStatus: "",
    smokingDetails: "",
    alcoholStatus: "",
    alcoholDetails: "",
    previousSurgeries: "",
    previousAnesthesiaProblems: "",
    pregnancyStatus: "",
    breastfeeding: false,
    womanHealthNotes: "",
    additionalNotes: "",
    questionsForDoctor: "",
    currentStep: 0,
    completedSteps: [],
  });

  const { data: config, isLoading, error } = useQuery<QuestionnaireConfig>({
    queryKey: ["/api/public/questionnaire", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/questionnaire/${token}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to load questionnaire");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (config) {
      setLanguage(config.language || "de");
      i18n.changeLanguage(config.language || "de");

      const existing = config.existingResponse;
      setFormData({
        patientFirstName: existing?.patientFirstName || config.patientFirstName || "",
        patientLastName: existing?.patientLastName || config.patientSurname || "",
        patientBirthday: existing?.patientBirthday || config.patientBirthday || "",
        patientEmail: existing?.patientEmail || "",
        patientPhone: existing?.patientPhone || "",
        height: existing?.height || "",
        weight: existing?.weight || "",
        allergies: existing?.allergies || [],
        allergiesNotes: existing?.allergiesNotes || "",
        medications: existing?.medications || [],
        medicationsNotes: existing?.medicationsNotes || "",
        conditions: existing?.conditions || {},
        smokingStatus: existing?.smokingStatus || "",
        smokingDetails: existing?.smokingDetails || "",
        alcoholStatus: existing?.alcoholStatus || "",
        alcoholDetails: existing?.alcoholDetails || "",
        previousSurgeries: existing?.previousSurgeries || "",
        previousAnesthesiaProblems: existing?.previousAnesthesiaProblems || "",
        pregnancyStatus: existing?.pregnancyStatus || "",
        breastfeeding: existing?.breastfeeding || false,
        womanHealthNotes: existing?.womanHealthNotes || "",
        additionalNotes: existing?.additionalNotes || "",
        questionsForDoctor: existing?.questionsForDoctor || "",
        currentStep: existing?.currentStep || 0,
        completedSteps: existing?.completedSteps || [],
      });
      if (existing?.currentStep) {
        setCurrentStep(existing.currentStep);
      }
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<FormData>) => {
      const res = await fetch(`/api/public/questionnaire/${token}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to save");
      }
      return res.json();
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => setSaveStatus("error"),
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch(`/api/public/questionnaire/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to submit");
      }
      return res.json();
    },
    onSuccess: () => setIsSubmitted(true),
  });

  const handleNext = useCallback(() => {
    const stepId = STEPS[currentStep].id;
    const newCompletedSteps = formData.completedSteps.includes(stepId) 
      ? formData.completedSteps 
      : [...formData.completedSteps, stepId];
    const newStep = currentStep + 1;
    
    setFormData(prev => ({
      ...prev,
      currentStep: newStep,
      completedSteps: newCompletedSteps,
    }));
    setCurrentStep(newStep);

    saveMutation.mutate({
      ...formData,
      currentStep: newStep,
      completedSteps: newCompletedSteps,
    });
  }, [currentStep, formData, saveMutation]);

  const handleBack = useCallback(() => {
    const newStep = currentStep - 1;
    setCurrentStep(newStep);
    setFormData(prev => ({ ...prev, currentStep: newStep }));
  }, [currentStep]);

  const handleSubmit = useCallback(() => {
    submitMutation.mutate(formData);
  }, [formData, submitMutation]);

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">{t("questionnaire.success.title")}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t("questionnaire.success.message")}
            </p>
            <p className="text-sm text-gray-500">
              {t("questionnaire.success.close")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-4 pb-24">
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">{t("questionnaire.title")}</CardTitle>
            <CardDescription>{t("questionnaire.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="h-2 mb-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{STEPS[currentStep].id === "personal" ? t(STEPS[currentStep].labelKey) : `${currentStep + 1}/${STEPS.length}`}</span>
              <span>
                {saveStatus === "saving" && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("questionnaire.saving")}
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="flex items-center gap-1 text-green-600">
                    <Check className="h-3 w-3" />
                    {t("questionnaire.saved")}
                  </span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex overflow-x-auto gap-2 mb-4 pb-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = formData.completedSteps.includes(step.id);
            const isCurrent = index === currentStep;
            return (
              <button
                key={step.id}
                onClick={() => {
                  if (isCompleted || index <= currentStep) {
                    setCurrentStep(index);
                  }
                }}
                disabled={!isCompleted && index > currentStep}
                className={`flex-shrink-0 flex flex-col items-center p-2 rounded-lg transition-colors ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                }`}
                data-testid={`step-${step.id}`}
              >
                {isCompleted && !isCurrent ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span className="text-xs mt-1 whitespace-nowrap">{t(step.labelKey)}</span>
              </button>
            );
          })}
        </div>

        <Card>
          <CardContent className="pt-6">
            {currentStep === 0 && (
              <PersonalInfoStep
                formData={formData}
                updateField={updateField}
                t={t}
              />
            )}
            {currentStep === 1 && config && (
              <ConditionsStep
                formData={formData}
                updateField={updateField}
                conditions={config.conditionsList}
                t={t}
              />
            )}
            {currentStep === 2 && (
              <MedicationsStep
                formData={formData}
                updateField={updateField}
                t={t}
              />
            )}
            {currentStep === 3 && config && (
              <AllergiesStep
                formData={formData}
                updateField={updateField}
                allergyList={config.allergyList}
                t={t}
              />
            )}
            {currentStep === 4 && (
              <LifestyleStep
                formData={formData}
                updateField={updateField}
                t={t}
              />
            )}
            {currentStep === 5 && (
              <HistoryStep
                formData={formData}
                updateField={updateField}
                t={t}
              />
            )}
            {currentStep === 6 && (
              <NotesStep
                formData={formData}
                updateField={updateField}
                t={t}
              />
            )}
          </CardContent>
        </Card>

        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t p-4 shadow-lg">
          <div className="max-w-2xl mx-auto flex gap-3">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
                data-testid="button-back"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("questionnaire.nav.back")}
              </Button>
            )}
            {currentStep < STEPS.length - 1 ? (
              <Button
                onClick={handleNext}
                className="flex-1"
                data-testid="button-next"
              >
                {t("questionnaire.nav.next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={submitMutation.isPending}
                data-testid="button-submit"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("questionnaire.nav.submitting")}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t("questionnaire.nav.submit")}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  formData: FormData;
  updateField: <K extends keyof FormData>(field: K, value: FormData[K]) => void;
  t: (key: string) => string;
}

function PersonalInfoStep({ formData, updateField, t }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName">{t("questionnaire.personal.firstName")}</Label>
          <Input
            id="firstName"
            value={formData.patientFirstName}
            onChange={(e) => updateField("patientFirstName", e.target.value)}
            data-testid="input-firstName"
          />
        </div>
        <div>
          <Label htmlFor="lastName">{t("questionnaire.personal.lastName")}</Label>
          <Input
            id="lastName"
            value={formData.patientLastName}
            onChange={(e) => updateField("patientLastName", e.target.value)}
            data-testid="input-lastName"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="birthday">{t("questionnaire.personal.birthday")}</Label>
        <Input
          id="birthday"
          type="date"
          value={formData.patientBirthday}
          onChange={(e) => updateField("patientBirthday", e.target.value)}
          data-testid="input-birthday"
        />
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="email">{t("questionnaire.personal.email")}</Label>
          <Input
            id="email"
            type="email"
            value={formData.patientEmail}
            onChange={(e) => updateField("patientEmail", e.target.value)}
            data-testid="input-email"
          />
        </div>
        <div>
          <Label htmlFor="phone">{t("questionnaire.personal.phone")}</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.patientPhone}
            onChange={(e) => updateField("patientPhone", e.target.value)}
            data-testid="input-phone"
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="height">{t("questionnaire.personal.height")}</Label>
          <Input
            id="height"
            type="number"
            value={formData.height}
            onChange={(e) => updateField("height", e.target.value)}
            placeholder="170"
            data-testid="input-height"
          />
        </div>
        <div>
          <Label htmlFor="weight">{t("questionnaire.personal.weight")}</Label>
          <Input
            id="weight"
            type="number"
            value={formData.weight}
            onChange={(e) => updateField("weight", e.target.value)}
            placeholder="70"
            data-testid="input-weight"
          />
        </div>
      </div>
    </div>
  );
}

interface ConditionsStepProps extends StepProps {
  conditions: Array<{ id: string; label: string; helpText?: string; category: string }>;
}

function ConditionsStep({ formData, updateField, conditions, t }: ConditionsStepProps) {
  const groupedConditions = conditions.reduce((acc, condition) => {
    if (!acc[condition.category]) {
      acc[condition.category] = [];
    }
    acc[condition.category].push(condition);
    return acc;
  }, {} as Record<string, typeof conditions>);

  const toggleCondition = (id: string) => {
    const current = formData.conditions[id] || { checked: false };
    updateField("conditions", {
      ...formData.conditions,
      [id]: { ...current, checked: !current.checked },
    });
  };

  const updateConditionNotes = (id: string, notes: string) => {
    const current = formData.conditions[id] || { checked: true };
    updateField("conditions", {
      ...formData.conditions,
      [id]: { ...current, notes },
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t("questionnaire.conditions.title")}
      </p>

      {Object.entries(groupedConditions).map(([category, items]) => (
        <div key={category}>
          <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 capitalize">
            {category}
          </h3>
          <div className="space-y-2">
            {items.map((condition) => {
              const state = formData.conditions[condition.id];
              return (
                <div key={condition.id} className="border rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`condition-${condition.id}`}
                      checked={state?.checked || false}
                      onCheckedChange={() => toggleCondition(condition.id)}
                      data-testid={`checkbox-condition-${condition.id}`}
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={`condition-${condition.id}`}
                        className="font-normal cursor-pointer"
                      >
                        {condition.label}
                      </Label>
                      {condition.helpText && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          {condition.helpText}
                        </p>
                      )}
                    </div>
                  </div>
                  {state?.checked && (
                    <div className="mt-2 pl-6">
                      <Input
                        placeholder={t("questionnaire.conditions.notes")}
                        value={state.notes || ""}
                        onChange={(e) => updateConditionNotes(condition.id, e.target.value)}
                        className="text-sm"
                        data-testid={`input-condition-notes-${condition.id}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MedicationsStep({ formData, updateField, t }: StepProps) {
  const addMedication = () => {
    updateField("medications", [
      ...formData.medications,
      { name: "", dosage: "", frequency: "", reason: "" },
    ]);
  };

  const removeMedication = (index: number) => {
    updateField(
      "medications",
      formData.medications.filter((_, i) => i !== index)
    );
  };

  const updateMedication = (index: number, field: keyof Medication, value: string) => {
    const updated = [...formData.medications];
    updated[index] = { ...updated[index], [field]: value };
    updateField("medications", updated);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t("questionnaire.medications.title")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("questionnaire.medications.subtitle")}
        </p>
      </div>

      {formData.medications.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed rounded-lg">
          <Pill className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 mb-3">No medications added</p>
          <Button variant="outline" onClick={addMedication} data-testid="button-add-medication">
            <Plus className="h-4 w-4 mr-1" />
            {t("questionnaire.medications.add")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {formData.medications.map((med, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMedication(index)}
                  className="h-8 w-8 p-0 text-red-500"
                  data-testid={`button-remove-medication-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  placeholder={t("questionnaire.medications.name")}
                  value={med.name}
                  onChange={(e) => updateMedication(index, "name", e.target.value)}
                  data-testid={`input-medication-name-${index}`}
                />
                <Input
                  placeholder={t("questionnaire.medications.dosage")}
                  value={med.dosage || ""}
                  onChange={(e) => updateMedication(index, "dosage", e.target.value)}
                  data-testid={`input-medication-dosage-${index}`}
                />
                <Input
                  placeholder={t("questionnaire.medications.frequency")}
                  value={med.frequency || ""}
                  onChange={(e) => updateMedication(index, "frequency", e.target.value)}
                  data-testid={`input-medication-frequency-${index}`}
                />
                <Input
                  placeholder={t("questionnaire.medications.reason")}
                  value={med.reason || ""}
                  onChange={(e) => updateMedication(index, "reason", e.target.value)}
                  data-testid={`input-medication-reason-${index}`}
                />
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addMedication} className="w-full" data-testid="button-add-medication">
            <Plus className="h-4 w-4 mr-1" />
            {t("questionnaire.medications.add")}
          </Button>
        </div>
      )}

      <div>
        <Label htmlFor="medicationsNotes">{t("questionnaire.medications.notes")}</Label>
        <Textarea
          id="medicationsNotes"
          value={formData.medicationsNotes}
          onChange={(e) => updateField("medicationsNotes", e.target.value)}
          rows={3}
          data-testid="input-medications-notes"
        />
      </div>
    </div>
  );
}

interface AllergiesStepProps extends StepProps {
  allergyList: Array<{ id: string; label: string; helpText?: string }>;
}

function AllergiesStep({ formData, updateField, allergyList, t }: AllergiesStepProps) {
  const toggleAllergy = (id: string) => {
    const current = formData.allergies;
    if (current.includes(id)) {
      updateField("allergies", current.filter((a) => a !== id));
    } else {
      updateField("allergies", [...current, id]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t("questionnaire.allergies.title")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("questionnaire.allergies.subtitle")}
        </p>
      </div>

      {allergyList.length > 0 && (
        <div className="space-y-2">
          {allergyList.map((allergy) => (
            <div key={allergy.id} className="flex items-start gap-3 p-2 border rounded">
              <Checkbox
                id={`allergy-${allergy.id}`}
                checked={formData.allergies.includes(allergy.id)}
                onCheckedChange={() => toggleAllergy(allergy.id)}
                data-testid={`checkbox-allergy-${allergy.id}`}
              />
              <div>
                <Label htmlFor={`allergy-${allergy.id}`} className="font-normal cursor-pointer">
                  {allergy.label}
                </Label>
                {allergy.helpText && (
                  <p className="text-xs text-gray-500">{allergy.helpText}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <Label htmlFor="allergiesNotes">{t("questionnaire.allergies.notes")}</Label>
        <Textarea
          id="allergiesNotes"
          value={formData.allergiesNotes}
          onChange={(e) => updateField("allergiesNotes", e.target.value)}
          rows={4}
          placeholder={t("questionnaire.allergies.notes")}
          data-testid="input-allergies-notes"
        />
      </div>
    </div>
  );
}

function LifestyleStep({ formData, updateField, t }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">{t("questionnaire.lifestyle.smoking.title")}</h3>
        <RadioGroup
          value={formData.smokingStatus}
          onValueChange={(value) => updateField("smokingStatus", value)}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="never" id="smoking-never" data-testid="radio-smoking-never" />
              <Label htmlFor="smoking-never" className="font-normal cursor-pointer">
                {t("questionnaire.lifestyle.smoking.never")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="former" id="smoking-former" data-testid="radio-smoking-former" />
              <Label htmlFor="smoking-former" className="font-normal cursor-pointer">
                {t("questionnaire.lifestyle.smoking.former")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="current" id="smoking-current" data-testid="radio-smoking-current" />
              <Label htmlFor="smoking-current" className="font-normal cursor-pointer">
                {t("questionnaire.lifestyle.smoking.current")}
              </Label>
            </div>
          </div>
        </RadioGroup>
        {(formData.smokingStatus === "former" || formData.smokingStatus === "current") && (
          <div className="mt-3">
            <Input
              placeholder={t("questionnaire.lifestyle.smoking.details")}
              value={formData.smokingDetails}
              onChange={(e) => updateField("smokingDetails", e.target.value)}
              data-testid="input-smoking-details"
            />
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h3 className="font-semibold mb-3">{t("questionnaire.lifestyle.alcohol.title")}</h3>
        <RadioGroup
          value={formData.alcoholStatus}
          onValueChange={(value) => updateField("alcoholStatus", value)}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="never" id="alcohol-never" data-testid="radio-alcohol-never" />
              <Label htmlFor="alcohol-never" className="font-normal cursor-pointer">
                {t("questionnaire.lifestyle.alcohol.never")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="occasional" id="alcohol-occasional" data-testid="radio-alcohol-occasional" />
              <Label htmlFor="alcohol-occasional" className="font-normal cursor-pointer">
                {t("questionnaire.lifestyle.alcohol.occasional")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="moderate" id="alcohol-moderate" data-testid="radio-alcohol-moderate" />
              <Label htmlFor="alcohol-moderate" className="font-normal cursor-pointer">
                {t("questionnaire.lifestyle.alcohol.moderate")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="heavy" id="alcohol-heavy" data-testid="radio-alcohol-heavy" />
              <Label htmlFor="alcohol-heavy" className="font-normal cursor-pointer">
                {t("questionnaire.lifestyle.alcohol.heavy")}
              </Label>
            </div>
          </div>
        </RadioGroup>
        {formData.alcoholStatus && formData.alcoholStatus !== "never" && (
          <div className="mt-3">
            <Input
              placeholder={t("questionnaire.lifestyle.alcohol.details")}
              value={formData.alcoholDetails}
              onChange={(e) => updateField("alcoholDetails", e.target.value)}
              data-testid="input-alcohol-details"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryStep({ formData, updateField, t }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="previousSurgeries">{t("questionnaire.history.surgeries")}</Label>
        <p className="text-xs text-gray-500 mb-2">{t("questionnaire.history.surgeriesHint")}</p>
        <Textarea
          id="previousSurgeries"
          value={formData.previousSurgeries}
          onChange={(e) => updateField("previousSurgeries", e.target.value)}
          rows={4}
          data-testid="input-previous-surgeries"
        />
      </div>

      <div>
        <Label htmlFor="anesthesiaProblems">{t("questionnaire.history.anesthesia")}</Label>
        <p className="text-xs text-gray-500 mb-2">{t("questionnaire.history.anesthesiaHint")}</p>
        <Textarea
          id="anesthesiaProblems"
          value={formData.previousAnesthesiaProblems}
          onChange={(e) => updateField("previousAnesthesiaProblems", e.target.value)}
          rows={4}
          data-testid="input-anesthesia-problems"
        />
      </div>

      <Separator />

      <div>
        <h3 className="font-semibold mb-3">{t("questionnaire.history.pregnancy")}</h3>
        <RadioGroup
          value={formData.pregnancyStatus}
          onValueChange={(value) => updateField("pregnancyStatus", value)}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="not_applicable" id="pregnancy-na" data-testid="radio-pregnancy-na" />
              <Label htmlFor="pregnancy-na" className="font-normal cursor-pointer">
                {t("questionnaire.history.pregnancy.notApplicable")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="no" id="pregnancy-no" data-testid="radio-pregnancy-no" />
              <Label htmlFor="pregnancy-no" className="font-normal cursor-pointer">
                {t("questionnaire.history.pregnancy.no")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="possible" id="pregnancy-possible" data-testid="radio-pregnancy-possible" />
              <Label htmlFor="pregnancy-possible" className="font-normal cursor-pointer">
                {t("questionnaire.history.pregnancy.possible")}
              </Label>
            </div>
            <div className="flex items-center gap-3 p-2 border rounded">
              <RadioGroupItem value="yes" id="pregnancy-yes" data-testid="radio-pregnancy-yes" />
              <Label htmlFor="pregnancy-yes" className="font-normal cursor-pointer">
                {t("questionnaire.history.pregnancy.yes")}
              </Label>
            </div>
          </div>
        </RadioGroup>

        {formData.pregnancyStatus && formData.pregnancyStatus !== "not_applicable" && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 p-2 border rounded">
              <Checkbox
                id="breastfeeding"
                checked={formData.breastfeeding}
                onCheckedChange={(checked) => updateField("breastfeeding", !!checked)}
                data-testid="checkbox-breastfeeding"
              />
              <Label htmlFor="breastfeeding" className="font-normal cursor-pointer">
                {t("questionnaire.history.breastfeeding")}
              </Label>
            </div>
            <div>
              <Label htmlFor="womanNotes">{t("questionnaire.history.womanNotes")}</Label>
              <Textarea
                id="womanNotes"
                value={formData.womanHealthNotes}
                onChange={(e) => updateField("womanHealthNotes", e.target.value)}
                rows={2}
                data-testid="input-woman-notes"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotesStep({ formData, updateField, t }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="additionalNotes">{t("questionnaire.notes.additional")}</Label>
        <p className="text-xs text-gray-500 mb-2">{t("questionnaire.notes.additionalHint")}</p>
        <Textarea
          id="additionalNotes"
          value={formData.additionalNotes}
          onChange={(e) => updateField("additionalNotes", e.target.value)}
          rows={4}
          data-testid="input-additional-notes"
        />
      </div>

      <div>
        <Label htmlFor="questionsForDoctor">{t("questionnaire.notes.questions")}</Label>
        <p className="text-xs text-gray-500 mb-2">{t("questionnaire.notes.questionsHint")}</p>
        <Textarea
          id="questionsForDoctor"
          value={formData.questionsForDoctor}
          onChange={(e) => updateField("questionsForDoctor", e.target.value)}
          rows={4}
          data-testid="input-questions-for-doctor"
        />
      </div>
    </div>
  );
}
