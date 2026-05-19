import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, ListTodo, Send } from "lucide-react";
import { formatDateTime } from "@/lib/dateUtils";
import { useCreateTodo } from "@/hooks/useCreateTodo";
import { PatientDocumentsSection } from "@/components/shared/PatientDocumentsSection";
import { useCanWrite } from "@/hooks/useCanWrite";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { ALL_REGIONAL_BLOCKS } from "@/lib/anesthesiaBlocks";
import { QuestionnaireTab } from "@/components/questionnaire/QuestionnaireTab";

type PreOpAssessmentData = {
  // General Data
  height: string;
  weight: string;
  allergies: string[];
  allergiesOther: string;
  cave: string;
  asa: string;
  specialNotes: string;
  metAbove4: boolean | null;
  functionallyDependent: boolean | null;
  previousSurgeries: string;
  outpatientCaregiverFirstName: string;
  outpatientCaregiverLastName: string;
  outpatientCaregiverPhone: string;
  
  // Medications
  anticoagulationMeds: string[];
  anticoagulationMedsOther: string;
  generalMeds: string[];
  generalMedsOther: string;
  medicationsNotes: string;
  
  // Medical History
  heartIllnesses: Record<string, boolean>;
  heartNotes: string;
  lungIllnesses: Record<string, boolean>;
  lungNotes: string;
  giIllnesses: Record<string, boolean>;
  kidneyIllnesses: Record<string, boolean>;
  metabolicIllnesses: Record<string, boolean>;
  giKidneyMetabolicNotes: string;
  neuroIllnesses: Record<string, boolean>;
  psychIllnesses: Record<string, boolean>;
  skeletalIllnesses: Record<string, boolean>;
  neuroPsychSkeletalNotes: string;
  coagulationIllnesses: Record<string, boolean>;
  infectiousIllnesses: Record<string, boolean>;
  coagulationInfectiousNotes: string;
  anesthesiaHistoryIssues: Record<string, boolean>;
  dentalIssues: Record<string, boolean>;
  ponvTransfusionIssues: Record<string, boolean>;
  anesthesiaSurgicalHistoryNotes: string;
  womanIssues: Record<string, boolean>;
  womanNotes: string;
  noxen: Record<string, boolean>;
  noxenNotes: string;
  childrenIssues: Record<string, boolean>;
  childrenNotes: string;
  
  // Airway
  mallampati: string;
  mouthOpening: string;
  dentition: string;
  airwayDifficult: string;
  airwayNotes: string;
  
  // Fasting
  lastSolids: string;
  lastClear: string;
  
  // Planned Anesthesia
  anesthesiaTechniques: {
    general?: boolean;
    generalOptions?: Record<string, boolean>;
    spinal?: boolean;
    epidural?: boolean;
    epiduralOptions?: Record<string, boolean>;
    regional?: boolean;
    regionalOptions?: Record<string, boolean>;
    sedation?: boolean;
    combined?: boolean;
  };
  postOpICU: boolean;
  anesthesiaOther: string;
  
  // Installations
  installations: Record<string, boolean>;
  installationsOther: string;
  
  // Surgical Approval
  surgicalApproval: string;
  
  // Doctor Info
  assessmentDate: string;
  doctorName: string;
  doctorSignature: string;
};

interface PreOpOverviewProps {
  surgeryId: string;
  hospitalId?: string;
  patientId?: string;
  patientName?: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  questionnaireLinks?: any[];
}

