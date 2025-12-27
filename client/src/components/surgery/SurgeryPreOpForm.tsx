import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Save, CheckCircle2, Eye, Upload, Trash2, FileImage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCanWrite } from "@/hooks/useCanWrite";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import type { SurgeryPreOpAssessment } from "@shared/schema";

interface SurgeryPreOpFormProps {
  surgeryId: string;
  hospitalId: string;
}

// Default medication lists (same as anesthesia)
const anticoagulationMedications = [
  { id: 'aspirin', label: 'Aspirin' },
  { id: 'clopidogrel', label: 'Clopidogrel' },
  { id: 'rivaroxaban', label: 'Rivaroxaban' },
  { id: 'apixaban', label: 'Apixaban' },
  { id: 'dabigatran', label: 'Dabigatran' },
  { id: 'warfarin', label: 'Warfarin' },
  { id: 'heparin', label: 'Heparin' },
  { id: 'enoxaparin', label: 'Enoxaparin' },
];

const generalMedications = [
  { id: 'betablocker', label: 'Beta-Blocker' },
  { id: 'acei', label: 'ACE Inhibitor' },
  { id: 'arb', label: 'ARB' },
  { id: 'diuretic', label: 'Diuretic' },
  { id: 'statin', label: 'Statin' },
  { id: 'insulin', label: 'Insulin' },
  { id: 'metformin', label: 'Metformin' },
  { id: 'thyroid', label: 'Thyroid medication' },
];

interface AssessmentData {
  height: string;
  weight: string;
  allergies: string[];
  allergiesOther: string;
  cave: string;
  asa: string;
  specialNotes: string;
  anticoagulationMeds: string[];
  anticoagulationMedsOther: string;
  generalMeds: string[];
  generalMedsOther: string;
  medicationsNotes: string;
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
  womanIssues: Record<string, boolean>;
  womanNotes: string;
  noxen: Record<string, boolean>;
  noxenNotes: string;
  childrenIssues: Record<string, boolean>;
  childrenNotes: string;
  anesthesiaHistoryIssues: Record<string, boolean>;
  dentalIssues: Record<string, boolean>;
  ponvTransfusionIssues: Record<string, boolean>;
  previousSurgeries: string;
  anesthesiaSurgicalHistoryNotes: string;
  outpatientCaregiverFirstName: string;
  outpatientCaregiverLastName: string;
  outpatientCaregiverPhone: string;
  lastSolids: string;
  lastClear: string;
  standBy: boolean;
  standByReason: string;
  standByReasonNote: string;
  surgicalApproval: string;
  assessmentDate: string;
  doctorName: string;
  consentNotes: string;
}

const initialAssessmentData: AssessmentData = {
  height: '',
  weight: '',
  allergies: [],
  allergiesOther: '',
  cave: '',
  asa: '',
  specialNotes: '',
  anticoagulationMeds: [],
  anticoagulationMedsOther: '',
  generalMeds: [],
  generalMedsOther: '',
  medicationsNotes: '',
  heartIllnesses: {},
  heartNotes: '',
  lungIllnesses: {},
  lungNotes: '',
  giIllnesses: {},
  kidneyIllnesses: {},
  metabolicIllnesses: {},
  giKidneyMetabolicNotes: '',
  neuroIllnesses: {},
  psychIllnesses: {},
  skeletalIllnesses: {},
  neuroPsychSkeletalNotes: '',
  coagulationIllnesses: {},
  infectiousIllnesses: {},
  coagulationInfectiousNotes: '',
  womanIssues: {},
  womanNotes: '',
  noxen: {},
  noxenNotes: '',
  childrenIssues: {},
  childrenNotes: '',
  anesthesiaHistoryIssues: {},
  dentalIssues: {},
  ponvTransfusionIssues: {},
  previousSurgeries: '',
  anesthesiaSurgicalHistoryNotes: '',
  outpatientCaregiverFirstName: '',
  outpatientCaregiverLastName: '',
  outpatientCaregiverPhone: '',
  lastSolids: '',
  lastClear: '',
  standBy: false,
  standByReason: '',
  standByReasonNote: '',
  surgicalApproval: '',
  assessmentDate: '',
  doctorName: '',
  consentNotes: '',
};

