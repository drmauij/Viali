import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
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
  Info,
  Paperclip,
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  Globe,
  Camera,
  ArrowLeft,
  Home,
  FileCheck,
  Calendar,
  Shield
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
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

interface FileUpload {
  id: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  category: 'medication_list' | 'diagnosis' | 'exam_result' | 'other';
  description?: string;
  isUploading?: boolean;
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
    labelDe?: string;
    labelEn?: string;
    helpText?: string;
    category: string;
  }>;
  allergyList: Array<{
    id: string;
    label: string;
    labelDe?: string;
    labelEn?: string;
    helpText?: string;
  }>;
  medicationsList?: Array<{
    id: string;
    label: string;
    category: string;
  }>;
  existingUploads?: Array<{
    id: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
    category: 'medication_list' | 'diagnosis' | 'exam_result' | 'other';
    description?: string;
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
  drugUse: Record<string, boolean>;
  drugUseDetails: string;
  previousSurgeries: string;
  previousAnesthesiaProblems: string;
  // Dental status (matches schema field name: dentalIssues)
  dentalIssues: Record<string, boolean>;
  dentalNotes: string;
  // PONV & Transfusion (matches schema field name: ponvTransfusionIssues)
  ponvTransfusionIssues: Record<string, boolean>;
  ponvTransfusionNotes: string;
  // Outpatient care
  outpatientCaregiverFirstName: string;
  outpatientCaregiverLastName: string;
  outpatientCaregiverPhone: string;
  pregnancyStatus: string;
  breastfeeding: boolean;
  womanHealthNotes: string;
  additionalNotes: string;
  questionsForDoctor: string;
  // Submission
  submissionDate: string;
  signature: string;
  privacyConsent: boolean;
  smsConsent: boolean;
  currentStep: number;
  completedSteps: string[];
}

const STEPS = [
  { id: "personal", icon: User, labelKey: "questionnaire.steps.personal" },
  { id: "allergies", icon: AlertTriangle, labelKey: "questionnaire.steps.allergies" },
  { id: "conditions", icon: Heart, labelKey: "questionnaire.steps.conditions" },
  { id: "medications", icon: Pill, labelKey: "questionnaire.steps.medications" },
  { id: "lifestyle", icon: Cigarette, labelKey: "questionnaire.steps.lifestyle" },
  { id: "uploads", icon: Paperclip, labelKey: "questionnaire.steps.uploads" },
  { id: "notes", icon: MessageSquare, labelKey: "questionnaire.steps.notes" },
  { id: "submit", icon: FileCheck, labelKey: "questionnaire.steps.submit" },
];