function useIllnessLabels() {
  const { t } = useTranslation();
  return {
    htn: t('anesthesia.preop.illness.htn', 'Hypertension'),
    chd: t('anesthesia.preop.illness.chd', 'Coronary Heart Disease'),
    heartValve: t('anesthesia.preop.illness.heartValve', 'Heart Valve Disease'),
    arrhythmia: t('anesthesia.preop.illness.arrhythmia', 'Arrhythmia'),
    heartFailure: t('anesthesia.preop.illness.heartFailure', 'Heart Failure'),
    asthma: t('anesthesia.preop.illness.asthma', 'Asthma'),
    copd: t('anesthesia.preop.illness.copd', 'Chronic Obstructive Pulmonary Disease'),
    sleepApnea: t('anesthesia.preop.illness.sleepApnea', 'Sleep Apnea'),
    pneumonia: t('anesthesia.preop.illness.pneumonia', 'Pneumonia'),
    reflux: t('anesthesia.preop.illness.reflux', 'Gastroesophageal Reflux Disease'),
    ibd: t('anesthesia.preop.illness.ibd', 'Inflammatory Bowel Disease'),
    liverDisease: t('anesthesia.preop.illness.liverDisease', 'Liver Disease'),
    ckd: t('anesthesia.preop.illness.ckd', 'Chronic Kidney Disease'),
    dialysis: t('anesthesia.preop.illness.dialysis', 'Dialysis'),
    diabetes: t('anesthesia.preop.illness.diabetes', 'Diabetes Mellitus'),
    thyroid: t('anesthesia.preop.illness.thyroid', 'Thyroid Disease'),
    stroke: t('anesthesia.preop.illness.stroke', 'Cerebrovascular Accident'),
    epilepsy: t('anesthesia.preop.illness.epilepsy', 'Epilepsy'),
    parkinsons: t('anesthesia.preop.illness.parkinsons', "Parkinson's Disease"),
    dementia: t('anesthesia.preop.illness.dementia', 'Dementia'),
    depression: t('anesthesia.preop.illness.depression', 'Depression'),
    anxiety: t('anesthesia.preop.illness.anxiety', 'Anxiety'),
    psychosis: t('anesthesia.preop.illness.psychosis', 'Psychosis'),
    arthritis: t('anesthesia.preop.illness.arthritis', 'Arthritis'),
    osteoporosis: t('anesthesia.preop.illness.osteoporosis', 'Osteoporosis'),
    spineDisorders: t('anesthesia.preop.illness.spineDisorders', 'Spine Disorders'),
    pregnancy: t('anesthesia.preop.illness.pregnancy', 'Pregnancy'),
    breastfeeding: t('anesthesia.preop.illness.breastfeeding', 'Breastfeeding'),
    menopause: t('anesthesia.preop.illness.menopause', 'Menopause'),
    gynecologicalSurgery: t('anesthesia.preop.illness.gynecologicalSurgery', 'Gynecological Surgery History'),
    nicotine: t('anesthesia.preop.illness.nicotine', 'Nicotine Use'),
    alcohol: t('anesthesia.preop.illness.alcohol', 'Alcohol Use'),
    drugs: t('anesthesia.preop.illness.drugs', 'Drug Use'),
    prematurity: t('anesthesia.preop.illness.prematurity', 'Prematurity'),
    developmentalDelay: t('anesthesia.preop.illness.developmentalDelay', 'Developmental Delay'),
    congenitalAnomalies: t('anesthesia.preop.illness.congenitalAnomalies', 'Congenital Anomalies'),
    vaccination: t('anesthesia.preop.illness.vaccination', 'Vaccination Issues'),
  } as Record<string, string>;
}

function useInstallationLabels() {
  const { t } = useTranslation();
  return {
    arterialLine: t('anesthesia.preop.installation.arterialLine', 'Arterial Line'),
    centralLine: t('anesthesia.preop.installation.centralLine', 'Central Line'),
    cvc: t('anesthesia.preop.installation.cvc', 'Central Venous Catheter'),
    picLine: t('anesthesia.preop.installation.picLine', 'Peripherally Inserted Central Catheter'),
    epiduralCatheter: t('anesthesia.preop.installation.epiduralCatheter', 'Epidural Catheter'),
    urinaryCatheter: t('anesthesia.preop.installation.urinaryCatheter', 'Urinary Catheter'),
    nasogastricTube: t('anesthesia.preop.installation.nasogastricTube', 'Nasogastric Tube'),
    drainageTube: t('anesthesia.preop.installation.drainageTube', 'Drainage Tube'),
    ivExtensionLine: t('anesthesia.preop.installation.ivExtensionLine', 'Peripheral IV with Extension Line'),
    bilateralIV: t('anesthesia.preop.installation.bilateralIV', 'Bilateral Peripheral IV Access'),
  } as Record<string, string>;
}

