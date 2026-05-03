import { useState, useEffect, useCallback, useRef } from "react";
import * as Sentry from "@sentry/react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import { DateInput } from "@/components/ui/date-input";
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
  Shield,
  ClipboardList,
  CheckCircle,
  Pencil,
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { formatDateForInput } from "@/lib/dateUtils";

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
  patientPhone?: string;
  patientEmail?: string;
  patientStreet?: string;
  patientPostalCode?: string;
  patientCity?: string;
  hospitalId: string;
  surgeryId?: string;
  surgery?: { admissionTime: string | null; plannedDate: string | null; stayType: string | null } | null;
  hospital?: { name: string | null; phone: string | null; defaultAdmissionOffsetMinutes: number | null } | null;
  existingResponse?: {
    id: string;
    patientFirstName?: string;
    patientLastName?: string;
    patientBirthday?: string;
    patientEmail?: string;
    patientPhone?: string;
    patientStreet?: string;
    patientPostalCode?: string;
    patientCity?: string;
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
    outpatientCaregiverFirstName?: string;
    outpatientCaregiverLastName?: string;
    outpatientCaregiverPhone?: string;
    caregiverIsEmergencyContact?: boolean;
    currentStep?: number;
    completedSteps?: string[];
  } | null;
  conditionsList: Array<{
    id: string;
    label: string;
    patientLabel?: string;
    patientHelpText?: string;
    patientVisible?: boolean;
    category: string;
  }>;
  allergyList: Array<{
    id: string;
    label: string;
    patientLabel?: string;
    patientHelpText?: string;
    patientVisible?: boolean;
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
  patientStreet: string;
  patientPostalCode: string;
  patientCity: string;
  height: string;
  weight: string;
  allergies: string[];
  allergiesNotes: string;
  noAllergies: boolean;
  medications: Medication[];
  medicationsNotes: string;
  noMedications: boolean;
  conditions: Record<string, ConditionState>;
  noConditions: boolean;
  smokingStatus: string;
  smokingDetails: string;
  alcoholStatus: string;
  alcoholDetails: string;
  drugUse: Record<string, boolean>;
  drugUseDetails: string;
  noDrugUse: boolean;
  noSmokingAlcohol: boolean;
  previousSurgeries: string;
  previousAnesthesiaProblems: string;
  noPreviousSurgeries: boolean;
  noAnesthesiaProblems: boolean;
  dentalIssues: Record<string, boolean>;
  dentalNotes: string;
  noDentalIssues: boolean;
  ponvTransfusionIssues: Record<string, boolean>;
  ponvTransfusionNotes: string;
  noPonvIssues: boolean;
  outpatientCaregiverFirstName: string;
  outpatientCaregiverLastName: string;
  outpatientCaregiverPhone: string;
  caregiverIsEmergencyContact: boolean;
  pregnancyStatus: string;
  breastfeeding: boolean;
  womanHealthNotes: string;
  additionalNotes: string;
  questionsForDoctor: string;
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
  { id: "summary", icon: ClipboardList, labelKey: "questionnaire.steps.summary" },
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
    "questionnaire.personal.street": "Street, Nr.",
    "questionnaire.personal.postalCode": "Postal Code",
    "questionnaire.personal.city": "City",
    "questionnaire.personal.height": "Height (cm)",
    "questionnaire.personal.weight": "Weight (kg)",
    "questionnaire.conditions.title": "Do you have any of the following conditions?",
    "questionnaire.conditions.noneCheckbox": "I have no pre-existing conditions",
    "questionnaire.conditions.noPreviousSurgeries": "I have had no previous surgeries",
    "questionnaire.conditions.noAnesthesiaProblems": "I have had no problems with anesthesia",
    "questionnaire.conditions.noDentalIssues": "I have no dental issues",
    "questionnaire.conditions.noPonvIssues": "I have had no previous reactions (PONV, transfusion)",
    "questionnaire.conditions.notes": "Additional details",
    "questionnaire.conditions.category.cardiovascular": "Cardiovascular",
    "questionnaire.conditions.category.pulmonary": "Pulmonary",
    "questionnaire.conditions.category.gastrointestinal": "Gastrointestinal",
    "questionnaire.conditions.category.kidney": "Kidney",
    "questionnaire.conditions.category.metabolic": "Metabolic",
    "questionnaire.conditions.category.neurological": "Neurological",
    "questionnaire.conditions.category.psychiatric": "Psychiatric",
    "questionnaire.conditions.category.skeletal": "Skeletal",
    "questionnaire.conditions.category.coagulation": "Coagulation",
    "questionnaire.conditions.category.infectious": "Infectious diseases",
    "questionnaire.conditions.category.woman": "Gynecology",
    "questionnaire.conditions.category.children": "Pediatric",
    "questionnaire.conditions.category.anesthesiaHistory": "Anesthesia & surgical history",
    "questionnaire.conditions.category.ponvTransfusion": "PONV / Transfusion",
    "questionnaire.medications.title": "Current Medications",
    "questionnaire.medications.subtitle": "List all medications you are currently taking",
    "questionnaire.medications.noneCheckbox": "I take no medications",
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
    "questionnaire.allergies.noneCheckbox": "I have no allergies",
    "questionnaire.allergies.notes": "Please describe your allergies and reactions",
    "questionnaire.lifestyle.noneCheckbox": "I don't smoke, drink alcohol, or use drugs",
    "questionnaire.lifestyle.noSmokingAlcohol": "I don't smoke or drink alcohol",
    "questionnaire.lifestyle.noDrugUse": "I don't use any recreational drugs",
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
    "questionnaire.history.outpatient.subtitleSurgery": "After your surgery, the clinic needs someone to call. Please tell us who will accompany you home.",
    "questionnaire.history.outpatient.importantBadge": "Important",
    "questionnaire.history.outpatient.useAsEmergencyContact": "Also save this person as my emergency contact",
    "questionnaire.history.outpatient.useAsEmergencyContactHint": "If anything happens during or after your surgery, the clinic will contact this person. Uncheck if you'd prefer not to.",
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
    "questionnaire.steps.summary": "Summary",
    "questionnaire.steps.submit": "Submit",
    "questionnaire.summary.title": "Summary of Your Information",
    "questionnaire.summary.subtitle": "Please review all your answers before submitting",
    "questionnaire.summary.personalInfo": "Personal Information",
    "questionnaire.summary.none": "None",
    "questionnaire.summary.noneExplicit": "None (explicitly confirmed)",
    "questionnaire.summary.notFilled": "Not filled",
    "questionnaire.summary.smoking": "Smoking",
    "questionnaire.summary.alcohol": "Alcohol",
    "questionnaire.summary.drugs": "Drugs",
    "questionnaire.summary.previousSurgeries": "Previous Surgeries",
    "questionnaire.summary.anesthesiaProblems": "Anesthesia Problems",
    "questionnaire.summary.dentalStatus": "Dental Status",
    "questionnaire.summary.previousReactions": "Previous Reactions",
    "questionnaire.summary.outpatientContact": "Outpatient Contact",
    "questionnaire.summary.caregiverMissingTitle": "Please add an emergency contact",
    "questionnaire.summary.caregiverMissingHint": "After your surgery the clinic needs someone to call. This information is operationally important.",
    "questionnaire.summary.caregiverMissingAction": "Add now",
    "questionnaire.preop.title": "Important — please read before signing",
    "questionnaire.preop.subtitle": "These are the key things you need to know for the day of your procedure.",
    "questionnaire.preop.arrival.label": "Arrival time (Eintritt)",
    "questionnaire.preop.arrival.exact": "Please come to the clinic on {time}.",
    "questionnaire.preop.arrival.generic": "You will receive your arrival time shortly before the procedure. As a rule, you should plan to arrive about {minutes} minutes before your scheduled surgery time.",
    "questionnaire.preop.fasting.label": "Fasting (Nüchtern)",
    "questionnaire.preop.fasting.text": "No solid food for 6 hours before the procedure. Clear liquids (water, tea without milk) are allowed up to 2 hours before. Do not chew gum.",
    "questionnaire.preop.escort.label": "Escort home",
    "questionnaire.preop.escort.text": "An accompanying adult is required to take you home. You may not drive yourself or travel home alone after anesthesia.",
    "questionnaire.preop.bring.label": "Please bring with you",
    "questionnaire.preop.bring.text": "Identity card or passport, your insurance card, and a complete list of your current medications.",
    "questionnaire.preop.appearance.label": "Before you come",
    "questionnaire.preop.appearance.text": "Remove make-up, nail polish, contact lenses, and all jewellery (including piercings and rings). Wear loose, comfortable clothing.",
    "questionnaire.preop.driving.label": "After the procedure",
    "questionnaire.preop.driving.text": "You may not drive a vehicle, operate machinery, or sign legally binding documents for 24 hours after anesthesia.",
    "questionnaire.preop.callIfChange.label": "If you cannot make it",
    "questionnaire.preop.callIfChange.text": "Please call the clinic as soon as possible at {phone}.",
    "questionnaire.summary.documents": "Documents",
    "questionnaire.summary.additionalNotes": "Additional Notes",
    "questionnaire.summary.questionsForDoctor": "Questions for Doctor",
    "questionnaire.none.confirmed": "✓ Confirmed: None",
    "questionnaire.submit.title": "Review and Submit",
    "questionnaire.submit.subtitle": "Please review your information and sign to complete the questionnaire",
    "questionnaire.submit.date": "Today's Date",
    "questionnaire.submit.signature": "Your Signature",
    "questionnaire.submit.signatureHint": "Please sign below to confirm the information is accurate",
    "questionnaire.submit.addSignature": "Tap to add signature",
    "questionnaire.submit.changeSignature": "Change signature",
    "questionnaire.submit.privacy": "Privacy Consent",
    "questionnaire.submit.privacyText": "I consent to the processing of my personal and health data for the purpose of my medical treatment. I confirm that the information provided is accurate to the best of my knowledge.",
    "questionnaire.submit.signatureRequired": "Please sign the questionnaire before submitting",
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
    "questionnaire.error.submitFailed": "Submission failed. Please check your internet connection and try again.",
    "questionnaire.success.title": "Thank You!",
    "questionnaire.success.message": "Your questionnaire has been submitted successfully. Your medical team will review your information before your procedure.",
    "questionnaire.success.close": "You can close this page now.",
    "questionnaire.success.returnToPortal": "Return to Patient Portal",
    "questionnaire.returnToPortal": "Back to Portal",
    "questionnaire.review.title": "Review Your Information",
    "questionnaire.review.edit": "Edit",
    "questionnaire.validation.required": "Required field",
    "questionnaire.validation.completeStep": "Please fill in the missing information to continue.",
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
    "questionnaire.personal.street": "Strasse, Nr.",
    "questionnaire.personal.postalCode": "PLZ",
    "questionnaire.personal.city": "Ort",
    "questionnaire.personal.height": "Größe (cm)",
    "questionnaire.personal.weight": "Gewicht (kg)",
    "questionnaire.conditions.title": "Haben Sie eine der folgenden Erkrankungen?",
    "questionnaire.conditions.noneCheckbox": "Ich habe keine Vorerkrankungen",
    "questionnaire.conditions.noPreviousSurgeries": "Ich hatte keine früheren Operationen",
    "questionnaire.conditions.noAnesthesiaProblems": "Ich hatte keine Probleme mit der Narkose",
    "questionnaire.conditions.noDentalIssues": "Ich habe keine Zahnprobleme",
    "questionnaire.conditions.noPonvIssues": "Ich hatte keine früheren Reaktionen (PONV, Transfusion)",
    "questionnaire.conditions.notes": "Zusätzliche Details",
    "questionnaire.conditions.category.cardiovascular": "Herz-Kreislauf",
    "questionnaire.conditions.category.pulmonary": "Lunge",
    "questionnaire.conditions.category.gastrointestinal": "Magen-Darm",
    "questionnaire.conditions.category.kidney": "Nieren",
    "questionnaire.conditions.category.metabolic": "Stoffwechsel",
    "questionnaire.conditions.category.neurological": "Neurologisch",
    "questionnaire.conditions.category.psychiatric": "Psychisch",
    "questionnaire.conditions.category.skeletal": "Skelett",
    "questionnaire.conditions.category.coagulation": "Gerinnung",
    "questionnaire.conditions.category.infectious": "Infektionskrankheiten",
    "questionnaire.conditions.category.woman": "Gynäkologie",
    "questionnaire.conditions.category.children": "Pädiatrie",
    "questionnaire.conditions.category.anesthesiaHistory": "Anästhesie & Operationsgeschichte",
    "questionnaire.conditions.category.ponvTransfusion": "PONV / Transfusion",
    "questionnaire.medications.title": "Aktuelle Medikamente",
    "questionnaire.medications.subtitle": "Listen Sie alle Medikamente auf, die Sie derzeit einnehmen",
    "questionnaire.medications.noneCheckbox": "Ich nehme keine Medikamente",
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
    "questionnaire.allergies.noneCheckbox": "Ich habe keine Allergien",
    "questionnaire.allergies.notes": "Bitte beschreiben Sie Ihre Allergien und Reaktionen",
    "questionnaire.lifestyle.noneCheckbox": "Ich rauche nicht, trinke keinen Alkohol und nehme keine Drogen",
    "questionnaire.lifestyle.noSmokingAlcohol": "Ich rauche nicht und trinke keinen Alkohol",
    "questionnaire.lifestyle.noDrugUse": "Ich nehme keine Freizeitdrogen",
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
    "questionnaire.history.outpatient.subtitleSurgery": "Nach dem Eingriff braucht die Klinik eine Kontaktperson. Bitte teilen Sie uns mit, wer Sie nach Hause begleitet.",
    "questionnaire.history.outpatient.importantBadge": "Wichtig",
    "questionnaire.history.outpatient.useAsEmergencyContact": "Diese Person auch als Notfallkontakt hinterlegen",
    "questionnaire.history.outpatient.useAsEmergencyContactHint": "Falls während oder nach dem Eingriff etwas vorfällt, kontaktiert die Klinik diese Person. Entfernen Sie das Häkchen, wenn Sie das nicht möchten.",
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
    "questionnaire.steps.summary": "Zusammenfassung",
    "questionnaire.steps.submit": "Absenden",
    "questionnaire.summary.title": "Zusammenfassung Ihrer Angaben",
    "questionnaire.summary.subtitle": "Bitte überprüfen Sie alle Ihre Antworten vor dem Absenden",
    "questionnaire.summary.personalInfo": "Persönliche Daten",
    "questionnaire.summary.none": "Keine",
    "questionnaire.summary.noneExplicit": "Keine (ausdrücklich bestätigt)",
    "questionnaire.summary.notFilled": "Nicht ausgefüllt",
    "questionnaire.summary.smoking": "Rauchen",
    "questionnaire.summary.alcohol": "Alkohol",
    "questionnaire.summary.drugs": "Drogen",
    "questionnaire.summary.previousSurgeries": "Frühere Operationen",
    "questionnaire.summary.anesthesiaProblems": "Narkoseprobleme",
    "questionnaire.summary.dentalStatus": "Zahnstatus",
    "questionnaire.summary.previousReactions": "Frühere Reaktionen",
    "questionnaire.summary.outpatientContact": "Begleitperson",
    "questionnaire.summary.caregiverMissingTitle": "Bitte Notfallkontakt ergänzen",
    "questionnaire.summary.caregiverMissingHint": "Nach Ihrem Eingriff braucht die Klinik eine Kontaktperson. Diese Information ist organisatorisch wichtig.",
    "questionnaire.summary.caregiverMissingAction": "Jetzt ergänzen",
    "questionnaire.preop.title": "Wichtig — bitte vor dem Unterschreiben lesen",
    "questionnaire.preop.subtitle": "Das sind die wichtigsten Punkte, die Sie für den Eingriffstag wissen müssen.",
    "questionnaire.preop.arrival.label": "Eintrittszeit",
    "questionnaire.preop.arrival.exact": "Bitte erscheinen Sie am {time} in der Klinik.",
    "questionnaire.preop.arrival.generic": "Sie erhalten Ihre Eintrittszeit kurz vor dem Eingriff. In der Regel sollten Sie etwa {minutes} Minuten vor Ihrer geplanten Operationszeit eintreffen.",
    "questionnaire.preop.fasting.label": "Nüchternheit",
    "questionnaire.preop.fasting.text": "6 Stunden vor dem Eingriff keine feste Nahrung. Klare Flüssigkeiten (Wasser, Tee ohne Milch) sind bis 2 Stunden vorher erlaubt. Kein Kaugummi.",
    "questionnaire.preop.escort.label": "Begleitperson für die Heimreise",
    "questionnaire.preop.escort.text": "Eine erwachsene Begleitperson ist Pflicht. Sie dürfen nach der Narkose nicht selbst Auto fahren oder allein nach Hause reisen.",
    "questionnaire.preop.bring.label": "Bitte mitbringen",
    "questionnaire.preop.bring.text": "Ausweis oder Pass, Ihre Versicherungskarte und eine vollständige Liste Ihrer aktuellen Medikamente.",
    "questionnaire.preop.appearance.label": "Vor dem Eingriff",
    "questionnaire.preop.appearance.text": "Entfernen Sie Make-up, Nagellack, Kontaktlinsen und sämtlichen Schmuck (auch Piercings und Ringe). Tragen Sie lockere, bequeme Kleidung.",
    "questionnaire.preop.driving.label": "Nach dem Eingriff",
    "questionnaire.preop.driving.text": "Sie dürfen 24 Stunden nach der Narkose nicht Auto fahren, keine Maschinen bedienen und keine rechtsgültigen Dokumente unterzeichnen.",
    "questionnaire.preop.callIfChange.label": "Bei Verhinderung",
    "questionnaire.preop.callIfChange.text": "Bitte rufen Sie umgehend die Klinik unter {phone} an.",
    "questionnaire.summary.documents": "Dokumente",
    "questionnaire.summary.additionalNotes": "Zusätzliche Hinweise",
    "questionnaire.summary.questionsForDoctor": "Fragen an den Arzt",
    "questionnaire.none.confirmed": "✓ Bestätigt: Keine",
    "questionnaire.submit.title": "Überprüfen und Absenden",
    "questionnaire.submit.subtitle": "Bitte überprüfen Sie Ihre Angaben und unterschreiben Sie, um den Fragebogen abzuschließen",
    "questionnaire.submit.date": "Heutiges Datum",
    "questionnaire.submit.signature": "Ihre Unterschrift",
    "questionnaire.submit.signatureHint": "Bitte unterschreiben Sie unten, um die Richtigkeit der Angaben zu bestätigen",
    "questionnaire.submit.addSignature": "Tippen zum Unterschreiben",
    "questionnaire.submit.changeSignature": "Unterschrift ändern",
    "questionnaire.submit.privacy": "Datenschutz-Einwilligung",
    "questionnaire.submit.privacyText": "Ich willige in die Verarbeitung meiner persönlichen und gesundheitlichen Daten zum Zweck meiner medizinischen Behandlung ein. Ich bestätige, dass die gemachten Angaben nach bestem Wissen korrekt sind.",
    "questionnaire.submit.signatureRequired": "Bitte unterschreiben Sie den Fragebogen vor dem Absenden",
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
    "questionnaire.error.submitFailed": "Senden fehlgeschlagen. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
    "questionnaire.success.title": "Vielen Dank!",
    "questionnaire.success.message": "Ihr Fragebogen wurde erfolgreich übermittelt. Ihr medizinisches Team wird Ihre Informationen vor Ihrem Eingriff überprüfen.",
    "questionnaire.success.close": "Sie können diese Seite jetzt schließen.",
    "questionnaire.success.returnToPortal": "Zurück zum Patientenportal",
    "questionnaire.returnToPortal": "Zurück zum Portal",
    "questionnaire.review.title": "Überprüfen Sie Ihre Angaben",
    "questionnaire.review.edit": "Bearbeiten",
    "questionnaire.validation.required": "Pflichtfeld",
    "questionnaire.validation.completeStep": "Bitte ergänzen Sie die fehlenden Angaben, um fortzufahren.",
  },
  it: {
    "questionnaire.title": "Questionario preoperatorio",
    "questionnaire.subtitle": "Si prega di compilare questo modulo prima dell'intervento",
    "questionnaire.start": "Iniziare il questionario",
    "questionnaire.starting": "Avvio in corso...",
    "questionnaire.steps.personal": "Dati personali",
    "questionnaire.steps.conditions": "Patologie",
    "questionnaire.steps.medications": "Farmaci",
    "questionnaire.steps.allergies": "Allergie",
    "questionnaire.steps.lifestyle": "Stile di vita",
    "questionnaire.steps.history": "Anamnesi",
    "questionnaire.steps.notes": "Note aggiuntive",
    "questionnaire.personal.firstName": "Nome",
    "questionnaire.personal.lastName": "Cognome",
    "questionnaire.personal.birthday": "Data di nascita",
    "questionnaire.personal.email": "Email (facoltativo)",
    "questionnaire.personal.phone": "Telefono",
    "questionnaire.personal.street": "Via, Nr.",
    "questionnaire.personal.postalCode": "CAP",
    "questionnaire.personal.city": "Città",
    "questionnaire.personal.height": "Altezza (cm)",
    "questionnaire.personal.weight": "Peso (kg)",
    "questionnaire.conditions.title": "Ha una delle seguenti patologie?",
    "questionnaire.conditions.noneCheckbox": "Non ho patologie pregresse",
    "questionnaire.conditions.noPreviousSurgeries": "Non ho avuto interventi chirurgici precedenti",
    "questionnaire.conditions.noAnesthesiaProblems": "Non ho avuto problemi con l'anestesia",
    "questionnaire.conditions.noDentalIssues": "Non ho problemi dentali",
    "questionnaire.conditions.noPonvIssues": "Non ho avuto reazioni precedenti (PONV, trasfusione)",
    "questionnaire.conditions.notes": "Dettagli aggiuntivi",
    "questionnaire.conditions.category.cardiovascular": "Cardiovascolare",
    "questionnaire.conditions.category.pulmonary": "Polmonare",
    "questionnaire.conditions.category.gastrointestinal": "Gastrointestinale",
    "questionnaire.conditions.category.kidney": "Renale",
    "questionnaire.conditions.category.metabolic": "Metabolico",
    "questionnaire.conditions.category.neurological": "Neurologico",
    "questionnaire.conditions.category.psychiatric": "Psichiatrico",
    "questionnaire.conditions.category.skeletal": "Scheletrico",
    "questionnaire.conditions.category.coagulation": "Coagulazione",
    "questionnaire.conditions.category.infectious": "Malattie infettive",
    "questionnaire.conditions.category.woman": "Ginecologia",
    "questionnaire.conditions.category.children": "Pediatrico",
    "questionnaire.conditions.category.anesthesiaHistory": "Storia anestesiologica e chirurgica",
    "questionnaire.conditions.category.ponvTransfusion": "PONV / Trasfusione",
    "questionnaire.medications.title": "Farmaci attuali",
    "questionnaire.medications.subtitle": "Elenchi tutti i farmaci che sta assumendo attualmente",
    "questionnaire.medications.noneCheckbox": "Non assumo farmaci",
    "questionnaire.medications.selectFromList": "Selezionare dai farmaci comuni",
    "questionnaire.medications.orAddCustom": "Oppure aggiungere un farmaco personalizzato",
    "questionnaire.medications.name": "Nome del farmaco",
    "questionnaire.medications.dosage": "Dosaggio",
    "questionnaire.medications.frequency": "Frequenza",
    "questionnaire.medications.reason": "Motivo/Patologia",
    "questionnaire.medications.add": "Aggiungere farmaco",
    "questionnaire.medications.addCustom": "Aggiungere farmaco personalizzato",
    "questionnaire.medications.notes": "Note aggiuntive sui farmaci",
    "questionnaire.allergies.title": "Allergie",
    "questionnaire.allergies.subtitle": "Ha allergie a farmaci, alimenti o altre sostanze?",
    "questionnaire.allergies.none": "Nessuna allergia nota",
    "questionnaire.allergies.noneCheckbox": "Non ho allergie",
    "questionnaire.allergies.notes": "Descriva le Sue allergie e reazioni",
    "questionnaire.lifestyle.noneCheckbox": "Non fumo, non bevo alcol e non uso droghe",
    "questionnaire.lifestyle.noSmokingAlcohol": "Non fumo e non bevo alcol",
    "questionnaire.lifestyle.noDrugUse": "Non uso droghe ricreative",
    "questionnaire.lifestyle.smoking.title": "Fumo",
    "questionnaire.lifestyle.smoking.never": "Mai fumato",
    "questionnaire.lifestyle.smoking.former": "Ex fumatore",
    "questionnaire.lifestyle.smoking.current": "Fumatore attuale",
    "questionnaire.lifestyle.smoking.details": "Quanto/da quanto tempo?",
    "questionnaire.lifestyle.alcohol.title": "Consumo di alcol",
    "questionnaire.lifestyle.alcohol.never": "Mai",
    "questionnaire.lifestyle.alcohol.occasional": "Occasionale (1-2 drink/settimana)",
    "questionnaire.lifestyle.alcohol.moderate": "Moderato (3-7 drink/settimana)",
    "questionnaire.lifestyle.alcohol.heavy": "Elevato (più di 7 drink/settimana)",
    "questionnaire.lifestyle.alcohol.details": "Dettagli aggiuntivi",
    "questionnaire.lifestyle.drugs.title": "Uso di droghe",
    "questionnaire.lifestyle.drugs.subtitle": "Ha mai usato le seguenti sostanze (attualmente o in passato)?",
    "questionnaire.lifestyle.drugs.thc": "Cannabis (THC)",
    "questionnaire.lifestyle.drugs.cocaine": "Cocaina",
    "questionnaire.lifestyle.drugs.heroin": "Eroina/Oppioidi",
    "questionnaire.lifestyle.drugs.mdma": "MDMA/Ecstasy",
    "questionnaire.lifestyle.drugs.other": "Altre sostanze",
    "questionnaire.lifestyle.drugs.details": "Fornire dettagli (quando, con quale frequenza)",
    "questionnaire.history.surgeries": "Interventi chirurgici precedenti",
    "questionnaire.history.surgeriesHint": "Elenchi eventuali interventi chirurgici precedenti con date approssimative",
    "questionnaire.history.anesthesia": "Problemi precedenti con l'anestesia",
    "questionnaire.history.anesthesiaHint": "Lei o i Suoi familiari hanno avuto problemi con l'anestesia?",
    "questionnaire.history.pregnancy": "Stato di gravidanza",
    "questionnaire.history.pregnancy.notApplicable": "Non applicabile",
    "questionnaire.history.pregnancy.no": "Non incinta",
    "questionnaire.history.pregnancy.possible": "Possibilmente incinta",
    "questionnaire.history.pregnancy.yes": "Incinta",
    "questionnaire.history.breastfeeding": "Attualmente in allattamento",
    "questionnaire.history.womanNotes": "Informazioni aggiuntive",
    "questionnaire.history.dental.title": "Stato dentale",
    "questionnaire.history.dental.subtitle": "Indichi eventuali problemi dentali",
    "questionnaire.history.dental.dentures": "Protesi dentarie (totali o parziali)",
    "questionnaire.history.dental.crowns": "Corone o ponti dentali",
    "questionnaire.history.dental.implants": "Impianti dentali",
    "questionnaire.history.dental.looseTeeth": "Denti mobili",
    "questionnaire.history.dental.damagedTeeth": "Denti danneggiati o fragili",
    "questionnaire.history.dental.notes": "Note aggiuntive sullo stato dentale",
    "questionnaire.history.ponv.title": "Reazioni precedenti",
    "questionnaire.history.ponv.subtitle": "Ha sperimentato una delle seguenti situazioni?",
    "questionnaire.history.ponv.ponvPrevious": "Nausea/vomito dopo l'anestesia",
    "questionnaire.history.ponv.ponvFamily": "Anamnesi familiare di problemi con l'anestesia",
    "questionnaire.history.ponv.bloodTransfusion": "Trasfusione di sangue precedente",
    "questionnaire.history.ponv.transfusionReaction": "Reazione a prodotti ematici",
    "questionnaire.history.ponv.notes": "Dettagli aggiuntivi",
    "questionnaire.history.outpatient.title": "Contatto per accompagnamento",
    "questionnaire.history.outpatient.subtitle": "Per interventi ambulatoriali: chi La accompagnerà a casa?",
    "questionnaire.history.outpatient.subtitleSurgery": "Dopo l'intervento la clinica ha bisogno di una persona da contattare. Indichi chi La accompagnerà a casa.",
    "questionnaire.history.outpatient.importantBadge": "Importante",
    "questionnaire.history.outpatient.useAsEmergencyContact": "Salva questa persona anche come contatto di emergenza",
    "questionnaire.history.outpatient.useAsEmergencyContactHint": "Se durante o dopo l'intervento dovesse succedere qualcosa, la clinica contatterà questa persona. Tolga la spunta se preferisce di no.",
    "questionnaire.history.outpatient.firstName": "Nome",
    "questionnaire.history.outpatient.lastName": "Cognome",
    "questionnaire.history.outpatient.phone": "Numero di telefono",
    "questionnaire.uploads.title": "Caricamento documenti",
    "questionnaire.uploads.subtitle": "Carichi foto di elenchi farmaci, diagnosi o risultati di esami (facoltativo)",
    "questionnaire.uploads.selectFiles": "Selezionare file",
    "questionnaire.uploads.dragDrop": "o trascinare i file qui",
    "questionnaire.uploads.supportedFormats": "Supportati: immagini (JPG, PNG), documenti PDF",
    "questionnaire.uploads.maxSize": "Dimensione massima: 10 MB",
    "questionnaire.uploads.category": "Categoria",
    "questionnaire.uploads.category.medication_list": "Elenco farmaci",
    "questionnaire.uploads.category.diagnosis": "Diagnosi/Referto",
    "questionnaire.uploads.category.exam_result": "Risultato esame",
    "questionnaire.uploads.category.other": "Altro",
    "questionnaire.uploads.uploading": "Caricamento...",
    "questionnaire.uploads.uploadError": "Caricamento fallito",
    "questionnaire.uploads.deleteConfirm": "Eliminare questo file?",
    "questionnaire.uploads.noFiles": "Nessun file caricato",
    "questionnaire.uploads.skip": "Può saltare questo passaggio se non ha documenti da caricare",
    "questionnaire.uploads.takePhoto": "Scattare foto",
    "questionnaire.uploads.or": "o",
    "questionnaire.steps.uploads": "Documenti",
    "questionnaire.notes.additional": "Note aggiuntive",
    "questionnaire.notes.additionalHint": "Altre informazioni che ritiene importanti",
    "questionnaire.notes.questions": "Domande per il medico",
    "questionnaire.notes.questionsHint": "Ha domande o dubbi riguardo al Suo intervento?",
    "questionnaire.steps.summary": "Riepilogo",
    "questionnaire.steps.submit": "Inviare",
    "questionnaire.summary.title": "Riepilogo delle Sue informazioni",
    "questionnaire.summary.subtitle": "Si prega di verificare tutte le risposte prima dell'invio",
    "questionnaire.summary.personalInfo": "Dati personali",
    "questionnaire.summary.none": "Nessuno",
    "questionnaire.summary.noneExplicit": "Nessuno (confermato esplicitamente)",
    "questionnaire.summary.notFilled": "Non compilato",
    "questionnaire.summary.smoking": "Fumo",
    "questionnaire.summary.alcohol": "Alcol",
    "questionnaire.summary.drugs": "Droghe",
    "questionnaire.summary.previousSurgeries": "Interventi precedenti",
    "questionnaire.summary.anesthesiaProblems": "Problemi con l'anestesia",
    "questionnaire.summary.dentalStatus": "Stato dentale",
    "questionnaire.summary.previousReactions": "Reazioni precedenti",
    "questionnaire.summary.outpatientContact": "Contatto accompagnatore",
    "questionnaire.summary.caregiverMissingTitle": "Aggiunga un contatto di emergenza",
    "questionnaire.summary.caregiverMissingHint": "Dopo l'intervento la clinica ha bisogno di una persona da contattare. Questa informazione è importante a livello operativo.",
    "questionnaire.summary.caregiverMissingAction": "Aggiungi ora",
    "questionnaire.preop.title": "Importante — legga prima di firmare",
    "questionnaire.preop.subtitle": "Queste sono le informazioni essenziali per il giorno dell'intervento.",
    "questionnaire.preop.arrival.label": "Orario d'ingresso",
    "questionnaire.preop.arrival.exact": "Si presenti in clinica il {time}.",
    "questionnaire.preop.arrival.generic": "L'orario d'ingresso Le verrà comunicato poco prima dell'intervento. Di norma, è bene arrivare circa {minutes} minuti prima dell'orario previsto.",
    "questionnaire.preop.fasting.label": "Digiuno",
    "questionnaire.preop.fasting.text": "Nessun cibo solido nelle 6 ore precedenti l'intervento. Liquidi chiari (acqua, tè senza latte) consentiti fino a 2 ore prima. Niente chewing gum.",
    "questionnaire.preop.escort.label": "Accompagnamento per il rientro",
    "questionnaire.preop.escort.text": "È obbligatoria una persona adulta che L'accompagni a casa. Dopo l'anestesia non può guidare né viaggiare da solo.",
    "questionnaire.preop.bring.label": "Da portare con sé",
    "questionnaire.preop.bring.text": "Documento d'identità o passaporto, tessera dell'assicurazione e un elenco completo dei farmaci che assume.",
    "questionnaire.preop.appearance.label": "Prima di venire",
    "questionnaire.preop.appearance.text": "Rimuova trucco, smalto, lenti a contatto e tutti i gioielli (anche piercing e anelli). Indossi abiti comodi.",
    "questionnaire.preop.driving.label": "Dopo l'intervento",
    "questionnaire.preop.driving.text": "Per 24 ore dopo l'anestesia non può guidare, usare macchinari né firmare documenti vincolanti.",
    "questionnaire.preop.callIfChange.label": "In caso di impedimento",
    "questionnaire.preop.callIfChange.text": "La preghiamo di telefonare subito alla clinica al {phone}.",
    "questionnaire.summary.documents": "Documenti",
    "questionnaire.summary.additionalNotes": "Note aggiuntive",
    "questionnaire.summary.questionsForDoctor": "Domande per il medico",
    "questionnaire.none.confirmed": "✓ Confermato: Nessuno",
    "questionnaire.submit.title": "Verifica e invio",
    "questionnaire.submit.subtitle": "Si prega di verificare le informazioni e firmare per completare il questionario",
    "questionnaire.submit.date": "Data odierna",
    "questionnaire.submit.signature": "La Sua firma",
    "questionnaire.submit.signatureHint": "Firmi qui sotto per confermare l'accuratezza delle informazioni",
    "questionnaire.submit.addSignature": "Toccare per aggiungere la firma",
    "questionnaire.submit.changeSignature": "Cambiare firma",
    "questionnaire.submit.privacy": "Consenso alla privacy",
    "questionnaire.submit.privacyText": "Acconsento al trattamento dei miei dati personali e sanitari ai fini del mio trattamento medico. Confermo che le informazioni fornite sono accurate al meglio delle mie conoscenze.",
    "questionnaire.submit.signatureRequired": "Si prega di firmare il questionario prima dell'invio",
    "questionnaire.submit.privacyRequired": "Deve accettare il consenso alla privacy per inviare il questionario",
    "questionnaire.personal.smsConsent": "Acconsento a ricevere notifiche SMS",
    "questionnaire.personal.smsConsentText": "Acconsento a ricevere promemoria di appuntamenti e notifiche importanti via SMS al numero di telefono indicato sopra.",
    "questionnaire.submit.phoneRequired": "Il numero di telefono è obbligatorio",
    "questionnaire.nav.back": "Indietro",
    "questionnaire.nav.next": "Avanti",
    "questionnaire.nav.submit": "Inviare il questionario",
    "questionnaire.nav.submitting": "Invio in corso...",
    "questionnaire.saving": "Salvataggio...",
    "questionnaire.saved": "Salvato",
    "questionnaire.error.load": "Impossibile caricare il questionario",
    "questionnaire.error.expired": "Questo link del questionario è scaduto",
    "questionnaire.error.submitted": "Questo questionario è già stato inviato",
    "questionnaire.error.notFound": "Questionario non trovato",
    "questionnaire.error.save": "Impossibile salvare i progressi",
    "questionnaire.error.submit": "Impossibile inviare il questionario",
    "questionnaire.error.submitFailed": "Invio non riuscito. Verifichi la connessione internet e riprovi.",
    "questionnaire.success.title": "Grazie!",
    "questionnaire.success.message": "Il Suo questionario è stato inviato con successo. Il Suo team medico esaminerà le Sue informazioni prima dell'intervento.",
    "questionnaire.success.close": "Può chiudere questa pagina.",
    "questionnaire.success.returnToPortal": "Torna al portale del paziente",
    "questionnaire.returnToPortal": "Torna al portale",
    "questionnaire.review.title": "Verifichi le Sue informazioni",
    "questionnaire.review.edit": "Modificare",
    "questionnaire.validation.required": "Campo obbligatorio",
    "questionnaire.validation.completeStep": "Compili le informazioni mancanti per continuare.",
  },
  es: {
    "questionnaire.title": "Cuestionario preoperatorio",
    "questionnaire.subtitle": "Por favor complete este formulario antes de su operación",
    "questionnaire.start": "Iniciar cuestionario",
    "questionnaire.starting": "Iniciando...",
    "questionnaire.steps.personal": "Datos personales",
    "questionnaire.steps.conditions": "Patologías",
    "questionnaire.steps.medications": "Medicamentos",
    "questionnaire.steps.allergies": "Alergias",
    "questionnaire.steps.lifestyle": "Estilo de vida",
    "questionnaire.steps.history": "Historial médico",
    "questionnaire.steps.notes": "Notas adicionales",
    "questionnaire.personal.firstName": "Nombre",
    "questionnaire.personal.lastName": "Apellido",
    "questionnaire.personal.birthday": "Fecha de nacimiento",
    "questionnaire.personal.email": "Email (opcional)",
    "questionnaire.personal.phone": "Teléfono",
    "questionnaire.personal.street": "Calle, Nr.",
    "questionnaire.personal.postalCode": "Código postal",
    "questionnaire.personal.city": "Ciudad",
    "questionnaire.personal.height": "Altura (cm)",
    "questionnaire.personal.weight": "Peso (kg)",
    "questionnaire.conditions.title": "¿Tiene alguna de las siguientes patologías?",
    "questionnaire.conditions.noneCheckbox": "No tengo patologías previas",
    "questionnaire.conditions.noPreviousSurgeries": "No he tenido operaciones previas",
    "questionnaire.conditions.noAnesthesiaProblems": "No he tenido problemas con la anestesia",
    "questionnaire.conditions.noDentalIssues": "No tengo problemas dentales",
    "questionnaire.conditions.noPonvIssues": "No he tenido reacciones previas (PONV, transfusión)",
    "questionnaire.conditions.notes": "Detalles adicionales",
    "questionnaire.conditions.category.cardiovascular": "Cardiovascular",
    "questionnaire.conditions.category.pulmonary": "Pulmonar",
    "questionnaire.conditions.category.gastrointestinal": "Gastrointestinal",
    "questionnaire.conditions.category.kidney": "Renal",
    "questionnaire.conditions.category.metabolic": "Metabólico",
    "questionnaire.conditions.category.neurological": "Neurológico",
    "questionnaire.conditions.category.psychiatric": "Psiquiátrico",
    "questionnaire.conditions.category.skeletal": "Esquelético",
    "questionnaire.conditions.category.coagulation": "Coagulación",
    "questionnaire.conditions.category.infectious": "Enfermedades infecciosas",
    "questionnaire.conditions.category.woman": "Ginecología",
    "questionnaire.conditions.category.children": "Pediátrico",
    "questionnaire.conditions.category.anesthesiaHistory": "Historial anestésico y quirúrgico",
    "questionnaire.conditions.category.ponvTransfusion": "NVPO / Transfusión",
    "questionnaire.medications.title": "Medicamentos actuales",
    "questionnaire.medications.subtitle": "Enumere todos los medicamentos que toma actualmente",
    "questionnaire.medications.noneCheckbox": "No tomo medicamentos",
    "questionnaire.medications.selectFromList": "Seleccionar de medicamentos comunes",
    "questionnaire.medications.orAddCustom": "O agregar un medicamento personalizado",
    "questionnaire.medications.name": "Nombre del medicamento",
    "questionnaire.medications.dosage": "Dosis",
    "questionnaire.medications.frequency": "Frecuencia",
    "questionnaire.medications.reason": "Motivo/Patología",
    "questionnaire.medications.add": "Agregar medicamento",
    "questionnaire.medications.addCustom": "Agregar medicamento personalizado",
    "questionnaire.medications.notes": "Notas adicionales sobre medicamentos",
    "questionnaire.allergies.title": "Alergias",
    "questionnaire.allergies.subtitle": "¿Tiene alergias a medicamentos, alimentos u otras sustancias?",
    "questionnaire.allergies.none": "Sin alergias conocidas",
    "questionnaire.allergies.noneCheckbox": "No tengo alergias",
    "questionnaire.allergies.notes": "Describa sus alergias y reacciones",
    "questionnaire.lifestyle.noneCheckbox": "No fumo, no bebo alcohol ni uso drogas",
    "questionnaire.lifestyle.noSmokingAlcohol": "No fumo ni bebo alcohol",
    "questionnaire.lifestyle.noDrugUse": "No uso drogas recreativas",
    "questionnaire.lifestyle.smoking.title": "Tabaco",
    "questionnaire.lifestyle.smoking.never": "Nunca he fumado",
    "questionnaire.lifestyle.smoking.former": "Exfumador",
    "questionnaire.lifestyle.smoking.current": "Fumador actual",
    "questionnaire.lifestyle.smoking.details": "¿Cuánto/desde cuándo?",
    "questionnaire.lifestyle.alcohol.title": "Consumo de alcohol",
    "questionnaire.lifestyle.alcohol.never": "Nunca",
    "questionnaire.lifestyle.alcohol.occasional": "Ocasional (1-2 bebidas/semana)",
    "questionnaire.lifestyle.alcohol.moderate": "Moderado (3-7 bebidas/semana)",
    "questionnaire.lifestyle.alcohol.heavy": "Elevado (más de 7 bebidas/semana)",
    "questionnaire.lifestyle.alcohol.details": "Detalles adicionales",
    "questionnaire.lifestyle.drugs.title": "Uso de drogas",
    "questionnaire.lifestyle.drugs.subtitle": "¿Ha usado alguna vez las siguientes sustancias (actualmente o en el pasado)?",
    "questionnaire.lifestyle.drugs.thc": "Cannabis (THC)",
    "questionnaire.lifestyle.drugs.cocaine": "Cocaína",
    "questionnaire.lifestyle.drugs.heroin": "Heroína/Opioides",
    "questionnaire.lifestyle.drugs.mdma": "MDMA/Éxtasis",
    "questionnaire.lifestyle.drugs.other": "Otras sustancias",
    "questionnaire.lifestyle.drugs.details": "Proporcione detalles (cuándo, con qué frecuencia)",
    "questionnaire.history.surgeries": "Operaciones previas",
    "questionnaire.history.surgeriesHint": "Enumere sus operaciones previas con fechas aproximadas",
    "questionnaire.history.anesthesia": "Problemas previos con la anestesia",
    "questionnaire.history.anesthesiaHint": "¿Usted o algún familiar ha tenido problemas con la anestesia?",
    "questionnaire.history.pregnancy": "Estado de embarazo",
    "questionnaire.history.pregnancy.notApplicable": "No aplicable",
    "questionnaire.history.pregnancy.no": "No embarazada",
    "questionnaire.history.pregnancy.possible": "Posiblemente embarazada",
    "questionnaire.history.pregnancy.yes": "Embarazada",
    "questionnaire.history.breastfeeding": "Actualmente en período de lactancia",
    "questionnaire.history.womanNotes": "Información adicional",
    "questionnaire.history.dental.title": "Estado dental",
    "questionnaire.history.dental.subtitle": "Indique cualquier problema dental",
    "questionnaire.history.dental.dentures": "Prótesis dentales (totales o parciales)",
    "questionnaire.history.dental.crowns": "Coronas o puentes dentales",
    "questionnaire.history.dental.implants": "Implantes dentales",
    "questionnaire.history.dental.looseTeeth": "Dientes flojos",
    "questionnaire.history.dental.damagedTeeth": "Dientes dañados o frágiles",
    "questionnaire.history.dental.notes": "Notas adicionales sobre estado dental",
    "questionnaire.history.ponv.title": "Reacciones previas",
    "questionnaire.history.ponv.subtitle": "¿Ha experimentado alguna de las siguientes situaciones?",
    "questionnaire.history.ponv.ponvPrevious": "Náuseas/vómitos después de la anestesia",
    "questionnaire.history.ponv.ponvFamily": "Antecedentes familiares de problemas con la anestesia",
    "questionnaire.history.ponv.bloodTransfusion": "Transfusión de sangre previa",
    "questionnaire.history.ponv.transfusionReaction": "Reacción a productos sanguíneos",
    "questionnaire.history.ponv.notes": "Detalles adicionales",
    "questionnaire.history.outpatient.title": "Contacto de acompañante",
    "questionnaire.history.outpatient.subtitle": "Para procedimientos ambulatorios: ¿quién le acompañará a casa?",
    "questionnaire.history.outpatient.subtitleSurgery": "Tras la intervención, la clínica necesita una persona de contacto. Indique quién le acompañará a casa.",
    "questionnaire.history.outpatient.importantBadge": "Importante",
    "questionnaire.history.outpatient.useAsEmergencyContact": "Guardar también esta persona como contacto de emergencia",
    "questionnaire.history.outpatient.useAsEmergencyContactHint": "Si ocurre algo durante o después de la intervención, la clínica contactará a esta persona. Desmarque si prefiere que no.",
    "questionnaire.history.outpatient.firstName": "Nombre",
    "questionnaire.history.outpatient.lastName": "Apellido",
    "questionnaire.history.outpatient.phone": "Número de teléfono",
    "questionnaire.uploads.title": "Carga de documentos",
    "questionnaire.uploads.subtitle": "Suba fotos de listas de medicamentos, diagnósticos o resultados de exámenes (opcional)",
    "questionnaire.uploads.selectFiles": "Seleccionar archivos",
    "questionnaire.uploads.dragDrop": "o arrastre archivos aquí",
    "questionnaire.uploads.supportedFormats": "Soportados: imágenes (JPG, PNG), documentos PDF",
    "questionnaire.uploads.maxSize": "Tamaño máximo: 10 MB",
    "questionnaire.uploads.category": "Categoría",
    "questionnaire.uploads.category.medication_list": "Lista de medicamentos",
    "questionnaire.uploads.category.diagnosis": "Diagnóstico/Informe",
    "questionnaire.uploads.category.exam_result": "Resultado de examen",
    "questionnaire.uploads.category.other": "Otro",
    "questionnaire.uploads.uploading": "Subiendo...",
    "questionnaire.uploads.uploadError": "Error al subir",
    "questionnaire.uploads.deleteConfirm": "¿Eliminar este archivo?",
    "questionnaire.uploads.noFiles": "Aún no se han subido archivos",
    "questionnaire.uploads.skip": "Puede omitir este paso si no tiene documentos que subir",
    "questionnaire.uploads.takePhoto": "Tomar foto",
    "questionnaire.uploads.or": "o",
    "questionnaire.steps.uploads": "Documentos",
    "questionnaire.notes.additional": "Notas adicionales",
    "questionnaire.notes.additionalHint": "Cualquier otra información que considere importante",
    "questionnaire.notes.questions": "Preguntas para su médico",
    "questionnaire.notes.questionsHint": "¿Tiene preguntas o dudas sobre su procedimiento?",
    "questionnaire.steps.summary": "Resumen",
    "questionnaire.steps.submit": "Enviar",
    "questionnaire.summary.title": "Resumen de su información",
    "questionnaire.summary.subtitle": "Por favor revise todas sus respuestas antes de enviar",
    "questionnaire.summary.personalInfo": "Datos personales",
    "questionnaire.summary.none": "Ninguno",
    "questionnaire.summary.noneExplicit": "Ninguno (confirmado explícitamente)",
    "questionnaire.summary.notFilled": "No completado",
    "questionnaire.summary.smoking": "Tabaco",
    "questionnaire.summary.alcohol": "Alcohol",
    "questionnaire.summary.drugs": "Drogas",
    "questionnaire.summary.previousSurgeries": "Operaciones previas",
    "questionnaire.summary.anesthesiaProblems": "Problemas con anestesia",
    "questionnaire.summary.dentalStatus": "Estado dental",
    "questionnaire.summary.previousReactions": "Reacciones previas",
    "questionnaire.summary.outpatientContact": "Contacto acompañante",
    "questionnaire.summary.caregiverMissingTitle": "Añada un contacto de emergencia",
    "questionnaire.summary.caregiverMissingHint": "Tras la intervención la clínica necesita una persona de contacto. Esta información es importante a nivel operativo.",
    "questionnaire.summary.caregiverMissingAction": "Añadir ahora",
    "questionnaire.preop.title": "Importante — lea antes de firmar",
    "questionnaire.preop.subtitle": "Esta es la información esencial para el día de la intervención.",
    "questionnaire.preop.arrival.label": "Hora de entrada",
    "questionnaire.preop.arrival.exact": "Por favor, preséntese en la clínica el {time}.",
    "questionnaire.preop.arrival.generic": "Recibirá su hora de entrada poco antes de la intervención. Por regla general, debe llegar unos {minutes} minutos antes de la hora prevista.",
    "questionnaire.preop.fasting.label": "Ayuno",
    "questionnaire.preop.fasting.text": "Sin comida sólida en las 6 horas previas. Se permiten líquidos claros (agua, té sin leche) hasta 2 horas antes. No mastique chicle.",
    "questionnaire.preop.escort.label": "Acompañante para el regreso",
    "questionnaire.preop.escort.text": "Es obligatorio que un adulto le acompañe a casa. Tras la anestesia no puede conducir ni viajar solo.",
    "questionnaire.preop.bring.label": "Traer consigo",
    "questionnaire.preop.bring.text": "Documento de identidad o pasaporte, tarjeta del seguro y una lista completa de los medicamentos que toma.",
    "questionnaire.preop.appearance.label": "Antes de venir",
    "questionnaire.preop.appearance.text": "Retire maquillaje, esmalte de uñas, lentes de contacto y todas las joyas (incluidos piercings y anillos). Use ropa cómoda.",
    "questionnaire.preop.driving.label": "Después de la intervención",
    "questionnaire.preop.driving.text": "Durante 24 horas tras la anestesia no debe conducir, manejar maquinaria ni firmar documentos vinculantes.",
    "questionnaire.preop.callIfChange.label": "Si no puede acudir",
    "questionnaire.preop.callIfChange.text": "Llame a la clínica cuanto antes al {phone}.",
    "questionnaire.summary.documents": "Documentos",
    "questionnaire.summary.additionalNotes": "Notas adicionales",
    "questionnaire.summary.questionsForDoctor": "Preguntas para el médico",
    "questionnaire.none.confirmed": "✓ Confirmado: Ninguno",
    "questionnaire.submit.title": "Revisar y enviar",
    "questionnaire.submit.subtitle": "Por favor revise su información y firme para completar el cuestionario",
    "questionnaire.submit.date": "Fecha de hoy",
    "questionnaire.submit.signature": "Su firma",
    "questionnaire.submit.signatureHint": "Firme a continuación para confirmar la exactitud de la información",
    "questionnaire.submit.addSignature": "Toque para agregar firma",
    "questionnaire.submit.changeSignature": "Cambiar firma",
    "questionnaire.submit.privacy": "Consentimiento de privacidad",
    "questionnaire.submit.privacyText": "Consiento el tratamiento de mis datos personales y de salud con el fin de mi tratamiento médico. Confirmo que la información proporcionada es correcta según mi conocimiento.",
    "questionnaire.submit.signatureRequired": "Por favor firme el cuestionario antes de enviarlo",
    "questionnaire.submit.privacyRequired": "Debe aceptar el consentimiento de privacidad para enviar el cuestionario",
    "questionnaire.personal.smsConsent": "Acepto recibir notificaciones por SMS",
    "questionnaire.personal.smsConsentText": "Consiento recibir recordatorios de citas y notificaciones importantes por SMS al número de teléfono indicado arriba.",
    "questionnaire.submit.phoneRequired": "El número de teléfono es obligatorio",
    "questionnaire.nav.back": "Atrás",
    "questionnaire.nav.next": "Siguiente",
    "questionnaire.nav.submit": "Enviar cuestionario",
    "questionnaire.nav.submitting": "Enviando...",
    "questionnaire.saving": "Guardando...",
    "questionnaire.saved": "Guardado",
    "questionnaire.error.load": "No se pudo cargar el cuestionario",
    "questionnaire.error.expired": "Este enlace del cuestionario ha caducado",
    "questionnaire.error.submitted": "Este cuestionario ya ha sido enviado",
    "questionnaire.error.notFound": "Cuestionario no encontrado",
    "questionnaire.error.save": "No se pudo guardar el progreso",
    "questionnaire.error.submit": "No se pudo enviar el cuestionario",
    "questionnaire.error.submitFailed": "Error al enviar. Por favor verifique su conexión a internet e inténtelo de nuevo.",
    "questionnaire.success.title": "¡Gracias!",
    "questionnaire.success.message": "Su cuestionario ha sido enviado con éxito. Su equipo médico revisará su información antes del procedimiento.",
    "questionnaire.success.close": "Puede cerrar esta página.",
    "questionnaire.success.returnToPortal": "Volver al portal del paciente",
    "questionnaire.returnToPortal": "Volver al portal",
    "questionnaire.review.title": "Revise su información",
    "questionnaire.review.edit": "Editar",
    "questionnaire.validation.required": "Campo obligatorio",
    "questionnaire.validation.completeStep": "Complete la información faltante para continuar.",
  },
  fr: {
    "questionnaire.title": "Questionnaire préopératoire",
    "questionnaire.subtitle": "Veuillez remplir ce formulaire avant votre opération",
    "questionnaire.start": "Commencer le questionnaire",
    "questionnaire.starting": "Démarrage...",
    "questionnaire.steps.personal": "Données personnelles",
    "questionnaire.steps.conditions": "Pathologies",
    "questionnaire.steps.medications": "Médicaments",
    "questionnaire.steps.allergies": "Allergies",
    "questionnaire.steps.lifestyle": "Mode de vie",
    "questionnaire.steps.history": "Antécédents médicaux",
    "questionnaire.steps.notes": "Notes supplémentaires",
    "questionnaire.personal.firstName": "Prénom",
    "questionnaire.personal.lastName": "Nom",
    "questionnaire.personal.birthday": "Date de naissance",
    "questionnaire.personal.email": "Email (facultatif)",
    "questionnaire.personal.phone": "Téléphone",
    "questionnaire.personal.street": "Rue, Nr.",
    "questionnaire.personal.postalCode": "Code postal",
    "questionnaire.personal.city": "Ville",
    "questionnaire.personal.height": "Taille (cm)",
    "questionnaire.personal.weight": "Poids (kg)",
    "questionnaire.conditions.title": "Avez-vous l'une des pathologies suivantes ?",
    "questionnaire.conditions.noneCheckbox": "Je n'ai pas de pathologies préexistantes",
    "questionnaire.conditions.noPreviousSurgeries": "Je n'ai pas eu d'opérations précédentes",
    "questionnaire.conditions.noAnesthesiaProblems": "Je n'ai pas eu de problèmes avec l'anesthésie",
    "questionnaire.conditions.noDentalIssues": "Je n'ai pas de problèmes dentaires",
    "questionnaire.conditions.noPonvIssues": "Je n'ai pas eu de réactions précédentes (PONV, transfusion)",
    "questionnaire.conditions.notes": "Détails supplémentaires",
    "questionnaire.conditions.category.cardiovascular": "Cardiovasculaire",
    "questionnaire.conditions.category.pulmonary": "Pulmonaire",
    "questionnaire.conditions.category.gastrointestinal": "Gastro-intestinal",
    "questionnaire.conditions.category.kidney": "Rénal",
    "questionnaire.conditions.category.metabolic": "Métabolique",
    "questionnaire.conditions.category.neurological": "Neurologique",
    "questionnaire.conditions.category.psychiatric": "Psychiatrique",
    "questionnaire.conditions.category.skeletal": "Squelettique",
    "questionnaire.conditions.category.coagulation": "Coagulation",
    "questionnaire.conditions.category.infectious": "Maladies infectieuses",
    "questionnaire.conditions.category.woman": "Gynécologie",
    "questionnaire.conditions.category.children": "Pédiatrique",
    "questionnaire.conditions.category.anesthesiaHistory": "Antécédents anesthésiques et chirurgicaux",
    "questionnaire.conditions.category.ponvTransfusion": "NVPO / Transfusion",
    "questionnaire.medications.title": "Médicaments actuels",
    "questionnaire.medications.subtitle": "Listez tous les médicaments que vous prenez actuellement",
    "questionnaire.medications.noneCheckbox": "Je ne prends pas de médicaments",
    "questionnaire.medications.selectFromList": "Sélectionner parmi les médicaments courants",
    "questionnaire.medications.orAddCustom": "Ou ajouter un médicament personnalisé",
    "questionnaire.medications.name": "Nom du médicament",
    "questionnaire.medications.dosage": "Dosage",
    "questionnaire.medications.frequency": "Fréquence",
    "questionnaire.medications.reason": "Raison/Pathologie",
    "questionnaire.medications.add": "Ajouter médicament",
    "questionnaire.medications.addCustom": "Ajouter médicament personnalisé",
    "questionnaire.medications.notes": "Notes supplémentaires sur les médicaments",
    "questionnaire.allergies.title": "Allergies",
    "questionnaire.allergies.subtitle": "Avez-vous des allergies aux médicaments, aliments ou autres substances ?",
    "questionnaire.allergies.none": "Aucune allergie connue",
    "questionnaire.allergies.noneCheckbox": "Je n'ai pas d'allergies",
    "questionnaire.allergies.notes": "Décrivez vos allergies et réactions",
    "questionnaire.lifestyle.noneCheckbox": "Je ne fume pas, ne bois pas d'alcool et ne consomme pas de drogues",
    "questionnaire.lifestyle.noSmokingAlcohol": "Je ne fume pas et ne bois pas d'alcool",
    "questionnaire.lifestyle.noDrugUse": "Je ne consomme pas de drogues récréatives",
    "questionnaire.lifestyle.smoking.title": "Tabac",
    "questionnaire.lifestyle.smoking.never": "Jamais fumé",
    "questionnaire.lifestyle.smoking.former": "Ancien fumeur",
    "questionnaire.lifestyle.smoking.current": "Fumeur actuel",
    "questionnaire.lifestyle.smoking.details": "Combien/depuis quand ?",
    "questionnaire.lifestyle.alcohol.title": "Consommation d'alcool",
    "questionnaire.lifestyle.alcohol.never": "Jamais",
    "questionnaire.lifestyle.alcohol.occasional": "Occasionnel (1-2 verres/semaine)",
    "questionnaire.lifestyle.alcohol.moderate": "Modéré (3-7 verres/semaine)",
    "questionnaire.lifestyle.alcohol.heavy": "Élevé (plus de 7 verres/semaine)",
    "questionnaire.lifestyle.alcohol.details": "Détails supplémentaires",
    "questionnaire.lifestyle.drugs.title": "Usage de drogues",
    "questionnaire.lifestyle.drugs.subtitle": "Avez-vous déjà utilisé les substances suivantes (actuellement ou par le passé) ?",
    "questionnaire.lifestyle.drugs.thc": "Cannabis (THC)",
    "questionnaire.lifestyle.drugs.cocaine": "Cocaïne",
    "questionnaire.lifestyle.drugs.heroin": "Héroïne/Opioïdes",
    "questionnaire.lifestyle.drugs.mdma": "MDMA/Ecstasy",
    "questionnaire.lifestyle.drugs.other": "Autres substances",
    "questionnaire.lifestyle.drugs.details": "Veuillez fournir des détails (quand, à quelle fréquence)",
    "questionnaire.history.surgeries": "Opérations précédentes",
    "questionnaire.history.surgeriesHint": "Listez vos opérations précédentes avec les dates approximatives",
    "questionnaire.history.anesthesia": "Problèmes précédents avec l'anesthésie",
    "questionnaire.history.anesthesiaHint": "Vous ou des membres de votre famille avez-vous eu des problèmes avec l'anesthésie ?",
    "questionnaire.history.pregnancy": "État de grossesse",
    "questionnaire.history.pregnancy.notApplicable": "Non applicable",
    "questionnaire.history.pregnancy.no": "Pas enceinte",
    "questionnaire.history.pregnancy.possible": "Possiblement enceinte",
    "questionnaire.history.pregnancy.yes": "Enceinte",
    "questionnaire.history.breastfeeding": "Allaitement en cours",
    "questionnaire.history.womanNotes": "Informations supplémentaires",
    "questionnaire.history.dental.title": "État dentaire",
    "questionnaire.history.dental.subtitle": "Veuillez indiquer tout problème dentaire",
    "questionnaire.history.dental.dentures": "Prothèses dentaires (totales ou partielles)",
    "questionnaire.history.dental.crowns": "Couronnes ou ponts dentaires",
    "questionnaire.history.dental.implants": "Implants dentaires",
    "questionnaire.history.dental.looseTeeth": "Dents mobiles",
    "questionnaire.history.dental.damagedTeeth": "Dents endommagées ou fragiles",
    "questionnaire.history.dental.notes": "Notes supplémentaires sur l'état dentaire",
    "questionnaire.history.ponv.title": "Réactions précédentes",
    "questionnaire.history.ponv.subtitle": "Avez-vous vécu l'une des situations suivantes ?",
    "questionnaire.history.ponv.ponvPrevious": "Nausées/vomissements après l'anesthésie",
    "questionnaire.history.ponv.ponvFamily": "Antécédents familiaux de problèmes d'anesthésie",
    "questionnaire.history.ponv.bloodTransfusion": "Transfusion sanguine précédente",
    "questionnaire.history.ponv.transfusionReaction": "Réaction aux produits sanguins",
    "questionnaire.history.ponv.notes": "Détails supplémentaires",
    "questionnaire.history.outpatient.title": "Contact d'accompagnement",
    "questionnaire.history.outpatient.subtitle": "Pour les procédures ambulatoires : qui vous accompagnera chez vous ?",
    "questionnaire.history.outpatient.subtitleSurgery": "Après l'intervention, la clinique a besoin d'une personne à contacter. Veuillez indiquer qui vous accompagnera chez vous.",
    "questionnaire.history.outpatient.importantBadge": "Important",
    "questionnaire.history.outpatient.useAsEmergencyContact": "Enregistrer aussi cette personne comme contact d'urgence",
    "questionnaire.history.outpatient.useAsEmergencyContactHint": "Si quelque chose survient pendant ou après l'intervention, la clinique contactera cette personne. Décochez si vous préférez que non.",
    "questionnaire.history.outpatient.firstName": "Prénom",
    "questionnaire.history.outpatient.lastName": "Nom",
    "questionnaire.history.outpatient.phone": "Numéro de téléphone",
    "questionnaire.uploads.title": "Téléchargement de documents",
    "questionnaire.uploads.subtitle": "Téléchargez des photos de listes de médicaments, diagnostics ou résultats d'examens (facultatif)",
    "questionnaire.uploads.selectFiles": "Sélectionner des fichiers",
    "questionnaire.uploads.dragDrop": "ou glissez-déposez vos fichiers ici",
    "questionnaire.uploads.supportedFormats": "Supportés : images (JPG, PNG), documents PDF",
    "questionnaire.uploads.maxSize": "Taille maximale : 10 Mo",
    "questionnaire.uploads.category": "Catégorie",
    "questionnaire.uploads.category.medication_list": "Liste de médicaments",
    "questionnaire.uploads.category.diagnosis": "Diagnostic/Rapport",
    "questionnaire.uploads.category.exam_result": "Résultat d'examen",
    "questionnaire.uploads.category.other": "Autre",
    "questionnaire.uploads.uploading": "Téléchargement...",
    "questionnaire.uploads.uploadError": "Échec du téléchargement",
    "questionnaire.uploads.deleteConfirm": "Supprimer ce fichier ?",
    "questionnaire.uploads.noFiles": "Aucun fichier téléchargé",
    "questionnaire.uploads.skip": "Vous pouvez sauter cette étape si vous n'avez pas de documents à télécharger",
    "questionnaire.uploads.takePhoto": "Prendre une photo",
    "questionnaire.uploads.or": "ou",
    "questionnaire.steps.uploads": "Documents",
    "questionnaire.notes.additional": "Notes supplémentaires",
    "questionnaire.notes.additionalHint": "Toute autre information que vous jugez importante",
    "questionnaire.notes.questions": "Questions pour votre médecin",
    "questionnaire.notes.questionsHint": "Avez-vous des questions ou des préoccupations concernant votre intervention ?",
    "questionnaire.steps.summary": "Résumé",
    "questionnaire.steps.submit": "Envoyer",
    "questionnaire.summary.title": "Résumé de vos informations",
    "questionnaire.summary.subtitle": "Veuillez vérifier toutes vos réponses avant l'envoi",
    "questionnaire.summary.personalInfo": "Données personnelles",
    "questionnaire.summary.none": "Aucun",
    "questionnaire.summary.noneExplicit": "Aucun (confirmé explicitement)",
    "questionnaire.summary.notFilled": "Non rempli",
    "questionnaire.summary.smoking": "Tabac",
    "questionnaire.summary.alcohol": "Alcool",
    "questionnaire.summary.drugs": "Drogues",
    "questionnaire.summary.previousSurgeries": "Opérations précédentes",
    "questionnaire.summary.anesthesiaProblems": "Problèmes d'anesthésie",
    "questionnaire.summary.dentalStatus": "État dentaire",
    "questionnaire.summary.previousReactions": "Réactions précédentes",
    "questionnaire.summary.outpatientContact": "Contact accompagnant",
    "questionnaire.summary.caregiverMissingTitle": "Veuillez ajouter un contact d'urgence",
    "questionnaire.summary.caregiverMissingHint": "Après votre intervention, la clinique a besoin d'une personne à contacter. Cette information est importante sur le plan opérationnel.",
    "questionnaire.summary.caregiverMissingAction": "Ajouter maintenant",
    "questionnaire.preop.title": "Important — à lire avant de signer",
    "questionnaire.preop.subtitle": "Voici les informations essentielles pour le jour de votre intervention.",
    "questionnaire.preop.arrival.label": "Heure d'arrivée",
    "questionnaire.preop.arrival.exact": "Veuillez vous présenter à la clinique le {time}.",
    "questionnaire.preop.arrival.generic": "Votre heure d'arrivée vous sera communiquée peu avant l'intervention. En règle générale, prévoyez d'arriver environ {minutes} minutes avant l'horaire prévu.",
    "questionnaire.preop.fasting.label": "Jeûne",
    "questionnaire.preop.fasting.text": "Pas de nourriture solide dans les 6 heures précédant l'intervention. Liquides clairs (eau, thé sans lait) autorisés jusqu'à 2 heures avant. Pas de chewing-gum.",
    "questionnaire.preop.escort.label": "Accompagnement pour le retour",
    "questionnaire.preop.escort.text": "Une personne adulte doit obligatoirement vous raccompagner. Après l'anesthésie, vous ne pouvez pas conduire ni rentrer seul.",
    "questionnaire.preop.bring.label": "À apporter",
    "questionnaire.preop.bring.text": "Pièce d'identité ou passeport, carte d'assurance et liste complète de vos médicaments actuels.",
    "questionnaire.preop.appearance.label": "Avant de venir",
    "questionnaire.preop.appearance.text": "Retirez maquillage, vernis à ongles, lentilles de contact et tous les bijoux (y compris piercings et bagues). Portez des vêtements amples.",
    "questionnaire.preop.driving.label": "Après l'intervention",
    "questionnaire.preop.driving.text": "Pendant 24 heures après l'anesthésie, vous ne devez pas conduire, utiliser de machines ou signer de documents engageants.",
    "questionnaire.preop.callIfChange.label": "En cas d'empêchement",
    "questionnaire.preop.callIfChange.text": "Veuillez appeler la clinique dès que possible au {phone}.",
    "questionnaire.summary.documents": "Documents",
    "questionnaire.summary.additionalNotes": "Notes supplémentaires",
    "questionnaire.summary.questionsForDoctor": "Questions pour le médecin",
    "questionnaire.none.confirmed": "✓ Confirmé : Aucun",
    "questionnaire.submit.title": "Vérifier et envoyer",
    "questionnaire.submit.subtitle": "Veuillez vérifier vos informations et signer pour compléter le questionnaire",
    "questionnaire.submit.date": "Date du jour",
    "questionnaire.submit.signature": "Votre signature",
    "questionnaire.submit.signatureHint": "Veuillez signer ci-dessous pour confirmer l'exactitude des informations",
    "questionnaire.submit.addSignature": "Touchez pour ajouter la signature",
    "questionnaire.submit.changeSignature": "Changer la signature",
    "questionnaire.submit.privacy": "Consentement de confidentialité",
    "questionnaire.submit.privacyText": "Je consens au traitement de mes données personnelles et de santé aux fins de mon traitement médical. Je confirme que les informations fournies sont exactes au meilleur de ma connaissance.",
    "questionnaire.submit.signatureRequired": "Veuillez signer le questionnaire avant de l'envoyer",
    "questionnaire.submit.privacyRequired": "Vous devez accepter le consentement de confidentialité pour envoyer le questionnaire",
    "questionnaire.personal.smsConsent": "J'accepte de recevoir des notifications par SMS",
    "questionnaire.personal.smsConsentText": "Je consens à recevoir des rappels de rendez-vous et des notifications importantes par SMS au numéro de téléphone indiqué ci-dessus.",
    "questionnaire.submit.phoneRequired": "Le numéro de téléphone est obligatoire",
    "questionnaire.nav.back": "Retour",
    "questionnaire.nav.next": "Suivant",
    "questionnaire.nav.submit": "Envoyer le questionnaire",
    "questionnaire.nav.submitting": "Envoi en cours...",
    "questionnaire.saving": "Sauvegarde...",
    "questionnaire.saved": "Sauvegardé",
    "questionnaire.error.load": "Impossible de charger le questionnaire",
    "questionnaire.error.expired": "Ce lien de questionnaire a expiré",
    "questionnaire.error.submitted": "Ce questionnaire a déjà été envoyé",
    "questionnaire.error.notFound": "Questionnaire non trouvé",
    "questionnaire.error.save": "Impossible de sauvegarder la progression",
    "questionnaire.error.submit": "Impossible d'envoyer le questionnaire",
    "questionnaire.error.submitFailed": "Échec de l'envoi. Veuillez vérifier votre connexion internet et réessayer.",
    "questionnaire.success.title": "Merci !",
    "questionnaire.success.message": "Votre questionnaire a été envoyé avec succès. Votre équipe médicale examinera vos informations avant votre intervention.",
    "questionnaire.success.close": "Vous pouvez fermer cette page.",
    "questionnaire.success.returnToPortal": "Retour au portail patient",
    "questionnaire.returnToPortal": "Retour au portail",
    "questionnaire.review.title": "Vérifiez vos informations",
    "questionnaire.review.edit": "Modifier",
    "questionnaire.validation.required": "Champ obligatoire",
    "questionnaire.validation.completeStep": "Veuillez compléter les informations manquantes pour continuer.",
  },
  zh: {
    "questionnaire.title": "术前问卷",
    "questionnaire.subtitle": "请在手术前填写此表格",
    "questionnaire.start": "开始问卷",
    "questionnaire.starting": "正在开始...",
    "questionnaire.steps.personal": "个人信息",
    "questionnaire.steps.conditions": "健康状况",
    "questionnaire.steps.medications": "用药情况",
    "questionnaire.steps.allergies": "过敏史",
    "questionnaire.steps.lifestyle": "生活习惯",
    "questionnaire.steps.history": "病史",
    "questionnaire.steps.notes": "其他备注",
    "questionnaire.personal.firstName": "名字",
    "questionnaire.personal.lastName": "姓氏",
    "questionnaire.personal.birthday": "出生日期",
    "questionnaire.personal.email": "邮箱（可选）",
    "questionnaire.personal.phone": "电话",
    "questionnaire.personal.street": "街道、门牌号",
    "questionnaire.personal.postalCode": "邮政编码",
    "questionnaire.personal.city": "城市",
    "questionnaire.personal.height": "身高（厘米）",
    "questionnaire.personal.weight": "体重（千克）",
    "questionnaire.conditions.title": "您是否有以下健康状况？",
    "questionnaire.conditions.noneCheckbox": "我没有任何既往疾病",
    "questionnaire.conditions.noPreviousSurgeries": "我从未进行过手术",
    "questionnaire.conditions.noAnesthesiaProblems": "我对麻醉没有不良反应史",
    "questionnaire.conditions.noDentalIssues": "我没有牙科问题",
    "questionnaire.conditions.noPonvIssues": "我对麻醉后恶心呕吐（PONV）或输血无不良反应",
    "questionnaire.conditions.notes": "其他详细信息",
    "questionnaire.conditions.category.cardiovascular": "心血管系统",
    "questionnaire.conditions.category.pulmonary": "呼吸系统",
    "questionnaire.conditions.category.gastrointestinal": "消化系统",
    "questionnaire.conditions.category.kidney": "肾脏",
    "questionnaire.conditions.category.metabolic": "代谢",
    "questionnaire.conditions.category.neurological": "神经系统",
    "questionnaire.conditions.category.psychiatric": "精神/心理",
    "questionnaire.conditions.category.skeletal": "骨骼",
    "questionnaire.conditions.category.coagulation": "凝血",
    "questionnaire.conditions.category.infectious": "传染病",
    "questionnaire.conditions.category.woman": "妇科",
    "questionnaire.conditions.category.children": "儿科",
    "questionnaire.conditions.category.anesthesiaHistory": "麻醉与手术史",
    "questionnaire.conditions.category.ponvTransfusion": "术后恶心呕吐 / 输血",
    "questionnaire.medications.title": "当前用药",
    "questionnaire.medications.subtitle": "列出您当前服用的所有药物",
    "questionnaire.medications.noneCheckbox": "我没有服用任何药物",
    "questionnaire.medications.selectFromList": "从常用药物中选择",
    "questionnaire.medications.orAddCustom": "或添加自定义药物",
    "questionnaire.medications.name": "药物名称",
    "questionnaire.medications.dosage": "剂量",
    "questionnaire.medications.frequency": "使用频率",
    "questionnaire.medications.reason": "用药原因/适应症",
    "questionnaire.medications.add": "添加药物",
    "questionnaire.medications.addCustom": "添加自定义药物",
    "questionnaire.medications.notes": "用药的其他备注",
    "questionnaire.allergies.title": "过敏史",
    "questionnaire.allergies.subtitle": "您对药物、食物或其他物质有过敏吗？",
    "questionnaire.allergies.none": "无已知过敏",
    "questionnaire.allergies.noneCheckbox": "我没有任何过敏",
    "questionnaire.allergies.notes": "请描述您的过敏及反应",
    "questionnaire.lifestyle.noneCheckbox": "我不吸烟、不饮酒，也不使用毒品",
    "questionnaire.lifestyle.noSmokingAlcohol": "我不吸烟也不饮酒",
    "questionnaire.lifestyle.noDrugUse": "我不使用任何娱乐性毒品",
    "questionnaire.lifestyle.smoking.title": "吸烟情况",
    "questionnaire.lifestyle.smoking.never": "从未吸烟",
    "questionnaire.lifestyle.smoking.former": "已戒烟",
    "questionnaire.lifestyle.smoking.current": "现在吸烟",
    "questionnaire.lifestyle.smoking.details": "吸烟量/吸烟时长？",
    "questionnaire.lifestyle.alcohol.title": "饮酒习惯",
    "questionnaire.lifestyle.alcohol.never": "从不饮酒",
    "questionnaire.lifestyle.alcohol.occasional": "偶尔（每周1-2次）",
    "questionnaire.lifestyle.alcohol.moderate": "适度（每周3-7次）",
    "questionnaire.lifestyle.alcohol.heavy": "大量（每周超过7次）",
    "questionnaire.lifestyle.alcohol.details": "其他详细信息",
    "questionnaire.lifestyle.drugs.title": "毒品使用",
    "questionnaire.lifestyle.drugs.subtitle": "您是否曾经使用过以下任何物质（目前或过去）？",
    "questionnaire.lifestyle.drugs.thc": "大麻（THC）",
    "questionnaire.lifestyle.drugs.cocaine": "可卡因",
    "questionnaire.lifestyle.drugs.heroin": "海洛因/阿片类药物",
    "questionnaire.lifestyle.drugs.mdma": "摇头丸/MDMA",
    "questionnaire.lifestyle.drugs.other": "其他物质",
    "questionnaire.lifestyle.drugs.details": "请提供详细信息（时间、频率等）",
    "questionnaire.history.surgeries": "既往手术史",
    "questionnaire.history.surgeriesHint": "请列出以往手术及大致时间",
    "questionnaire.history.anesthesia": "麻醉过敏史",
    "questionnaire.history.anesthesiaHint": "您本人或家人是否有过麻醉相关问题？",
    "questionnaire.history.pregnancy": "怀孕状态",
    "questionnaire.history.pregnancy.notApplicable": "不适用",
    "questionnaire.history.pregnancy.no": "未怀孕",
    "questionnaire.history.pregnancy.possible": "可能怀孕",
    "questionnaire.history.pregnancy.yes": "怀孕",
    "questionnaire.history.breastfeeding": "目前正在哺乳",
    "questionnaire.history.womanNotes": "其他信息",
    "questionnaire.history.dental.title": "牙齿状况",
    "questionnaire.history.dental.subtitle": "请说明是否有任何牙齿问题",
    "questionnaire.history.dental.dentures": "假牙（全口或部分）",
    "questionnaire.history.dental.crowns": "牙冠或牙桥",
    "questionnaire.history.dental.implants": "牙种植体",
    "questionnaire.history.dental.looseTeeth": "松动牙齿",
    "questionnaire.history.dental.damagedTeeth": "受损或脆弱牙齿",
    "questionnaire.history.dental.notes": "其他牙齿相关说明",
    "questionnaire.history.ponv.title": "过往反应",
    "questionnaire.history.ponv.subtitle": "您是否有以下经历？",
    "questionnaire.history.ponv.ponvPrevious": "麻醉后恶心/呕吐",
    "questionnaire.history.ponv.ponvFamily": "家族麻醉过敏史",
    "questionnaire.history.ponv.bloodTransfusion": "既往输血史",
    "questionnaire.history.ponv.transfusionReaction": "输血反应",
    "questionnaire.history.ponv.notes": "其他详细信息",
    "questionnaire.history.outpatient.title": "门诊护理联系人",
    "questionnaire.history.outpatient.subtitle": "门诊手术：谁将陪同您回家？",
    "questionnaire.history.outpatient.subtitleSurgery": "手术后，诊所需要联系某人。请告诉我们谁将陪同您回家。",
    "questionnaire.history.outpatient.importantBadge": "重要",
    "questionnaire.history.outpatient.useAsEmergencyContact": "同时将此人设为我的紧急联系人",
    "questionnaire.history.outpatient.useAsEmergencyContactHint": "如果手术期间或之后发生任何情况，诊所将联系此人。如不希望，请取消勾选。",
    "questionnaire.history.outpatient.firstName": "名字",
    "questionnaire.history.outpatient.lastName": "姓氏",
    "questionnaire.history.outpatient.phone": "电话号码",
    "questionnaire.uploads.title": "文档上传",
    "questionnaire.uploads.subtitle": "上传药物清单、诊断或检查结果的照片（可选）",
    "questionnaire.uploads.selectFiles": "选择文件",
    "questionnaire.uploads.dragDrop": "或拖拽文件至此",
    "questionnaire.uploads.supportedFormats": "支持：图片（JPG、PNG）、PDF文档",
    "questionnaire.uploads.maxSize": "最大文件大小：10 MB",
    "questionnaire.uploads.category": "类别",
    "questionnaire.uploads.category.medication_list": "药物清单",
    "questionnaire.uploads.category.diagnosis": "诊断/报告",
    "questionnaire.uploads.category.exam_result": "检查结果",
    "questionnaire.uploads.category.other": "其他",
    "questionnaire.uploads.uploading": "正在上传...",
    "questionnaire.uploads.uploadError": "上传失败",
    "questionnaire.uploads.deleteConfirm": "删除此文件？",
    "questionnaire.uploads.noFiles": "尚未上传任何文件",
    "questionnaire.uploads.skip": "如无文档需要上传，可跳过此步骤",
    "questionnaire.uploads.takePhoto": "拍照",
    "questionnaire.uploads.or": "或",
    "questionnaire.steps.uploads": "文件",
    "questionnaire.notes.additional": "补充说明",
    "questionnaire.notes.additionalHint": "您认为重要的其他信息",
    "questionnaire.notes.questions": "给医生的问题",
    "questionnaire.notes.questionsHint": "您对手术有任何疑问或顾虑吗？",
    "questionnaire.steps.summary": "总结",
    "questionnaire.steps.submit": "提交",
    "questionnaire.summary.title": "您的信息总结",
    "questionnaire.summary.subtitle": "提交前请核对所有答案",
    "questionnaire.summary.personalInfo": "个人信息",
    "questionnaire.summary.none": "无",
    "questionnaire.summary.noneExplicit": "无（已明确确认）",
    "questionnaire.summary.notFilled": "未填写",
    "questionnaire.summary.smoking": "吸烟",
    "questionnaire.summary.alcohol": "饮酒",
    "questionnaire.summary.drugs": "药物",
    "questionnaire.summary.previousSurgeries": "既往手术史",
    "questionnaire.summary.anesthesiaProblems": "麻醉相关问题",
    "questionnaire.summary.dentalStatus": "牙齿状况",
    "questionnaire.summary.previousReactions": "既往不良反应",
    "questionnaire.summary.outpatientContact": "门诊联系人",
    "questionnaire.summary.caregiverMissingTitle": "请添加紧急联系人",
    "questionnaire.summary.caregiverMissingHint": "手术后诊所需要联系紧急联系人。此信息对手术流程至关重要。",
    "questionnaire.summary.caregiverMissingAction": "立即添加",
    "questionnaire.preop.title": "重要提示——请在签署前阅读",
    "questionnaire.preop.subtitle": "这是您手术当天需要了解的关键信息。",
    "questionnaire.preop.arrival.label": "到达时间",
    "questionnaire.preop.arrival.exact": "请于{time}到达诊所。",
    "questionnaire.preop.arrival.generic": "您将在手术前不久收到具体到达时间。通常，您应在手术预定时间前约{minutes}分钟到达。",
    "questionnaire.preop.fasting.label": "禁食",
    "questionnaire.preop.fasting.text": "手术前6小时禁止进食固体食物。手术前2小时可饮用清液体（水、不含牛奶的茶）。请勿嚼口香糖。",
    "questionnaire.preop.escort.label": "陪同回家",
    "questionnaire.preop.escort.text": "需要一名成年陪同人员接您回家。麻醉后您不得自行驾车或独自回家。",
    "questionnaire.preop.bring.label": "请携带",
    "questionnaire.preop.bring.text": "身份证或护照、医保卡以及当前所有药物的完整清单。",
    "questionnaire.preop.appearance.label": "到达前",
    "questionnaire.preop.appearance.text": "请卸除化妆品、指甲油、隐形眼镜和所有饰品（包括穿孔饰品和戒指）。穿宽松舒适的衣物。",
    "questionnaire.preop.driving.label": "手术后",
    "questionnaire.preop.driving.text": "麻醉后24小时内，您不得驾驶车辆、操作机械或签署具有法律效力的文件。",
    "questionnaire.preop.callIfChange.label": "如无法前来",
    "questionnaire.preop.callIfChange.text": "请尽快致电{phone}联系诊所。",
    "questionnaire.summary.documents": "文件",
    "questionnaire.summary.additionalNotes": "补充说明",
    "questionnaire.summary.questionsForDoctor": "给医生的问题",
    "questionnaire.none.confirmed": "✓ 确认：无",
    "questionnaire.submit.title": "审核并提交",
    "questionnaire.submit.subtitle": "请审核您的信息，然后签名完成问卷",
    "questionnaire.submit.date": "今日日期",
    "questionnaire.submit.signature": "您的签名",
    "questionnaire.submit.signatureHint": "请在下方签名以确认信息准确",
    "questionnaire.submit.addSignature": "点击添加签名",
    "questionnaire.submit.changeSignature": "更改签名",
    "questionnaire.submit.privacy": "隐私同意",
    "questionnaire.submit.privacyText": "我同意处理我的个人和健康数据以用于我的医疗治疗。我确认所提供的信息在我所知范围内准确无误。",
    "questionnaire.submit.signatureRequired": "提交前请签名",
    "questionnaire.submit.privacyRequired": "您必须接受隐私同意才能提交问卷",
    "questionnaire.personal.smsConsent": "我同意接收短信通知",
    "questionnaire.personal.smsConsentText": "我同意通过上述提供的手机号码接收预约提醒和重要通知短信。",
    "questionnaire.submit.phoneRequired": "手机号码为必填项",
    "questionnaire.nav.back": "返回",
    "questionnaire.nav.next": "下一步",
    "questionnaire.nav.submit": "提交问卷",
    "questionnaire.nav.submitting": "提交中...",
    "questionnaire.saving": "保存中...",
    "questionnaire.saved": "已保存",
    "questionnaire.error.load": "加载问卷失败",
    "questionnaire.error.expired": "此问卷链接已过期",
    "questionnaire.error.submitted": "此问卷已提交过",
    "questionnaire.error.notFound": "未找到问卷",
    "questionnaire.error.save": "保存进度失败",
    "questionnaire.error.submit": "提交问卷失败",
    "questionnaire.error.submitFailed": "提交失败。请检查网络连接后重试。",
    "questionnaire.success.title": "感谢您！",
    "questionnaire.success.message": "您的问卷已成功提交。您的医疗团队将在手术前审核您的信息。",
    "questionnaire.success.close": "您现在可以关闭此页面。",
    "questionnaire.success.returnToPortal": "返回患者门户",
    "questionnaire.returnToPortal": "返回门户",
    "questionnaire.review.title": "审核您的信息",
    "questionnaire.review.edit": "编辑",
    "questionnaire.validation.required": "必填项",
    "questionnaire.validation.completeStep": "请填写缺失信息以继续。",
  },
};

