import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, ListTodo, Send } from "lucide-react";
import { formatDateTime } from "@/lib/dateUtils";
import { useCreateTodo } from "@/hooks/useCreateTodo";
import { PatientDocumentsSection } from "@/components/shared/PatientDocumentsSection";
import { useCanWrite } from "@/hooks/useCanWrite";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";

type PreOpAssessmentData = {
  // General Data
  height: string;
  weight: string;
  allergies: string[];
  allergiesOther: string;
  cave: string;
  asa: string;
  specialNotes: string;
  
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
    cvc: t('anesthesia.preop.installation.cvc', 'Central Venous Catheter'),
    picLine: t('anesthesia.preop.installation.picLine', 'Peripherally Inserted Central Catheter'),
    urinaryCatheter: t('anesthesia.preop.installation.urinaryCatheter', 'Urinary Catheter'),
    nasogastricTube: t('anesthesia.preop.installation.nasogastricTube', 'Nasogastric Tube'),
    drainageTube: t('anesthesia.preop.installation.drainageTube', 'Drainage Tube'),
  } as Record<string, string>;
}

export function PreOpOverview({ surgeryId, hospitalId, patientId, patientName, patientEmail, patientPhone }: PreOpOverviewProps) {
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

  if (!assessment) {
    return (
      <div className="space-y-4 p-4">
        {/* Header with Send Questionnaire Button - visible even without assessment */}
        {addons.questionnaire && patientId && patientName && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSendDialogOpen(true)}
              title={t('common.patientCommunication', 'Contact')}
              data-testid="button-send-questionnaire-preop-no-data"
            >
              <Send className="h-5 w-5 text-white" />
            </Button>
          </div>
        )}
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          <p>{t('anesthesia.preop.noAssessmentData', 'No assessment data')}</p>
        </div>
        
        {/* Send Questionnaire Dialog */}
        {patientId && patientName && (
          <SendQuestionnaireDialog
            open={sendDialogOpen}
            onOpenChange={setSendDialogOpen}
            patientId={patientId}
            patientName={patientName}
            patientEmail={patientEmail}
            patientPhone={patientPhone}
          />
        )}
      </div>
    );
  }

  const data = assessment;

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
  ].filter(section => section.items.length > 0 || section.notes?.trim());

  const allMedications = [
    ...(data.anticoagulationMeds || []).map(m => `${m} (Anticoagulation)`),
    data.anticoagulationMedsOther ? `${data.anticoagulationMedsOther} (Anticoagulation)` : '',
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
        const labels: Record<string, string> = {
          'interscalene-block': t('anesthesia.preop.blocks.interscalene', 'Interscalene Block'),
          'supraclavicular-block': t('anesthesia.preop.blocks.supraclavicular', 'Supraclavicular Block'),
          'infraclavicular-block': t('anesthesia.preop.blocks.infraclavicular', 'Infraclavicular Block'),
          'axillary-block': t('anesthesia.preop.blocks.axillary', 'Axillary Block'),
          'femoral-block': t('anesthesia.preop.blocks.femoral', 'Femoral Block'),
          'sciatic-block': t('anesthesia.preop.blocks.sciatic', 'Sciatic Block'),
          'popliteal-block': t('anesthesia.preop.blocks.popliteal', 'Popliteal Block'),
          'tap-block': t('anesthesia.preop.blocks.tap', 'Transversus Abdominis Plane Block'),
          'pecs-block': t('anesthesia.preop.blocks.pecs', 'Pectoral Nerve Block'),
          'serratus-block': t('anesthesia.preop.blocks.serratus', 'Serratus Plane Block'),
          'with-catheter': t('anesthesia.preop.blocks.withCatheter', 'with Catheter'),
        };
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
    };
    return colorMap[color] || { border: "", text: "" };
  };

  // Check if we have any relevant data
  const hasAnyData = 
    data.asa?.trim() ||
    allMedications.length > 0 ||
    data.medicationsNotes?.trim() ||
    medicalSections.length > 0 ||
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

  if (!hasAnyData) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        <p>{t('anesthesia.preop.noAssessmentData', 'No assessment data')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header with Send Questionnaire Button */}
      {addons.questionnaire && patientId && patientName && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSendDialogOpen(true)}
            title={t('common.patientCommunication', 'Contact')}
            data-testid="button-send-questionnaire-preop"
          >
            <Send className="h-5 w-5 text-white" />
          </Button>
        </div>
      )}
      
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

      {/* Patient Documents Section */}
      {patientId && hospitalId && (
        <PatientDocumentsSection
          patientId={patientId}
          hospitalId={hospitalId}
          canWrite={canWrite}
          variant="card"
        />
      )}
      
      {/* Send Questionnaire Dialog */}
      {patientId && patientName && (
        <SendQuestionnaireDialog
          open={sendDialogOpen}
          onOpenChange={setSendDialogOpen}
          patientId={patientId}
          patientName={patientName}
          patientEmail={patientEmail}
          patientPhone={patientPhone}
        />
      )}
    </div>
  );
}