export function PreOpOverview({ surgeryId, hospitalId, patientId, patientName, patientEmail, patientPhone, questionnaireLinks: externalLinks }: PreOpOverviewProps) {
  const { t } = useTranslation();
  const { createTodo, isPending: isTodoPending } = useCreateTodo(hospitalId);
  const canWrite = useCanWrite();
  const { addons } = useHospitalAddons();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const illnessLabels = useIllnessLabels();
  const installationLabels = useInstallationLabels();

  const { data: assessment, isLoading } = useQuery<PreOpAssessmentData>({
    queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  const { data: fetchedLinks = [] } = useQuery<any[]>({
    queryKey: [`/api/questionnaire/patient/${patientId}/links`],
    enabled: !!patientId,
  });

  const questionnaireLinks = (externalLinks && externalLinks.length > 0) ? externalLinks : fetchedLinks;

  const submittedLinks = questionnaireLinks.filter(
    (link: any) => link.status === 'submitted' && link.response
  );

  // Mirror PatientDocumentsSection's query so we can show a count on the
  // Documents tab trigger — the user shouldn't have to click in to find out
  // whether anything is attached.
  const { data: documentsList = [] } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/documents`, patientId],
    enabled: !!patientId && !!hospitalId,
  });
  const documentsCount = documentsList.length;

  const getSelectedItems = (record: Record<string, boolean>, labels: Record<string, string>) => {
    return Object.entries(record || {})
      .filter(([_, value]) => value)
      .map(([key]) => labels[key] || key);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Fall through to the main render even when no assessment row exists yet —
  // the subtab layout still has to surface Questionnaire + Documents.
  // `data` is treated as a partial so the ?.trim() / record-or-empty checks
  // below short-circuit on every field that's missing.
  const data = (assessment ?? {}) as PreOpAssessmentData;

  // Build medical history sections with data check
  const medicalSections = [
    {
      title: t('anesthesia.preop.medHistory.heart', 'Heart and Circulation'),
      color: "red",
      items: getSelectedItems(data.heartIllnesses, illnessLabels),
      notes: data.heartNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.lungs', 'Lungs'),
      color: "blue",
      items: getSelectedItems(data.lungIllnesses, illnessLabels),
      notes: data.lungNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.giTract', 'GI-Tract'),
      color: "yellow",
      items: getSelectedItems(data.giIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: t('anesthesia.preop.medHistory.kidney', 'Kidney'),
      color: "yellow",
      items: getSelectedItems(data.kidneyIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: t('anesthesia.preop.medHistory.metabolic', 'Metabolic'),
      color: "yellow",
      items: getSelectedItems(data.metabolicIllnesses, illnessLabels),
      notes: data.giKidneyMetabolicNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.neurological', 'Neurological'),
      color: "orange",
      items: getSelectedItems(data.neuroIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: t('anesthesia.preop.medHistory.psychiatry', 'Psychiatry'),
      color: "orange",
      items: getSelectedItems(data.psychIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: t('anesthesia.preop.medHistory.skeletal', 'Skeletal'),
      color: "orange",
      items: getSelectedItems(data.skeletalIllnesses, illnessLabels),
      notes: data.neuroPsychSkeletalNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.coagulation', 'Coagulation'),
      color: "red",
      items: getSelectedItems(data.coagulationIllnesses, illnessLabels),
      notes: data.coagulationInfectiousNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.infectious', 'Infectious'),
      color: "red",
      items: getSelectedItems(data.infectiousIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: t('anesthesia.preop.medHistory.gynecology', 'Gynecology'),
      color: "pink",
      items: getSelectedItems(data.womanIssues, illnessLabels),
      notes: data.womanNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.pediatric', 'Pediatric'),
      color: "green",
      items: getSelectedItems(data.childrenIssues, illnessLabels),
      notes: data.childrenNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.dependencies', 'Dependencies (Substances)'),
      color: "gray",
      items: getSelectedItems(data.noxen, illnessLabels),
      notes: data.noxenNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.anesthesiaHistory', 'Anesthesia History'),
      color: "purple",
      items: getSelectedItems(data.anesthesiaHistoryIssues, illnessLabels),
      notes: data.anesthesiaSurgicalHistoryNotes,
    },
    {
      title: t('anesthesia.preop.medHistory.dental', 'Dental'),
      color: "cyan",
      items: getSelectedItems(data.dentalIssues, illnessLabels),
      notes: null,
    },
    {
      title: t('anesthesia.preop.medHistory.ponvTransfusion', 'PONV / Transfusion'),
      color: "yellow",
      items: getSelectedItems(data.ponvTransfusionIssues, illnessLabels),
      notes: null,
    },
  ].filter(section => section.items.length > 0 || section.notes?.trim());

  const allMedications = [
    ...(data.anticoagulationMeds || []).map(m => `${m} (${t('anesthesia.patientDetail.anticoagulationSuffix', 'Anticoagulation')})`),
    data.anticoagulationMedsOther ? `${data.anticoagulationMedsOther} (${t('anesthesia.patientDetail.anticoagulationSuffix', 'Anticoagulation')})` : '',
    ...(data.generalMeds || []),
    data.generalMedsOther
  ].filter(Boolean);

  // Build anesthesia techniques with sub-options
  const anesthesiaWithDetails: string[] = [];
  const techniques = data.anesthesiaTechniques || {};
  
  if (techniques.general) {
    const subOptions = Object.entries(techniques.generalOptions || {})
      .filter(([_, value]) => value)
      .map(([key]) => {
        const labels: Record<string, string> = {
          'tiva-tci': 'TIVA/TCI',
          'tubus': t('anesthesia.preop.techniques.tubus', 'Endotracheal Tube'),
          'rsi': 'RSI',
          'larynxmask': t('anesthesia.preop.techniques.larynxmask', 'Laryngeal Mask'),
          'larynxmask-auragain': t('anesthesia.preop.techniques.larynxmaskAuragain', 'Laryngeal Mask AuraGain'),
          'rae-tubus': t('anesthesia.preop.techniques.raeTubus', 'Ring-Adair-Elwyn Tube'),
          'spiralfedertubus': t('anesthesia.preop.techniques.spiralTubus', 'Spiral Reinforced Tube'),
          'doppellumentubus': t('anesthesia.preop.techniques.doubleLumen', 'Double Lumen Tube'),
          'nasal-intubation': t('anesthesia.preop.techniques.nasalIntubation', 'Nasal Intubation'),
          'awake-intubation': t('anesthesia.preop.techniques.awakeIntubation', 'Awake Intubation'),
          'videolaryngoscope': t('anesthesia.preop.techniques.videolaryngoscope', 'Videolaryngoscope'),
          'ponv-prophylaxis': t('anesthesia.preop.techniques.ponvProphylaxis', 'PONV Prophylaxis'),
        };
        return labels[key] || key;
      });
    const generalLabel = t('anesthesia.preop.techniques.general', 'General Anesthesia');
    anesthesiaWithDetails.push(subOptions.length > 0 ? `${generalLabel} (${subOptions.join(', ')})` : generalLabel);
  }
  if (techniques.spinal) anesthesiaWithDetails.push(t('anesthesia.preop.techniques.spinal', 'Spinal'));
  if (techniques.epidural) {
    const subOptions = Object.entries(techniques.epiduralOptions || {})
      .filter(([_, value]) => value)
      .map(([key]) => key === 'thoracic' ? t('anesthesia.preop.techniques.thoracic', 'Thoracic') : t('anesthesia.preop.techniques.lumbar', 'Lumbar'));
    const epiduralLabel = t('anesthesia.preop.techniques.epidural', 'Epidural');
    anesthesiaWithDetails.push(subOptions.length > 0 ? `${epiduralLabel} (${subOptions.join(', ')})` : epiduralLabel);
  }
  if (techniques.regional) {
    const subOptions = Object.entries(techniques.regionalOptions || {})
      .filter(([_, value]) => value)
      .map(([key]) => {
        // Build label map from shared block definitions
        const labels: Record<string, string> = Object.fromEntries(
          ALL_REGIONAL_BLOCKS.map((b) => [
            `${b.id}-block`,
            t(`anesthesia.preop.blocks.${b.i18nKey}`, b.fallbackLabel),
          ]),
        );
        // Legacy ID kept for existing data + catheter option
        labels['sciatic-block'] = t('anesthesia.preop.blocks.sciatic', 'Sciatic Block');
        labels['with-catheter'] = t('anesthesia.preop.blocks.withCatheter', 'with Catheter');
        return labels[key] || key;
      });
    const regionalLabel = t('anesthesia.preop.techniques.regional', 'Regional Anesthesia');
    anesthesiaWithDetails.push(subOptions.length > 0 ? `${regionalLabel} (${subOptions.join(', ')})` : regionalLabel);
  }
  if (techniques.sedation) anesthesiaWithDetails.push(t('anesthesia.preop.techniques.sedation', 'Sedation'));
  if (techniques.combined) anesthesiaWithDetails.push(t('anesthesia.preop.techniques.combined', 'Combined'));

  const selectedAnesthesia = anesthesiaWithDetails;
  const selectedInstallations = getSelectedItems(data.installations, installationLabels);

  // Helper to get border and text color classes
  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { border: string; text: string }> = {
      red: { border: "border-red-500 dark:border-red-700", text: "text-red-600 dark:text-red-400" },
      blue: { border: "border-blue-500 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400" },
      yellow: { border: "border-yellow-500 dark:border-yellow-700", text: "text-yellow-600 dark:text-yellow-400" },
      orange: { border: "border-orange-500 dark:border-orange-700", text: "text-orange-600 dark:text-orange-400" },
      pink: { border: "border-pink-500 dark:border-pink-700", text: "text-pink-600 dark:text-pink-400" },
      green: { border: "border-green-500 dark:border-green-700", text: "text-green-600 dark:text-green-400" },
      gray: { border: "border-gray-500 dark:border-gray-400", text: "text-gray-700 dark:text-gray-300" },
      purple: { border: "border-purple-500 dark:border-purple-700", text: "text-purple-600 dark:text-purple-400" },
      cyan: { border: "border-cyan-500 dark:border-cyan-700", text: "text-cyan-600 dark:text-cyan-400" },
    };
    return colorMap[color] || { border: "", text: "" };
  };

  const hasFunctionalCapacity =
    data.metAbove4 !== null && data.metAbove4 !== undefined ||
    data.functionallyDependent !== null && data.functionallyDependent !== undefined;
  const hasPreviousSurgeries = !!data.previousSurgeries?.trim();
  const hasOutpatientCare = !!(
    data.outpatientCaregiverFirstName?.trim() ||
    data.outpatientCaregiverLastName?.trim() ||
    data.outpatientCaregiverPhone?.trim()
  );
  const outpatientCaregiverName = [
    data.outpatientCaregiverFirstName?.trim(),
    data.outpatientCaregiverLastName?.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  // Check if we have any relevant data
  const hasAnyData =
    data.asa?.trim() ||
    allMedications.length > 0 ||
    data.medicationsNotes?.trim() ||
    medicalSections.length > 0 ||
    hasFunctionalCapacity ||
    hasPreviousSurgeries ||
    hasOutpatientCare ||
    data.mallampati?.trim() ||
    data.mouthOpening?.trim() ||
    data.dentition?.trim() ||
    data.airwayDifficult?.trim() ||
    data.airwayNotes?.trim() ||
    data.lastSolids?.trim() ||
    data.lastClear?.trim() ||
    selectedAnesthesia.length > 0 ||
    data.postOpICU ||
    data.anesthesiaOther?.trim() ||
    selectedInstallations.length > 0 ||
    data.installationsOther?.trim() ||
    data.surgicalApproval?.trim() ||
    data.specialNotes?.trim();

  // Count of populated assessment sections, surfaced as a badge on the
  // Assessment tab so the user can see at a glance whether anything is
  // filled in (mirrors the badges on Questionnaire + Documents).
  const assessmentSectionCount =
    medicalSections.length +
    [
      data.specialNotes?.trim(),
      data.asa?.trim() || data.surgicalApproval?.trim(),
      allMedications.length > 0 || data.medicationsNotes?.trim(),
      hasFunctionalCapacity,
      hasPreviousSurgeries,
      hasOutpatientCare,
      data.mallampati?.trim() ||
        data.mouthOpening?.trim() ||
        data.dentition?.trim() ||
        data.airwayDifficult?.trim() ||
        data.airwayNotes?.trim(),
      data.lastSolids?.trim() || data.lastClear?.trim(),
      selectedAnesthesia.length > 0 || data.postOpICU || data.anesthesiaOther?.trim(),
      selectedInstallations.length > 0 || data.installationsOther?.trim(),
    ].filter(Boolean).length;

  // Default to whichever tab has actual content: if the assessment is empty
  // but a questionnaire was submitted, drop the user onto Questionnaire so
  // they don't see a blank Assessment tab first.
  const defaultTab: "assessment" | "questionnaire" | "documents" =
    !hasAnyData && submittedLinks.length > 0 ? "questionnaire" : "assessment";

  return (
    <div className="space-y-4 p-4">
      {/* Special Notes - Highlighted at top */}
      {data.specialNotes?.trim() && (
        <Card className="border-blue-500 dark:border-blue-700 group">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-blue-900 dark:text-blue-100 text-sm">{t('anesthesia.preop.specialNotes', 'Special Notes')}</div>
                  {hospitalId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => createTodo(data.specialNotes!, patientId, patientName)}
                      disabled={isTodoPending}
                      title={t('anesthesia.preop.addToTodo', 'Add to To-Do list')}
                      data-testid="button-add-todo-from-special-notes"
                    >
                      <ListTodo className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="text-blue-800 dark:text-blue-200 mt-1 text-sm">{data.specialNotes}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subtabs: keep Assessment / Questionnaire / Documents side-by-side
         instead of stacked. Special Notes stays above the tabs so it's always
         visible — it's the critical-flag block. The "send questionnaire"
         button sits to the right of the TabsList so it shares the row
         instead of pushing the tabs down with an otherwise-empty header. */}
      <Tabs defaultValue={defaultTab} className="w-full">
        {/* Compact rounded-pill segmented control — visually distinct from
           the case page's primary tab bar so it doesn't read as a second row
           of nested tabs. Sits left, with the Contact action floated right
           on the same line. */}
        <div className="flex items-center justify-between gap-2">
          <TabsList className="inline-flex h-9 gap-1 rounded-full bg-muted/40 p-1">
            <TabsTrigger
              value="assessment"
              className="rounded-full px-4 py-1 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              data-testid="preop-subtab-assessment"
            >
              {t('anesthesia.preop.tabs.assessment', 'Assessment')}
              {assessmentSectionCount > 0 && (
                <span className="ml-2 rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs data-[state=active]:bg-primary-foreground/20">
                  {assessmentSectionCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="questionnaire"
              className="rounded-full px-4 py-1 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              data-testid="preop-subtab-questionnaire"
            >
              {t('anesthesia.preop.tabs.questionnaire', 'Questionnaire')}
              {submittedLinks.length > 0 && (
                <span className="ml-2 rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs">
                  {submittedLinks.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="rounded-full px-4 py-1 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              data-testid="preop-subtab-documents"
            >
              {t('anesthesia.preop.tabs.documents', 'Documents')}
              {documentsCount > 0 && (
                <span className="ml-2 rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs">
                  {documentsCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          {addons.questionnaire && patientId && patientName && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSendDialogOpen(true)}
              title={t('common.patientCommunication', 'Contact')}
              data-testid="button-send-questionnaire-preop"
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>

        <TabsContent value="assessment" className="space-y-4 mt-4">
      {!hasAnyData && (
        <Card className="border-gray-300 dark:border-gray-600">
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            {t('anesthesia.preop.noAssessmentData', 'No assessment data')}
          </CardContent>
        </Card>
      )}

      {/* General Data and Surgical Approval - 70/30 Split */}
      {(data.asa?.trim() || data.surgicalApproval?.trim()) && (
        <div className="grid grid-cols-1 md:grid-cols-10 gap-4">
          {/* General Data Section - 70% */}
          {data.asa?.trim() && (
            <div className="md:col-span-7">
              <Card className="border-gray-300 dark:border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-gray-700 dark:text-gray-300 text-base">{t('anesthesia.preop.generalData', 'General Data')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm">
                    <span className="font-semibold">ASA:</span> {data.asa}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Surgical Approval Section - 30% */}
          {data.surgicalApproval?.trim() && (
            <div className="md:col-span-3">
              <Card className="border-gray-300 dark:border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-gray-700 dark:text-gray-300 text-base">{t('anesthesia.preop.surgicalApproval', 'Surgical Approval')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-sm font-semibold ${
                    data.surgicalApproval === 'approved' 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {data.surgicalApproval.replace('-', ' ').toUpperCase()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Medications Section */}
      {(allMedications.length > 0 || data.medicationsNotes?.trim()) && (
        <Card className="border-gray-300 dark:border-gray-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">{t('anesthesia.preop.medications', 'Medications')}</CardTitle>
          </CardHeader>
          <CardContent>
            {allMedications.length > 0 && (
              <div className="text-sm mb-2">
                {allMedications.join(', ')}
              </div>
            )}
            {data.medicationsNotes?.trim() && (
              <div className="text-sm italic text-muted-foreground">{data.medicationsNotes}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Medical History Sections */}
      {medicalSections.map((section, idx) => {
        const colors = getColorClasses(section.color);
        return (
          <Card key={idx} className={colors.border}>
            <CardHeader className="pb-3">
              <CardTitle className={`${colors.text} text-base`}>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {section.items.length > 0 && (
                <div className="text-sm mb-2">
                  {section.items.join(', ')}
                </div>
              )}
              {section.notes?.trim() && (
                <div className="text-sm italic text-muted-foreground">{section.notes}</div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Functional Capacity Section */}
      {hasFunctionalCapacity && (
        <Card className="border-gray-300 dark:border-gray-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">
              {t('anesthesia.preop.functionalCapacity', 'Functional Capacity')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.metAbove4 !== null && data.metAbove4 !== undefined && (
              <div>
                <span className="font-semibold">{t('anesthesia.preop.metAbove4', '≥ 4 METs')}:</span>{' '}
                {data.metAbove4
                  ? t('common.yes', 'Yes')
                  : t('common.no', 'No')}
              </div>
            )}
            {data.functionallyDependent !== null && data.functionallyDependent !== undefined && (
              <div>
                <span className="font-semibold">{t('anesthesia.preop.functionallyDependent', 'Functionally Dependent')}:</span>{' '}
                {data.functionallyDependent
                  ? t('common.yes', 'Yes')
                  : t('common.no', 'No')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Previous Surgeries Section */}
      {hasPreviousSurgeries && (
        <Card className="border-gray-300 dark:border-gray-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">
              {t('anesthesia.preop.previousSurgeries', 'Previous Surgeries')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm whitespace-pre-wrap">{data.previousSurgeries}</div>
          </CardContent>
        </Card>
      )}

      {/* Outpatient Care Section */}
      {hasOutpatientCare && (
        <Card className="border-cyan-500 dark:border-cyan-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-cyan-600 dark:text-cyan-400 text-base">
              {t('anesthesia.preop.outpatientCare', 'Outpatient Care')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {outpatientCaregiverName && (
              <div>
                <span className="font-semibold">{t('anesthesia.preop.caregiverName', 'Caregiver')}:</span>{' '}
                {outpatientCaregiverName}
              </div>
            )}
            {data.outpatientCaregiverPhone?.trim() && (
              <div>
                <span className="font-semibold">{t('anesthesia.preop.caregiverPhone', 'Phone')}:</span>{' '}
                <a href={`tel:${data.outpatientCaregiverPhone}`} className="text-primary underline">
                  {data.outpatientCaregiverPhone}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Airway Section */}
      {(data.mallampati?.trim() || data.mouthOpening?.trim() || data.dentition?.trim() || data.airwayDifficult?.trim() || data.airwayNotes?.trim()) && (
        <Card className="border-gray-300 dark:border-gray-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">{t('anesthesia.preop.airway', 'Airway')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.mallampati?.trim() && <div><span className="font-semibold">Mallampati:</span> {data.mallampati}</div>}
            {data.mouthOpening?.trim() && <div><span className="font-semibold">{t('anesthesia.preop.mouthOpening', 'Mouth Opening')}:</span> {data.mouthOpening}</div>}
            {data.dentition?.trim() && <div><span className="font-semibold">{t('anesthesia.preop.dentition', 'Dentition')}:</span> {data.dentition}</div>}
            {data.airwayDifficult?.trim() && (
              <div className="font-semibold text-red-600 dark:text-red-400">
                {t('anesthesia.preop.difficultAirway', 'Difficult Airway')}: {data.airwayDifficult}
              </div>
            )}
            {data.airwayNotes?.trim() && (
              <div className="italic text-muted-foreground">{data.airwayNotes}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fasting Section */}
      {(data.lastSolids?.trim() || data.lastClear?.trim()) && (
        <Card className="border-gray-300 dark:border-gray-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">{t('anesthesia.preop.fasting', 'Fasting')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.lastSolids?.trim() && <div><span className="font-semibold">{t('anesthesia.preop.lastSolids', 'Last Solids')}:</span> {formatDateTime(data.lastSolids)}</div>}
            {data.lastClear?.trim() && <div><span className="font-semibold">{t('anesthesia.preop.lastClear', 'Last Clear')}:</span> {formatDateTime(data.lastClear)}</div>}
          </CardContent>
        </Card>
      )}

      {/* Planned Anesthesia and Installations - 2 Column Layout */}
      {((selectedAnesthesia.length > 0 || data.postOpICU || data.anesthesiaOther?.trim()) || 
        (selectedInstallations.length > 0 || data.installationsOther?.trim())) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Planned Anesthesia Section */}
          {(selectedAnesthesia.length > 0 || data.postOpICU || data.anesthesiaOther?.trim()) && (
            <Card className="border-gray-300 dark:border-gray-600">
              <CardHeader className="pb-3">
                <CardTitle className="text-gray-700 dark:text-gray-300 text-base">{t('anesthesia.preop.plannedAnesthesia', 'Planned Anesthesia')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedAnesthesia.length > 0 && (
                  <div className="text-sm">
                    {selectedAnesthesia.join(', ')}
                  </div>
                )}
                {data.postOpICU && (
                  <div className="text-sm">{t('anesthesia.preop.postOpICU', 'Post-Op ICU')}</div>
                )}
                {data.anesthesiaOther?.trim() && (
                  <div className="text-sm italic text-muted-foreground">{data.anesthesiaOther}</div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Installations Section */}
          {(selectedInstallations.length > 0 || data.installationsOther?.trim()) && (
            <Card className="border-gray-300 dark:border-gray-600">
              <CardHeader className="pb-3">
                <CardTitle className="text-gray-700 dark:text-gray-300 text-base">{t('anesthesia.preop.plannedInstallations', 'Planned Installations')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedInstallations.length > 0 && (
                  <div className="text-sm">
                    {selectedInstallations.join(', ')}
                  </div>
                )}
                {data.installationsOther?.trim() && (
                  <div className="text-sm italic text-muted-foreground">{data.installationsOther}</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

        </TabsContent>

        <TabsContent value="questionnaire" className="mt-4">
          {submittedLinks.length > 0 && patientId && hospitalId ? (
            <QuestionnaireTab
              patientId={patientId}
              hospitalId={hospitalId}
              canWrite={false}
              questionnaireLinks={questionnaireLinks}
              onOpenSendDialog={() => setSendDialogOpen(true)}
              patientRecord={patientName ? {
                firstName: patientName.split(', ')[1],
                surname: patientName.split(', ')[0],
              } : undefined}
            />
          ) : (
            <Card className="border-gray-300 dark:border-gray-600">
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                {t('anesthesia.preop.noQuestionnaireResponses', 'No questionnaire responses yet.')}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {patientId && hospitalId && (
            <PatientDocumentsSection
              patientId={patientId}
              hospitalId={hospitalId}
              canWrite={canWrite}
              variant="card"
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Send Questionnaire Dialog */}
      {patientId && patientName && (
        <SendQuestionnaireDialog
          open={sendDialogOpen}
          onOpenChange={setSendDialogOpen}
          patientId={patientId}
          patientName={patientName}
          patientEmail={patientEmail}
          patientPhone={patientPhone}
          surgeryId={surgeryId}
        />
      )}
    </div>
  );
}