export default function PatientQuestionnaire({ resolvedToken, isHospitalLink }: { resolvedToken?: string; isHospitalLink?: boolean } = {}) {
  const { token: urlToken } = useParams<{ token: string }>();
  const token = resolvedToken || urlToken;
  const [location] = useLocation();
  const isHospitalToken = isHospitalLink || location.includes('/questionnaire/hospital/');
  const [currentStep, setCurrentStep] = useState(0);
  // Pills strip ref so we can keep the active pill centred inside its
  // horizontal scroller as the patient progresses through steps.
  const pillsContainerRef = useRef<HTMLDivElement>(null);
  // Reset scroll to top whenever the step changes (back, next, or pill-jump),
  // so patients don't land mid-page on the new step's content.
  // On non-touch devices also focus the first focusable control in the new
  // step — speeds up keyboard-driven completion. Skipped on touch (`pointer:
  // coarse`) because on phones the popping keyboard hides content.
  // Also scrolls the step pills strip so the current pill stays visible
  // (the strip is its own overflow-x-auto container).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    const container = pillsContainerRef.current;
    const activePill = container?.children[currentStep] as HTMLElement | undefined;
    if (container && activePill) {
      container.scrollTo({
        left: Math.max(0, activePill.offsetLeft - container.clientWidth / 2 + activePill.offsetWidth / 2),
        behavior: 'smooth',
      });
    }
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
    if (isTouch) return;
    const id = window.setTimeout(() => {
      const card = document.querySelector<HTMLElement>('[data-step-card] input, [data-step-card] textarea, [data-step-card] select, [data-step-card] button:not([data-no-autofocus])');
      try { card?.focus({ preventScroll: true }); } catch { /* noop */ }
    }, 60);
    return () => window.clearTimeout(id);
  }, [currentStep]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [language, setLanguageState] = useState<string>(() => {
    const saved = localStorage.getItem('patient-portal-language');
    const supported = ['de', 'en', 'it', 'es', 'fr'];
    return saved && supported.includes(saved) ? saved : 'de';
  });
  const setLanguage = (l: string) => {
    setLanguageState(l);
    localStorage.setItem('patient-portal-language', l);
  };
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [attemptedNext, setAttemptedNext] = useState(false);

  useEffect(() => {
    setAttemptedNext(false);
  }, [currentStep]);

  const t = useCallback((key: string) => {
    return translations[language]?.[key] || translations["en"]?.[key] || key;
  }, [language]);

  const [formData, setFormData] = useState<FormData>({
    patientFirstName: "",
    patientLastName: "",
    patientBirthday: "",
    patientEmail: "",
    patientPhone: "",
    patientStreet: "",
    patientPostalCode: "",
    patientCity: "",
    height: "",
    weight: "",
    allergies: [],
    allergiesNotes: "",
    noAllergies: false,
    medications: [],
    medicationsNotes: "",
    noMedications: false,
    conditions: {},
    noConditions: false,
    smokingStatus: "",
    smokingDetails: "",
    alcoholStatus: "",
    alcoholDetails: "",
    drugUse: {},
    drugUseDetails: "",
    noDrugUse: false,
    noSmokingAlcohol: false,
    previousSurgeries: "",
    previousAnesthesiaProblems: "",
    noPreviousSurgeries: false,
    noAnesthesiaProblems: false,
    dentalIssues: {},
    dentalNotes: "",
    noDentalIssues: false,
    ponvTransfusionIssues: {},
    ponvTransfusionNotes: "",
    noPonvIssues: false,
    outpatientCaregiverFirstName: "",
    outpatientCaregiverLastName: "",
    outpatientCaregiverPhone: "",
    caregiverIsEmergencyContact: true,
    pregnancyStatus: "",
    breastfeeding: false,
    womanHealthNotes: "",
    additionalNotes: "",
    questionsForDoctor: "",
    submissionDate: formatDateForInput(new Date()),
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
    queryKey: ["/api/public/questionnaire", linkToken || token, isHospitalToken && !linkToken ? "hospital" : "direct", language],
    queryFn: async () => {
      const baseEndpoint = linkToken
        ? `/api/public/questionnaire/${linkToken}`
        : isHospitalToken
          ? `/api/public/questionnaire/hospital/${token}`
          : `/api/public/questionnaire/${token}`;
      const endpoint = `${baseEndpoint}?lang=${encodeURIComponent(language)}`;
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
      const savedLang = localStorage.getItem('patient-portal-language');
      const langToUse = savedLang || config.language || "de";
      setLanguage(langToUse);
      i18n.changeLanguage(langToUse);

      const existing = config.existingResponse;
      setFormData({
        patientFirstName: existing?.patientFirstName || config.patientFirstName || "",
        patientLastName: existing?.patientLastName || config.patientSurname || "",
        patientBirthday: existing?.patientBirthday || config.patientBirthday || "",
        patientEmail: existing?.patientEmail || config.patientEmail || "",
        patientPhone: existing?.patientPhone || config.patientPhone || "",
        patientStreet: existing?.patientStreet || config.patientStreet || "",
        patientPostalCode: existing?.patientPostalCode || config.patientPostalCode || "",
        patientCity: existing?.patientCity || config.patientCity || "",
        height: existing?.height || "",
        weight: existing?.weight || "",
        allergies: existing?.allergies || [],
        allergiesNotes: existing?.allergiesNotes || "",
        noAllergies: (existing as any)?.noAllergies || false,
        medications: existing?.medications || [],
        medicationsNotes: existing?.medicationsNotes || "",
        noMedications: (existing as any)?.noMedications || false,
        conditions: existing?.conditions || {},
        noConditions: (existing as any)?.noConditions || false,
        smokingStatus: existing?.smokingStatus || "",
        smokingDetails: existing?.smokingDetails || "",
        alcoholStatus: existing?.alcoholStatus || "",
        alcoholDetails: existing?.alcoholDetails || "",
        drugUse: (existing as any)?.drugUse || {},
        drugUseDetails: (existing as any)?.drugUseDetails || "",
        noDrugUse: (existing as any)?.noDrugUse || false,
        noSmokingAlcohol: (existing as any)?.noSmokingAlcohol || false,
        previousSurgeries: existing?.previousSurgeries || "",
        previousAnesthesiaProblems: existing?.previousAnesthesiaProblems || "",
        noPreviousSurgeries: (existing as any)?.noPreviousSurgeries || false,
        noAnesthesiaProblems: (existing as any)?.noAnesthesiaProblems || false,
        dentalIssues: (existing as any)?.dentalIssues || {},
        dentalNotes: (existing as any)?.dentalNotes || "",
        noDentalIssues: (existing as any)?.noDentalIssues || false,
        ponvTransfusionIssues: (existing as any)?.ponvTransfusionIssues || {},
        ponvTransfusionNotes: (existing as any)?.ponvTransfusionNotes || "",
        noPonvIssues: (existing as any)?.noPonvIssues || false,
        outpatientCaregiverFirstName: (existing as any)?.outpatientCaregiverFirstName || "",
        outpatientCaregiverLastName: (existing as any)?.outpatientCaregiverLastName || "",
        outpatientCaregiverPhone: (existing as any)?.outpatientCaregiverPhone || "",
        caregiverIsEmergencyContact: (existing as any)?.caregiverIsEmergencyContact ?? true,
        pregnancyStatus: existing?.pregnancyStatus || "",
        breastfeeding: existing?.breastfeeding || false,
        womanHealthNotes: existing?.womanHealthNotes || "",
        additionalNotes: existing?.additionalNotes || "",
        questionsForDoctor: existing?.questionsForDoctor || "",
        submissionDate: (existing as any)?.submissionDate || formatDateForInput(new Date()),
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
    onMutate: () => {
      // Clear dirty flag on mutate (not onSuccess) so typing-during-save
      // re-marks dirty correctly via the formData effect.
      pendingDirtyRef.current = false;
      setSaveStatus("saving");
    },
    onSuccess: () => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => setSaveStatus("error"),
  });

  // Debounced auto-save: persist progress 1.5s after the last field change so
  // patients don't lose work if they close the tab between Weiter clicks.
  // Skip the first render (formData is initialised once from existingResponse)
  // and skip after submit. `pendingDirtyRef` powers the beforeunload guard.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSaveRef = useRef(true);
  const pendingDirtyRef = useRef(false);
  useEffect(() => {
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    if (isSubmitted || !activeToken) return;
    pendingDirtyRef.current = true;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveMutation.mutate(formData);
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formData, isSubmitted, activeToken, saveMutation]);

  // Reset the skip flag whenever existingResponse repopulates formData so the
  // hydration write doesn't trigger a redundant save.
  useEffect(() => {
    if (config) skipNextAutoSaveRef.current = true;
  }, [config]);

  // Warn the patient before they close the tab if a save is queued or in-flight.
  // The autosave covers the common case (1.5s after typing) but won't catch the
  // "type-and-immediately-close" race; this dialog does.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isSubmitted) return;
      if (pendingDirtyRef.current || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isSubmitted, saveStatus]);

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch(`/api/public/questionnaire/${activeToken}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        throw new Error(`Failed to submit: ${res.status} ${errorText}`);
      }
      return res.json();
    },
    onSuccess: () => setIsSubmitted(true),
    onError: (error: Error) => {
      setSubmitError(true);
      Sentry.captureException(error, {
        tags: { component: 'questionnaire-submit' },
        extra: { token: activeToken },
      });
    },
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

  const isStepValid = useCallback((stepIndex: number): boolean => {
    const stepId = STEPS[stepIndex]?.id;
    switch (stepId) {
      case 'personal':
        return !!(formData.patientFirstName && formData.patientLastName && formData.patientBirthday && formData.patientPhone && formData.height && formData.weight && formData.smsConsent);
      case 'allergies':
        return formData.noAllergies || formData.allergies.length > 0 || !!formData.allergiesNotes;
      case 'conditions':
        return (formData.noConditions && formData.noPreviousSurgeries && formData.noAnesthesiaProblems && formData.noDentalIssues && formData.noPonvIssues)
          || Object.values(formData.conditions).some(c => c.checked)
          || !!formData.previousSurgeries
          || !!formData.previousAnesthesiaProblems
          || Object.values(formData.dentalIssues).some(v => v)
          || Object.values(formData.ponvTransfusionIssues).some(v => v);
      case 'medications':
        return formData.noMedications || formData.medications.length > 0 || !!formData.medicationsNotes;
      case 'lifestyle':
        return (formData.noSmokingAlcohol && formData.noDrugUse)
          || (formData.noSmokingAlcohol && Object.values(formData.drugUse).some(v => v))
          || (formData.noDrugUse && (!!formData.smokingStatus || !!formData.alcoholStatus))
          || (!!formData.smokingStatus || !!formData.alcoholStatus || Object.values(formData.drugUse).some(v => v));
      default:
        return true;
    }
  }, [formData]);

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

  const handleAutoAdvance = useCallback(() => {
    setTimeout(() => {
      handleNext();
    }, 600);
  }, [handleNext]);

  const getFirstMissingPersonalFieldId = useCallback((): string | null => {
    if (!formData.patientFirstName) return 'firstName';
    if (!formData.patientLastName) return 'lastName';
    if (!formData.patientBirthday) return 'birthday';
    if (!formData.height) return 'height';
    if (!formData.weight) return 'weight';
    if (!formData.patientPhone) return 'phone';
    if (!formData.smsConsent) return 'sms-consent';
    return null;
  }, [formData]);

  const handleNextClick = useCallback(() => {
    if (!isStepValid(currentStep)) {
      setAttemptedNext(true);
      if (STEPS[currentStep]?.id === 'personal') {
        const fieldId = getFirstMissingPersonalFieldId();
        if (fieldId) {
          const el = document.getElementById(fieldId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
              try { el.focus({ preventScroll: true }); } catch { /* noop */ }
            }, 350);
          }
        }
      } else {
        // Other steps: scroll to top so the validation banner (rendered above
        // the step content) is visible, then the patient knows why Weiter
        // didn't advance.
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    handleNext();
  }, [currentStep, isStepValid, getFirstMissingPersonalFieldId, handleNext]);

  const handleBack = useCallback(() => {
    const newStep = currentStep - 1;
    setCurrentStep(newStep);
    setFormData(prev => ({ ...prev, currentStep: newStep }));
  }, [currentStep]);

  const handleSubmit = useCallback(() => {
    if (!formData.patientPhone) {
      return;
    }
    setSubmitError(false);
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
      <div className="min-h-screen flex items-start justify-center bg-gray-50 dark:bg-gray-900 p-4 py-8">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">{t("questionnaire.success.title")}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t("questionnaire.success.message")}
            </p>

            {/* Repeat the pre-op info card here so it's the last thing the
                patient sees on the screen — and they have something to refer
                back to before the email arrives. Only for surgery-linked. */}
            {config?.surgeryId && (
              <div className="text-left mt-4">
                <PreOpInfoCard
                  surgery={config?.surgery}
                  hospital={config?.hospital}
                  language={language}
                  t={t}
                />
              </div>
            )}

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
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-auto gap-1.5 h-8 px-2 text-xs" data-testid="select-language">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">DE Deutsch</SelectItem>
                  <SelectItem value="en">EN English</SelectItem>
                  <SelectItem value="it">IT Italiano</SelectItem>
                  <SelectItem value="es">ES Español</SelectItem>
                  <SelectItem value="fr">FR Français</SelectItem>
                  <SelectItem value="zh">ZH 中文</SelectItem>
                </SelectContent>
              </Select>
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

        <div ref={pillsContainerRef} className="flex overflow-x-auto scrollbar-hide gap-2 mb-4 pb-2">
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

        <Card data-step-card>
          <CardContent className="pt-6">
            {/* Validation error banner — shown after a failed Weiter click on
                non-Personal steps (the Personal step has its own per-field
                scroll-and-focus). The handleNextClick scrolls to top so this
                banner is visible. */}
            {attemptedNext && !isStepValid(currentStep) && STEPS[currentStep]?.id !== 'personal' && (
              <div
                className="mb-4 p-3 border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300"
                data-testid="banner-step-validation-error"
              >
                {t("questionnaire.validation.completeStep")}
              </div>
            )}
            {currentStep === 0 && (
              <PersonalInfoStep
                formData={formData}
                updateField={updateField}
                t={t}
                attemptedNext={attemptedNext}
              />
            )}
            {currentStep === 1 && config && (
              <AllergiesStep
                formData={formData}
                updateField={updateField}
                allergyList={config.allergyList}
                t={t}
                language={language}
                onNoneChecked={() => handleAutoAdvance()}
              />
            )}
            {currentStep === 2 && config && (
              <ConditionsStep
                formData={formData}
                updateField={updateField}
                conditions={config.conditionsList}
                t={t}
                language={language}
                onNoneChecked={() => handleAutoAdvance()}
              />
            )}
            {currentStep === 3 && (
              <MedicationsStep
                formData={formData}
                updateField={updateField}
                t={t}
                medicationsList={config?.medicationsList}
                onNoneChecked={() => handleAutoAdvance()}
              />
            )}
            {currentStep === 4 && (
              <LifestyleStep
                formData={formData}
                updateField={updateField}
                t={t}
                onNoneChecked={() => handleAutoAdvance()}
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
                surgeryLinked={!!config?.surgeryId}
              />
            )}
            {currentStep === 7 && (
              <SummaryStep
                formData={formData}
                t={t}
                uploads={uploads}
                onEditStep={(stepIndex: number) => setCurrentStep(stepIndex)}
                allergyList={config?.allergyList}
                conditionsList={config?.conditionsList}
                language={language}
                surgeryLinked={!!config?.surgeryId}
              />
            )}
            {currentStep === 8 && (
              <SubmitStep
                formData={formData}
                updateField={updateField}
                t={t}
                onOpenSignature={() => setSignatureOpen(true)}
                submitError={submitError}
                surgery={config?.surgery}
                hospital={config?.hospital}
                language={language}
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
                onClick={handleNextClick}
                className={`flex-1 ${!isStepValid(currentStep) ? 'opacity-50' : ''}`}
                aria-disabled={!isStepValid(currentStep)}
                data-testid="button-next"
              >
                {t("questionnaire.nav.next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={submitMutation.isPending || !formData.privacyConsent || !formData.signature || !formData.patientPhone}
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
  attemptedNext?: boolean;
}

function NoneCheckbox({ checked, onChange, label, testId }: { checked: boolean; onChange: (checked: boolean) => void; label: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-300 ${
        checked
          ? 'border-green-500 bg-green-50 dark:bg-green-900/30 shadow-sm'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      data-testid={testId}
    >
      <div className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
        checked
          ? 'border-green-500 bg-green-500 text-white'
          : 'border-gray-300 dark:border-gray-600'
      }`}>
        {checked && <Check className="h-4 w-4" />}
      </div>
      <span className={`text-base font-medium ${
        checked ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'
      }`}>
        {label}
      </span>
      {checked && (
        <CheckCircle className="h-5 w-5 text-green-500 ml-auto flex-shrink-0" />
      )}
    </button>
  );
}

