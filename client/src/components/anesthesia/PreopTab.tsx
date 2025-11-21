import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import SignaturePad from "@/components/SignaturePad";
import { Loader2, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  const { toast } = useToast();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [doctorSignatureModalOpen, setDoctorSignatureModalOpen] = useState(false);
  const [patientSignatureModalOpen, setPatientSignatureModalOpen] = useState(false);

  const { data: assessment, isLoading } = useQuery<PreOpAssessment>({
    queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

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
        allergies: assessment.allergies || [],
        allergiesOther: assessment.allergiesOther || "",
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
      const response = await fetch('/api/anesthesia/preop', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
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
          assessmentDate: data.assessmentDate,
          doctorName: data.doctorName,
          doctorSignature: data.doctorSignature,
          consentGiven: data.consentGiven,
          consentText: data.consentText,
          patientSignature: data.patientSignature,
          consentDate: data.consentDate,
          status: (data.doctorSignature && data.patientSignature) ? "completed" : "draft",
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create assessment");
      }
      
      return response.json();
    },
    onSuccess: (newAssessment) => {
      // Immediately update cache with new assessment to prevent duplicate creates
      queryClient.setQueryData([`/api/anesthesia/preop/surgery/${surgeryId}`], newAssessment);
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${hospitalId}`] });
      setLastSaved(new Date());
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<PreOpFormData>) => {
      if (!assessment?.id) throw new Error("No assessment ID");
      
      const response = await fetch(`/api/anesthesia/preop/${assessment.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
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
          assessmentDate: data.assessmentDate,
          doctorName: data.doctorName,
          doctorSignature: data.doctorSignature,
          consentGiven: data.consentGiven,
          consentText: data.consentText,
          patientSignature: data.patientSignature,
          consentDate: data.consentDate,
          status: (data.doctorSignature && data.patientSignature) ? "completed" : "draft",
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update assessment");
      }
      
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
  }, [assessment?.id, form, createMutation, updateMutation, isCompleted]);

  useEffect(() => {
    if (isCompleted) return;
    
    const interval = setInterval(() => {
      autoSave();
    }, 30000);

    return () => clearInterval(interval);
  }, [isCompleted, autoSave]);

  const handleManualSave = async () => {
    const formData = form.getValues();
    setIsSaving(true);
    
    try {
      if (!assessment?.id) {
        await createMutation.mutateAsync(formData);
      } else {
        await updateMutation.mutateAsync(formData);
      }
      toast({ title: "Saved", description: "Pre-op assessment saved successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save assessment", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    const formData = form.getValues();
    
    if (!formData.doctorSignature || !formData.patientSignature) {
      toast({ 
        title: "Signatures Required", 
        description: "Both doctor and patient signatures are required to complete the assessment",
        variant: "destructive" 
      });
      return;
    }

    setIsSaving(true);
    
    try {
      if (!assessment?.id) {
        await createMutation.mutateAsync(formData);
      } else {
        await updateMutation.mutateAsync(formData);
      }
      toast({ 
        title: "Completed", 
        description: "Pre-op assessment completed and signed",
        variant: "default"
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to complete assessment", variant: "destructive" });
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pre-operative Assessment</h2>
          {lastSaved && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Last saved: {lastSaved.toLocaleTimeString()}
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isCompleted && (
            <Badge className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          )}
          {!isCompleted && (
            <>
              <Button
                variant="outline"
                onClick={handleManualSave}
                disabled={isSaving}
                data-testid="button-save-draft"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button
                onClick={handleComplete}
                disabled={isSaving || !form.watch("doctorSignature") || !form.watch("patientSignature")}
                data-testid="button-complete-preop"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete & Sign
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vitals & ASA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input 
                    id="height" 
                    {...form.register("height")}
                    disabled={isCompleted}
                    data-testid="input-height" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input 
                    id="weight" 
                    {...form.register("weight")}
                    disabled={isCompleted}
                    data-testid="input-weight" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asa">ASA Classification</Label>
                <Select 
                  value={form.watch("asa") || ""}
                  onValueChange={(value) => form.setValue("asa", value)}
                  disabled={isCompleted}
                >
                  <SelectTrigger data-testid="select-asa">
                    <SelectValue placeholder="Select ASA class" />
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
                <Label htmlFor="specialNotes">Special Notes</Label>
                <Textarea 
                  id="specialNotes" 
                  {...form.register("specialNotes")}
                  disabled={isCompleted}
                  rows={3}
                  data-testid="textarea-special-notes" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allergies & CAVE</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="allergiesOther">Allergies</Label>
                <Textarea 
                  id="allergiesOther" 
                  {...form.register("allergiesOther")}
                  disabled={isCompleted}
                  placeholder="List any allergies..."
                  rows={3}
                  data-testid="textarea-allergies" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cave">CAVE (Contraindications/Warnings)</Label>
                <Textarea 
                  id="cave" 
                  {...form.register("cave")}
                  disabled={isCompleted}
                  placeholder="Any contraindications or warnings..."
                  rows={3}
                  data-testid="textarea-cave" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Medications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anticoagulationMedsOther">Anticoagulation Medications</Label>
                <Textarea 
                  id="anticoagulationMedsOther" 
                  {...form.register("anticoagulationMedsOther")}
                  disabled={isCompleted}
                  placeholder="List anticoagulation medications..."
                  rows={2}
                  data-testid="textarea-anticoagulation-meds" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="generalMedsOther">General Medications</Label>
                <Textarea 
                  id="generalMedsOther" 
                  {...form.register("generalMedsOther")}
                  disabled={isCompleted}
                  placeholder="List other medications..."
                  rows={3}
                  data-testid="textarea-general-meds" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicationsNotes">Medication Notes</Label>
                <Textarea 
                  id="medicationsNotes" 
                  {...form.register("medicationsNotes")}
                  disabled={isCompleted}
                  placeholder="Additional medication notes..."
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
              <CardTitle>Medical History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="heartNotes">Cardiovascular History</Label>
                <Textarea 
                  id="heartNotes" 
                  {...form.register("heartNotes")}
                  disabled={isCompleted}
                  placeholder="HTN, CHD, arrhythmia, etc..."
                  rows={2}
                  data-testid="textarea-heart-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lungNotes">Respiratory History</Label>
                <Textarea 
                  id="lungNotes" 
                  {...form.register("lungNotes")}
                  disabled={isCompleted}
                  placeholder="Asthma, COPD, sleep apnea, etc..."
                  rows={2}
                  data-testid="textarea-lung-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="giKidneyMetabolicNotes">GI / Renal / Metabolic History</Label>
                <Textarea 
                  id="giKidneyMetabolicNotes" 
                  {...form.register("giKidneyMetabolicNotes")}
                  disabled={isCompleted}
                  placeholder="Diabetes, CKD, liver disease, reflux, etc..."
                  rows={2}
                  data-testid="textarea-gi-kidney-metabolic-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="neuroPsychSkeletalNotes">Neuro / Psych / Skeletal History</Label>
                <Textarea 
                  id="neuroPsychSkeletalNotes" 
                  {...form.register("neuroPsychSkeletalNotes")}
                  disabled={isCompleted}
                  placeholder="Stroke, epilepsy, arthritis, depression, etc..."
                  rows={2}
                  data-testid="textarea-neuro-psych-skeletal-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="womanNotes">Women's Health (if applicable)</Label>
                <Textarea 
                  id="womanNotes" 
                  {...form.register("womanNotes")}
                  disabled={isCompleted}
                  placeholder="Pregnancy, breastfeeding, menopause, etc..."
                  rows={2}
                  data-testid="textarea-woman-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="noxenNotes">Substance Use</Label>
                <Textarea 
                  id="noxenNotes" 
                  {...form.register("noxenNotes")}
                  disabled={isCompleted}
                  placeholder="Nicotine, alcohol, drugs..."
                  rows={2}
                  data-testid="textarea-noxen-notes" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="childrenNotes">Pediatric Issues (if applicable)</Label>
                <Textarea 
                  id="childrenNotes" 
                  {...form.register("childrenNotes")}
                  disabled={isCompleted}
                  placeholder="Prematurity, developmental delays, vaccinations, etc..."
                  rows={2}
                  data-testid="textarea-children-notes" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Airway Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mallampati">Mallampati Class</Label>
                <Select 
                  value={form.watch("mallampati") || ""}
                  onValueChange={(value) => form.setValue("mallampati", value)}
                  disabled={isCompleted}
                >
                  <SelectTrigger data-testid="select-mallampati">
                    <SelectValue placeholder="Select class" />
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
                <Label htmlFor="mouthOpening">Mouth Opening</Label>
                <Input 
                  id="mouthOpening" 
                  {...form.register("mouthOpening")}
                  disabled={isCompleted}
                  placeholder="e.g., Normal, Reduced"
                  data-testid="input-mouth-opening" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dentition">Dentition</Label>
                <Input 
                  id="dentition" 
                  {...form.register("dentition")}
                  disabled={isCompleted}
                  placeholder="e.g., Good, Poor, Dentures"
                  data-testid="input-dentition" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="airwayDifficult">Difficult Airway Predicted</Label>
                <Select 
                  value={form.watch("airwayDifficult") || ""}
                  onValueChange={(value) => form.setValue("airwayDifficult", value)}
                  disabled={isCompleted}
                >
                  <SelectTrigger data-testid="select-airway-difficult">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="Uncertain">Uncertain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="airwayNotes">Airway Notes</Label>
                <Textarea 
                  id="airwayNotes" 
                  {...form.register("airwayNotes")}
                  disabled={isCompleted}
                  rows={2}
                  data-testid="textarea-airway-notes" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fasting Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lastSolids">Last Solids</Label>
                <Input
                  id="lastSolids"
                  type="datetime-local"
                  {...form.register("lastSolids")}
                  disabled={isCompleted}
                  data-testid="input-last-solids"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastClear">Last Clear Fluids</Label>
                <Input
                  id="lastClear"
                  type="datetime-local"
                  {...form.register("lastClear")}
                  disabled={isCompleted}
                  data-testid="input-last-clear"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anesthesia Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anesthesiaOther">Planned Anesthesia</Label>
                <Textarea 
                  id="anesthesiaOther" 
                  {...form.register("anesthesiaOther")}
                  disabled={isCompleted}
                  placeholder="e.g., GA with ETT, Spinal, Regional..."
                  rows={3}
                  data-testid="textarea-planned-anesthesia" 
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="postOpICU"
                  checked={form.watch("postOpICU") || false}
                  onCheckedChange={(checked) => form.setValue("postOpICU", checked as boolean)}
                  disabled={isCompleted}
                  data-testid="checkbox-post-op-icu"
                />
                <Label htmlFor="postOpICU">Post-op ICU Planned</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Installations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="installationsOther">Planned Installations</Label>
                <Textarea 
                  id="installationsOther" 
                  {...form.register("installationsOther")}
                  disabled={isCompleted}
                  placeholder="e.g., Arterial line, CVC, urinary catheter..."
                  rows={3}
                  data-testid="textarea-installations" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Surgical Approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="surgicalApproval">Surgical Approval / Clearance</Label>
                <Textarea 
                  id="surgicalApproval" 
                  {...form.register("surgicalApproval")}
                  disabled={isCompleted}
                  placeholder="Any surgical clearances or approvals..."
                  rows={2}
                  data-testid="textarea-surgical-approval" 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signatures & Consent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assessmentDate">Assessment Date</Label>
                <Input
                  id="assessmentDate"
                  type="date"
                  {...form.register("assessmentDate")}
                  disabled={isCompleted}
                  data-testid="input-assessment-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctorName">Doctor Name</Label>
                <Input 
                  id="doctorName" 
                  {...form.register("doctorName")}
                  disabled={isCompleted}
                  placeholder="Anesthesiologist name"
                  data-testid="input-doctor-name" 
                />
              </div>
              
              <div className="space-y-2">
                <Label>Doctor Signature</Label>
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
                        Change Signature
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
                      Add Doctor Signature
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
                    disabled={isCompleted}
                    data-testid="checkbox-consent-given"
                  />
                  <Label htmlFor="consentGiven">Patient Consent Given</Label>
                </div>
              </div>

              {form.watch("consentGiven") && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="consentText">Consent Details</Label>
                    <Textarea 
                      id="consentText" 
                      {...form.register("consentText")}
                      disabled={isCompleted}
                      placeholder="Details of consent discussion..."
                      rows={3}
                      data-testid="textarea-consent-text" 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consentDate">Consent Date</Label>
                    <Input
                      id="consentDate"
                      type="date"
                      {...form.register("consentDate")}
                      disabled={isCompleted}
                      data-testid="input-consent-date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Patient Signature</Label>
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
                            Change Signature
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
                          Add Patient Signature
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
        title="Doctor Signature"
      />

      {/* Patient Signature Modal */}
      <SignaturePad
        isOpen={patientSignatureModalOpen}
        onClose={() => setPatientSignatureModalOpen(false)}
        onSave={(signature) => {
          form.setValue("patientSignature", signature);
          setPatientSignatureModalOpen(false);
        }}
        title="Patient Signature"
      />
    </div>
  );
}

