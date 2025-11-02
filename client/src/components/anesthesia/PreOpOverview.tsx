import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  surgeryId: string;
}

const illnessLabels: Record<string, string> = {
  htn: "HTN", chd: "CHD", heartValve: "Valve Dx", arrhythmia: "Arrhythmia", heartFailure: "HF",
  asthma: "Asthma", copd: "COPD", sleepApnea: "Sleep Apnea", pneumonia: "Pneumonia",
  reflux: "GERD", ibd: "IBD", liverDisease: "Liver Dx",
  ckd: "CKD", dialysis: "Dialysis",
  diabetes: "DM", thyroid: "Thyroid Dx",
  stroke: "CVA", epilepsy: "Epilepsy", parkinsons: "Parkinson's", dementia: "Dementia",
  depression: "Depression", anxiety: "Anxiety", psychosis: "Psychosis",
  arthritis: "Arthritis", osteoporosis: "Osteoporosis", spineDisorders: "Spine Dx",
  pregnancy: "Pregnant", breastfeeding: "Breastfeeding", menopause: "Menopause", gynecologicalSurgery: "Gyn Surg Hx",
  nicotine: "Nicotine", alcohol: "Alcohol", drugs: "Drugs",
  prematurity: "Prematurity", developmentalDelay: "Dev. Delay", congenitalAnomalies: "Congenital", vaccination: "Vacc. Issues",
};

const anesthesiaLabels: Record<string, string> = {
  general: "GA", spinal: "Spinal", epidural: "Epidural", regional: "Regional", sedation: "Sedation", combined: "Combined",
};

const installationLabels: Record<string, string> = {
  arterialLine: "Art. Line", cvc: "CVC", picLine: "PICC", urinaryCatheter: "Foley", nasogastricTube: "NGT", drainageTube: "Drain",
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

  // Collect all medical history
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
    data.heartNotes, data.lungNotes, data.giKidneyMetabolicNotes, 
    data.neuroPsychSkeletalNotes, data.womanNotes, data.noxenNotes, data.childrenNotes
  ].filter(note => note?.trim());

  const allMedications = [
    ...data.anticoagulationMeds.map(m => `${m} (AC)`),
    data.anticoagulationMedsOther ? `${data.anticoagulationMedsOther} (AC)` : '',
    ...data.generalMeds,
    data.generalMedsOther
  ].filter(Boolean);

  const selectedAnesthesia = getSelectedItems(data.anesthesiaTechniques, anesthesiaLabels);
  const selectedInstallations = getSelectedItems(data.installations, installationLabels);

  // Check if we have any relevant data (excluding header info: height, weight, allergies, surgery)
  const hasAnyData = 
    data.asa?.trim() ||
    allMedications.length > 0 ||
    data.medicationsNotes?.trim() ||
    medicalHistory.length > 0 ||
    allNotes.length > 0 ||
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
    <div className="space-y-3 text-xs p-4 bg-muted/30 rounded-lg">
      {/* Special Notes - Highlighted at top */}
      {data.specialNotes?.trim() && (
        <div className="p-2 rounded bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 dark:text-amber-100 text-xs">CAVE</div>
              <div className="text-amber-800 dark:text-amber-200 mt-0.5">{data.specialNotes}</div>
            </div>
          </div>
        </div>
      )}

      {/* ASA */}
      {data.asa?.trim() && (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground min-w-[60px]">ASA:</span>
          <Badge variant="outline" className="font-semibold text-xs">{data.asa}</Badge>
        </div>
      )}

      {/* Medications */}
      {allMedications.length > 0 && (
        <div>
          <div className="font-semibold text-muted-foreground mb-1">Medications:</div>
          <div className="pl-2 space-y-0.5">
            {allMedications.map((med, idx) => (
              <div key={idx} className="text-xs">• {med}</div>
            ))}
            {data.medicationsNotes?.trim() && (
              <div className="text-xs italic text-muted-foreground mt-1">{data.medicationsNotes}</div>
            )}
          </div>
        </div>
      )}

      {/* Medical History */}
      {medicalHistory.length > 0 && (
        <div>
          <div className="font-semibold text-muted-foreground mb-1">Hx:</div>
          <div className="flex flex-wrap gap-1 pl-2">
            {medicalHistory.map((illness, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs py-0">{illness}</Badge>
            ))}
          </div>
          {allNotes.length > 0 && (
            <div className="pl-2 mt-1 space-y-0.5">
              {allNotes.map((note, idx) => (
                <div key={idx} className="text-xs italic text-muted-foreground">• {note}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Airway */}
      {(data.mallampati?.trim() || data.mouthOpening?.trim() || data.dentition?.trim() || data.airwayDifficult?.trim() || data.airwayNotes?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-1">Airway:</div>
          <div className="pl-2 space-y-0.5">
            {data.mallampati?.trim() && <div>MP: {data.mallampati}</div>}
            {data.mouthOpening?.trim() && <div>MO: {data.mouthOpening}</div>}
            {data.dentition?.trim() && <div>Teeth: {data.dentition}</div>}
            {data.airwayDifficult?.trim() && (
              <Badge variant="destructive" className="text-xs">Difficult: {data.airwayDifficult}</Badge>
            )}
            {data.airwayNotes?.trim() && (
              <div className="text-xs italic text-muted-foreground">{data.airwayNotes}</div>
            )}
          </div>
        </div>
      )}

      {/* Fasting */}
      {(data.lastSolids?.trim() || data.lastClear?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-1">Fasting:</div>
          <div className="pl-2 space-y-0.5">
            {data.lastSolids?.trim() && <div>Solids: {formatDateTime(data.lastSolids)}</div>}
            {data.lastClear?.trim() && <div>Clear: {formatDateTime(data.lastClear)}</div>}
          </div>
        </div>
      )}

      {/* Planned Anesthesia */}
      {(selectedAnesthesia.length > 0 || data.postOpICU || data.anesthesiaOther?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-1">Planned:</div>
          <div className="pl-2">
            {selectedAnesthesia.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedAnesthesia.map((technique, idx) => (
                  <Badge key={idx} variant="default" className="text-xs py-0">{technique}</Badge>
                ))}
              </div>
            )}
            {data.postOpICU && (
              <Badge variant="outline" className="text-xs mt-1">Post-Op ICU</Badge>
            )}
            {data.anesthesiaOther?.trim() && (
              <div className="text-xs italic text-muted-foreground mt-1">{data.anesthesiaOther}</div>
            )}
          </div>
        </div>
      )}

      {/* Installations */}
      {(selectedInstallations.length > 0 || data.installationsOther?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-1">Installations:</div>
          <div className="pl-2">
            {selectedInstallations.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedInstallations.map((installation, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs py-0">{installation}</Badge>
                ))}
              </div>
            )}
            {data.installationsOther?.trim() && (
              <div className="text-xs italic text-muted-foreground mt-1">{data.installationsOther}</div>
            )}
          </div>
        </div>
      )}

      {/* Surgical Approval */}
      {data.surgicalApproval?.trim() && (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground min-w-[60px]">Approval:</span>
          <Badge 
            variant={data.surgicalApproval === 'approved' ? 'default' : 'destructive'}
            className="text-xs"
          >
            {data.surgicalApproval.replace('-', ' ').toUpperCase()}
          </Badge>
        </div>
      )}
    </div>
  );
}
