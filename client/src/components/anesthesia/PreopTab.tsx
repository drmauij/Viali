import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import SignaturePad from "@/components/SignaturePad";
import { Loader2, Save, CheckCircle2, AlertCircle, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCanWrite } from "@/hooks/useCanWrite";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import { useTranslation } from "react-i18next";
import type { PreOpAssessment } from "@shared/schema";

interface PreopTabProps {
  surgeryId: string;
  hospitalId: string;
}

const preOpFormSchema = z.object({
  height: z.string().optional(),
  weight: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  allergiesOther: z.string().optional(),
  cave: z.string().optional(),
  asa: z.string().optional(),
  specialNotes: z.string().optional(),
  anticoagulationMeds: z.array(z.string()).optional(),
  anticoagulationMedsOther: z.string().optional(),
  generalMeds: z.array(z.string()).optional(),
  generalMedsOther: z.string().optional(),
  medicationsNotes: z.string().optional(),
  heartNotes: z.string().optional(),
  lungNotes: z.string().optional(),
  giKidneyMetabolicNotes: z.string().optional(),
  neuroPsychSkeletalNotes: z.string().optional(),
  womanNotes: z.string().optional(),
  noxenNotes: z.string().optional(),
  childrenNotes: z.string().optional(),
  // Anesthesia & Surgical History section
  anesthesiaHistoryIssues: z.record(z.boolean()).optional(),
  dentalIssues: z.record(z.boolean()).optional(),
  ponvTransfusionIssues: z.record(z.boolean()).optional(),
  previousSurgeries: z.string().optional(),
  anesthesiaSurgicalHistoryNotes: z.string().optional(),
  // Outpatient Care section
  outpatientCaregiverFirstName: z.string().optional(),
  outpatientCaregiverLastName: z.string().optional(),
  outpatientCaregiverPhone: z.string().optional(),
  mallampati: z.string().optional(),
  mouthOpening: z.string().optional(),
  dentition: z.string().optional(),
  airwayDifficult: z.string().optional(),
  airwayNotes: z.string().optional(),
  lastSolids: z.string().optional(),
  lastClear: z.string().optional(),
  postOpICU: z.boolean().optional(),
  anesthesiaOther: z.string().optional(),
  installationsOther: z.string().optional(),
  surgicalApproval: z.string().optional(),
  standBy: z.boolean().optional(),
  standByReason: z.string().optional(),
  standByReasonNote: z.string().optional(),
  assessmentDate: z.string().optional(),
  doctorName: z.string().optional(),
  doctorSignature: z.string().optional(),
  consentGiven: z.boolean().optional(),
  consentText: z.string().optional(),
  patientSignature: z.string().optional(),
  consentDate: z.string().optional(),
});

type PreOpFormData = z.infer<typeof preOpFormSchema>;