const translations: Record<string, Record<string, string>> = {
  en: {
    "questionnaire.title": "Pre-Operative Questionnaire",
    "questionnaire.subtitle": "Please complete this form before your surgery",
    "questionnaire.start": "Start Questionnaire",
    "questionnaire.starting": "Starting...",
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
    "questionnaire.personal.phone": "Phone",
    "questionnaire.personal.height": "Height (cm)",
    "questionnaire.personal.weight": "Weight (kg)",
    "questionnaire.conditions.title": "Do you have any of the following conditions?",
    "questionnaire.conditions.notes": "Additional details",
    "questionnaire.medications.title": "Current Medications",
    "questionnaire.medications.subtitle": "List all medications you are currently taking",
    "questionnaire.medications.selectFromList": "Select from common medications",
    "questionnaire.medications.orAddCustom": "Or add a custom medication",
    "questionnaire.medications.name": "Medication Name",
    "questionnaire.medications.dosage": "Dosage",
    "questionnaire.medications.frequency": "How often",
    "questionnaire.medications.reason": "Reason/Condition",
    "questionnaire.medications.add": "Add Medication",
    "questionnaire.medications.addCustom": "Add Custom Medication",
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
    "questionnaire.lifestyle.drugs.title": "Drug Use",
    "questionnaire.lifestyle.drugs.subtitle": "Have you ever used any of the following substances (currently or in the past)?",
    "questionnaire.lifestyle.drugs.thc": "Cannabis (THC)",
    "questionnaire.lifestyle.drugs.cocaine": "Cocaine",
    "questionnaire.lifestyle.drugs.heroin": "Heroin/Opioids",
    "questionnaire.lifestyle.drugs.mdma": "MDMA/Ecstasy",
    "questionnaire.lifestyle.drugs.other": "Other substances",
    "questionnaire.lifestyle.drugs.details": "Please provide details (when, how often)",
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
    "questionnaire.history.dental.title": "Dental Status",
    "questionnaire.history.dental.subtitle": "Please indicate any dental issues",
    "questionnaire.history.dental.dentures": "Dentures (full or partial)",
    "questionnaire.history.dental.crowns": "Dental crowns or bridges",
    "questionnaire.history.dental.implants": "Dental implants",
    "questionnaire.history.dental.looseTeeth": "Loose teeth",
    "questionnaire.history.dental.damagedTeeth": "Damaged or fragile teeth",
    "questionnaire.history.dental.notes": "Additional dental notes",
    "questionnaire.history.ponv.title": "Previous Reactions",
    "questionnaire.history.ponv.subtitle": "Have you experienced any of the following?",
    "questionnaire.history.ponv.ponvPrevious": "Nausea/vomiting after anesthesia",
    "questionnaire.history.ponv.ponvFamily": "Family history of anesthesia problems",
    "questionnaire.history.ponv.bloodTransfusion": "Previous blood transfusion",
    "questionnaire.history.ponv.transfusionReaction": "Reaction to blood products",
    "questionnaire.history.ponv.notes": "Additional details",
    "questionnaire.history.outpatient.title": "Outpatient Care Contact",
    "questionnaire.history.outpatient.subtitle": "For ambulatory procedures: Who will accompany you home?",
    "questionnaire.history.outpatient.firstName": "First Name",
    "questionnaire.history.outpatient.lastName": "Last Name",
    "questionnaire.history.outpatient.phone": "Phone Number",
    "questionnaire.uploads.title": "Document Uploads",
    "questionnaire.uploads.subtitle": "Upload photos of medication lists, diagnoses, or test results (optional)",
    "questionnaire.uploads.selectFiles": "Select Files",
    "questionnaire.uploads.dragDrop": "or drag and drop files here",
    "questionnaire.uploads.supportedFormats": "Supported: Images (JPG, PNG), PDF documents",
    "questionnaire.uploads.maxSize": "Maximum file size: 10 MB",
    "questionnaire.uploads.category": "Category",
    "questionnaire.uploads.category.medication_list": "Medication List",
    "questionnaire.uploads.category.diagnosis": "Diagnosis/Report",
    "questionnaire.uploads.category.exam_result": "Exam Result",
    "questionnaire.uploads.category.other": "Other",
    "questionnaire.uploads.uploading": "Uploading...",
    "questionnaire.uploads.uploadError": "Upload failed",
    "questionnaire.uploads.deleteConfirm": "Delete this file?",
    "questionnaire.uploads.noFiles": "No files uploaded yet",
    "questionnaire.uploads.skip": "You can skip this step if you have no documents to upload",
    "questionnaire.uploads.takePhoto": "Take Photo",
    "questionnaire.uploads.or": "or",
    "questionnaire.steps.uploads": "Documents",
    "questionnaire.notes.additional": "Additional Notes",
    "questionnaire.notes.additionalHint": "Any other information you think is important",
    "questionnaire.notes.questions": "Questions for Your Doctor",
    "questionnaire.notes.questionsHint": "Do you have any questions or concerns about your procedure?",
    "questionnaire.steps.submit": "Submit",
    "questionnaire.submit.title": "Review and Submit",
    "questionnaire.submit.subtitle": "Please review your information and sign to complete the questionnaire",
    "questionnaire.submit.date": "Today's Date",
    "questionnaire.submit.signature": "Your Signature",
    "questionnaire.submit.signatureHint": "Please sign below to confirm the information is accurate",
    "questionnaire.submit.addSignature": "Tap to add signature",
    "questionnaire.submit.changeSignature": "Change signature",
    "questionnaire.submit.privacy": "Privacy Consent",
    "questionnaire.submit.privacyText": "I consent to the processing of my personal and health data for the purpose of my medical treatment. I confirm that the information provided is accurate to the best of my knowledge.",
    "questionnaire.submit.privacyRequired": "You must accept the privacy consent to submit the questionnaire",
    "questionnaire.personal.smsConsent": "I agree to receive SMS notifications",
    "questionnaire.personal.smsConsentText": "I consent to receive appointment reminders and important notifications via SMS to the phone number provided above.",
    "questionnaire.submit.phoneRequired": "Phone number is required",
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
    "questionnaire.success.returnToPortal": "Return to Patient Portal",
    "questionnaire.returnToPortal": "Back to Portal",
    "questionnaire.review.title": "Review Your Information",
    "questionnaire.review.edit": "Edit",
  },
  de: {
    "questionnaire.title": "Präoperativer Fragebogen",
    "questionnaire.subtitle": "Bitte füllen Sie dieses Formular vor Ihrer Operation aus",
    "questionnaire.start": "Fragebogen starten",
    "questionnaire.starting": "Wird gestartet...",
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
    "questionnaire.personal.phone": "Telefon",
    "questionnaire.personal.height": "Größe (cm)",
    "questionnaire.personal.weight": "Gewicht (kg)",
    "questionnaire.conditions.title": "Haben Sie eine der folgenden Erkrankungen?",
    "questionnaire.conditions.notes": "Zusätzliche Details",
    "questionnaire.medications.title": "Aktuelle Medikamente",
    "questionnaire.medications.subtitle": "Listen Sie alle Medikamente auf, die Sie derzeit einnehmen",
    "questionnaire.medications.selectFromList": "Aus häufigen Medikamenten auswählen",
    "questionnaire.medications.orAddCustom": "Oder ein anderes Medikament hinzufügen",
    "questionnaire.medications.name": "Medikamentenname",
    "questionnaire.medications.dosage": "Dosierung",
    "questionnaire.medications.frequency": "Wie oft",
    "questionnaire.medications.reason": "Grund/Erkrankung",
    "questionnaire.medications.add": "Medikament hinzufügen",
    "questionnaire.medications.addCustom": "Anderes Medikament hinzufügen",
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
    "questionnaire.lifestyle.drugs.title": "Drogenkonsum",
    "questionnaire.lifestyle.drugs.subtitle": "Haben Sie jemals folgende Substanzen konsumiert (aktuell oder in der Vergangenheit)?",
    "questionnaire.lifestyle.drugs.thc": "Cannabis (THC)",
    "questionnaire.lifestyle.drugs.cocaine": "Kokain",
    "questionnaire.lifestyle.drugs.heroin": "Heroin/Opioide",
    "questionnaire.lifestyle.drugs.mdma": "MDMA/Ecstasy",
    "questionnaire.lifestyle.drugs.other": "Andere Substanzen",
    "questionnaire.lifestyle.drugs.details": "Bitte geben Sie Details an (wann, wie oft)",
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
    "questionnaire.history.dental.title": "Zahnstatus",
    "questionnaire.history.dental.subtitle": "Bitte geben Sie eventuelle Zahnprobleme an",
    "questionnaire.history.dental.dentures": "Zahnprothese (voll oder teilweise)",
    "questionnaire.history.dental.crowns": "Zahnkronen oder Brücken",
    "questionnaire.history.dental.implants": "Zahnimplantate",
    "questionnaire.history.dental.looseTeeth": "Lockere Zähne",
    "questionnaire.history.dental.damagedTeeth": "Beschädigte oder brüchige Zähne",
    "questionnaire.history.dental.notes": "Zusätzliche Hinweise zum Zahnstatus",
    "questionnaire.history.ponv.title": "Frühere Reaktionen",
    "questionnaire.history.ponv.subtitle": "Haben Sie eine der folgenden Reaktionen erlebt?",
    "questionnaire.history.ponv.ponvPrevious": "Übelkeit/Erbrechen nach Narkose",
    "questionnaire.history.ponv.ponvFamily": "Familienanamnese von Narkoseproblemen",
    "questionnaire.history.ponv.bloodTransfusion": "Frühere Bluttransfusion",
    "questionnaire.history.ponv.transfusionReaction": "Reaktion auf Blutprodukte",
    "questionnaire.history.ponv.notes": "Zusätzliche Angaben",
    "questionnaire.history.outpatient.title": "Begleitperson für ambulante Eingriffe",
    "questionnaire.history.outpatient.subtitle": "Wer wird Sie nach dem Eingriff nach Hause begleiten?",
    "questionnaire.history.outpatient.firstName": "Vorname",
    "questionnaire.history.outpatient.lastName": "Nachname",
    "questionnaire.history.outpatient.phone": "Telefonnummer",
    "questionnaire.uploads.title": "Dokumente hochladen",
    "questionnaire.uploads.subtitle": "Laden Sie Fotos von Medikamentenlisten, Diagnosen oder Untersuchungsergebnissen hoch (optional)",
    "questionnaire.uploads.selectFiles": "Dateien auswählen",
    "questionnaire.uploads.dragDrop": "oder Dateien hierher ziehen",
    "questionnaire.uploads.supportedFormats": "Unterstützt: Bilder (JPG, PNG), PDF-Dokumente",
    "questionnaire.uploads.maxSize": "Maximale Dateigröße: 10 MB",
    "questionnaire.uploads.category": "Kategorie",
    "questionnaire.uploads.category.medication_list": "Medikamentenliste",
    "questionnaire.uploads.category.diagnosis": "Diagnose/Bericht",
    "questionnaire.uploads.category.exam_result": "Untersuchungsergebnis",
    "questionnaire.uploads.category.other": "Sonstiges",
    "questionnaire.uploads.uploading": "Wird hochgeladen...",
    "questionnaire.uploads.uploadError": "Hochladen fehlgeschlagen",
    "questionnaire.uploads.deleteConfirm": "Diese Datei löschen?",
    "questionnaire.uploads.noFiles": "Noch keine Dateien hochgeladen",
    "questionnaire.uploads.skip": "Sie können diesen Schritt überspringen, wenn Sie keine Dokumente hochladen möchten",
    "questionnaire.uploads.takePhoto": "Foto aufnehmen",
    "questionnaire.uploads.or": "oder",
    "questionnaire.steps.uploads": "Dokumente",
    "questionnaire.notes.additional": "Zusätzliche Hinweise",
    "questionnaire.notes.additionalHint": "Sonstige Informationen, die Sie für wichtig halten",
    "questionnaire.notes.questions": "Fragen an Ihren Arzt",
    "questionnaire.notes.questionsHint": "Haben Sie Fragen oder Bedenken zu Ihrem Eingriff?",
    "questionnaire.steps.submit": "Absenden",
    "questionnaire.submit.title": "Überprüfen und Absenden",
    "questionnaire.submit.subtitle": "Bitte überprüfen Sie Ihre Angaben und unterschreiben Sie, um den Fragebogen abzuschließen",
    "questionnaire.submit.date": "Heutiges Datum",
    "questionnaire.submit.signature": "Ihre Unterschrift",
    "questionnaire.submit.signatureHint": "Bitte unterschreiben Sie unten, um die Richtigkeit der Angaben zu bestätigen",
    "questionnaire.submit.addSignature": "Tippen zum Unterschreiben",
    "questionnaire.submit.changeSignature": "Unterschrift ändern",
    "questionnaire.submit.privacy": "Datenschutz-Einwilligung",
    "questionnaire.submit.privacyText": "Ich willige in die Verarbeitung meiner persönlichen und gesundheitlichen Daten zum Zweck meiner medizinischen Behandlung ein. Ich bestätige, dass die gemachten Angaben nach bestem Wissen korrekt sind.",
    "questionnaire.submit.privacyRequired": "Sie müssen der Datenschutzerklärung zustimmen, um den Fragebogen abzusenden",
    "questionnaire.personal.smsConsent": "Ich stimme dem Empfang von SMS-Benachrichtigungen zu",
    "questionnaire.personal.smsConsentText": "Ich willige ein, Terminerinnerungen und wichtige Benachrichtigungen per SMS an die oben angegebene Telefonnummer zu erhalten.",
    "questionnaire.submit.phoneRequired": "Telefonnummer ist erforderlich",
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
    "questionnaire.success.returnToPortal": "Zurück zum Patientenportal",
    "questionnaire.returnToPortal": "Zurück zum Portal",
    "questionnaire.review.title": "Überprüfen Sie Ihre Angaben",
    "questionnaire.review.edit": "Bearbeiten",
  },
};