function RequiredFieldError({ show, t }: { show: boolean; t: (key: string) => string }) {
  if (!show) return null;
  return (
    <p className="text-sm text-red-500 mt-1" data-testid="error-required">
      {t("questionnaire.validation.required")}
    </p>
  );
}

function PersonalInfoStep({ formData, updateField, t, attemptedNext }: StepProps) {
  const showError = (value: string) => !!attemptedNext && !value;
  const errorClass = (value: string) => (showError(value) ? "border-red-500 focus-visible:ring-red-500" : "");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName">{t("questionnaire.personal.firstName")} <span className="text-red-500">*</span></Label>
          <Input
            id="firstName"
            value={formData.patientFirstName}
            onChange={(e) => updateField("patientFirstName", e.target.value)}
            data-testid="input-firstName"
            className={errorClass(formData.patientFirstName)}
          />
          <RequiredFieldError show={showError(formData.patientFirstName)} t={t} />
        </div>
        <div>
          <Label htmlFor="lastName">{t("questionnaire.personal.lastName")} <span className="text-red-500">*</span></Label>
          <Input
            id="lastName"
            value={formData.patientLastName}
            onChange={(e) => updateField("patientLastName", e.target.value)}
            data-testid="input-lastName"
            className={errorClass(formData.patientLastName)}
          />
          <RequiredFieldError show={showError(formData.patientLastName)} t={t} />
        </div>
      </div>

      <div>
        <Label htmlFor="birthday">{t("questionnaire.personal.birthday")} <span className="text-red-500">*</span></Label>
        <FlexibleDateInput
          id="birthday"
          value={formData.patientBirthday}
          onChange={(value) => updateField("patientBirthday", value)}
          data-testid="input-birthday"
        />
        <RequiredFieldError show={showError(formData.patientBirthday)} t={t} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="height">{t("questionnaire.personal.height")} <span className="text-red-500">*</span></Label>
          <Input
            id="height"
            type="number"
            value={formData.height}
            onChange={(e) => updateField("height", e.target.value)}
            placeholder="170"
            data-testid="input-height"
            className={errorClass(formData.height)}
          />
          <RequiredFieldError show={showError(formData.height)} t={t} />
        </div>
        <div>
          <Label htmlFor="weight">{t("questionnaire.personal.weight")} <span className="text-red-500">*</span></Label>
          <Input
            id="weight"
            type="number"
            value={formData.weight}
            onChange={(e) => updateField("weight", e.target.value)}
            placeholder="70"
            data-testid="input-weight"
            className={errorClass(formData.weight)}
          />
          <RequiredFieldError show={showError(formData.weight)} t={t} />
        </div>
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
          <Label htmlFor="phone">{t("questionnaire.personal.phone")} <span className="text-red-500">*</span></Label>
          <PhoneInputWithCountry
            id="phone"
            value={formData.patientPhone}
            onChange={(value) => updateField("patientPhone", value)}
            data-testid="input-phone"
          />
          <RequiredFieldError show={showError(formData.patientPhone)} t={t} />
        </div>
      </div>

      {formData.patientPhone && (
        <div>
          <div className={`flex items-start gap-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20 ${attemptedNext && !formData.smsConsent ? 'border-red-500' : ''}`}>
            <Checkbox
              id="sms-consent"
              checked={formData.smsConsent}
              onCheckedChange={(checked) => updateField("smsConsent", !!checked)}
              data-testid="checkbox-sms-consent"
            />
            <div>
              <Label htmlFor="sms-consent" className="cursor-pointer">
                {t("questionnaire.personal.smsConsent")} <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {t("questionnaire.personal.smsConsentText")}
              </p>
            </div>
          </div>
          <RequiredFieldError show={!!attemptedNext && !formData.smsConsent} t={t} />
        </div>
      )}

      <div className="space-y-2">
        <div>
          <Label htmlFor="street">{t("questionnaire.personal.street")}</Label>
          <Input
            id="street"
            value={formData.patientStreet}
            onChange={(e) => updateField("patientStreet", e.target.value)}
            autoComplete="street-address"
            data-testid="input-street"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="postalCode">{t("questionnaire.personal.postalCode")}</Label>
            <Input
              id="postalCode"
              value={formData.patientPostalCode}
              onChange={(e) => updateField("patientPostalCode", e.target.value)}
              autoComplete="postal-code"
              data-testid="input-postal-code"
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="city">{t("questionnaire.personal.city")}</Label>
            <Input
              id="city"
              value={formData.patientCity}
              onChange={(e) => updateField("patientCity", e.target.value)}
              autoComplete="address-level2"
              data-testid="input-city"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConditionsStepProps extends StepProps {
  conditions: Array<{ id: string; label: string; patientLabel?: string; patientHelpText?: string; patientVisible?: boolean; category: string }>;
  language: string;
  onNoneChecked: () => void;
}

function ConditionsStep({ formData, updateField, conditions, t, language, onNoneChecked }: ConditionsStepProps) {
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

  const handleNoneConditionsToggle = (checked: boolean) => {
    updateField("noConditions", checked);
    if (checked) {
      updateField("conditions", {});
    }
  };

  const handleNoneSurgeriesToggle = (checked: boolean) => {
    updateField("noPreviousSurgeries", checked);
    if (checked) {
      updateField("previousSurgeries", "");
    }
  };

  const handleNoneAnesthesiaToggle = (checked: boolean) => {
    updateField("noAnesthesiaProblems", checked);
    if (checked) {
      updateField("previousAnesthesiaProblems", "");
    }
  };

  const handleNoneDentalToggle = (checked: boolean) => {
    updateField("noDentalIssues", checked);
    if (checked) {
      updateField("dentalIssues", {});
      updateField("dentalNotes", "");
    }
  };

  const handleNonePonvToggle = (checked: boolean) => {
    updateField("noPonvIssues", checked);
    if (checked) {
      updateField("ponvTransfusionIssues", {});
      updateField("ponvTransfusionNotes", "");
    }
  };

  const allNoneChecked = formData.noConditions && formData.noPreviousSurgeries && formData.noAnesthesiaProblems && formData.noDentalIssues && formData.noPonvIssues;

  const handleAllNone = () => {
    updateField("noConditions", true);
    updateField("conditions", {});
    updateField("noPreviousSurgeries", true);
    updateField("previousSurgeries", "");
    updateField("noAnesthesiaProblems", true);
    updateField("previousAnesthesiaProblems", "");
    updateField("noDentalIssues", true);
    updateField("dentalIssues", {});
    updateField("dentalNotes", "");
    updateField("noPonvIssues", true);
    updateField("ponvTransfusionIssues", {});
    updateField("ponvTransfusionNotes", "");
    onNoneChecked();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t("questionnaire.conditions.title")}
      </p>

      <NoneCheckbox
        checked={formData.noConditions}
        onChange={handleNoneConditionsToggle}
        label={t("questionnaire.conditions.noneCheckbox")}
        testId="checkbox-no-conditions"
      />

      {!formData.noConditions && (
        <>
          {sortedCategories.map((category) => {
            const items = groupedConditions[category];
            const translatedCategory = t(`questionnaire.conditions.category.${category}`);
            const displayCategory =
              translatedCategory === `questionnaire.conditions.category.${category}`
                ? category
                : translatedCategory;
            return (
              <div key={category}>
                <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 capitalize">
                  {displayCategory}
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
                              {condition.patientLabel || condition.label}
                            </Label>
                            {condition.patientHelpText && (
                              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                {condition.patientHelpText}
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
        </>
      )}

      <Separator className="my-6" />

      <NoneCheckbox
        checked={formData.noPreviousSurgeries}
        onChange={handleNoneSurgeriesToggle}
        label={t("questionnaire.conditions.noPreviousSurgeries")}
        testId="checkbox-no-previous-surgeries"
      />

      {!formData.noPreviousSurgeries && (
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
      )}

      <Separator className="my-6" />

      <NoneCheckbox
        checked={formData.noAnesthesiaProblems}
        onChange={handleNoneAnesthesiaToggle}
        label={t("questionnaire.conditions.noAnesthesiaProblems")}
        testId="checkbox-no-anesthesia-problems"
      />

      {!formData.noAnesthesiaProblems && (
        <div>
          <Label htmlFor="previousAnesthesiaProblems">{t("questionnaire.history.anesthesia")}</Label>
          <p className="text-xs text-gray-500 mb-2">{t("questionnaire.history.anesthesiaHint")}</p>
          <Textarea
            id="previousAnesthesiaProblems"
            value={formData.previousAnesthesiaProblems}
            onChange={(e) => updateField("previousAnesthesiaProblems", e.target.value)}
            rows={4}
            data-testid="input-anesthesia-problems"
          />
        </div>
      )}

      <Separator className="my-6" />

      <NoneCheckbox
        checked={formData.noDentalIssues}
        onChange={handleNoneDentalToggle}
        label={t("questionnaire.conditions.noDentalIssues")}
        testId="checkbox-no-dental-issues"
      />

      {!formData.noDentalIssues && (
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
      )}

      <Separator className="my-6" />

      <NoneCheckbox
        checked={formData.noPonvIssues}
        onChange={handleNonePonvToggle}
        label={t("questionnaire.conditions.noPonvIssues")}
        testId="checkbox-no-ponv-issues"
      />

      {!formData.noPonvIssues && (
        <div>
          <h3 className="font-semibold mb-2">{t("questionnaire.history.ponv.title")}</h3>
          <p className="text-xs text-gray-500 mb-3">{t("questionnaire.history.ponv.subtitle")}</p>
          <div className="space-y-2">
            {[
              { id: "ponvPrevious", label: t("questionnaire.history.ponv.ponvPrevious") },
              { id: "ponvFamily", label: t("questionnaire.history.ponv.ponvFamily") },
              { id: "bloodTransfusion", label: t("questionnaire.history.ponv.bloodTransfusion") },
              { id: "transfusionReaction", label: t("questionnaire.history.ponv.transfusionReaction") },
            ].map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-2 border rounded">
                <Checkbox
                  id={`ponv-${item.id}`}
                  checked={formData.ponvTransfusionIssues[item.id] || false}
                  onCheckedChange={(checked) => updateField("ponvTransfusionIssues", { ...formData.ponvTransfusionIssues, [item.id]: !!checked })}
                  data-testid={`checkbox-ponv-${item.id}`}
                />
                <Label htmlFor={`ponv-${item.id}`} className="font-normal cursor-pointer">
                  {item.label}
                </Label>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Input
              placeholder={t("questionnaire.history.ponv.notes")}
              value={formData.ponvTransfusionNotes}
              onChange={(e) => updateField("ponvTransfusionNotes", e.target.value)}
              data-testid="input-ponv-notes"
            />
          </div>
        </div>
      )}

    </div>
  );
}

interface MedicationsStepProps extends StepProps {
  medicationsList?: Array<{ id: string; label: string; category: string }>;
  onNoneChecked: () => void;
}

function MedicationsStep({ formData, updateField, t, medicationsList, onNoneChecked }: MedicationsStepProps) {
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

  const handleNoneToggle = (checked: boolean) => {
    updateField("noMedications", checked);
    if (checked) {
      updateField("medications", []);
      updateField("medicationsNotes", "");
      onNoneChecked();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t("questionnaire.medications.title")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("questionnaire.medications.subtitle")}
        </p>
      </div>

      <NoneCheckbox
        checked={formData.noMedications}
        onChange={handleNoneToggle}
        label={t("questionnaire.medications.noneCheckbox")}
        testId="checkbox-no-medications"
      />

      {!formData.noMedications && hasPredefinedMedications && (
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

      {!formData.noMedications && hasPredefinedMedications && (
        <Separator className="my-4" />
      )}

      {!formData.noMedications && formData.medications.length > 0 && (
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

      {!formData.noMedications && (
        <Button 
          variant="outline" 
          onClick={() => addMedication()} 
          className="w-full" 
          data-testid="button-add-medication"
        >
          <Plus className="h-4 w-4 mr-1" />
          {hasPredefinedMedications ? t("questionnaire.medications.addCustom") : t("questionnaire.medications.add")}
        </Button>
      )}

      {!formData.noMedications && (
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
      )}
    </div>
  );
}

interface AllergiesStepProps extends StepProps {
  allergyList: Array<{ id: string; label: string; patientLabel?: string; patientHelpText?: string; patientVisible?: boolean }>;
  language: string;
  onNoneChecked: () => void;
}

function AllergiesStep({ formData, updateField, allergyList, t, language, onNoneChecked }: AllergiesStepProps) {
  const toggleAllergy = (id: string) => {
    const current = formData.allergies;
    if (current.includes(id)) {
      updateField("allergies", current.filter((a) => a !== id));
    } else {
      updateField("allergies", [...current, id]);
    }
  };

  const handleNoneToggle = (checked: boolean) => {
    updateField("noAllergies", checked);
    if (checked) {
      updateField("allergies", []);
      updateField("allergiesNotes", "");
      onNoneChecked();
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

      <NoneCheckbox
        checked={formData.noAllergies}
        onChange={handleNoneToggle}
        label={t("questionnaire.allergies.noneCheckbox")}
        testId="checkbox-no-allergies"
      />

      {!formData.noAllergies && (
        <>
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
                      {allergy.patientLabel || allergy.label}
                    </Label>
                    {allergy.patientHelpText && (
                      <p className="text-xs text-gray-500">{allergy.patientHelpText}</p>
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
        </>
      )}
    </div>
  );
}

interface LifestyleStepProps extends StepProps {
  onNoneChecked: () => void;
}

function LifestyleStep({ formData, updateField, t, onNoneChecked }: LifestyleStepProps) {
  const handleNoneSmokingAlcoholToggle = (checked: boolean) => {
    updateField("noSmokingAlcohol", checked);
    if (checked) {
      updateField("smokingStatus", "never");
      updateField("smokingDetails", "");
      updateField("alcoholStatus", "never");
      updateField("alcoholDetails", "");
    }
  };

  const handleNoneDrugUseToggle = (checked: boolean) => {
    updateField("noDrugUse", checked);
    if (checked) {
      updateField("drugUse", {});
      updateField("drugUseDetails", "");
    }
  };

  const allNone = formData.noSmokingAlcohol && formData.noDrugUse;

  return (
    <div className="space-y-6">
      <NoneCheckbox
        checked={formData.noSmokingAlcohol}
        onChange={handleNoneSmokingAlcoholToggle}
        label={t("questionnaire.lifestyle.noSmokingAlcohol")}
        testId="checkbox-no-smoking-alcohol"
      />

      {!formData.noSmokingAlcohol && (
        <>
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
        </>
      )}

      <Separator />

      <NoneCheckbox
        checked={formData.noDrugUse}
        onChange={handleNoneDrugUseToggle}
        label={t("questionnaire.lifestyle.noDrugUse")}
        testId="checkbox-no-drug-use"
      />

      {!formData.noDrugUse && (
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
      )}
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

interface SummaryStepProps {
  formData: FormData;
  t: (key: string) => string;
  uploads: FileUpload[];
  onEditStep: (stepIndex: number) => void;
  allergyList?: Array<{ id: string; label: string; patientLabel?: string; patientHelpText?: string; patientVisible?: boolean }>;
  conditionsList?: Array<{ id: string; label: string; patientLabel?: string; patientHelpText?: string; patientVisible?: boolean }>;
  language: string;
  surgeryLinked: boolean;
}

function SummaryStep({ formData, t, uploads, onEditStep, allergyList, conditionsList, language, surgeryLinked }: SummaryStepProps) {
  const NoneBadge = () => (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
      <CheckCircle className="h-3 w-3" />
      {t("questionnaire.summary.noneExplicit")}
    </span>
  );

  const SectionHeader = ({ title, stepIndex }: { title: string; stepIndex: number }) => (
    <div className="flex items-center justify-between">
      <h4 className="font-semibold text-sm">{title}</h4>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEditStep(stepIndex)}
        className="text-primary h-7 px-2"
        data-testid={`button-edit-step-${stepIndex}`}
      >
        <Pencil className="h-3 w-3 mr-1" />
        {language === "de" ? "Bearbeiten" : "Edit"}
      </Button>
    </div>
  );

  const checkedConditions = conditionsList?.filter(c => formData.conditions[c.id]?.checked) || [];
  const selectedAllergies = allergyList?.filter(a => formData.allergies.includes(a.id)) || [];
  const dentalItems = Object.entries(formData.dentalIssues).filter(([_, v]) => v);
  const ponvItems = Object.entries(formData.ponvTransfusionIssues).filter(([_, v]) => v);
  const drugItems = Object.entries(formData.drugUse).filter(([_, v]) => v);

  const hasCaregiverData =
    !!formData.outpatientCaregiverFirstName ||
    !!formData.outpatientCaregiverLastName ||
    !!formData.outpatientCaregiverPhone;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-lg">{t("questionnaire.summary.title")}</h3>
        <p className="text-sm text-gray-500">{t("questionnaire.summary.subtitle")}</p>
      </div>

      {/* Missing-caregiver banner: surgery-linked questionnaires NEED a Begleitperson
          for post-op contact. Don't block submit; just nudge the patient back. */}
      {surgeryLinked && !hasCaregiverData && (
        <div
          className="flex items-start gap-3 p-3 border-2 border-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/20"
          data-testid="banner-missing-caregiver"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {t("questionnaire.summary.caregiverMissingTitle")}
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
              {t("questionnaire.summary.caregiverMissingHint")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditStep(6)}
              className="mt-2 border-amber-500 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              data-testid="button-add-caregiver"
            >
              <Pencil className="h-3 w-3 mr-1" />
              {t("questionnaire.summary.caregiverMissingAction")}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="border rounded-lg p-3 space-y-1">
          <SectionHeader title={t("questionnaire.summary.personalInfo")} stepIndex={0} />
          <p className="text-sm">{formData.patientFirstName} {formData.patientLastName}</p>
          {formData.patientBirthday && <p className="text-sm text-gray-500">{formData.patientBirthday}</p>}
          {formData.patientPhone && <p className="text-sm text-gray-500">{formData.patientPhone}</p>}
          {(formData.patientStreet || formData.patientCity) && (
            <p className="text-sm text-gray-500">
              {[formData.patientStreet, [formData.patientPostalCode, formData.patientCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
            </p>
          )}
        </div>

        <div className="border rounded-lg p-3 space-y-1">
          <SectionHeader title={t("questionnaire.steps.allergies")} stepIndex={1} />
          {formData.noAllergies ? (
            <NoneBadge />
          ) : selectedAllergies.length > 0 || formData.allergiesNotes ? (
            <div>
              {selectedAllergies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedAllergies.map(a => (
                    <span key={a.id} className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-full text-xs">
                      {a.patientLabel || a.label}
                    </span>
                  ))}
                </div>
              )}
              {formData.allergiesNotes && <p className="text-sm text-gray-600 mt-1">{formData.allergiesNotes}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>
          )}
        </div>

        <div className="border rounded-lg p-3 space-y-2">
          <SectionHeader title={t("questionnaire.steps.conditions")} stepIndex={2} />
          {formData.noConditions ? (
            <NoneBadge />
          ) : checkedConditions.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {checkedConditions.map(c => (
                <span key={c.id} className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-xs">
                  {c.patientLabel || c.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>
          )}

          <div className="border-t pt-2 mt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">{t("questionnaire.summary.previousSurgeries")}</p>
            {formData.noPreviousSurgeries ? <NoneBadge /> : formData.previousSurgeries ? (
              <p className="text-sm">{formData.previousSurgeries}</p>
            ) : <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>}
          </div>

          <div className="border-t pt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">{t("questionnaire.summary.anesthesiaProblems")}</p>
            {formData.noAnesthesiaProblems ? <NoneBadge /> : formData.previousAnesthesiaProblems ? (
              <p className="text-sm">{formData.previousAnesthesiaProblems}</p>
            ) : <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>}
          </div>

          <div className="border-t pt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">{t("questionnaire.summary.dentalStatus")}</p>
            {formData.noDentalIssues ? <NoneBadge /> : dentalItems.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {dentalItems.map(([key]) => (
                  <span key={key} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">{key}</span>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>}
          </div>

          <div className="border-t pt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">{t("questionnaire.summary.previousReactions")}</p>
            {formData.noPonvIssues ? <NoneBadge /> : ponvItems.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {ponvItems.map(([key]) => (
                  <span key={key} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">{key}</span>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>}
          </div>
        </div>

        <div className="border rounded-lg p-3 space-y-1">
          <SectionHeader title={t("questionnaire.steps.medications")} stepIndex={3} />
          {formData.noMedications ? (
            <NoneBadge />
          ) : formData.medications.length > 0 ? (
            <div className="space-y-1">
              {formData.medications.map((med, i) => (
                <p key={i} className="text-sm">
                  {med.name}{med.dosage ? ` - ${med.dosage}` : ""}{med.frequency ? ` (${med.frequency})` : ""}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>
          )}
        </div>

        <div className="border rounded-lg p-3 space-y-2">
          <SectionHeader title={t("questionnaire.steps.lifestyle")} stepIndex={4} />
          <div>
            <p className="text-xs font-medium text-gray-500">{t("questionnaire.summary.smoking")}</p>
            {formData.noSmokingAlcohol ? <NoneBadge /> : formData.smokingStatus ? (
              <p className="text-sm capitalize">{formData.smokingStatus}{formData.smokingDetails ? `: ${formData.smokingDetails}` : ""}</p>
            ) : <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>}
          </div>
          {!formData.noSmokingAlcohol && (
            <div>
              <p className="text-xs font-medium text-gray-500">{t("questionnaire.summary.alcohol")}</p>
              {formData.alcoholStatus ? (
                <p className="text-sm capitalize">{formData.alcoholStatus}{formData.alcoholDetails ? `: ${formData.alcoholDetails}` : ""}</p>
              ) : <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500">{t("questionnaire.summary.drugs")}</p>
            {formData.noDrugUse ? <NoneBadge /> : drugItems.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {drugItems.map(([key]) => (
                  <span key={key} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs capitalize">{key}</span>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400 italic">{t("questionnaire.summary.notFilled")}</p>}
          </div>
        </div>

        {uploads.length > 0 && (
          <div className="border rounded-lg p-3 space-y-1">
            <SectionHeader title={t("questionnaire.summary.documents")} stepIndex={5} />
            <p className="text-sm">{uploads.length} {language === "de" ? "Dokument(e)" : "document(s)"}</p>
          </div>
        )}

        {(formData.additionalNotes || formData.questionsForDoctor) && (
          <div className="border rounded-lg p-3 space-y-1">
            <SectionHeader title={t("questionnaire.summary.additionalNotes")} stepIndex={6} />
            {formData.additionalNotes && <p className="text-sm">{formData.additionalNotes}</p>}
            {formData.questionsForDoctor && (
              <p className="text-sm text-gray-500">{t("questionnaire.summary.questionsForDoctor")}: {formData.questionsForDoctor}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CaregiverFields({ formData, updateField, t, surgeryLinked }: StepProps & { surgeryLinked: boolean }) {
  const hasCaregiverData =
    !!formData.outpatientCaregiverFirstName ||
    !!formData.outpatientCaregiverLastName ||
    !!formData.outpatientCaregiverPhone;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold">{t("questionnaire.history.outpatient.title")}</h3>
        {surgeryLinked && (
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {t("questionnaire.history.outpatient.importantBadge")}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {surgeryLinked
          ? t("questionnaire.history.outpatient.subtitleSurgery")
          : t("questionnaire.history.outpatient.subtitle")}
      </p>
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
        {surgeryLinked && hasCaregiverData && (
          <div className="flex items-start gap-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Checkbox
              id="caregiver-emergency-contact"
              checked={formData.caregiverIsEmergencyContact}
              onCheckedChange={(checked) => updateField("caregiverIsEmergencyContact", !!checked)}
              data-testid="checkbox-caregiver-emergency-contact"
            />
            <div>
              <Label htmlFor="caregiver-emergency-contact" className="cursor-pointer">
                {t("questionnaire.history.outpatient.useAsEmergencyContact")}
              </Label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {t("questionnaire.history.outpatient.useAsEmergencyContactHint")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotesStep({ formData, updateField, t, surgeryLinked }: StepProps & { surgeryLinked: boolean }) {
  // When the questionnaire is surgery-linked, the Begleitperson is operationally
  // critical (post-op contact). Hoist it above the optional notes/questions so
  // patients can't miss it. Otherwise keep the original ordering.
  return (
    <div className="space-y-6">
      {surgeryLinked && <CaregiverFields formData={formData} updateField={updateField} t={t} surgeryLinked={surgeryLinked} />}
      {surgeryLinked && <Separator className="my-6" />}

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

      {!surgeryLinked && (
        <>
          <Separator className="my-6" />
          <CaregiverFields formData={formData} updateField={updateField} t={t} surgeryLinked={surgeryLinked} />
        </>
      )}
    </div>
  );
}

// Pre-op info card — single source of truth for the "what to expect" panel.
// Rendered above the signature on the Submit step AND on the post-submit
// confirmation screen. Only shown for surgery-linked questionnaires.
//
// Contents (all hardcoded text per design decision A.a — clinical norms are
// universal; if a clinic differs we add per-hospital editable text later):
// Eintrittszeit, fasting, Begleitperson, documents, no make-up/jewelry,
// no driving 24h, who to call.
interface PreOpInfoCardProps {
  surgery: { admissionTime: string | null; plannedDate: string | null; stayType: string | null } | null | undefined;
  hospital: { name: string | null; phone: string | null; defaultAdmissionOffsetMinutes: number | null } | null | undefined;
  language: string;
  t: (key: string) => string;
}
function PreOpInfoCard({ surgery, hospital, language, t }: PreOpInfoCardProps) {
  const dtLocale = language === "de" ? "de-CH" : language === "it" ? "it-CH" : language === "fr" ? "fr-CH" : language === "es" ? "es-ES" : "en-GB";
  const dtFormat = (iso: string | null, withDate: boolean) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return withDate
        ? d.toLocaleString(dtLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
        : d.toLocaleTimeString(dtLocale, { hour: "2-digit", minute: "2-digit" });
    } catch { return null; }
  };

  const arrivalAbsolute = dtFormat(surgery?.admissionTime ?? null, true);
  const offsetMinutes = hospital?.defaultAdmissionOffsetMinutes ?? 60;

  return (
    <div className="border-2 border-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3" data-testid="preop-info-card">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <h3 className="font-semibold text-amber-900 dark:text-amber-100">
          {t("questionnaire.preop.title")}
        </h3>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-200">
        {t("questionnaire.preop.subtitle")}
      </p>

      <ul className="space-y-3 text-sm text-amber-900 dark:text-amber-100">
        <li>
          <p className="font-semibold">{t("questionnaire.preop.arrival.label")}</p>
          <p className="text-xs mt-0.5">
            {arrivalAbsolute
              ? t("questionnaire.preop.arrival.exact").replace("{time}", arrivalAbsolute)
              : t("questionnaire.preop.arrival.generic").replace("{minutes}", String(offsetMinutes))}
          </p>
        </li>
        <li>
          <p className="font-semibold">{t("questionnaire.preop.fasting.label")}</p>
          <p className="text-xs mt-0.5">{t("questionnaire.preop.fasting.text")}</p>
        </li>
        <li>
          <p className="font-semibold">{t("questionnaire.preop.escort.label")}</p>
          <p className="text-xs mt-0.5">{t("questionnaire.preop.escort.text")}</p>
        </li>
        <li>
          <p className="font-semibold">{t("questionnaire.preop.bring.label")}</p>
          <p className="text-xs mt-0.5">{t("questionnaire.preop.bring.text")}</p>
        </li>
        <li>
          <p className="font-semibold">{t("questionnaire.preop.appearance.label")}</p>
          <p className="text-xs mt-0.5">{t("questionnaire.preop.appearance.text")}</p>
        </li>
        <li>
          <p className="font-semibold">{t("questionnaire.preop.driving.label")}</p>
          <p className="text-xs mt-0.5">{t("questionnaire.preop.driving.text")}</p>
        </li>
        {hospital?.phone && (
          <li>
            <p className="font-semibold">{t("questionnaire.preop.callIfChange.label")}</p>
            <p className="text-xs mt-0.5">
              {t("questionnaire.preop.callIfChange.text").replace("{phone}", hospital.phone)}
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

interface SubmitStepProps extends StepProps {
  onOpenSignature: () => void;
  submitError: boolean;
  surgery?: QuestionnaireConfig["surgery"];
  hospital?: QuestionnaireConfig["hospital"];
  language: string;
}

function SubmitStep({ formData, updateField, t, onOpenSignature, submitError, surgery, hospital, language }: SubmitStepProps) {
  const surgeryLinked = !!surgery;
  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">{t("questionnaire.submit.title")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("questionnaire.submit.subtitle")}</p>
      </div>

      {surgeryLinked && (
        <PreOpInfoCard surgery={surgery} hospital={hospital} language={language} t={t} />
      )}

      <div>
        <Label className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {t("questionnaire.submit.date")}
        </Label>
        <DateInput
          value={formData.submissionDate}
          onChange={(v) => updateField("submissionDate", v)}
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

      {!formData.signature && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("questionnaire.submit.signatureRequired")}</AlertDescription>
        </Alert>
      )}
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
      {submitError && (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t("questionnaire.error.submitFailed")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