export default function PreopTab({ surgeryId, hospitalId }: PreopTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [doctorSignatureModalOpen, setDoctorSignatureModalOpen] = useState(false);
  const [patientSignatureModalOpen, setPatientSignatureModalOpen] = useState(false);

  const { data: assessment, isLoading } = useQuery<PreOpAssessment>({
    queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  const { data: anesthesiaSettings } = useHospitalAnesthesiaSettings(hospitalId);

  const form = useForm<PreOpFormData>({
    resolver: zodResolver(preOpFormSchema),
    defaultValues: {
      height: "",
      weight: "",
      allergies: [],
      allergiesOther: "",
      cave: "",
      asa: "",
      specialNotes: "",
      anticoagulationMeds: [],
      anticoagulationMedsOther: "",
      generalMeds: [],
      generalMedsOther: "",
      medicationsNotes: "",
      heartNotes: "",
      lungNotes: "",
      giKidneyMetabolicNotes: "",
      neuroPsychSkeletalNotes: "",
      womanNotes: "",
      noxenNotes: "",
      childrenNotes: "",
      anesthesiaHistoryIssues: {},
      dentalIssues: {},
      ponvTransfusionIssues: {},
      previousSurgeries: "",
      anesthesiaSurgicalHistoryNotes: "",
      outpatientCaregiverFirstName: "",
      outpatientCaregiverLastName: "",
      outpatientCaregiverPhone: "",
      mallampati: "",
      mouthOpening: "",
      dentition: "",
      airwayDifficult: "",
      airwayNotes: "",
      lastSolids: "",
      lastClear: "",
      postOpICU: false,
      anesthesiaOther: "",
      installationsOther: "",
      surgicalApproval: "",
      standBy: false,
      standByReason: "",
      standByReasonNote: "",
      assessmentDate: "",
      doctorName: "",
      doctorSignature: "",
      consentGiven: false,
      consentText: "",
      patientSignature: "",
      consentDate: "",
    },
  });

  useEffect(() => {
    if (assessment) {
      form.reset({
        height: assessment.height || "",
        weight: assessment.weight || "",
        allergies: [],
        allergiesOther: "",
        cave: assessment.cave || "",
        asa: assessment.asa || "",
        specialNotes: assessment.specialNotes || "",
        anticoagulationMeds: assessment.anticoagulationMeds || [],
        anticoagulationMedsOther: assessment.anticoagulationMedsOther || "",
        generalMeds: assessment.generalMeds || [],
        generalMedsOther: assessment.generalMedsOther || "",
        medicationsNotes: assessment.medicationsNotes || "",
        heartNotes: assessment.heartNotes || "",
        lungNotes: assessment.lungNotes || "",
        giKidneyMetabolicNotes: assessment.giKidneyMetabolicNotes || "",
        neuroPsychSkeletalNotes: assessment.neuroPsychSkeletalNotes || "",
        womanNotes: assessment.womanNotes || "",
        noxenNotes: assessment.noxenNotes || "",
        childrenNotes: assessment.childrenNotes || "",
        anesthesiaHistoryIssues: assessment.anesthesiaHistoryIssues || {},
        dentalIssues: assessment.dentalIssues || {},
        ponvTransfusionIssues: assessment.ponvTransfusionIssues || {},
        previousSurgeries: assessment.previousSurgeries || "",
        anesthesiaSurgicalHistoryNotes: assessment.anesthesiaSurgicalHistoryNotes || "",
        outpatientCaregiverFirstName: assessment.outpatientCaregiverFirstName || "",
        outpatientCaregiverLastName: assessment.outpatientCaregiverLastName || "",
        outpatientCaregiverPhone: assessment.outpatientCaregiverPhone || "",
        mallampati: assessment.mallampati || "",
        mouthOpening: assessment.mouthOpening || "",
        dentition: assessment.dentition || "",
        airwayDifficult: assessment.airwayDifficult || "",
        airwayNotes: assessment.airwayNotes || "",
        lastSolids: assessment.lastSolids || "",
        lastClear: assessment.lastClear || "",
        postOpICU: assessment.postOpICU || false,
        anesthesiaOther: assessment.anesthesiaOther || "",
        installationsOther: assessment.installationsOther || "",
        surgicalApproval: assessment.surgicalApproval || "",
        standBy: assessment.standBy || false,
        standByReason: assessment.standByReason || "",
        standByReasonNote: assessment.standByReasonNote || "",
        assessmentDate: assessment.assessmentDate || "",
        doctorName: assessment.doctorName || "",
        doctorSignature: assessment.doctorSignature || "",
        consentGiven: assessment.consentGiven || false,
        consentText: assessment.consentText || "",
        patientSignature: assessment.patientSignature || "",
        consentDate: assessment.consentDate || "",
      });
    }
  }, [assessment, form]);

  const createMutation = useMutation({
    mutationFn: async (data: Partial<PreOpFormData>) => {
      // Auto-complete logic: only 'approved' or 'not-approved' mark as completed
      // Stand-by, empty, or any other value stays as draft
      const surgicalApproval = data.surgicalApproval || '';
      const isApproved = surgicalApproval === 'approved' || surgicalApproval === 'not-approved';
      const status = isApproved ? 'completed' : 'draft';
      
      const response = await apiRequest("POST", '/api/anesthesia/preop', {
        surgeryId,
        height: data.height,
        weight: data.weight,
        allergies: data.allergies || [],
        allergiesOther: data.allergiesOther,
        cave: data.cave,
        asa: data.asa,
        specialNotes: data.specialNotes,
        anticoagulationMeds: data.anticoagulationMeds || [],
        anticoagulationMedsOther: data.anticoagulationMedsOther,
        generalMeds: data.generalMeds || [],
        generalMedsOther: data.generalMedsOther,
        medicationsNotes: data.medicationsNotes,
        heartNotes: data.heartNotes,
        lungNotes: data.lungNotes,
        giKidneyMetabolicNotes: data.giKidneyMetabolicNotes,
        neuroPsychSkeletalNotes: data.neuroPsychSkeletalNotes,
        womanNotes: data.womanNotes,
        noxenNotes: data.noxenNotes,
        childrenNotes: data.childrenNotes,
        anesthesiaHistoryIssues: data.anesthesiaHistoryIssues || {},
        dentalIssues: data.dentalIssues || {},
        ponvTransfusionIssues: data.ponvTransfusionIssues || {},
        previousSurgeries: data.previousSurgeries,
        anesthesiaSurgicalHistoryNotes: data.anesthesiaSurgicalHistoryNotes,
        outpatientCaregiverFirstName: data.outpatientCaregiverFirstName,
        outpatientCaregiverLastName: data.outpatientCaregiverLastName,
        outpatientCaregiverPhone: data.outpatientCaregiverPhone,
        mallampati: data.mallampati,
        mouthOpening: data.mouthOpening,
        dentition: data.dentition,
        airwayDifficult: data.airwayDifficult,
        airwayNotes: data.airwayNotes,
        lastSolids: data.lastSolids,
        lastClear: data.lastClear,
        postOpICU: data.postOpICU,
        anesthesiaOther: data.anesthesiaOther,
        installationsOther: data.installationsOther,
        surgicalApproval: data.surgicalApproval,
        standBy: data.standBy,
        standByReason: data.standByReason,
        standByReasonNote: data.standByReasonNote,
        assessmentDate: data.assessmentDate,
        doctorName: data.doctorName,
        doctorSignature: data.doctorSignature,
        consentGiven: data.consentGiven,
        consentText: data.consentText,
        patientSignature: data.patientSignature,
        consentDate: data.consentDate,
        status,
      });
      
      return response.json();
    },
    onSuccess: (newAssessment) => {
      queryClient.setQueryData([`/api/anesthesia/preop/surgery/${surgeryId}`], newAssessment);
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${hospitalId}`] });
      setLastSaved(new Date());
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<PreOpFormData>) => {
      if (!assessment?.id) throw new Error("No assessment ID");
      
      // Auto-complete logic: only 'approved' or 'not-approved' mark as completed
      // Use existing assessment value if form value is undefined
      // Stand-by, empty, or any other value stays as draft
      const surgicalApproval = data.surgicalApproval !== undefined ? data.surgicalApproval : (assessment.surgicalApproval || '');
      const isApproved = surgicalApproval === 'approved' || surgicalApproval === 'not-approved';
      const status = isApproved ? 'completed' : 'draft';
      
      const response = await apiRequest("PATCH", `/api/anesthesia/preop/${assessment.id}`, {
        height: data.height,
        weight: data.weight,
        allergies: data.allergies,
        allergiesOther: data.allergiesOther,
        cave: data.cave,
        asa: data.asa,
        specialNotes: data.specialNotes,
        anticoagulationMeds: data.anticoagulationMeds,
        anticoagulationMedsOther: data.anticoagulationMedsOther,
        generalMeds: data.generalMeds,
        generalMedsOther: data.generalMedsOther,
        medicationsNotes: data.medicationsNotes,
        heartNotes: data.heartNotes,
        lungNotes: data.lungNotes,
        giKidneyMetabolicNotes: data.giKidneyMetabolicNotes,
        neuroPsychSkeletalNotes: data.neuroPsychSkeletalNotes,
        womanNotes: data.womanNotes,
        noxenNotes: data.noxenNotes,
        childrenNotes: data.childrenNotes,
        anesthesiaHistoryIssues: data.anesthesiaHistoryIssues,
        dentalIssues: data.dentalIssues,
        ponvTransfusionIssues: data.ponvTransfusionIssues,
        previousSurgeries: data.previousSurgeries,
        anesthesiaSurgicalHistoryNotes: data.anesthesiaSurgicalHistoryNotes,
        outpatientCaregiverFirstName: data.outpatientCaregiverFirstName,
        outpatientCaregiverLastName: data.outpatientCaregiverLastName,
        outpatientCaregiverPhone: data.outpatientCaregiverPhone,
        mallampati: data.mallampati,
        mouthOpening: data.mouthOpening,
        dentition: data.dentition,
        airwayDifficult: data.airwayDifficult,
        airwayNotes: data.airwayNotes,
        lastSolids: data.lastSolids,
        lastClear: data.lastClear,
        postOpICU: data.postOpICU,
        anesthesiaOther: data.anesthesiaOther,
        installationsOther: data.installationsOther,
        surgicalApproval: data.surgicalApproval,
        standBy: data.standBy,
        standByReason: data.standByReason,
        standByReasonNote: data.standByReasonNote,
        assessmentDate: data.assessmentDate,
        doctorName: data.doctorName,
        doctorSignature: data.doctorSignature,
        consentGiven: data.consentGiven,
        consentText: data.consentText,
        patientSignature: data.patientSignature,
        consentDate: data.consentDate,
        status,
      });
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${hospitalId}`] });
      setLastSaved(new Date());
    },
  });

  const isCompleted = assessment?.status === "completed";

  const autoSave = useCallback(async () => {
    // Don't auto-save for guest users (read-only)
    if (!canWrite) return;
    if (form.formState.isSubmitting || isCompleted) return;
    
    // Only auto-save if form has been modified (prevents empty assessments)
    if (!form.formState.isDirty && !assessment?.id) return;
    
    const formData = form.getValues();
    setIsSaving(true);
    
    try {
      if (!assessment?.id) {
        await createMutation.mutateAsync(formData);
      } else {
        await updateMutation.mutateAsync(formData);
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
    } finally {
      setIsSaving(false);
    }
  }, [assessment?.id, form, createMutation, updateMutation, isCompleted, canWrite]);

  useEffect(() => {
    // Don't set up auto-save interval for guest users
    if (isCompleted || !canWrite) return;
    
    const interval = setInterval(() => {
      autoSave();
    }, 30000);

    return () => clearInterval(interval);
  }, [isCompleted, autoSave, canWrite]);

  const handleManualSave = async () => {
    const formData = form.getValues();
    setIsSaving(true);
    
    try {
      if (!assessment?.id) {
        await createMutation.mutateAsync(formData);
      } else {
        await updateMutation.mutateAsync(formData);
      }
      toast({ title: t("anesthesia.preop.saved"), description: t("anesthesia.preop.savedDesc") });
    } catch (error) {
      toast({ title: t("error"), description: t("anesthesia.preop.saveError"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Combine readonly conditions
  const isReadOnly = isCompleted || !canWrite;

  return (
    <div className="space-y-6">
      {/* Read-only banner for guests */}
      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
          <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">{t("anesthesia.preop.viewOnlyMode")}</p>
            <p className="text-sm text-amber-600 dark:text-amber-400">{t("anesthesia.preop.viewOnlyDesc")}</p>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("anesthesia.preop.title")}</h2>
          {lastSaved && canWrite && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  {t("anesthesia.preop.lastSaved", { time: lastSaved.toLocaleTimeString() })}
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isCompleted && (
            <Badge className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t("anesthesia.preop.completed")}
            </Badge>
          )}
          {!isCompleted && canWrite && (
            <Button
              variant="outline"
              onClick={handleManualSave}
              disabled={isSaving}
              data-testid="button-save"
            >
              <Save className="h-4 w-4 mr-2" />
              {t("save")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.vitalsAndAsa")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="height">{t("anesthesia.preop.height")}</Label>
                  <Input 
                    id="height" 
                    {...form.register("height")}
                    disabled={isReadOnly}
                    data-testid="input-height" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">{t("anesthesia.preop.weight")}</Label>
                  <Input 
                    id="weight" 
                    {...form.register("weight")}
                    disabled={isReadOnly}
                    data-testid="input-weight" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asa">{t("anesthesia.preop.asaClassification")}</Label>
                <Select 
                  value={form.watch("asa") || ""}
                  onValueChange={(value) => form.setValue("asa", value)}
                  disabled={isReadOnly}
                >
                  <SelectTrigger data-testid="select-asa">
                    <SelectValue placeholder={t("anesthesia.preop.selectAsaClass")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">I - Healthy</SelectItem>
                    <SelectItem value="II">II - Mild systemic disease</SelectItem>
                    <SelectItem value="III">III - Severe systemic disease</SelectItem>
                    <SelectItem value="IV">IV - Life-threatening disease</SelectItem>
                    <SelectItem value="V">V - Moribund</SelectItem>
                    <SelectItem value="VI">VI - Brain-dead organ donor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialNotes">{t("anesthesia.preop.specialNotes")}</Label>
                <Textarea 
                  id="specialNotes" 
                  {...form.register("specialNotes")}
                  disabled={isReadOnly}
                  rows={3}
                  data-testid="textarea-special-notes" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.allergiesAndCave")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="allergiesOther">{t("anesthesia.preop.allergies")}</Label>
                <Textarea
                  id="allergiesOther"
                  {...form.register("allergiesOther")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.allergiesPlaceholder")}
                  rows={3}
                  data-testid="textarea-allergies" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cave">{t("anesthesia.preop.cave")}</Label>
                <Textarea
                  id="cave"
                  {...form.register("cave")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.cavePlaceholder")}
                  rows={3}
                  data-testid="textarea-cave" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.medications")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anticoagulationMedsOther">{t("anesthesia.preop.anticoagulationMeds")}</Label>
                <Textarea
                  id="anticoagulationMedsOther"
                  {...form.register("anticoagulationMedsOther")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.anticoagulationMedsPlaceholder")}
                  rows={2}
                  data-testid="textarea-anticoagulation-meds" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="generalMedsOther">{t("anesthesia.preop.generalMeds")}</Label>
                <Textarea
                  id="generalMedsOther"
                  {...form.register("generalMedsOther")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.generalMedsPlaceholder")}
                  rows={3}
                  data-testid="textarea-general-meds" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicationsNotes">{t("anesthesia.preop.medicationNotes")}</Label>
                <Textarea
                  id="medicationsNotes"
                  {...form.register("medicationsNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.medicationNotesPlaceholder")}
                  rows={2}
                  data-testid="textarea-medications-notes" 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.medicalHistory")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="heartNotes">{t("anesthesia.preop.cardiovascularHistory")}</Label>
                <Textarea
                  id="heartNotes"
                  {...form.register("heartNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.cardiovascularPlaceholder")}
                  rows={2}
                  data-testid="textarea-heart-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lungNotes">{t("anesthesia.preop.respiratoryHistory")}</Label>
                <Textarea
                  id="lungNotes"
                  {...form.register("lungNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.respiratoryPlaceholder")}
                  rows={2}
                  data-testid="textarea-lung-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="giKidneyMetabolicNotes">{t("anesthesia.preop.giRenalMetabolicHistory")}</Label>
                <Textarea
                  id="giKidneyMetabolicNotes"
                  {...form.register("giKidneyMetabolicNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.giRenalMetabolicPlaceholder")}
                  rows={2}
                  data-testid="textarea-gi-kidney-metabolic-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="neuroPsychSkeletalNotes">{t("anesthesia.preop.neuroPsychSkeletalHistory")}</Label>
                <Textarea
                  id="neuroPsychSkeletalNotes"
                  {...form.register("neuroPsychSkeletalNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.neuroPsychSkeletalPlaceholder")}
                  rows={2}
                  data-testid="textarea-neuro-psych-skeletal-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="womanNotes">{t("anesthesia.preop.womensHealth")}</Label>
                <Textarea
                  id="womanNotes"
                  {...form.register("womanNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.womensHealthPlaceholder")}
                  rows={2}
                  data-testid="textarea-woman-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="noxenNotes">{t("anesthesia.preop.substanceUse")}</Label>
                <Textarea
                  id="noxenNotes"
                  {...form.register("noxenNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.substanceUsePlaceholder")}
                  rows={2}
                  data-testid="textarea-noxen-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="childrenNotes">{t("anesthesia.preop.pediatricIssues")}</Label>
                <Textarea
                  id="childrenNotes"
                  {...form.register("childrenNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.pediatricPlaceholder")}
                  rows={2}
                  data-testid="textarea-children-notes" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.anesthesiaSurgicalHistory")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="previousSurgeries">{t("anesthesia.preop.previousSurgeries")}</Label>
                <Textarea
                  id="previousSurgeries"
                  {...form.register("previousSurgeries")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.previousSurgeriesPlaceholder")}
                  rows={3}
                  data-testid="textarea-previous-surgeries" 
                />
              </div>
              
              {/* Anesthesia History Checkboxes */}
              {anesthesiaSettings?.illnessLists?.anesthesiaHistory && anesthesiaSettings.illnessLists.anesthesiaHistory.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("anesthesia.preop.previousAnesthesiaIssues")}</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {anesthesiaSettings.illnessLists.anesthesiaHistory.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`anesthesia-${item.id}`}
                          checked={form.watch("anesthesiaHistoryIssues")?.[item.id] || false}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("anesthesiaHistoryIssues") || {};
                            form.setValue("anesthesiaHistoryIssues", { ...current, [item.id]: checked as boolean }, { shouldDirty: true });
                          }}
                          disabled={isReadOnly}
                          data-testid={`checkbox-anesthesia-${item.id}`}
                        />
                        <Label htmlFor={`anesthesia-${item.id}`} className="font-normal text-sm">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Dental Status Checkboxes */}
              {anesthesiaSettings?.illnessLists?.dental && anesthesiaSettings.illnessLists.dental.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("anesthesia.preop.dentalStatus")}</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {anesthesiaSettings.illnessLists.dental.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dental-${item.id}`}
                          checked={form.watch("dentalIssues")?.[item.id] || false}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("dentalIssues") || {};
                            form.setValue("dentalIssues", { ...current, [item.id]: checked as boolean }, { shouldDirty: true });
                          }}
                          disabled={isReadOnly}
                          data-testid={`checkbox-dental-${item.id}`}
                        />
                        <Label htmlFor={`dental-${item.id}`} className="font-normal text-sm">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* PONV & Transfusion Checkboxes */}
              {anesthesiaSettings?.illnessLists?.ponvTransfusion && anesthesiaSettings.illnessLists.ponvTransfusion.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("anesthesia.preop.ponvTransfusionHistory")}</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {anesthesiaSettings.illnessLists.ponvTransfusion.map((item) => (
                      <div key={item.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`ponv-${item.id}`}
                          checked={form.watch("ponvTransfusionIssues")?.[item.id] || false}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("ponvTransfusionIssues") || {};
                            form.setValue("ponvTransfusionIssues", { ...current, [item.id]: checked as boolean }, { shouldDirty: true });
                          }}
                          disabled={isReadOnly}
                          data-testid={`checkbox-ponv-${item.id}`}
                        />
                        <Label htmlFor={`ponv-${item.id}`} className="font-normal text-sm">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="anesthesiaSurgicalHistoryNotes">{t("anesthesia.preop.additionalNotes")}</Label>
                <Textarea
                  id="anesthesiaSurgicalHistoryNotes"
                  {...form.register("anesthesiaSurgicalHistoryNotes")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.additionalNotesPlaceholder")}
                  rows={3}
                  data-testid="textarea-anesthesia-surgical-history-notes" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.outpatientCare")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("anesthesia.preop.outpatientCareDesc")}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="outpatientCaregiverFirstName">{t("anesthesia.preop.caregiverFirstName")}</Label>
                  <Input 
                    id="outpatientCaregiverFirstName" 
                    {...form.register("outpatientCaregiverFirstName")}
                    disabled={isReadOnly}
                    placeholder={t("anesthesia.preop.firstName")}
                    data-testid="input-caregiver-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outpatientCaregiverLastName">{t("anesthesia.preop.caregiverLastName")}</Label>
                  <Input 
                    id="outpatientCaregiverLastName" 
                    {...form.register("outpatientCaregiverLastName")}
                    disabled={isReadOnly}
                    placeholder={t("anesthesia.preop.lastName")}
                    data-testid="input-caregiver-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="outpatientCaregiverPhone">{t("anesthesia.preop.caregiverPhone")}</Label>
                <Controller
                  name="outpatientCaregiverPhone"
                  control={form.control}
                  render={({ field }) => (
                    <PhoneInputWithCountry
                      id="outpatientCaregiverPhone"
                      value={field.value || ""}
                      onChange={field.onChange}
                      disabled={isReadOnly}
                      placeholder={t("anesthesia.preop.phoneNumber")}
                      data-testid="input-caregiver-phone"
                    />
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.airwayAssessment")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mallampati">{t("anesthesia.preop.mallampatiClass")}</Label>
                <Select 
                  value={form.watch("mallampati") || ""}
                  onValueChange={(value) => form.setValue("mallampati", value)}
                  disabled={isReadOnly}
                >
                  <SelectTrigger data-testid="select-mallampati">
                    <SelectValue placeholder={t("anesthesia.preop.selectClass")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">I</SelectItem>
                    <SelectItem value="II">II</SelectItem>
                    <SelectItem value="III">III</SelectItem>
                    <SelectItem value="IV">IV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mouthOpening">{t("anesthesia.preop.mouthOpening")}</Label>
                <Input
                  id="mouthOpening"
                  {...form.register("mouthOpening")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.mouthOpeningPlaceholder")}
                  data-testid="input-mouth-opening" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dentition">{t("anesthesia.preop.dentition")}</Label>
                <Input
                  id="dentition"
                  {...form.register("dentition")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.dentitionPlaceholder")}
                  data-testid="input-dentition" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="airwayDifficult">{t("anesthesia.preop.difficultAirway")}</Label>
                <Select 
                  value={form.watch("airwayDifficult") || ""}
                  onValueChange={(value) => form.setValue("airwayDifficult", value)}
                  disabled={isReadOnly}
                >
                  <SelectTrigger data-testid="select-airway-difficult">
                    <SelectValue placeholder={t("anesthesia.preop.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="Uncertain">Uncertain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="airwayNotes">{t("anesthesia.preop.airwayNotes")}</Label>
                <Textarea 
                  id="airwayNotes" 
                  {...form.register("airwayNotes")}
                  disabled={isReadOnly}
                  rows={2}
                  data-testid="textarea-airway-notes" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.fastingStatus")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lastSolids">{t("anesthesia.preop.lastSolids")}</Label>
                <Input
                  id="lastSolids"
                  type="datetime-local"
                  {...form.register("lastSolids")}
                  disabled={isReadOnly}
                  data-testid="input-last-solids"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastClear">{t("anesthesia.preop.lastClearFluids")}</Label>
                <Input
                  id="lastClear"
                  type="datetime-local"
                  {...form.register("lastClear")}
                  disabled={isReadOnly}
                  data-testid="input-last-clear"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.anesthesiaPlan")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anesthesiaOther">{t("anesthesia.preop.plannedAnesthesia")}</Label>
                <Textarea
                  id="anesthesiaOther"
                  {...form.register("anesthesiaOther")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.plannedAnesthesiaPlaceholder")}
                  rows={3}
                  data-testid="textarea-planned-anesthesia" 
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="postOpICU"
                  checked={form.watch("postOpICU") || false}
                  onCheckedChange={(checked) => form.setValue("postOpICU", checked as boolean)}
                  disabled={isReadOnly}
                  data-testid="checkbox-post-op-icu"
                />
                <Label htmlFor="postOpICU">{t("anesthesia.preop.postOpIcu")}</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.installations")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="installationsOther">{t("anesthesia.preop.plannedInstallations")}</Label>
                <Textarea
                  id="installationsOther"
                  {...form.register("installationsOther")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.plannedInstallationsPlaceholder")}
                  rows={3}
                  data-testid="textarea-installations" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.assessmentCompletion")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="surgicalApproval">{t("anesthesia.preop.status")}</Label>
                <Select
                  value={form.watch("surgicalApproval") || ""}
                  onValueChange={(value) => form.setValue("surgicalApproval", value)}
                  disabled={isReadOnly}
                >
                  <SelectTrigger data-testid="select-surgical-approval">
                    <SelectValue placeholder={t("anesthesia.preop.selectCompletionStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-assessed">{t("anesthesia.preop.notAssessed")}</SelectItem>
                    <SelectItem value="approved">{t("anesthesia.preop.approved")}</SelectItem>
                    <SelectItem value="not-approved">{t("anesthesia.preop.notApproved")}</SelectItem>
                    <SelectItem value="stand-by">{t("anesthesia.preop.standByOption")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.standByStatus")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="standBy"
                  checked={form.watch("standBy") || false}
                  onCheckedChange={(checked) => {
                    form.setValue("standBy", checked);
                    if (!checked) {
                      form.setValue("standByReason", "");
                      form.setValue("standByReasonNote", "");
                    }
                  }}
                  disabled={isReadOnly}
                  data-testid="switch-stand-by"
                />
                <Label htmlFor="standBy">{t("anesthesia.preop.standBy")}</Label>
              </div>
              
              {form.watch("standBy") && (
                <div className="space-y-4 pl-8 border-l-2 border-amber-500/50">
                  <div className="space-y-2">
                    <Label htmlFor="standByReason">{t("anesthesia.preop.reason")}</Label>
                    <Select
                      value={form.watch("standByReason") || ""}
                      onValueChange={(value) => {
                        form.setValue("standByReason", value);
                        if (value !== "other") {
                          form.setValue("standByReasonNote", "");
                        }
                      }}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger data-testid="select-stand-by-reason">
                        <SelectValue placeholder={t("anesthesia.preop.selectReason")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="signature_missing">{t("anesthesia.preop.signatureMissing")}</SelectItem>
                        <SelectItem value="consent_required">{t("anesthesia.preop.consentRequired")}</SelectItem>
                        <SelectItem value="waiting_exams">{t("anesthesia.preop.waitingExams")}</SelectItem>
                        <SelectItem value="other">{t("anesthesia.preop.otherReason")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {form.watch("standByReason") === "other" && (
                    <div className="space-y-2">
                      <Label htmlFor="standByReasonNote">{t("anesthesia.preop.pleaseSpecify")}</Label>
                      <Textarea
                        id="standByReasonNote"
                        {...form.register("standByReasonNote")}
                        disabled={isReadOnly}
                        placeholder={t("anesthesia.preop.enterReason")}
                        rows={2}
                        data-testid="textarea-stand-by-reason-note" 
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("anesthesia.preop.signaturesAndConsent")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assessmentDate">{t("anesthesia.preop.assessmentDate")}</Label>
                <Controller
                  name="assessmentDate"
                  control={form.control}
                  render={({ field }) => (
                    <FlexibleDateInput
                      id="assessmentDate"
                      value={field.value || ""}
                      onChange={field.onChange}
                      disabled={isReadOnly}
                      data-testid="input-assessment-date"
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctorName">{t("anesthesia.preop.doctorName")}</Label>
                <Input
                  id="doctorName"
                  {...form.register("doctorName")}
                  disabled={isReadOnly}
                  placeholder={t("anesthesia.preop.anesthesiologistName")}
                  data-testid="input-doctor-name" 
                />
              </div>
              
              <div className="space-y-2">
                <Label>{t("anesthesia.preop.doctorSignature")}</Label>
                {form.watch("doctorSignature") ? (
                  <div className="space-y-2">
                    <div className="border rounded-md p-2 bg-muted">
                      <img src={form.watch("doctorSignature") || ""} alt="Doctor signature" className="max-h-32" />
                    </div>
                    {!isCompleted && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDoctorSignatureModalOpen(true)}
                        data-testid="button-change-doctor-signature"
                      >
                        {t("anesthesia.preop.changeSignature")}
                      </Button>
                    )}
                  </div>
                ) : (
                  !isCompleted && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDoctorSignatureModalOpen(true)}
                      data-testid="button-add-doctor-signature"
                    >
                      {t("anesthesia.preop.addDoctorSignature")}
                    </Button>
                  )
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="consentGiven"
                    checked={form.watch("consentGiven") || false}
                    onCheckedChange={(checked) => form.setValue("consentGiven", checked as boolean)}
                    disabled={isReadOnly}
                    data-testid="checkbox-consent-given"
                  />
                  <Label htmlFor="consentGiven">{t("anesthesia.preop.patientConsentGiven")}</Label>
                </div>
              </div>

              {form.watch("consentGiven") && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="consentText">{t("anesthesia.preop.consentDetails")}</Label>
                    <Textarea
                      id="consentText"
                      {...form.register("consentText")}
                      disabled={isReadOnly}
                      placeholder={t("anesthesia.preop.consentDetailsPlaceholder")}
                      rows={3}
                      data-testid="textarea-consent-text" 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consentDate">{t("anesthesia.preop.consentDate")}</Label>
                    <Controller
                      name="consentDate"
                      control={form.control}
                      render={({ field }) => (
                        <FlexibleDateInput
                          id="consentDate"
                          value={field.value || ""}
                          onChange={field.onChange}
                          disabled={isReadOnly}
                          data-testid="input-consent-date"
                        />
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("anesthesia.preop.patientSignature")}</Label>
                    {form.watch("patientSignature") ? (
                      <div className="space-y-2">
                        <div className="border rounded-md p-2 bg-muted">
                          <img src={form.watch("patientSignature") || ""} alt="Patient signature" className="max-h-32" />
                        </div>
                        {!isCompleted && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPatientSignatureModalOpen(true)}
                            data-testid="button-change-patient-signature"
                          >
                            {t("anesthesia.preop.changeSignature")}
                          </Button>
                        )}
                      </div>
                    ) : (
                      !isCompleted && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setPatientSignatureModalOpen(true)}
                          data-testid="button-add-patient-signature"
                        >
                          {t("anesthesia.preop.addPatientSignature")}
                        </Button>
                      )
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Doctor Signature Modal */}
      <SignaturePad
        isOpen={doctorSignatureModalOpen}
        onClose={() => setDoctorSignatureModalOpen(false)}
        onSave={(signature) => {
          form.setValue("doctorSignature", signature);
          setDoctorSignatureModalOpen(false);
        }}
        title={t("anesthesia.preop.doctorSignature")}
      />

      {/* Patient Signature Modal */}
      <SignaturePad
        isOpen={patientSignatureModalOpen}
        onClose={() => setPatientSignatureModalOpen(false)}
        onSave={(signature) => {
          form.setValue("patientSignature", signature);
          setPatientSignatureModalOpen(false);
        }}
        title={t("anesthesia.preop.patientSignature")}
      />
    </div>
  );
}

