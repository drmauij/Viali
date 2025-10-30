import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate, formatDateTime } from "@/lib/dateUtils";

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
  mouth_opening: string;
  dentition: string;
  airwayDifficult: string;
  airwayNotes: string;
  
  // Fasting
  last_solids: string;
  last_clear: string;
  
  // Planned Anesthesia
  anesthesiaTechniques: Record<string, boolean>;
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
  data: PreOpAssessmentData;
}

const illnessLabels: Record<string, string> = {
  // Heart
  htn: "Hypertension",
  chd: "CHD",
  heartValve: "Heart Valve",
  arrhythmia: "Arrhythmia",
  heartFailure: "Heart Failure",
  // Lung
  asthma: "Asthma",
  copd: "COPD",
  sleepApnea: "Sleep Apnea",
  pneumonia: "Pneumonia",
  // GI
  reflux: "Reflux",
  ibd: "IBD",
  liverDisease: "Liver Disease",
  // Kidney
  ckd: "CKD",
  dialysis: "Dialysis",
  // Metabolic
  diabetes: "Diabetes",
  thyroid: "Thyroid",
  // Neuro
  stroke: "Stroke",
  epilepsy: "Epilepsy",
  parkinsons: "Parkinson's",
  dementia: "Dementia",
  // Psych
  depression: "Depression",
  anxiety: "Anxiety",
  psychosis: "Psychosis",
  // Skeletal
  arthritis: "Arthritis",
  osteoporosis: "Osteoporosis",
  spineDisorders: "Spine Disorders",
  // Woman
  pregnancy: "Pregnancy",
  breastfeeding: "Breastfeeding",
  menopause: "Menopause",
  gynecologicalSurgery: "Gyn Surgery",
  // Noxen
  nicotine: "Nicotine",
  alcohol: "Alcohol",
  drugs: "Drugs",
  // Children
  prematurity: "Prematurity",
  developmentalDelay: "Dev. Delay",
  congenitalAnomalies: "Congenital Anomalies",
  vaccination: "Vaccination Issues",
};

const anesthesiaLabels: Record<string, string> = {
  general: "General",
  spinal: "Spinal",
  epidural: "Epidural",
  regional: "Regional",
  sedation: "Sedation",
  combined: "Combined",
};

const installationLabels: Record<string, string> = {
  arterialLine: "Art. Line",
  cvc: "CVC",
  picLine: "PICC",
  urinaryCatheter: "Urinary Cath.",
  nasogastricTube: "NG Tube",
  drainageTube: "Drainage",
};

