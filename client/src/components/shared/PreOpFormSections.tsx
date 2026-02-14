import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";

interface BaseFormSectionProps {
  form: UseFormReturn<any>;
  isReadOnly?: boolean;
}

export function VitalsSection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.vitals', 'Vitals')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="height">{t('preop.fields.height', 'Height (cm)')}</Label>
            <Input 
              id="height" 
              {...form.register("height")}
              disabled={isReadOnly}
              data-testid="input-height" 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight">{t('preop.fields.weight', 'Weight (kg)')}</Label>
            <Input 
              id="weight" 
              {...form.register("weight")}
              disabled={isReadOnly}
              data-testid="input-weight" 
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="heartRate">{t('preop.fields.heartRate', 'Heart Rate (bpm)')}</Label>
            <Input 
              id="heartRate" 
              type="number"
              {...form.register("heartRate")}
              disabled={isReadOnly}
              data-testid="input-heart-rate" 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bloodPressure">{t('preop.fields.bloodPressure', 'Blood Pressure')}</Label>
            <div className="flex gap-2 items-center">
              <Input 
                id="bloodPressureSystolic"
                type="number" 
                placeholder={t('preop.placeholders.systolic', 'Sys')}
                {...form.register("bloodPressureSystolic")}
                disabled={isReadOnly}
                className="w-20"
                data-testid="input-bp-systolic" 
              />
              <span>/</span>
              <Input 
                id="bloodPressureDiastolic"
                type="number" 
                placeholder={t('preop.placeholders.diastolic', 'Dia')}
                {...form.register("bloodPressureDiastolic")}
                disabled={isReadOnly}
                className="w-20"
                data-testid="input-bp-diastolic" 
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CaveSection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.cave', 'CAVE')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cave">{t('preop.fields.cave', 'CAVE (Contraindications/Warnings)')}</Label>
          <Textarea 
            id="cave" 
            {...form.register("cave")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.cave', 'Any contraindications or warnings...')}
            rows={3}
            data-testid="textarea-cave" 
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function MedicationsSection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.medications', 'Medications')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="anticoagulationMedsOther">{t('preop.fields.anticoagulationMeds', 'Anticoagulation Medications')}</Label>
          <Textarea 
            id="anticoagulationMedsOther" 
            {...form.register("anticoagulationMedsOther")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.anticoagulationMeds', 'List anticoagulation medications...')}
            rows={2}
            data-testid="textarea-anticoagulation-meds" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="generalMedsOther">{t('preop.fields.generalMeds', 'General Medications')}</Label>
          <Textarea 
            id="generalMedsOther" 
            {...form.register("generalMedsOther")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.generalMeds', 'List other medications...')}
            rows={3}
            data-testid="textarea-general-meds" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="medicationsNotes">{t('preop.fields.medicationsNotes', 'Medication Notes')}</Label>
          <Textarea 
            id="medicationsNotes" 
            {...form.register("medicationsNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.medicationsNotes', 'Additional medication notes...')}
            rows={2}
            data-testid="textarea-medications-notes" 
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function MedicalHistorySection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.medicalHistory', 'Medical History')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="heartNotes">{t('preop.fields.heartNotes', 'Cardiovascular History')}</Label>
          <Textarea 
            id="heartNotes" 
            {...form.register("heartNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.heartNotes', 'HTN, CHD, arrhythmia, etc...')}
            rows={2}
            data-testid="textarea-heart-notes" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lungNotes">{t('preop.fields.lungNotes', 'Respiratory History')}</Label>
          <Textarea 
            id="lungNotes" 
            {...form.register("lungNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.lungNotes', 'Asthma, COPD, sleep apnea, etc...')}
            rows={2}
            data-testid="textarea-lung-notes" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="giKidneyMetabolicNotes">{t('preop.fields.giKidneyMetabolicNotes', 'GI / Renal / Metabolic History')}</Label>
          <Textarea 
            id="giKidneyMetabolicNotes" 
            {...form.register("giKidneyMetabolicNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.giKidneyMetabolicNotes', 'Diabetes, CKD, liver disease, reflux, etc...')}
            rows={2}
            data-testid="textarea-gi-kidney-metabolic-notes" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="neuroPsychSkeletalNotes">{t('preop.fields.neuroPsychSkeletalNotes', 'Neuro / Psych / Skeletal History')}</Label>
          <Textarea 
            id="neuroPsychSkeletalNotes" 
            {...form.register("neuroPsychSkeletalNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.neuroPsychSkeletalNotes', 'Stroke, epilepsy, arthritis, depression, etc...')}
            rows={2}
            data-testid="textarea-neuro-psych-skeletal-notes" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="womanNotes">{t('preop.fields.womanNotes', "Women's Health (if applicable)")}</Label>
          <Textarea 
            id="womanNotes" 
            {...form.register("womanNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.womanNotes', 'Pregnancy, breastfeeding, menopause, etc...')}
            rows={2}
            data-testid="textarea-woman-notes" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="noxenNotes">{t('preop.fields.noxenNotes', 'Substance Use')}</Label>
          <Textarea 
            id="noxenNotes" 
            {...form.register("noxenNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.noxenNotes', 'Nicotine, alcohol, drugs...')}
            rows={2}
            data-testid="textarea-noxen-notes" 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="childrenNotes">{t('preop.fields.childrenNotes', 'Pediatric Issues (if applicable)')}</Label>
          <Textarea 
            id="childrenNotes" 
            {...form.register("childrenNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.childrenNotes', 'Prematurity, developmental delays, vaccinations, etc...')}
            rows={2}
            data-testid="textarea-children-notes" 
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function FastingSection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.fasting', 'Fasting Status')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lastSolids">{t('preop.fields.lastSolids', 'Last Solids')}</Label>
          <Input
            id="lastSolids"
            type="datetime-local"
            {...form.register("lastSolids")}
            disabled={isReadOnly}
            data-testid="input-last-solids"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastClear">{t('preop.fields.lastClear', 'Last Clear Fluids')}</Label>
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
  );
}

export function StandBySection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.standBy', 'Stand-By Status')}</CardTitle>
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
          <Label htmlFor="standBy">{t('preop.fields.standBy', 'Stand-By')}</Label>
        </div>
        
        {form.watch("standBy") && (
          <div className="space-y-4 pl-8 border-l-2 border-amber-500/50">
            <div className="space-y-2">
              <Label htmlFor="standByReason">{t('preop.fields.standByReason', 'Reason')}</Label>
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
                  <SelectValue placeholder={t('preop.placeholders.selectReason', 'Select reason...')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="signature_missing">{t('preop.standByReasons.signatureMissing', 'Patient informed, only signature missing')}</SelectItem>
                  <SelectItem value="consent_required">{t('preop.standByReasons.consentRequired', 'Only written, consent talk required')}</SelectItem>
                  <SelectItem value="waiting_exams">{t('preop.standByReasons.waitingExams', 'Waiting for EKG/Labs/Other exams')}</SelectItem>
                  <SelectItem value="other">{t('preop.standByReasons.other', 'Other reason')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {form.watch("standByReason") === "other" && (
              <div className="space-y-2">
                <Label htmlFor="standByReasonNote">{t('preop.fields.standByReasonNote', 'Please specify')}</Label>
                <Textarea 
                  id="standByReasonNote" 
                  {...form.register("standByReasonNote")}
                  disabled={isReadOnly}
                  placeholder={t('preop.placeholders.standByReasonNote', 'Enter the reason...')}
                  rows={2}
                  data-testid="textarea-stand-by-reason-note" 
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AssessmentCompletionSection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.completion', 'Assessment Completion')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="surgicalApproval">{t('preop.fields.status', 'Status')}</Label>
          <Select
            value={form.watch("surgicalApproval") || ""}
            onValueChange={(value) => form.setValue("surgicalApproval", value)}
            disabled={isReadOnly}
          >
            <SelectTrigger data-testid="select-surgical-approval">
              <SelectValue placeholder={t('preop.placeholders.selectStatus', 'Select completion status...')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not-assessed">{t('preop.statuses.notAssessed', 'Not yet assessed')}</SelectItem>
              <SelectItem value="approved">{t('preop.statuses.approved', 'Approved')}</SelectItem>
              <SelectItem value="not-approved">{t('preop.statuses.notApproved', 'Not Approved')}</SelectItem>
              <SelectItem value="stand-by">{t('preop.statuses.standBy', 'Stand-by')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export function SpecialNotesSection({ form, isReadOnly = false }: BaseFormSectionProps) {
  const { t } = useTranslation();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preop.sections.specialNotes', 'Special Notes')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="specialNotes">{t('preop.fields.specialNotes', 'Notes')}</Label>
          <Textarea 
            id="specialNotes" 
            {...form.register("specialNotes")}
            disabled={isReadOnly}
            placeholder={t('preop.placeholders.specialNotes', 'Any special notes or considerations...')}
            rows={3}
            data-testid="textarea-special-notes" 
          />
        </div>
      </CardContent>
    </Card>
  );
}