export default function PatientQuestionnaire() {
  const { token } = useParams<{ token: string }>();
  const [location] = useLocation();
  const isHospitalToken = location.includes('/questionnaire/hospital/');
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [language, setLanguage] = useState<string>("de");
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);

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
    drugUse: {},
    drugUseDetails: "",
    previousSurgeries: "",
    previousAnesthesiaProblems: "",
    dentalIssues: {},
    dentalNotes: "",
    ponvTransfusionIssues: {},
    ponvTransfusionNotes: "",
    outpatientCaregiverFirstName: "",
    outpatientCaregiverLastName: "",
    outpatientCaregiverPhone: "",
    pregnancyStatus: "",
    breastfeeding: false,
    womanHealthNotes: "",
    additionalNotes: "",
    questionsForDoctor: "",
    submissionDate: new Date().toISOString().split('T')[0],
    signature: "",
    privacyConsent: false,
    smsConsent: false,
    currentStep: 0,
    completedSteps: [],
  });

  const apiBase = linkToken 
    ? `/api/public/questionnaire/${linkToken}` 
    : isHospitalToken 
      ? `/api/public/questionnaire/hospital/${token}` 
      : `/api/public/questionnaire/${token}`;

  const { data: config, isLoading, error } = useQuery<QuestionnaireConfig>({
    queryKey: ["/api/public/questionnaire", linkToken || token, isHospitalToken && !linkToken ? "hospital" : "direct"],
    queryFn: async () => {
      const endpoint = linkToken 
        ? `/api/public/questionnaire/${linkToken}`
        : isHospitalToken 
          ? `/api/public/questionnaire/hospital/${token}`
          : `/api/public/questionnaire/${token}`;
      const res = await fetch(endpoint);
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
        drugUse: (existing as any)?.drugUse || {},
        drugUseDetails: (existing as any)?.drugUseDetails || "",
        previousSurgeries: existing?.previousSurgeries || "",
        previousAnesthesiaProblems: existing?.previousAnesthesiaProblems || "",
        dentalIssues: (existing as any)?.dentalIssues || {},
        dentalNotes: (existing as any)?.dentalNotes || "",
        ponvTransfusionIssues: (existing as any)?.ponvTransfusionIssues || {},
        ponvTransfusionNotes: (existing as any)?.ponvTransfusionNotes || "",
        outpatientCaregiverFirstName: (existing as any)?.outpatientCaregiverFirstName || "",
        outpatientCaregiverLastName: (existing as any)?.outpatientCaregiverLastName || "",
        outpatientCaregiverPhone: (existing as any)?.outpatientCaregiverPhone || "",
        pregnancyStatus: existing?.pregnancyStatus || "",
        breastfeeding: existing?.breastfeeding || false,
        womanHealthNotes: existing?.womanHealthNotes || "",
        additionalNotes: existing?.additionalNotes || "",
        questionsForDoctor: existing?.questionsForDoctor || "",
        submissionDate: (existing as any)?.submissionDate || new Date().toISOString().split('T')[0],
        signature: (existing as any)?.signature || "",
        privacyConsent: (existing as any)?.privacyConsent || false,
        smsConsent: (existing as any)?.smsConsent || false,
        currentStep: Math.min(existing?.currentStep || 0, STEPS.length - 1),
        completedSteps: existing?.completedSteps || [],
      });
      if (existing?.currentStep !== undefined) {
        setCurrentStep(Math.min(existing.currentStep, STEPS.length - 1));
      }

      // Load existing uploads
      if (config.existingUploads && config.existingUploads.length > 0) {
        setUploads(config.existingUploads.map(u => ({
          ...u,
          isUploading: false,
        })));
      }
    }
  }, [config]);

  const activeToken = linkToken || token;

  const startQuestionnaireMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/questionnaire/hospital/${token}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error("Failed to start questionnaire");
      }
      return res.json();
    },
    onSuccess: (data: { questionnaireToken: string }) => {
      setLinkToken(data.questionnaireToken);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<FormData>) => {
      const res = await fetch(`/api/public/questionnaire/${activeToken}/save`, {
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
      const res = await fetch(`/api/public/questionnaire/${activeToken}/submit`, {
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

  const handleFileUpload = useCallback(async (file: File, category: FileUpload['category'] = 'other') => {
    if (!activeToken) return;
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setUploadError(t("questionnaire.uploads.maxSize"));
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const newUpload: FileUpload = {
      id: tempId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      category,
      isUploading: true,
    };
    
    setUploads(prev => [...prev, newUpload]);
    setUploadError(null);

    try {
      // Step 1: Get presigned upload URL
      const urlRes = await fetch(`/api/public/questionnaire/${activeToken}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
      });
      
      if (!urlRes.ok) {
        throw new Error("Failed to get upload URL");
      }
      
      const { uploadUrl, fileUrl } = await urlRes.json();

      // Step 2: Upload file to S3
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      
      if (!uploadRes.ok) {
        throw new Error("Failed to upload file");
      }

      // Step 3: Register upload with backend
      const registerRes = await fetch(`/api/public/questionnaire/${activeToken}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileUrl,
          mimeType: file.type,
          fileSize: file.size,
          category,
        }),
      });
      
      if (!registerRes.ok) {
        throw new Error("Failed to register upload");
      }
      
      const result = await registerRes.json();
      
      // Update upload with real ID
      setUploads(prev => prev.map(u => 
        u.id === tempId 
          ? { ...u, id: result.id, isUploading: false }
          : u
      ));
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError(t("questionnaire.uploads.uploadError"));
      setUploads(prev => prev.filter(u => u.id !== tempId));
    }
  }, [activeToken, t]);

  const handleDeleteUpload = useCallback(async (uploadId: string) => {
    if (!activeToken) return;
    
    try {
      const res = await fetch(`/api/public/questionnaire/${activeToken}/upload/${uploadId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        throw new Error("Failed to delete");
      }
      
      setUploads(prev => prev.filter(u => u.id !== uploadId));
    } catch (err) {
      console.error("Delete error:", err);
    }
  }, [activeToken]);

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
    if (!formData.patientPhone) {
      return;
    }
    submitMutation.mutate(formData);
  }, [formData, submitMutation]);

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Fetch info flyers after submission (must be before any early returns to follow hooks rules)
  const { data: infoFlyersData } = useQuery({
    queryKey: ['/api/public/questionnaire', activeToken, 'info-flyers'],
    queryFn: async () => {
      if (!activeToken) return { flyers: [] };
      const res = await fetch(`/api/public/questionnaire/${activeToken}/info-flyers`);
      if (!res.ok) return { flyers: [] };
      return res.json();
    },
    enabled: isSubmitted && !!activeToken,
  });

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
    const flyers = infoFlyersData?.flyers || [];
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">{t("questionnaire.success.title")}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t("questionnaire.success.message")}
            </p>
            
            {flyers.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-lg font-semibold mb-3 flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {t("questionnaire.infoFlyers.title") || "Important Information"}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {t("questionnaire.infoFlyers.description") || "Please review the following documents before your procedure:"}
                </p>
                <div className="space-y-2">
                  {flyers.map((flyer: { unitName: string; unitType: string | null; downloadUrl: string }, index: number) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => window.open(flyer.downloadUrl, '_blank')}
                      data-testid={`button-download-flyer-${index}`}
                    >
                      <FileText className="h-4 w-4 mr-2 text-primary" />
                      {flyer.unitName}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            <p className="text-sm text-gray-500 mt-4">
              {t("questionnaire.success.close")}
            </p>
            
            {/* Return to Patient Portal button - only for direct questionnaire links (not hospital tokens) */}
            {!isHospitalToken && token && (
              <Button
                variant="default"
                className="mt-6 w-full"
                onClick={() => window.location.href = `/patient/${token}`}
                data-testid="button-return-to-portal"
              >
                <Home className="h-4 w-4 mr-2" />
                {t("questionnaire.success.returnToPortal")}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // For hospital tokens, show start screen until a questionnaire session is started
  if (isHospitalToken && !linkToken && config) {
    const hospitalConfig = config as unknown as { hospitalId: string; hospitalName: string; isOpenLink: boolean };
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("questionnaire.title")}</CardTitle>
            <CardDescription>
              {hospitalConfig.hospitalName}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-center">
            <Stethoscope className="h-16 w-16 text-primary mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t("questionnaire.subtitle")}
            </p>
            <Button 
              onClick={() => startQuestionnaireMutation.mutate()}
              disabled={startQuestionnaireMutation.isPending}
              size="lg"
              className="w-full"
              data-testid="button-start-questionnaire"
            >
              {startQuestionnaireMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("questionnaire.starting") || "Starting..."}
                </>
              ) : (
                t("questionnaire.start") || "Start Questionnaire"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-4 pb-24">
        {/* Back to Portal Button - always accessible during questionnaire */}
        {!isHospitalToken && token && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 text-muted-foreground hover:text-foreground"
            onClick={() => window.location.href = `/patient/${token}`}
            data-testid="button-back-to-portal"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("questionnaire.returnToPortal")}
          </Button>
        )}
        
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl">{t("questionnaire.title")}</CardTitle>
                <CardDescription>{t("questionnaire.subtitle")}</CardDescription>
              </div>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setLanguage("de")}
                  className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                    language === "de" 
                      ? "bg-white dark:bg-gray-700 shadow-sm font-medium" 
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="button-lang-de"
                >
                  🇩🇪 DE
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                    language === "en" 
                      ? "bg-white dark:bg-gray-700 shadow-sm font-medium" 
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="button-lang-en"
                >
                  🇬🇧 EN
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="h-2 mb-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{STEPS[currentStep]?.id === "personal" ? t(STEPS[currentStep].labelKey) : `${currentStep + 1}/${STEPS.length}`}</span>
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
              <AllergiesStep
                formData={formData}
                updateField={updateField}
                allergyList={config.allergyList}
                t={t}
                language={language}
              />
            )}
            {currentStep === 2 && config && (
              <ConditionsStep
                formData={formData}
                updateField={updateField}
                conditions={config.conditionsList}
                t={t}
                language={language}
              />
            )}
            {currentStep === 3 && (
              <MedicationsStep
                formData={formData}
                updateField={updateField}
                t={t}
                medicationsList={config?.medicationsList}
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
              <UploadsStep
                uploads={uploads}
                uploadError={uploadError}
                onUpload={handleFileUpload}
                onDelete={handleDeleteUpload}
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
            {currentStep === 7 && (
              <SubmitStep
                formData={formData}
                updateField={updateField}
                t={t}
                onOpenSignature={() => setSignatureOpen(true)}
              />
            )}
          </CardContent>
        </Card>

        <SignaturePad
          isOpen={signatureOpen}
          onClose={() => setSignatureOpen(false)}
          onSave={(sig) => {
            updateField("signature", sig);
            setSignatureOpen(false);
          }}
          title={t("questionnaire.submit.signature")}
        />

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
                disabled={submitMutation.isPending || !formData.privacyConsent || !formData.patientPhone}
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
        <FlexibleDateInput
          id="birthday"
          value={formData.patientBirthday}
          onChange={(value) => updateField("patientBirthday", value)}
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
          <PhoneInputWithCountry
            id="phone"
            value={formData.patientPhone}
            onChange={(value) => updateField("patientPhone", value)}
            data-testid="input-phone"
          />
        </div>
      </div>

      {formData.patientPhone && (
        <div className="flex items-start gap-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <Checkbox
            id="sms-consent"
            checked={formData.smsConsent}
            onCheckedChange={(checked) => updateField("smsConsent", !!checked)}
            data-testid="checkbox-sms-consent"
          />
          <div>
            <Label htmlFor="sms-consent" className="cursor-pointer">
              {t("questionnaire.personal.smsConsent")}
            </Label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {t("questionnaire.personal.smsConsentText")}
            </p>
          </div>
        </div>
      )}

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
  conditions: Array<{ id: string; label: string; labelDe?: string; labelEn?: string; helpText?: string; category: string }>;
  language: string;
}

function ConditionsStep({ formData, updateField, conditions, t, language }: ConditionsStepProps) {
  const getLabel = (item: { label: string; labelDe?: string; labelEn?: string }) => {
    if (language === "en" && item.labelEn) return item.labelEn;
    if (language === "de" && item.labelDe) return item.labelDe;
    return item.label;
  };
  
  const categoryOrder = [
    "cardiovascular", "heart", "pulmonary", "lung", "gi", "gastrointestinal", 
    "kidney", "renal", "metabolic", "neurological", "neuro", "psychiatry", "psych",
    "skeletal", "musculoskeletal", "woman", "gynecology", "pediatric", "children", "dental"
  ];
  
  const groupedConditions = conditions
    .filter((condition) => condition.category !== "noxen" && condition.category.toLowerCase() !== "dental")
    .reduce((acc, condition) => {
      if (!acc[condition.category]) {
        acc[condition.category] = [];
      }
      acc[condition.category].push(condition);
      return acc;
    }, {} as Record<string, typeof conditions>);
  
  const sortedCategories = Object.keys(groupedConditions).sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aIndex = categoryOrder.findIndex(cat => aLower.includes(cat) || cat.includes(aLower));
    const bIndex = categoryOrder.findIndex(cat => bLower.includes(cat) || cat.includes(bLower));
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

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

      {sortedCategories.map((category) => {
        const items = groupedConditions[category];
        return (
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
                          {getLabel(condition)}
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
        );
      })}

      <Separator className="my-6" />

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

      <Separator className="my-6" />

      <div>
        <h3 className="font-semibold mb-2">{t("questionnaire.history.dental.title")}</h3>
        <p className="text-xs text-gray-500 mb-3">{t("questionnaire.history.dental.subtitle")}</p>
        <div className="space-y-2">
          {[
            { id: "dentures", label: t("questionnaire.history.dental.dentures") },
            { id: "crowns", label: t("questionnaire.history.dental.crowns") },
            { id: "implants", label: t("questionnaire.history.dental.implants") },
            { id: "looseTeeth", label: t("questionnaire.history.dental.looseTeeth") },
            { id: "damagedTeeth", label: t("questionnaire.history.dental.damagedTeeth") },
          ].map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-2 border rounded">
              <Checkbox
                id={`dental-${item.id}`}
                checked={formData.dentalIssues[item.id] || false}
                onCheckedChange={(checked) => updateField("dentalIssues", { ...formData.dentalIssues, [item.id]: !!checked })}
                data-testid={`checkbox-dental-${item.id}`}
              />
              <Label htmlFor={`dental-${item.id}`} className="font-normal cursor-pointer">
                {item.label}
              </Label>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Input
            placeholder={t("questionnaire.history.dental.notes")}
            value={formData.dentalNotes}
            onChange={(e) => updateField("dentalNotes", e.target.value)}
            data-testid="input-dental-notes"
          />
        </div>
      </div>

    </div>
  );
}

interface MedicationsStepProps extends StepProps {
  medicationsList?: Array<{ id: string; label: string; category: string }>;
}

function MedicationsStep({ formData, updateField, t, medicationsList }: MedicationsStepProps) {
  const addMedication = (name?: string) => {
    updateField("medications", [
      ...formData.medications,
      { name: name || "", dosage: "", frequency: "", reason: "" },
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

  const togglePredefinedMedication = (medLabel: string) => {
    const existingIndex = formData.medications.findIndex(
      (m) => m.name.toLowerCase() === medLabel.toLowerCase()
    );
    if (existingIndex >= 0) {
      removeMedication(existingIndex);
    } else {
      addMedication(medLabel);
    }
  };

  const isMedicationSelected = (medLabel: string) => {
    return formData.medications.some(
      (m) => m.name.toLowerCase() === medLabel.toLowerCase()
    );
  };

  const hasPredefinedMedications = medicationsList && medicationsList.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t("questionnaire.medications.title")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("questionnaire.medications.subtitle")}
        </p>
      </div>

      {hasPredefinedMedications && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("questionnaire.medications.selectFromList")}
          </p>
          <div className="flex flex-wrap gap-2">
            {medicationsList.map((med) => {
              const isSelected = isMedicationSelected(med.label);
              return (
                <Button
                  key={med.id}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => togglePredefinedMedication(med.label)}
                  className={isSelected ? "bg-primary text-primary-foreground" : ""}
                  data-testid={`button-predefined-medication-${med.id}`}
                >
                  {isSelected && <Check className="h-3 w-3 mr-1" />}
                  {med.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {hasPredefinedMedications && (
        <Separator className="my-4" />
      )}

      {formData.medications.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {hasPredefinedMedications ? t("questionnaire.medications.orAddCustom") : ""}
          </p>
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
        </div>
      )}

      <Button 
        variant="outline" 
        onClick={() => addMedication()} 
        className="w-full" 
        data-testid="button-add-medication"
      >
        <Plus className="h-4 w-4 mr-1" />
        {hasPredefinedMedications ? t("questionnaire.medications.addCustom") : t("questionnaire.medications.add")}
      </Button>

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
  allergyList: Array<{ id: string; label: string; labelDe?: string; labelEn?: string; helpText?: string }>;
  language: string;
}

function AllergiesStep({ formData, updateField, allergyList, t, language }: AllergiesStepProps) {
  const getLabel = (item: { label: string; labelDe?: string; labelEn?: string }) => {
    if (language === "en" && item.labelEn) return item.labelEn;
    if (language === "de" && item.labelDe) return item.labelDe;
    return item.label;
  };
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
                  {getLabel(allergy)}
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

      <Separator />

      <div>
        <h3 className="font-semibold mb-2">{t("questionnaire.lifestyle.drugs.title")}</h3>
        <p className="text-xs text-gray-500 mb-3">{t("questionnaire.lifestyle.drugs.subtitle")}</p>
        <div className="space-y-2">
          {[
            { id: "thc", label: t("questionnaire.lifestyle.drugs.thc") },
            { id: "cocaine", label: t("questionnaire.lifestyle.drugs.cocaine") },
            { id: "heroin", label: t("questionnaire.lifestyle.drugs.heroin") },
            { id: "mdma", label: t("questionnaire.lifestyle.drugs.mdma") },
            { id: "other", label: t("questionnaire.lifestyle.drugs.other") },
          ].map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-2 border rounded">
              <Checkbox
                id={`drug-${item.id}`}
                checked={formData.drugUse[item.id] || false}
                onCheckedChange={(checked) => updateField("drugUse", { ...formData.drugUse, [item.id]: !!checked })}
                data-testid={`checkbox-drug-${item.id}`}
              />
              <Label htmlFor={`drug-${item.id}`} className="font-normal cursor-pointer">
                {item.label}
              </Label>
            </div>
          ))}
        </div>
        {Object.values(formData.drugUse).some(v => v) && (
          <div className="mt-3">
            <Input
              placeholder={t("questionnaire.lifestyle.drugs.details")}
              value={formData.drugUseDetails}
              onChange={(e) => updateField("drugUseDetails", e.target.value)}
              data-testid="input-drug-details"
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface UploadsStepProps {
  uploads: FileUpload[];
  uploadError: string | null;
  onUpload: (file: File, category: FileUpload['category']) => void;
  onDelete: (uploadId: string) => void;
  t: (key: string) => string;
}

function UploadsStep({ uploads, uploadError, onUpload, onDelete, t }: UploadsStepProps) {
  const [selectedCategory, setSelectedCategory] = useState<FileUpload['category']>('other');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => onUpload(file, selectedCategory));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => onUpload(file, selectedCategory));
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files) {
      Array.from(files).forEach(file => onUpload(file, selectedCategory));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType?: string) => {
    if (mimeType?.startsWith('image/')) return <ImageIcon className="h-5 w-5" />;
    return <FileText className="h-5 w-5" />;
  };

  const categories: { value: FileUpload['category']; labelKey: string }[] = [
    { value: 'medication_list', labelKey: 'questionnaire.uploads.category.medication_list' },
    { value: 'diagnosis', labelKey: 'questionnaire.uploads.category.diagnosis' },
    { value: 'exam_result', labelKey: 'questionnaire.uploads.category.exam_result' },
    { value: 'other', labelKey: 'questionnaire.uploads.category.other' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-1">{t("questionnaire.uploads.title")}</h3>
        <p className="text-sm text-gray-500 mb-4">{t("questionnaire.uploads.subtitle")}</p>
      </div>

      <div className="space-y-3">
        <Label>{t("questionnaire.uploads.category")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {categories.map(cat => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`p-2 text-sm rounded border transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
              data-testid={`category-${cat.value}`}
            >
              {t(cat.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="file-input"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraCapture}
          className="hidden"
          data-testid="camera-input"
        />
        <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-select-files"
          >
            <Upload className="h-4 w-4 mr-2" />
            {t("questionnaire.uploads.selectFiles")}
          </Button>
          <span className="text-gray-400 text-sm">{t("questionnaire.uploads.or")}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            data-testid="button-take-photo"
          >
            <Camera className="h-4 w-4 mr-2" />
            {t("questionnaire.uploads.takePhoto")}
          </Button>
        </div>
        <p className="text-sm text-gray-500 mt-2">{t("questionnaire.uploads.dragDrop")}</p>
        <p className="text-xs text-gray-400 mt-1">{t("questionnaire.uploads.supportedFormats")}</p>
        <p className="text-xs text-gray-400">{t("questionnaire.uploads.maxSize")}</p>
      </div>

      {uploadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}

      {uploads.length > 0 ? (
        <div className="space-y-2">
          {uploads.map(upload => (
            <div
              key={upload.id}
              className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800"
              data-testid={`upload-${upload.id}`}
            >
              <div className="text-gray-500">
                {getFileIcon(upload.mimeType)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{upload.fileName}</p>
                <div className="flex gap-2 text-xs text-gray-500">
                  <span>{t(`questionnaire.uploads.category.${upload.category}`)}</span>
                  {upload.fileSize && <span>• {formatFileSize(upload.fileSize)}</span>}
                </div>
              </div>
              {upload.isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(upload.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  data-testid={`delete-upload-${upload.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-500 text-sm py-4">
          {t("questionnaire.uploads.noFiles")}
        </p>
      )}

      <p className="text-center text-gray-500 text-sm">
        {t("questionnaire.uploads.skip")}
      </p>
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

      <Separator className="my-6" />

      <div>
        <h3 className="font-semibold mb-2">{t("questionnaire.history.outpatient.title")}</h3>
        <p className="text-xs text-gray-500 mb-3">{t("questionnaire.history.outpatient.subtitle")}</p>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="outpatientFirstName">{t("questionnaire.history.outpatient.firstName")}</Label>
            <Input
              id="outpatientFirstName"
              value={formData.outpatientCaregiverFirstName}
              onChange={(e) => updateField("outpatientCaregiverFirstName", e.target.value)}
              data-testid="input-outpatient-firstname"
            />
          </div>
          <div>
            <Label htmlFor="outpatientLastName">{t("questionnaire.history.outpatient.lastName")}</Label>
            <Input
              id="outpatientLastName"
              value={formData.outpatientCaregiverLastName}
              onChange={(e) => updateField("outpatientCaregiverLastName", e.target.value)}
              data-testid="input-outpatient-lastname"
            />
          </div>
          <div>
            <Label htmlFor="outpatientPhone">{t("questionnaire.history.outpatient.phone")}</Label>
            <PhoneInputWithCountry
              id="outpatientPhone"
              value={formData.outpatientCaregiverPhone}
              onChange={(value) => updateField("outpatientCaregiverPhone", value)}
              data-testid="input-outpatient-phone"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SubmitStepProps extends StepProps {
  onOpenSignature: () => void;
}

function SubmitStep({ formData, updateField, t, onOpenSignature }: SubmitStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">{t("questionnaire.submit.title")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("questionnaire.submit.subtitle")}</p>
      </div>

      <div>
        <Label className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {t("questionnaire.submit.date")}
        </Label>
        <Input
          type="date"
          value={formData.submissionDate}
          onChange={(e) => updateField("submissionDate", e.target.value)}
          className="mt-1"
          data-testid="input-submission-date"
        />
      </div>

      <Separator />

      <div>
        <Label className="flex items-center gap-2 mb-2">
          <FileCheck className="h-4 w-4" />
          {t("questionnaire.submit.signature")}
        </Label>
        <p className="text-xs text-gray-500 mb-3">{t("questionnaire.submit.signatureHint")}</p>
        
        {formData.signature ? (
          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
            <img 
              src={formData.signature} 
              alt="Signature" 
              className="max-h-24 mx-auto mb-2"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSignature}
              className="w-full"
              data-testid="button-change-signature"
            >
              {t("questionnaire.submit.changeSignature")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={onOpenSignature}
            className="w-full h-24 border-dashed"
            data-testid="button-add-signature"
          >
            <div className="text-center">
              <FileCheck className="h-6 w-6 mx-auto mb-1 text-gray-400" />
              <span className="text-sm text-gray-500">{t("questionnaire.submit.addSignature")}</span>
            </div>
          </Button>
        )}
      </div>

      <Separator />

      <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <Checkbox
            id="privacy-consent"
            checked={formData.privacyConsent}
            onCheckedChange={(checked) => updateField("privacyConsent", !!checked)}
            data-testid="checkbox-privacy-consent"
          />
          <div>
            <Label htmlFor="privacy-consent" className="font-semibold cursor-pointer flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t("questionnaire.submit.privacy")}
            </Label>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {t("questionnaire.submit.privacyText")}
            </p>
          </div>
        </div>
      </div>

      {!formData.privacyConsent && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("questionnaire.submit.privacyRequired")}</AlertDescription>
        </Alert>
      )}
      {!formData.patientPhone && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("questionnaire.submit.phoneRequired")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
