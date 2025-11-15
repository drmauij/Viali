import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";
import { formatDateTime } from "@/lib/dateUtils";

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
}

const illnessLabels: Record<string, string> = {
  htn: "Hypertension", 
  chd: "Coronary Heart Disease", 
  heartValve: "Heart Valve Disease", 
  arrhythmia: "Arrhythmia", 
  heartFailure: "Heart Failure",
  asthma: "Asthma", 
  copd: "Chronic Obstructive Pulmonary Disease", 
  sleepApnea: "Sleep Apnea", 
  pneumonia: "Pneumonia",
  reflux: "Gastroesophageal Reflux Disease", 
  ibd: "Inflammatory Bowel Disease", 
  liverDisease: "Liver Disease",
  ckd: "Chronic Kidney Disease", 
  dialysis: "Dialysis",
  diabetes: "Diabetes Mellitus", 
  thyroid: "Thyroid Disease",
  stroke: "Cerebrovascular Accident", 
  epilepsy: "Epilepsy", 
  parkinsons: "Parkinson's Disease", 
  dementia: "Dementia",
  depression: "Depression", 
  anxiety: "Anxiety", 
  psychosis: "Psychosis",
  arthritis: "Arthritis", 
  osteoporosis: "Osteoporosis", 
  spineDisorders: "Spine Disorders",
  pregnancy: "Pregnancy", 
  breastfeeding: "Breastfeeding", 
  menopause: "Menopause", 
  gynecologicalSurgery: "Gynecological Surgery History",
  nicotine: "Nicotine Use", 
  alcohol: "Alcohol Use", 
  drugs: "Drug Use",
  prematurity: "Prematurity", 
  developmentalDelay: "Developmental Delay", 
  congenitalAnomalies: "Congenital Anomalies", 
  vaccination: "Vaccination Issues",
};

const installationLabels: Record<string, string> = {
  arterialLine: "Arterial Line", 
  cvc: "Central Venous Catheter", 
  picLine: "Peripherally Inserted Central Catheter", 
  urinaryCatheter: "Urinary Catheter", 
  nasogastricTube: "Nasogastric Tube", 
  drainageTube: "Drainage Tube",
};