export function PreOpOverview({ data }: PreOpOverviewProps) {
  // Helper to get selected items from boolean records
  const getSelectedItems = (record: Record<string, boolean>, labels: Record<string, string>) => {
    return Object.entries(record)
      .filter(([_, value]) => value)
      .map(([key]) => labels[key] || key);
  };

  // Helper to check if any field in a group has data
  const hasData = (condition: boolean) => condition;

  // Collect all medical history items
  const medicalHistory = [
    ...getSelectedItems(data.heartIllnesses, illnessLabels),
    ...getSelectedItems(data.lungIllnesses, illnessLabels),
    ...getSelectedItems(data.giIllnesses, illnessLabels),
    ...getSelectedItems(data.kidneyIllnesses, illnessLabels),
    ...getSelectedItems(data.metabolicIllnesses, illnessLabels),
    ...getSelectedItems(data.neuroIllnesses, illnessLabels),
    ...getSelectedItems(data.psychIllnesses, illnessLabels),
    ...getSelectedItems(data.skeletalIllnesses, illnessLabels),
    ...getSelectedItems(data.womanIssues, illnessLabels),
    ...getSelectedItems(data.noxen, illnessLabels),
    ...getSelectedItems(data.childrenIssues, illnessLabels),
  ];

  const allNotes = [
    data.heartNotes,
    data.lungNotes,
    data.giKidneyMetabolicNotes,
    data.neuroPsychSkeletalNotes,
    data.womanNotes,
    data.noxenNotes,
    data.childrenNotes,
  ].filter(note => note.trim());

  const selectedAnesthesia = getSelectedItems(data.anesthesiaTechniques, anesthesiaLabels);
  const selectedInstallations = getSelectedItems(data.installations, installationLabels);

  // If no data at all, show empty state
  const hasAnyData = 
    data.asa.trim() ||
    data.specialNotes.trim() ||
    data.anticoagulationMeds.length > 0 ||
    data.anticoagulationMedsOther.trim() ||
    data.generalMeds.length > 0 ||
    data.generalMedsOther.trim() ||
    data.medicationsNotes.trim() ||
    medicalHistory.length > 0 ||
    allNotes.length > 0 ||
    data.mallampati.trim() ||
    data.mouth_opening.trim() ||
    data.dentition.trim() ||
    data.airwayDifficult.trim() ||
    data.airwayNotes.trim() ||
    data.last_solids.trim() ||
    data.last_clear.trim() ||
    selectedAnesthesia.length > 0 ||
    data.postOpICU ||
    data.anesthesiaOther.trim() ||
    selectedInstallations.length > 0 ||
    data.installationsOther.trim() ||
    data.surgicalApproval.trim();

  if (!hasAnyData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No pre-operative assessment data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {/* ASA & Vitals */}
      {hasData(!!data.asa.trim()) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">ASA Classification</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <Badge variant="outline" className="font-semibold">{data.asa}</Badge>
          </CardContent>
        </Card>
      )}

      {/* Medications */}
      {hasData(
        data.anticoagulationMeds.length > 0 || 
        !!data.anticoagulationMedsOther.trim() ||
        data.generalMeds.length > 0 ||
        !!data.generalMedsOther.trim() ||
        !!data.medicationsNotes.trim()
      ) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Medications</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 space-y-1.5">
            {(data.anticoagulationMeds.length > 0 || data.anticoagulationMedsOther.trim()) && (
              <div>
                <span className="text-muted-foreground text-xs">Anticoagulation: </span>
                <span className="font-medium">
                  {[...data.anticoagulationMeds, data.anticoagulationMedsOther].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            {(data.generalMeds.length > 0 || data.generalMedsOther.trim()) && (
              <div>
                <span className="text-muted-foreground text-xs">General: </span>
                <span className="font-medium">
                  {[...data.generalMeds, data.generalMedsOther].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            {data.medicationsNotes.trim() && (
              <div className="text-xs text-muted-foreground mt-1 italic">{data.medicationsNotes}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Medical History */}
      {hasData(medicalHistory.length > 0 || allNotes.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Medical History</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            {medicalHistory.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {medicalHistory.map((illness, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">{illness}</Badge>
                ))}
              </div>
            )}
            {allNotes.length > 0 && (
              <div className="space-y-1">
                {allNotes.map((note, idx) => (
                  <div key={idx} className="text-xs text-muted-foreground italic">• {note}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Airway Assessment */}
      {hasData(
        !!data.mallampati.trim() || 
        !!data.mouth_opening.trim() || 
        !!data.dentition.trim() ||
        !!data.airwayDifficult.trim() ||
        !!data.airwayNotes.trim()
      ) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Airway Assessment</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 space-y-1.5">
            {data.mallampati.trim() && (
              <div>
                <span className="text-muted-foreground text-xs">Mallampati: </span>
                <span className="font-medium">{data.mallampati}</span>
              </div>
            )}
            {data.mouth_opening.trim() && (
              <div>
                <span className="text-muted-foreground text-xs">Mouth Opening: </span>
                <span className="font-medium">{data.mouth_opening}</span>
              </div>
            )}
            {data.dentition.trim() && (
              <div>
                <span className="text-muted-foreground text-xs">Dentition: </span>
                <span className="font-medium">{data.dentition}</span>
              </div>
            )}
            {data.airwayDifficult.trim() && (
              <div>
                <Badge variant="destructive" className="text-xs">Difficult Airway: {data.airwayDifficult}</Badge>
              </div>
            )}
            {data.airwayNotes.trim() && (
              <div className="text-xs text-muted-foreground italic">{data.airwayNotes}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fasting Status */}
      {hasData(!!data.last_solids.trim() || !!data.last_clear.trim()) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Fasting Status</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 space-y-1.5">
            {data.last_solids.trim() && (
              <div>
                <span className="text-muted-foreground text-xs">Last Solids: </span>
                <span className="font-medium">{formatDateTime(data.last_solids)}</span>
              </div>
            )}
            {data.last_clear.trim() && (
              <div>
                <span className="text-muted-foreground text-xs">Last Clear Fluids: </span>
                <span className="font-medium">{formatDateTime(data.last_clear)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Planned Anesthesia */}
      {hasData(
        selectedAnesthesia.length > 0 || 
        data.postOpICU || 
        !!data.anesthesiaOther.trim()
      ) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Planned Anesthesia</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            {selectedAnesthesia.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedAnesthesia.map((technique, idx) => (
                  <Badge key={idx} variant="default" className="text-xs">{technique}</Badge>
                ))}
              </div>
            )}
            {data.postOpICU && (
              <Badge variant="outline" className="text-xs mb-2">Post-Op ICU</Badge>
            )}
            {data.anesthesiaOther.trim() && (
              <div className="text-xs text-muted-foreground italic">{data.anesthesiaOther}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Planned Installations */}
      {hasData(selectedInstallations.length > 0 || !!data.installationsOther.trim()) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Planned Installations</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            {selectedInstallations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedInstallations.map((installation, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">{installation}</Badge>
                ))}
              </div>
            )}
            {data.installationsOther.trim() && (
              <div className="text-xs text-muted-foreground italic">{data.installationsOther}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Surgical Approval */}
      {data.surgicalApproval.trim() && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Surgical Approval</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <Badge 
              variant={data.surgicalApproval === 'approved' ? 'default' : 'destructive'}
              className="text-xs"
            >
              {data.surgicalApproval.replace('-', ' ').toUpperCase()}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Assessment Info */}
      {hasData(!!data.assessmentDate.trim() || !!data.doctorName.trim()) && (
        <Card>
          <CardContent className="py-2 text-xs text-muted-foreground">
            {data.assessmentDate.trim() && (
              <div>Assessed: {formatDate(data.assessmentDate)}</div>
            )}
            {data.doctorName.trim() && (
              <div>By: {data.doctorName}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Special Notes */}
      {data.specialNotes.trim() && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-900 dark:text-amber-100">Special Notes</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">{data.specialNotes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