export default function SurgeryPreOpForm({ surgeryId, hospitalId }: SurgeryPreOpFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [assessmentData, setAssessmentData] = useState<AssessmentData>(initialAssessmentData);
  const [openSections, setOpenSections] = useState<string[]>(['general']);
  const [consentPreview, setConsentPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: assessment, isLoading } = useQuery<SurgeryPreOpAssessment>({
    queryKey: [`/api/surgery/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  const { data: anesthesiaSettings } = useHospitalAnesthesiaSettings(hospitalId);

  // Populate form from assessment data
  useEffect(() => {
    if (assessment) {
      setAssessmentData({
        height: assessment.height || '',
        weight: assessment.weight || '',
        allergies: [],
        allergiesOther: '',
        cave: assessment.cave || '',
        asa: '',
        specialNotes: assessment.specialNotes || '',
        anticoagulationMeds: assessment.anticoagulationMeds || [],
        anticoagulationMedsOther: assessment.anticoagulationMedsOther || '',
        generalMeds: assessment.generalMeds || [],
        generalMedsOther: assessment.generalMedsOther || '',
        medicationsNotes: assessment.medicationsNotes || '',
        heartIllnesses: assessment.heartIllnesses || {},
        heartNotes: assessment.heartNotes || '',
        lungIllnesses: assessment.lungIllnesses || {},
        lungNotes: assessment.lungNotes || '',
        giIllnesses: assessment.giIllnesses || {},
        kidneyIllnesses: assessment.kidneyIllnesses || {},
        metabolicIllnesses: assessment.metabolicIllnesses || {},
        giKidneyMetabolicNotes: assessment.giKidneyMetabolicNotes || '',
        neuroIllnesses: assessment.neuroIllnesses || {},
        psychIllnesses: assessment.psychIllnesses || {},
        skeletalIllnesses: assessment.skeletalIllnesses || {},
        neuroPsychSkeletalNotes: assessment.neuroPsychSkeletalNotes || '',
        coagulationIllnesses: {},
        infectiousIllnesses: {},
        coagulationInfectiousNotes: '',
        womanIssues: assessment.womanIssues || {},
        womanNotes: assessment.womanNotes || '',
        noxen: assessment.noxen || {},
        noxenNotes: assessment.noxenNotes || '',
        childrenIssues: assessment.childrenIssues || {},
        childrenNotes: assessment.childrenNotes || '',
        anesthesiaHistoryIssues: assessment.anesthesiaHistoryIssues || {},
        dentalIssues: assessment.dentalIssues || {},
        ponvTransfusionIssues: assessment.ponvTransfusionIssues || {},
        previousSurgeries: assessment.previousSurgeries || '',
        anesthesiaSurgicalHistoryNotes: assessment.anesthesiaSurgicalHistoryNotes || '',
        outpatientCaregiverFirstName: assessment.outpatientCaregiverFirstName || '',
        outpatientCaregiverLastName: assessment.outpatientCaregiverLastName || '',
        outpatientCaregiverPhone: assessment.outpatientCaregiverPhone || '',
        lastSolids: assessment.lastSolids || '',
        lastClear: assessment.lastClear || '',
        standBy: assessment.standBy || false,
        standByReason: assessment.standByReason || '',
        standByReasonNote: assessment.standByReasonNote || '',
        surgicalApproval: assessment.status === 'completed' ? 'approved' : '',
        assessmentDate: assessment.assessmentDate || '',
        doctorName: assessment.doctorName || '',
        consentNotes: assessment.consentNotes || '',
      });
      if (assessment.consentFileUrl) {
        setConsentPreview(assessment.consentFileUrl);
      }
    }
  }, [assessment]);

  const createMutation = useMutation({
    mutationFn: async (data: Partial<AssessmentData>) => {
      const response = await apiRequest("POST", '/api/surgery/preop', {
        surgeryId,
        ...data,
      });
      return response.json();
    },
    onSuccess: (newAssessment) => {
      queryClient.setQueryData([`/api/surgery/preop/surgery/${surgeryId}`], newAssessment);
      queryClient.invalidateQueries({ queryKey: [`/api/surgery/preop?hospitalId=${hospitalId}`] });
      setLastSaved(new Date());
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<AssessmentData>) => {
      if (!assessment?.id) throw new Error("No assessment ID");
      const response = await apiRequest("PATCH", `/api/surgery/preop/${assessment.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery/preop/surgery/${surgeryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/surgery/preop?hospitalId=${hospitalId}`] });
      setLastSaved(new Date());
    },
  });

  const isCompleted = assessment?.status === "completed";
  const isReadOnly = isCompleted || !canWrite;

  // Debounced auto-save
  const triggerAutoSave = useCallback((data: AssessmentData) => {
    if (!canWrite || isCompleted) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        if (!assessment?.id) {
          await createMutation.mutateAsync(data);
        } else {
          await updateMutation.mutateAsync(data);
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  }, [assessment?.id, canWrite, isCompleted, createMutation, updateMutation]);

  // Update data and trigger auto-save
  const updateAssessment = useCallback((updates: Partial<AssessmentData>) => {
    const newData = { ...assessmentData, ...updates };
    setAssessmentData(newData);
    triggerAutoSave(newData);
  }, [assessmentData, triggerAutoSave]);

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      if (!assessment?.id) {
        await createMutation.mutateAsync(assessmentData);
      } else {
        await updateMutation.mutateAsync(assessmentData);
      }
      toast({ title: t('common.saved'), description: t('surgery.preop.savedSuccess') });
    } catch (error) {
      toast({ title: t('common.error'), description: t('surgery.preop.saveError'), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConsentPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveFile = () => {
    setConsentPreview(assessment?.consentFileUrl || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Helper functions to check if sections have data
  const hasGeneralData = () => assessmentData.height || assessmentData.weight || assessmentData.cave || assessmentData.allergies.length > 0 || assessmentData.allergiesOther;
  const hasMedicationsData = () => assessmentData.anticoagulationMeds.length > 0 || assessmentData.generalMeds.length > 0 || assessmentData.medicationsNotes;
  const hasHeartData = () => Object.values(assessmentData.heartIllnesses).some(v => v) || assessmentData.heartNotes;
  const hasLungData = () => Object.values(assessmentData.lungIllnesses).some(v => v) || assessmentData.lungNotes;
  const hasGiKidneyData = () => Object.values(assessmentData.giIllnesses).some(v => v) || Object.values(assessmentData.kidneyIllnesses).some(v => v) || Object.values(assessmentData.metabolicIllnesses).some(v => v) || assessmentData.giKidneyMetabolicNotes;
  const hasNeuroPsychData = () => Object.values(assessmentData.neuroIllnesses).some(v => v) || Object.values(assessmentData.psychIllnesses).some(v => v) || Object.values(assessmentData.skeletalIllnesses).some(v => v) || assessmentData.neuroPsychSkeletalNotes;
  const hasAnesthesiaHistoryData = () => Object.values(assessmentData.anesthesiaHistoryIssues).some(v => v) || Object.values(assessmentData.dentalIssues).some(v => v) || Object.values(assessmentData.ponvTransfusionIssues).some(v => v) || assessmentData.previousSurgeries;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
          <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">{t('common.viewOnlyMode')}</p>
            <p className="text-sm text-amber-600 dark:text-amber-400">{t('common.viewOnlyModeDesc')}</p>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('surgery.preop.formTitle')}</h2>
          {lastSaved && canWrite && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  {t('common.lastSaved')}: {lastSaved.toLocaleTimeString()}
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isCompleted && (
            <Badge className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('common.completed')}
            </Badge>
          )}
          {!isCompleted && canWrite && (
            <Button
              variant="outline"
              onClick={handleManualSave}
              disabled={isSaving}
              data-testid="button-save-surgery-preop"
            >
              <Save className="h-4 w-4 mr-2" />
              {t('common.save')}
            </Button>
          )}
        </div>
      </div>

      <Accordion 
        type="multiple" 
        value={openSections} 
        onValueChange={setOpenSections}
        className="space-y-4"
      >
        {/* General Data Section */}
        <AccordionItem value="general">
          <Card className={hasGeneralData() ? "border-white dark:border-white" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-general">
              <CardTitle className="text-lg">{t('anesthesia.patientDetail.generalData', 'General Data')}</CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.heightCm', 'Height (cm)')}</Label>
                    <Input
                      type="number"
                      value={assessmentData.height}
                      onChange={(e) => updateAssessment({ height: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.enterHeight', 'Enter height')}
                      disabled={isReadOnly}
                      data-testid="input-height"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.weightKg', 'Weight (kg)')}</Label>
                    <Input
                      type="number"
                      value={assessmentData.weight}
                      onChange={(e) => updateAssessment({ weight: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.enterWeight', 'Enter weight')}
                      disabled={isReadOnly}
                      data-testid="input-weight"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.bmi', 'BMI')}</Label>
                    <Input
                      type="text"
                      value={assessmentData.height && assessmentData.weight ? 
                        (parseFloat(assessmentData.weight) / Math.pow(parseFloat(assessmentData.height) / 100, 2)).toFixed(1) : 
                        ''
                      }
                      readOnly
                      placeholder={t('anesthesia.patientDetail.autoCalculated', 'Auto-calculated')}
                      className="bg-muted"
                      data-testid="input-bmi"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('anesthesia.patientDetail.allergies', 'Allergies')}</Label>
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {(anesthesiaSettings?.allergyList || []).map((allergy) => (
                        <div key={allergy.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`allergy-${allergy.id}`}
                            checked={assessmentData.allergies.includes(allergy.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                updateAssessment({ allergies: [...assessmentData.allergies, allergy.id] });
                              } else {
                                updateAssessment({ allergies: assessmentData.allergies.filter(a => a !== allergy.id) });
                              }
                            }}
                            disabled={isReadOnly}
                            data-testid={`checkbox-allergy-${allergy.id}`}
                          />
                          <Label htmlFor={`allergy-${allergy.id}`} className="cursor-pointer font-normal text-sm">{allergy.label}</Label>
                        </div>
                      ))}
                    </div>
                    <Input
                      value={assessmentData.allergiesOther}
                      onChange={(e) => updateAssessment({ allergiesOther: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.otherAllergiesPlaceholder', 'Other allergies...')}
                      disabled={isReadOnly}
                      data-testid="input-allergies-other"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('anesthesia.patientDetail.cave', 'CAVE')}</Label>
                  <Input
                    value={assessmentData.cave}
                    onChange={(e) => updateAssessment({ cave: e.target.value })}
                    placeholder={t('anesthesia.patientDetail.cavePlaceholder', 'Important warnings...')}
                    disabled={isReadOnly}
                    data-testid="input-cave"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('anesthesia.patientDetail.specialNotes', 'Special Notes')}</Label>
                  <Textarea
                    value={assessmentData.specialNotes}
                    onChange={(e) => updateAssessment({ specialNotes: e.target.value })}
                    placeholder={t('anesthesia.patientDetail.specialNotesPlaceholder', 'Any special notes...')}
                    rows={3}
                    disabled={isReadOnly}
                    data-testid="textarea-special-notes"
                  />
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Medications Section */}
        <AccordionItem value="medications">
          <Card className={hasMedicationsData() ? "border-purple-400 dark:border-purple-600" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-medications">
              <CardTitle className={`text-lg ${hasMedicationsData() ? "text-purple-600 dark:text-purple-400" : ""}`}>
                {t('anesthesia.patientDetail.medications', 'Medications')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.anticoagulationMedications', 'Anticoagulation')}</Label>
                      <div className="border rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {anticoagulationMedications.map((medication) => (
                            <div key={medication.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`anticoag-${medication.id}`}
                                checked={assessmentData.anticoagulationMeds.includes(medication.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    updateAssessment({ anticoagulationMeds: [...assessmentData.anticoagulationMeds, medication.id] });
                                  } else {
                                    updateAssessment({ anticoagulationMeds: assessmentData.anticoagulationMeds.filter(m => m !== medication.id) });
                                  }
                                }}
                                disabled={isReadOnly}
                                data-testid={`checkbox-anticoag-${medication.id}`}
                              />
                              <Label htmlFor={`anticoag-${medication.id}`} className="cursor-pointer font-normal text-sm">{medication.label}</Label>
                            </div>
                          ))}
                        </div>
                        <Input
                          value={assessmentData.anticoagulationMedsOther}
                          onChange={(e) => updateAssessment({ anticoagulationMedsOther: e.target.value })}
                          placeholder={t('anesthesia.patientDetail.otherAnticoagulationPlaceholder', 'Other anticoagulation...')}
                          disabled={isReadOnly}
                          data-testid="input-anticoag-other"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.generalMedications', 'General Medications')}</Label>
                      <div className="border rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {generalMedications.map((medication) => (
                            <div key={medication.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`general-med-${medication.id}`}
                                checked={assessmentData.generalMeds.includes(medication.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    updateAssessment({ generalMeds: [...assessmentData.generalMeds, medication.id] });
                                  } else {
                                    updateAssessment({ generalMeds: assessmentData.generalMeds.filter(m => m !== medication.id) });
                                  }
                                }}
                                disabled={isReadOnly}
                                data-testid={`checkbox-general-med-${medication.id}`}
                              />
                              <Label htmlFor={`general-med-${medication.id}`} className="cursor-pointer font-normal text-sm">{medication.label}</Label>
                            </div>
                          ))}
                        </div>
                        <Input
                          value={assessmentData.generalMedsOther}
                          onChange={(e) => updateAssessment({ generalMedsOther: e.target.value })}
                          placeholder={t('anesthesia.patientDetail.otherMedicationsPlaceholder', 'Other medications...')}
                          disabled={isReadOnly}
                          data-testid="input-general-med-other"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.additionalNotes', 'Additional Notes')}</Label>
                    <Textarea
                      value={assessmentData.medicationsNotes}
                      onChange={(e) => updateAssessment({ medicationsNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.medicationsNotesPlaceholder', 'Additional medication notes...')}
                      rows={14}
                      disabled={isReadOnly}
                      data-testid="textarea-medications-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Heart and Circulation Section */}
        <AccordionItem value="heart">
          <Card className={hasHeartData() ? "border-red-500 dark:border-red-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-heart">
              <CardTitle className={`text-lg ${hasHeartData() ? "text-red-600 dark:text-red-400" : ""}`}>
                {t('anesthesia.patientDetail.heartAndCirculation', 'Heart & Circulation')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.conditions', 'Conditions')}</Label>
                    <div className="space-y-2">
                      {(anesthesiaSettings?.illnessLists?.cardiovascular || []).map(({ id, label }) => (
                        <div key={id} className="flex items-center space-x-2">
                          <Checkbox
                            id={id}
                            checked={assessmentData.heartIllnesses[id] || false}
                            onCheckedChange={(checked) => updateAssessment({
                              heartIllnesses: { ...assessmentData.heartIllnesses, [id]: checked as boolean }
                            })}
                            disabled={isReadOnly}
                            data-testid={`checkbox-${id}`}
                          />
                          <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.heartNotes}
                      onChange={(e) => updateAssessment({ heartNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={8}
                      disabled={isReadOnly}
                      data-testid="textarea-heart-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Lungs Section */}
        <AccordionItem value="lungs">
          <Card className={hasLungData() ? "border-blue-500 dark:border-blue-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-lungs">
              <CardTitle className={`text-lg ${hasLungData() ? "text-blue-600 dark:text-blue-400" : ""}`}>
                {t('anesthesia.patientDetail.lungs', 'Lungs & Respiratory')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.conditions', 'Conditions')}</Label>
                    <div className="space-y-2">
                      {(anesthesiaSettings?.illnessLists?.pulmonary || []).map(({ id, label }) => (
                        <div key={id} className="flex items-center space-x-2">
                          <Checkbox
                            id={id}
                            checked={assessmentData.lungIllnesses[id] || false}
                            onCheckedChange={(checked) => updateAssessment({
                              lungIllnesses: { ...assessmentData.lungIllnesses, [id]: checked as boolean }
                            })}
                            disabled={isReadOnly}
                            data-testid={`checkbox-${id}`}
                          />
                          <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.lungNotes}
                      onChange={(e) => updateAssessment({ lungNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={8}
                      disabled={isReadOnly}
                      data-testid="textarea-lung-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* GI, Kidney, Metabolic Section */}
        <AccordionItem value="gi-kidney-metabolic">
          <Card className={hasGiKidneyData() ? "border-amber-500 dark:border-amber-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-gi-kidney">
              <CardTitle className={`text-lg ${hasGiKidneyData() ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {t('anesthesia.patientDetail.giKidneyMetabolic', 'GI, Kidney & Metabolic')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.gastrointestinal', 'Gastrointestinal')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.gastrointestinal || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.giIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                giIllnesses: { ...assessmentData.giIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.kidney', 'Kidney')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.kidney || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.kidneyIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                kidneyIllnesses: { ...assessmentData.kidneyIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.metabolic', 'Metabolic')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.metabolic || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.metabolicIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                metabolicIllnesses: { ...assessmentData.metabolicIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.giKidneyMetabolicNotes}
                      onChange={(e) => updateAssessment({ giKidneyMetabolicNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={12}
                      disabled={isReadOnly}
                      data-testid="textarea-gi-kidney-metabolic-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Neuro, Psych, Skeletal Section */}
        <AccordionItem value="neuro-psych-skeletal">
          <Card className={hasNeuroPsychData() ? "border-violet-500 dark:border-violet-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-neuro-psych">
              <CardTitle className={`text-lg ${hasNeuroPsychData() ? "text-violet-600 dark:text-violet-400" : ""}`}>
                {t('anesthesia.patientDetail.neuroPsychSkeletal', 'Neuro, Psych & Skeletal')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.neurological', 'Neurological')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.neurological || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.neuroIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                neuroIllnesses: { ...assessmentData.neuroIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.psychiatric', 'Psychiatric')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.psychiatric || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.psychIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                psychIllnesses: { ...assessmentData.psychIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.skeletal', 'Skeletal')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.skeletal || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.skeletalIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                skeletalIllnesses: { ...assessmentData.skeletalIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.neuroPsychSkeletalNotes}
                      onChange={(e) => updateAssessment({ neuroPsychSkeletalNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={12}
                      disabled={isReadOnly}
                      data-testid="textarea-neuro-psych-skeletal-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Anesthesia & Surgical History Section */}
        <AccordionItem value="anesthesia-history">
          <Card className={hasAnesthesiaHistoryData() ? "border-orange-500 dark:border-orange-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-anesthesia-history">
              <CardTitle className={`text-lg ${hasAnesthesiaHistoryData() ? "text-orange-600 dark:text-orange-400" : ""}`}>
                {t('anesthesia.patientDetail.anesthesiaHistory', 'Anesthesia & Surgical History')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.anesthesiaIssues', 'Anesthesia Issues')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.anesthesiaHistory || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.anesthesiaHistoryIssues[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                anesthesiaHistoryIssues: { ...assessmentData.anesthesiaHistoryIssues, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.dentalIssues', 'Dental Issues')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.dental || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.dentalIssues[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                dentalIssues: { ...assessmentData.dentalIssues, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.ponvTransfusion', 'PONV & Transfusion')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.ponvTransfusion || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.ponvTransfusionIssues[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                ponvTransfusionIssues: { ...assessmentData.ponvTransfusionIssues, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.previousSurgeries', 'Previous Surgeries')}</Label>
                      <Textarea
                        value={assessmentData.previousSurgeries}
                        onChange={(e) => updateAssessment({ previousSurgeries: e.target.value })}
                        placeholder={t('anesthesia.patientDetail.previousSurgeriesPlaceholder', 'List previous surgeries...')}
                        rows={6}
                        disabled={isReadOnly}
                        data-testid="textarea-previous-surgeries"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                      <Textarea
                        value={assessmentData.anesthesiaSurgicalHistoryNotes}
                        onChange={(e) => updateAssessment({ anesthesiaSurgicalHistoryNotes: e.target.value })}
                        placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                        rows={6}
                        disabled={isReadOnly}
                        data-testid="textarea-anesthesia-history-notes"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Fasting Section */}
        <AccordionItem value="fasting">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-fasting">
              <CardTitle className="text-lg">{t('anesthesia.patientDetail.fasting', 'Fasting Status')}</CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.lastSolids', 'Last Solids')}</Label>
                    <Input
                      value={assessmentData.lastSolids}
                      onChange={(e) => updateAssessment({ lastSolids: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.lastSolidsPlaceholder', 'e.g., 08:00')}
                      disabled={isReadOnly}
                      data-testid="input-last-solids"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.lastClear', 'Last Clear Fluids')}</Label>
                    <Input
                      value={assessmentData.lastClear}
                      onChange={(e) => updateAssessment({ lastClear: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.lastClearPlaceholder', 'e.g., 10:00')}
                      disabled={isReadOnly}
                      data-testid="input-last-clear"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Outpatient Care Section */}
        <AccordionItem value="outpatient">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-outpatient">
              <CardTitle className="text-lg">{t('anesthesia.patientDetail.outpatientCare', 'Outpatient Care')}</CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.caregiverFirstName', 'Caregiver First Name')}</Label>
                    <Input
                      value={assessmentData.outpatientCaregiverFirstName}
                      onChange={(e) => updateAssessment({ outpatientCaregiverFirstName: e.target.value })}
                      disabled={isReadOnly}
                      data-testid="input-caregiver-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.caregiverLastName', 'Caregiver Last Name')}</Label>
                    <Input
                      value={assessmentData.outpatientCaregiverLastName}
                      onChange={(e) => updateAssessment({ outpatientCaregiverLastName: e.target.value })}
                      disabled={isReadOnly}
                      data-testid="input-caregiver-lastname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.caregiverPhone', 'Phone')}</Label>
                    <Input
                      value={assessmentData.outpatientCaregiverPhone}
                      onChange={(e) => updateAssessment({ outpatientCaregiverPhone: e.target.value })}
                      disabled={isReadOnly}
                      data-testid="input-caregiver-phone"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Stand-By Section */}
        <AccordionItem value="standby">
          <Card className={assessmentData.standBy ? "border-amber-500 dark:border-amber-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-standby">
              <CardTitle className={`text-lg ${assessmentData.standBy ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {t('anesthesia.patientDetail.standByStatus', 'Stand-By Status')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0 space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="standBy"
                    checked={assessmentData.standBy}
                    onCheckedChange={(checked) => {
                      updateAssessment({ 
                        standBy: checked,
                        standByReason: checked ? assessmentData.standByReason : '',
                        standByReasonNote: checked ? assessmentData.standByReasonNote : ''
                      });
                    }}
                    disabled={isReadOnly}
                    data-testid="switch-stand-by"
                  />
                  <Label htmlFor="standBy">{t('anesthesia.patientDetail.standBy', 'Stand-By')}</Label>
                </div>
                
                {assessmentData.standBy && (
                  <div className="space-y-4 pl-8 border-l-2 border-amber-500/50">
                    <div className="space-y-2">
                      <Label>{t('anesthesia.patientDetail.standByReason', 'Reason')}</Label>
                      <Select
                        value={assessmentData.standByReason}
                        onValueChange={(value) => updateAssessment({ standByReason: value })}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger data-testid="select-stand-by-reason">
                          <SelectValue placeholder={t('anesthesia.patientDetail.selectReason', 'Select reason...')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="consent_required">{t('anesthesia.patientDetail.consentRequired', 'Consent Required')}</SelectItem>
                          <SelectItem value="waiting_exams">{t('anesthesia.patientDetail.waitingExams', 'Waiting for Exams')}</SelectItem>
                          <SelectItem value="other">{t('anesthesia.patientDetail.other', 'Other')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {assessmentData.standByReason === 'other' && (
                      <div className="space-y-2">
                        <Label>{t('anesthesia.patientDetail.standByNote', 'Note')}</Label>
                        <Textarea
                          value={assessmentData.standByReasonNote}
                          onChange={(e) => updateAssessment({ standByReasonNote: e.target.value })}
                          placeholder={t('anesthesia.patientDetail.standByNotePlaceholder', 'Explain reason...')}
                          disabled={isReadOnly}
                          data-testid="textarea-stand-by-reason-note"
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Consent Upload Section */}
        <AccordionItem value="consent">
          <Card className={consentPreview ? "border-green-500 dark:border-green-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-consent">
              <CardTitle className={`text-lg ${consentPreview ? "text-green-600 dark:text-green-400" : ""}`}>
                {t('surgery.preop.consentDocument', 'Consent Document')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('surgery.preop.consentDocumentDesc', 'Upload the signed consent document')}
                </p>
                
                {consentPreview ? (
                  <div className="space-y-3">
                    <div className="border rounded-lg p-2 bg-muted/30">
                      <img 
                        src={consentPreview} 
                        alt={t('surgery.preop.consentImage', 'Consent document')} 
                        className="max-h-64 mx-auto object-contain rounded"
                      />
                    </div>
                    {!isReadOnly && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          data-testid="button-change-consent"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {t('surgery.preop.changeImage', 'Change')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveFile}
                          data-testid="button-remove-consent"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.remove', 'Remove')}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  !isReadOnly && (
                    <div 
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileImage className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium">{t('surgery.preop.uploadConsent', 'Click to upload consent')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t('surgery.preop.uploadConsentDesc', 'JPG, PNG or PDF')}</p>
                    </div>
                  )
                )}
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-consent-file"
                />

                <div className="space-y-2">
                  <Label>{t('surgery.preop.consentNotes', 'Consent Notes')}</Label>
                  <Input 
                    value={assessmentData.consentNotes}
                    onChange={(e) => updateAssessment({ consentNotes: e.target.value })}
                    disabled={isReadOnly}
                    placeholder={t('surgery.preop.consentNotesPlaceholder', 'Any notes about consent...')}
                    data-testid="input-consent-notes"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('surgery.preop.assessmentDate', 'Assessment Date')}</Label>
                    <FlexibleDateInput
                      value={assessmentData.assessmentDate}
                      onChange={(value) => updateAssessment({ assessmentDate: value })}
                      disabled={isReadOnly}
                      data-testid="input-assessment-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('surgery.preop.assessedBy', 'Assessed By')}</Label>
                    <Input 
                      value={assessmentData.doctorName}
                      onChange={(e) => updateAssessment({ doctorName: e.target.value })}
                      disabled={isReadOnly}
                      placeholder={t('surgery.preop.assessedByPlaceholder', 'Doctor name...')}
                      data-testid="input-doctor-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t('surgery.preop.assessmentStatus', 'Status')}</Label>
                  <Select
                    value={assessmentData.surgicalApproval}
                    onValueChange={(value) => updateAssessment({ surgicalApproval: value })}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger data-testid="select-surgical-approval">
                      <SelectValue placeholder={t('surgery.preop.selectStatus', 'Select status...')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-assessed">{t('surgery.preop.notAssessed', 'Not yet assessed')}</SelectItem>
                      <SelectItem value="approved">{t('surgery.preop.approved', 'Approved')}</SelectItem>
                      <SelectItem value="not-approved">{t('surgery.preop.notApproved', 'Not Approved')}</SelectItem>
                      <SelectItem value="stand-by">{t('surgery.preop.standBy', 'Stand-by')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