export function PreOpOverview({ surgeryId }: PreOpOverviewProps) {
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
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        <p>No assessment data</p>
      </div>
    );
  }

  const data = assessment;

  // Build medical history sections with data check
  const medicalSections = [
    {
      title: "Heart and Circulation",
      color: "red",
      items: getSelectedItems(data.heartIllnesses, illnessLabels),
      notes: data.heartNotes,
    },
    {
      title: "Lungs",
      color: "blue",
      items: getSelectedItems(data.lungIllnesses, illnessLabels),
      notes: data.lungNotes,
    },
    {
      title: "GI-Tract",
      color: "yellow",
      items: getSelectedItems(data.giIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: "Kidney",
      color: "yellow",
      items: getSelectedItems(data.kidneyIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: "Metabolic",
      color: "yellow",
      items: getSelectedItems(data.metabolicIllnesses, illnessLabels),
      notes: data.giKidneyMetabolicNotes, // Combined notes for GI/Kidney/Metabolic
    },
    {
      title: "Neurological",
      color: "orange",
      items: getSelectedItems(data.neuroIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: "Psychiatry",
      color: "orange",
      items: getSelectedItems(data.psychIllnesses, illnessLabels),
      notes: null,
    },
    {
      title: "Skeletal",
      color: "orange",
      items: getSelectedItems(data.skeletalIllnesses, illnessLabels),
      notes: data.neuroPsychSkeletalNotes, // Combined notes
    },
    {
      title: "Gynecology",
      color: "pink",
      items: getSelectedItems(data.womanIssues, illnessLabels),
      notes: data.womanNotes,
    },
    {
      title: "Pediatric",
      color: "green",
      items: getSelectedItems(data.childrenIssues, illnessLabels),
      notes: data.childrenNotes,
    },
    {
      title: "Dependencies (Substances)",
      color: "gray",
      items: getSelectedItems(data.noxen, illnessLabels),
      notes: data.noxenNotes,
    },
  ].filter(section => section.items.length > 0 || section.notes?.trim());

  const allMedications = [
    ...data.anticoagulationMeds.map(m => `${m} (Anticoagulation)`),
    data.anticoagulationMedsOther ? `${data.anticoagulationMedsOther} (Anticoagulation)` : '',
    ...data.generalMeds,
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
          'tubus': 'Endotracheal Tube',
          'rsi': 'RSI',
          'larynxmask': 'Laryngeal Mask',
          'larynxmask-auragain': 'Laryngeal Mask AuraGain',
          'rae-tubus': 'Ring-Adair-Elwyn Tube',
          'spiralfedertubus': 'Spiral Reinforced Tube',
          'doppellumentubus': 'Double Lumen Tube',
          'nasal-intubation': 'Nasal Intubation',
          'awake-intubation': 'Awake Intubation',
          'ponv-prophylaxis': 'PONV Prophylaxis',
        };
        return labels[key] || key;
      });
    anesthesiaWithDetails.push(subOptions.length > 0 ? `General Anesthesia (${subOptions.join(', ')})` : 'General Anesthesia');
  }
  if (techniques.spinal) anesthesiaWithDetails.push('Spinal');
  if (techniques.epidural) {
    const subOptions = Object.entries(techniques.epiduralOptions || {})
      .filter(([_, value]) => value)
      .map(([key]) => key === 'thoracic' ? 'Thoracic' : 'Lumbar');
    anesthesiaWithDetails.push(subOptions.length > 0 ? `Epidural (${subOptions.join(', ')})` : 'Epidural');
  }
  if (techniques.regional) {
    const subOptions = Object.entries(techniques.regionalOptions || {})
      .filter(([_, value]) => value)
      .map(([key]) => {
        const labels: Record<string, string> = {
          'interscalene-block': 'Interscalene Block',
          'supraclavicular-block': 'Supraclavicular Block',
          'infraclavicular-block': 'Infraclavicular Block',
          'axillary-block': 'Axillary Block',
          'femoral-block': 'Femoral Block',
          'sciatic-block': 'Sciatic Block',
          'popliteal-block': 'Popliteal Block',
          'tap-block': 'Transversus Abdominis Plane Block',
          'pecs-block': 'Pectoral Nerve Block',
          'serratus-block': 'Serratus Plane Block',
          'with-catheter': 'with Catheter',
        };
        return labels[key] || key;
      });
    anesthesiaWithDetails.push(subOptions.length > 0 ? `Regional Anesthesia (${subOptions.join(', ')})` : 'Regional Anesthesia');
  }
  if (techniques.sedation) anesthesiaWithDetails.push('Sedation');
  if (techniques.combined) anesthesiaWithDetails.push('Combined');

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
      gray: { border: "border-black dark:border-gray-700", text: "text-black dark:text-gray-300" },
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
        <p>No assessment data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Special Notes - Highlighted at top */}
      {data.specialNotes?.trim() && (
        <Card className="border-blue-500 dark:border-blue-700">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-blue-900 dark:text-blue-100 text-sm">Special Notes</div>
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
                  <CardTitle className="text-gray-700 dark:text-gray-300 text-base">General Data</CardTitle>
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
                  <CardTitle className="text-gray-700 dark:text-gray-300 text-base">Surgical Approval</CardTitle>
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
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">Medications</CardTitle>
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
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">Airway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.mallampati?.trim() && <div><span className="font-semibold">Mallampati:</span> {data.mallampati}</div>}
            {data.mouthOpening?.trim() && <div><span className="font-semibold">Mouth Opening:</span> {data.mouthOpening}</div>}
            {data.dentition?.trim() && <div><span className="font-semibold">Dentition:</span> {data.dentition}</div>}
            {data.airwayDifficult?.trim() && (
              <div className="font-semibold text-red-600 dark:text-red-400">
                Difficult Airway: {data.airwayDifficult}
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
            <CardTitle className="text-gray-700 dark:text-gray-300 text-base">Fasting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.lastSolids?.trim() && <div><span className="font-semibold">Last Solids:</span> {formatDateTime(data.lastSolids)}</div>}
            {data.lastClear?.trim() && <div><span className="font-semibold">Last Clear:</span> {formatDateTime(data.lastClear)}</div>}
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
                <CardTitle className="text-gray-700 dark:text-gray-300 text-base">Planned Anesthesia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedAnesthesia.length > 0 && (
                  <div className="text-sm">
                    {selectedAnesthesia.join(', ')}
                  </div>
                )}
                {data.postOpICU && (
                  <div className="text-sm">Post-Op ICU</div>
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
                <CardTitle className="text-gray-700 dark:text-gray-300 text-base">Planned Installations</CardTitle>
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
    </div>
  );
}
