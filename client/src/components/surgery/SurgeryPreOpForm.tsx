import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, CheckCircle2, Eye, Upload, Trash2, FileImage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCanWrite } from "@/hooks/useCanWrite";
import {
  VitalsSection,
  CaveSection,
  MedicationsSection,
  MedicalHistorySection,
  FastingSection,
  StandBySection,
  AssessmentCompletionSection,
  SpecialNotesSection,
} from "@/components/shared/PreOpFormSections";
import type { SurgeryPreOpAssessment } from "@shared/schema";

interface SurgeryPreOpFormProps {
  surgeryId: string;
  hospitalId: string;
}

const surgeryPreOpFormSchema = z.object({
  height: z.string().optional(),
  weight: z.string().optional(),
  heartRate: z.string().optional(),
  bloodPressureSystolic: z.string().optional(),
  bloodPressureDiastolic: z.string().optional(),
  cave: z.string().optional(),
  specialNotes: z.string().optional(),
  anticoagulationMedsOther: z.string().optional(),
  generalMedsOther: z.string().optional(),
  medicationsNotes: z.string().optional(),
  heartNotes: z.string().optional(),
  lungNotes: z.string().optional(),
  giKidneyMetabolicNotes: z.string().optional(),
  neuroPsychSkeletalNotes: z.string().optional(),
  womanNotes: z.string().optional(),
  noxenNotes: z.string().optional(),
  childrenNotes: z.string().optional(),
  lastSolids: z.string().optional(),
  lastClear: z.string().optional(),
  standBy: z.boolean().optional(),
  standByReason: z.string().optional(),
  standByReasonNote: z.string().optional(),
  assessmentDate: z.string().optional(),
  doctorName: z.string().optional(),
  consentNotes: z.string().optional(),
});

type SurgeryPreOpFormData = z.infer<typeof surgeryPreOpFormSchema>;

export default function SurgeryPreOpForm({ surgeryId, hospitalId }: SurgeryPreOpFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [consentFile, setConsentFile] = useState<File | null>(null);
  const [consentPreview, setConsentPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: assessment, isLoading } = useQuery<SurgeryPreOpAssessment>({
    queryKey: [`/api/surgery/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  const form = useForm<SurgeryPreOpFormData>({
    resolver: zodResolver(surgeryPreOpFormSchema),
    defaultValues: {
      height: "",
      weight: "",
      heartRate: "",
      bloodPressureSystolic: "",
      bloodPressureDiastolic: "",
      cave: "",
      specialNotes: "",
      anticoagulationMedsOther: "",
      generalMedsOther: "",
      medicationsNotes: "",
      heartNotes: "",
      lungNotes: "",
      giKidneyMetabolicNotes: "",
      neuroPsychSkeletalNotes: "",
      womanNotes: "",
      noxenNotes: "",
      childrenNotes: "",
      lastSolids: "",
      lastClear: "",
      standBy: false,
      standByReason: "",
      standByReasonNote: "",
      assessmentDate: "",
      doctorName: "",
      consentNotes: "",
    },
  });

  useEffect(() => {
    if (assessment) {
      form.reset({
        height: assessment.height || "",
        weight: assessment.weight || "",
        heartRate: assessment.heartRate || "",
        bloodPressureSystolic: assessment.bloodPressureSystolic || "",
        bloodPressureDiastolic: assessment.bloodPressureDiastolic || "",
        cave: assessment.cave || "",
        specialNotes: assessment.specialNotes || "",
        anticoagulationMedsOther: assessment.anticoagulationMedsOther || "",
        generalMedsOther: assessment.generalMedsOther || "",
        medicationsNotes: assessment.medicationsNotes || "",
        heartNotes: assessment.heartNotes || "",
        lungNotes: assessment.lungNotes || "",
        giKidneyMetabolicNotes: assessment.giKidneyMetabolicNotes || "",
        neuroPsychSkeletalNotes: assessment.neuroPsychSkeletalNotes || "",
        womanNotes: assessment.womanNotes || "",
        noxenNotes: assessment.noxenNotes || "",
        childrenNotes: assessment.childrenNotes || "",
        lastSolids: assessment.lastSolids || "",
        lastClear: assessment.lastClear || "",
        standBy: assessment.standBy || false,
        standByReason: assessment.standByReason || "",
        standByReasonNote: assessment.standByReasonNote || "",
        assessmentDate: assessment.assessmentDate || "",
        doctorName: assessment.doctorName || "",
        consentNotes: assessment.consentNotes || "",
      });
      if (assessment.consentFileUrl) {
        setConsentPreview(assessment.consentFileUrl);
      }
    }
  }, [assessment, form]);

  const createMutation = useMutation({
    mutationFn: async (data: Partial<SurgeryPreOpFormData>) => {
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
    mutationFn: async (data: Partial<SurgeryPreOpFormData>) => {
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

  const autoSave = useCallback(async () => {
    if (!canWrite) return;
    if (form.formState.isSubmitting || isCompleted) return;
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
      setConsentFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setConsentPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveFile = () => {
    setConsentFile(null);
    setConsentPreview(assessment?.consentFileUrl || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isReadOnly = isCompleted || !canWrite;

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

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <VitalsSection form={form} isReadOnly={isReadOnly} />
          <CaveSection form={form} isReadOnly={isReadOnly} />
          <MedicationsSection form={form} isReadOnly={isReadOnly} />
          <SpecialNotesSection form={form} isReadOnly={isReadOnly} />
        </div>

        <div className="space-y-6">
          <MedicalHistorySection form={form} isReadOnly={isReadOnly} />
          <FastingSection form={form} isReadOnly={isReadOnly} />
          <StandBySection form={form} isReadOnly={isReadOnly} />
          <AssessmentCompletionSection form={form} isReadOnly={isReadOnly} />
          
          <Card>
            <CardHeader>
              <CardTitle>{t('surgery.preop.consentDocument')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('surgery.preop.consentDocumentDesc')}
              </p>
              
              {consentPreview ? (
                <div className="space-y-3">
                  <div className="border rounded-lg p-2 bg-muted/30">
                    <img 
                      src={consentPreview} 
                      alt={t('surgery.preop.consentImage')} 
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
                        {t('surgery.preop.changeImage')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveFile}
                        data-testid="button-remove-consent"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('common.remove')}
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
                    <p className="text-sm font-medium">{t('surgery.preop.uploadConsent')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('surgery.preop.uploadConsentDesc')}</p>
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
                <Label htmlFor="consentNotes">{t('surgery.preop.consentNotes')}</Label>
                <Input 
                  id="consentNotes"
                  {...form.register("consentNotes")}
                  disabled={isReadOnly}
                  placeholder={t('surgery.preop.consentNotesPlaceholder')}
                  data-testid="input-consent-notes"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="assessmentDate">{t('surgery.preop.assessmentDate')}</Label>
                  <Input
                    id="assessmentDate"
                    type="date"
                    {...form.register("assessmentDate")}
                    disabled={isReadOnly}
                    data-testid="input-assessment-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doctorName">{t('surgery.preop.assessedBy')}</Label>
                  <Input 
                    id="doctorName"
                    {...form.register("doctorName")}
                    disabled={isReadOnly}
                    placeholder={t('surgery.preop.assessedByPlaceholder')}
                    data-testid="input-doctor-name"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
