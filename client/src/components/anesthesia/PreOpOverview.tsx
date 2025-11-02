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

  // Group medical history by system
  const medicalSystems = [
    { name: "Cardiovascular", illnesses: data.heartIllnesses, notes: data.heartNotes },
    { name: "Respiratory", illnesses: data.lungIllnesses, notes: data.lungNotes },
    { name: "GI", illnesses: data.giIllnesses, notes: data.giKidneyMetabolicNotes },
    { name: "Renal", illnesses: data.kidneyIllnesses, notes: null }, // Uses combined notes
    { name: "Metabolic", illnesses: data.metabolicIllnesses, notes: null }, // Uses combined notes
    { name: "Neurological", illnesses: data.neuroIllnesses, notes: data.neuroPsychSkeletalNotes },
    { name: "Psychiatric", illnesses: data.psychIllnesses, notes: null }, // Uses combined notes
    { name: "Musculoskeletal", illnesses: data.skeletalIllnesses, notes: null }, // Uses combined notes
    { name: "Women's Health", illnesses: data.womanIssues, notes: data.womanNotes },
    { name: "Substance Use", illnesses: data.noxen, notes: data.noxenNotes },
    { name: "Pediatric", illnesses: data.childrenIssues, notes: data.childrenNotes },
  ].map(system => ({
    ...system,
    items: getSelectedItems(system.illnesses, illnessLabels),
  })).filter(system => system.items.length > 0 || system.notes?.trim());

  // Collect all medical history for hasAnyData check
  const allMedicalHistory = medicalSystems.flatMap(s => s.items);

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
    allMedicalHistory.length > 0 ||
    medicalSystems.length > 0 ||
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
    <div className="space-y-4 text-xs p-4 bg-muted/30 rounded-lg">
      {/* Special Notes - Highlighted at top */}
      {data.specialNotes?.trim() && (
        <div className="p-3 rounded bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-blue-900 dark:text-blue-100 text-xs">Special Notes</div>
              <div className="text-blue-800 dark:text-blue-200 mt-1">{data.specialNotes}</div>
            </div>
          </div>
        </div>
      )}

      {/* ASA */}
      {data.asa?.trim() && (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground min-w-[80px]">ASA:</span>
          <Badge variant="outline" className="font-semibold text-sm">{data.asa}</Badge>
        </div>
      )}

      {/* Medications */}
      {allMedications.length > 0 && (
        <div>
          <div className="font-semibold text-muted-foreground mb-2">Medications:</div>
          <div className="pl-3 space-y-1">
            {allMedications.map((med, idx) => (
              <div key={idx} className="text-xs">• {med}</div>
            ))}
            {data.medicationsNotes?.trim() && (
              <div className="text-xs italic text-muted-foreground mt-2">{data.medicationsNotes}</div>
            )}
          </div>
        </div>
      )}

      {/* Medical History - Grouped by System */}
      {medicalSystems.length > 0 && (
        <div>
          <div className="font-semibold text-muted-foreground mb-2">Medical History:</div>
          <div className="space-y-3 pl-3">
            {medicalSystems.map((system, idx) => (
              <div key={idx}>
                <div className="font-medium text-foreground text-xs mb-1">{system.name}</div>
                {system.items.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {system.items.map((illness, iIdx) => (
                      <Badge key={iIdx} variant="secondary" className="text-xs py-0.5 px-2">{illness}</Badge>
                    ))}
                  </div>
                )}
                {system.notes?.trim() && (
                  <div className="text-xs italic text-muted-foreground pl-2">→ {system.notes}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Airway */}
      {(data.mallampati?.trim() || data.mouthOpening?.trim() || data.dentition?.trim() || data.airwayDifficult?.trim() || data.airwayNotes?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-2">Airway:</div>
          <div className="pl-3 space-y-1">
            {data.mallampati?.trim() && <div>Mallampati: {data.mallampati}</div>}
            {data.mouthOpening?.trim() && <div>Mouth Opening: {data.mouthOpening}</div>}
            {data.dentition?.trim() && <div>Dentition: {data.dentition}</div>}
            {data.airwayDifficult?.trim() && (
              <Badge variant="destructive" className="text-xs">Difficult Airway: {data.airwayDifficult}</Badge>
            )}
            {data.airwayNotes?.trim() && (
              <div className="text-xs italic text-muted-foreground mt-1">{data.airwayNotes}</div>
            )}
          </div>
        </div>
      )}

      {/* Fasting */}
      {(data.lastSolids?.trim() || data.lastClear?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-2">Fasting:</div>
          <div className="pl-3 space-y-1">
            {data.lastSolids?.trim() && <div>Last Solids: {formatDateTime(data.lastSolids)}</div>}
            {data.lastClear?.trim() && <div>Last Clear: {formatDateTime(data.lastClear)}</div>}
          </div>
        </div>
      )}

      {/* Planned Anesthesia */}
      {(selectedAnesthesia.length > 0 || data.postOpICU || data.anesthesiaOther?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-2">Planned Anesthesia:</div>
          <div className="pl-3 space-y-2">
            {selectedAnesthesia.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedAnesthesia.map((technique, idx) => (
                  <Badge key={idx} variant="default" className="text-xs py-0.5 px-2">{technique}</Badge>
                ))}
              </div>
            )}
            {data.postOpICU && (
              <Badge variant="outline" className="text-xs">Post-Op ICU</Badge>
            )}
            {data.anesthesiaOther?.trim() && (
              <div className="text-xs italic text-muted-foreground">{data.anesthesiaOther}</div>
            )}
          </div>
        </div>
      )}

      {/* Installations */}
      {(selectedInstallations.length > 0 || data.installationsOther?.trim()) && (
        <div>
          <div className="font-semibold text-muted-foreground mb-2">Planned Installations:</div>
          <div className="pl-3 space-y-2">
            {selectedInstallations.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedInstallations.map((installation, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs py-0.5 px-2">{installation}</Badge>
                ))}
              </div>
            )}
            {data.installationsOther?.trim() && (
              <div className="text-xs italic text-muted-foreground">{data.installationsOther}</div>
            )}
          </div>
        </div>
      )}

      {/* Surgical Approval */}
      {data.surgicalApproval?.trim() && (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground min-w-[80px]">Approval:</span>
          <Badge 
            variant={data.surgicalApproval === 'approved' ? 'default' : 'destructive'}
            className="text-sm"
          >
            {data.surgicalApproval.replace('-', ' ').toUpperCase()}
          </Badge>
        </div>
      )}
    </div>
  );
}
