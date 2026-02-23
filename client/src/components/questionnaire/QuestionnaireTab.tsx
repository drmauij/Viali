import { useState, useMemo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  Save,
  Loader2,
  ClipboardList,
  Send,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";

// Re-use the QuestionnaireLink type from queries
type QuestionnaireResponse = {
  id: string;
  allergies?: string[];
  allergiesNotes?: string;
  medications?: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    reason?: string;
  }>;
  medicationsNotes?: string;
  conditions?: Record<string, { checked: boolean; notes?: string }>;
  smokingStatus?: string;
  smokingDetails?: string;
  alcoholStatus?: string;
  alcoholDetails?: string;
  height?: string;
  weight?: string;
  previousSurgeries?: string;
  previousAnesthesiaProblems?: string;
  pregnancyStatus?: string;
  breastfeeding?: boolean;
  womanHealthNotes?: string;
  additionalNotes?: string;
  dentalIssues?: Record<string, boolean>;
  dentalNotes?: string;
  noDentalIssues?: boolean;
  ponvTransfusionIssues?: Record<string, boolean>;
  ponvTransfusionNotes?: string;
  noPonvIssues?: boolean;
  drugUse?: Record<string, boolean>;
  drugUseDetails?: string;
  noDrugUse?: boolean;
  questionsForDoctor?: string;
  outpatientCaregiverFirstName?: string;
  outpatientCaregiverLastName?: string;
  outpatientCaregiverPhone?: string;
  noAllergies?: boolean;
  noMedications?: boolean;
  noConditions?: boolean;
  noSmokingAlcohol?: boolean;
  noPreviousSurgeries?: boolean;
  noAnesthesiaProblems?: boolean;
  patientFirstName?: string;
  patientLastName?: string;
  patientBirthday?: string;
  patientEmail?: string;
  patientPhone?: string;
};

type QuestionnaireLink = {
  id: string;
  token: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  response?: QuestionnaireResponse;
};

interface QuestionnaireTabProps {
  patientId: string;
  hospitalId: string;
  canWrite: boolean;
  patientSex?: "M" | "F" | "O";
  questionnaireLinks: QuestionnaireLink[];
  onOpenSendDialog: () => void;
}

export function QuestionnaireTab({
  patientId,
  hospitalId,
  canWrite,
  patientSex,
  questionnaireLinks,
  onOpenSendDialog,
}: QuestionnaireTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Filter to only submitted/reviewed responses
  const availableResponses = useMemo(
    () =>
      questionnaireLinks.filter(
        (q) =>
          (q.status === "submitted" || q.status === "reviewed") && q.response?.id
      ),
    [questionnaireLinks]
  );

  // Default to most recent
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const activeLink = useMemo(() => {
    if (availableResponses.length === 0) return null;
    if (selectedLinkId) {
      return availableResponses.find((q) => q.id === selectedLinkId) || availableResponses[0];
    }
    return availableResponses[0];
  }, [availableResponses, selectedLinkId]);

  // Editable copy of the response
  const [editedData, setEditedData] = useState<Record<string, any> | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Initialize editedData when activeLink changes
  const initEdit = useCallback(
    (link: typeof activeLink) => {
      if (link?.response) {
        setEditedData({ ...link.response });
        setIsDirty(false);
      }
    },
    []
  );

  // When activeLink changes, reset edit state
  useMemo(() => {
    if (activeLink) {
      initEdit(activeLink);
    } else {
      setEditedData(null);
      setIsDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLink?.id]);

  const updateField = useCallback(
    (field: string, value: any) => {
      setEditedData((prev) => (prev ? { ...prev, [field]: value } : prev));
      setIsDirty(true);
    },
    []
  );

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeLink?.response?.id || !editedData) throw new Error("No data");
      const res = await apiRequest(
        "PUT",
        `/api/questionnaire/responses/${activeLink.response.id}`,
        editedData
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/questionnaire/patient", patientId, "links"],
      });
      setIsDirty(false);
      toast({
        title: t("questionnaireTab.saved", "Changes saved"),
        description: t("questionnaireTab.savedDesc", "Questionnaire data updated."),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("questionnaireTab.saveError", "Failed to save"),
        variant: "destructive",
      });
    },
  });

  // ─── Empty State ────────────────────────────────────────────────────
  if (availableResponses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="font-medium text-lg">
            {t("questionnaireTab.empty", "No questionnaire responses")}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t(
              "questionnaireTab.emptyDesc",
              "Send a questionnaire to the patient so they can fill in their medical history before the consultation."
            )}
          </p>
          {canWrite && (
            <Button className="mt-4" onClick={onOpenSendDialog}>
              <Send className="h-4 w-4 mr-2" />
              {t("questionnaireTab.sendQuestionnaire", "Send Questionnaire")}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!editedData || !activeLink) return null;

  // ─── Selector (multiple responses) ─────────────────────────────────
  const showSelector = availableResponses.length > 1;

  return (
    <div className="space-y-4">
      {/* Selector Cards */}
      {showSelector && (
        <div className="flex gap-2 flex-wrap">
          {availableResponses.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelectedLinkId(q.id)}
              className={cn(
                "px-3 py-2 rounded-md border text-sm flex items-center gap-2 transition-colors",
                activeLink.id === q.id
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:bg-muted"
              )}
            >
              {q.submittedAt && formatDate(q.submittedAt)}
              <StatusBadge status={q.status} t={t} />
            </button>
          ))}
        </div>
      )}

      {/* Dirty indicator + Save */}
      {canWrite && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {isDirty && (
              <>
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-amber-600 font-medium">
                  {t("questionnaireTab.unsavedChanges", "Unsaved changes")}
                </span>
              </>
            )}
            {!isDirty && activeLink?.response && (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">
                  {t("questionnaireTab.allSaved", "All changes saved")}
                </span>
              </>
            )}
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
            size="sm"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("questionnaireTab.saveChanges", "Save Changes")}
          </Button>
        </div>
      )}

      {/* Accordion Sections */}
      <Accordion type="multiple" className="space-y-2">
        {/* 1. Personal Info */}
        <AccordionSection value="personal" title={t("questionnaireTab.personalInfo", "Personal Info")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label={t("questionnaireTab.firstName", "First Name")}
              value={editedData.patientFirstName || ""}
              onChange={(v) => updateField("patientFirstName", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.lastName", "Last Name")}
              value={editedData.patientLastName || ""}
              onChange={(v) => updateField("patientLastName", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.birthday", "Date of Birth")}
              value={editedData.patientBirthday || ""}
              onChange={(v) => updateField("patientBirthday", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.email", "Email")}
              value={editedData.patientEmail || ""}
              onChange={(v) => updateField("patientEmail", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.phone", "Phone")}
              value={editedData.patientPhone || ""}
              onChange={(v) => updateField("patientPhone", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.height", "Height (cm)")}
              value={editedData.height || ""}
              onChange={(v) => updateField("height", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.weight", "Weight (kg)")}
              value={editedData.weight || ""}
              onChange={(v) => updateField("weight", v)}
              readOnly={!canWrite}
            />
          </div>
        </AccordionSection>

        {/* 2. Allergies */}
        <AccordionSection value="allergies" title={t("questionnaireTab.allergies", "Allergies")}>
          {editedData.noAllergies ? (
            <NoneConfirmed t={t} />
          ) : (
            <div className="space-y-3">
              {editedData.allergies && editedData.allergies.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {editedData.allergies.map((a: string, i: number) => (
                    <Badge key={i} variant="secondary">{a}</Badge>
                  ))}
                </div>
              )}
              <Field
                label={t("questionnaireTab.allergiesNotes", "Notes")}
                value={editedData.allergiesNotes || ""}
                onChange={(v) => updateField("allergiesNotes", v)}
                readOnly={!canWrite}
              />
              {(!editedData.allergies || editedData.allergies.length === 0) && !editedData.allergiesNotes && (
                <p className="text-sm text-muted-foreground italic">{t("questionnaireTab.noData", "No data provided")}</p>
              )}
            </div>
          )}
        </AccordionSection>

        {/* 3. Medications */}
        <AccordionSection value="medications" title={t("questionnaireTab.medicationsTitle", "Medications")}>
          {editedData.noMedications ? (
            <NoneConfirmed t={t} />
          ) : (
            <div className="space-y-3">
              {editedData.medications && editedData.medications.length > 0 && (
                <div className="space-y-2">
                  {editedData.medications.map((med: any, i: number) => (
                    <div key={i} className="flex flex-wrap gap-2 text-sm p-2 border rounded">
                      <span className="font-medium">{med.name}</span>
                      {med.dosage && <span className="text-muted-foreground">| {med.dosage}</span>}
                      {med.frequency && <span className="text-muted-foreground">| {med.frequency}</span>}
                      {med.reason && <span className="text-muted-foreground">| {med.reason}</span>}
                    </div>
                  ))}
                </div>
              )}
              <Field
                label={t("questionnaireTab.medicationsNotes", "Notes")}
                value={editedData.medicationsNotes || ""}
                onChange={(v) => updateField("medicationsNotes", v)}
                readOnly={!canWrite}
              />
              {(!editedData.medications || editedData.medications.length === 0) && !editedData.medicationsNotes && (
                <p className="text-sm text-muted-foreground italic">{t("questionnaireTab.noData", "No data provided")}</p>
              )}
            </div>
          )}
        </AccordionSection>

        {/* 4. Medical Conditions */}
        <AccordionSection value="conditions" title={t("questionnaireTab.conditions", "Medical Conditions")}>
          {editedData.noConditions ? (
            <NoneConfirmed t={t} />
          ) : (
            <div className="space-y-2">
              {editedData.conditions && Object.keys(editedData.conditions).length > 0 ? (
                Object.entries(editedData.conditions as Record<string, { checked: boolean; notes?: string }>)
                  .filter(([, v]) => v.checked)
                  .map(([key, val]) => (
                    <div key={key} className="flex items-start gap-2 text-sm p-2 border rounded">
                      <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{key}</span>
                        {val.notes && <span className="text-muted-foreground ml-2">— {val.notes}</span>}
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-muted-foreground italic">{t("questionnaireTab.noData", "No data provided")}</p>
              )}
            </div>
          )}
        </AccordionSection>

        {/* 5. Lifestyle */}
        <AccordionSection value="lifestyle" title={t("questionnaireTab.lifestyle", "Lifestyle")}>
          {editedData.noSmokingAlcohol ? (
            <NoneConfirmed t={t} label={t("questionnaireTab.noSmokingAlcohol", "No smoking or alcohol use confirmed")} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label={t("questionnaireTab.smokingStatus", "Smoking")}
                value={editedData.smokingStatus || ""}
                onChange={(v) => updateField("smokingStatus", v)}
                readOnly={!canWrite}
              />
              <Field
                label={t("questionnaireTab.smokingDetails", "Smoking Details")}
                value={editedData.smokingDetails || ""}
                onChange={(v) => updateField("smokingDetails", v)}
                readOnly={!canWrite}
              />
              <Field
                label={t("questionnaireTab.alcoholStatus", "Alcohol")}
                value={editedData.alcoholStatus || ""}
                onChange={(v) => updateField("alcoholStatus", v)}
                readOnly={!canWrite}
              />
              <Field
                label={t("questionnaireTab.alcoholDetails", "Alcohol Details")}
                value={editedData.alcoholDetails || ""}
                onChange={(v) => updateField("alcoholDetails", v)}
                readOnly={!canWrite}
              />
            </div>
          )}
        </AccordionSection>

        {/* 6. Previous Surgeries & Anesthesia */}
        <AccordionSection value="surgeries" title={t("questionnaireTab.previousSurgeries", "Previous Surgeries & Anesthesia")}>
          <div className="space-y-3">
            {editedData.noPreviousSurgeries ? (
              <NoneConfirmed t={t} label={t("questionnaireTab.noPreviousSurgeries", "No previous surgeries confirmed")} />
            ) : (
              <TextAreaField
                label={t("questionnaireTab.prevSurgeries", "Previous Surgeries")}
                value={editedData.previousSurgeries || ""}
                onChange={(v) => updateField("previousSurgeries", v)}
                readOnly={!canWrite}
              />
            )}
            {editedData.noAnesthesiaProblems ? (
              <NoneConfirmed t={t} label={t("questionnaireTab.noAnesthesiaProblems", "No anesthesia problems confirmed")} />
            ) : (
              <TextAreaField
                label={t("questionnaireTab.anesthesiaProblems", "Anesthesia Problems")}
                value={editedData.previousAnesthesiaProblems || ""}
                onChange={(v) => updateField("previousAnesthesiaProblems", v)}
                readOnly={!canWrite}
              />
            )}
          </div>
        </AccordionSection>

        {/* 7. Women's Health (only if sex=F) */}
        {patientSex === "F" && (
          <AccordionSection value="womensHealth" title={t("questionnaireTab.womensHealth", "Women's Health")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label={t("questionnaireTab.pregnancyStatus", "Pregnancy Status")}
                value={editedData.pregnancyStatus || ""}
                onChange={(v) => updateField("pregnancyStatus", v)}
                readOnly={!canWrite}
              />
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="breastfeeding"
                  checked={editedData.breastfeeding || false}
                  onCheckedChange={(checked) => updateField("breastfeeding", !!checked)}
                  disabled={!canWrite}
                />
                <Label htmlFor="breastfeeding" className="font-normal">
                  {t("questionnaireTab.breastfeeding", "Breastfeeding")}
                </Label>
              </div>
            </div>
            <TextAreaField
              label={t("questionnaireTab.womanHealthNotes", "Notes")}
              value={editedData.womanHealthNotes || ""}
              onChange={(v) => updateField("womanHealthNotes", v)}
              readOnly={!canWrite}
            />
          </AccordionSection>
        )}

        {/* 8. Dental */}
        <AccordionSection value="dental" title={t("questionnaireTab.dental", "Dental Status")}>
          {editedData.noDentalIssues ? (
            <NoneConfirmed t={t} label={t("questionnaireTab.noDentalIssues", "No dental issues confirmed")} />
          ) : (
            <div className="space-y-3">
              <CheckboxRecordDisplay
                data={editedData.dentalIssues}
                labelMap={{
                  dentures: t("questionnaireTab.dentalDentures", "Dentures"),
                  crowns: t("questionnaireTab.dentalCrowns", "Crowns"),
                  implants: t("questionnaireTab.dentalImplants", "Implants"),
                  looseTeeth: t("questionnaireTab.dentalLooseTeeth", "Loose Teeth"),
                  damagedTeeth: t("questionnaireTab.dentalDamagedTeeth", "Damaged Teeth"),
                }}
              />
              <Field
                label={t("questionnaireTab.dentalNotes", "Notes")}
                value={editedData.dentalNotes || ""}
                onChange={(v) => updateField("dentalNotes", v)}
                readOnly={!canWrite}
              />
            </div>
          )}
        </AccordionSection>

        {/* 9. PONV & Transfusion */}
        <AccordionSection value="ponv" title={t("questionnaireTab.ponvTransfusion", "PONV & Transfusion")}>
          {editedData.noPonvIssues ? (
            <NoneConfirmed t={t} label={t("questionnaireTab.noPonvIssues", "No PONV/transfusion issues confirmed")} />
          ) : (
            <div className="space-y-3">
              <CheckboxRecordDisplay
                data={editedData.ponvTransfusionIssues}
                labelMap={{
                  ponvPrevious: t("questionnaireTab.ponvPrevious", "Previous PONV"),
                  ponvFamily: t("questionnaireTab.ponvFamily", "Family PONV"),
                  bloodTransfusion: t("questionnaireTab.bloodTransfusion", "Blood Transfusion"),
                  transfusionReaction: t("questionnaireTab.transfusionReaction", "Transfusion Reaction"),
                }}
              />
              <Field
                label={t("questionnaireTab.ponvNotes", "Notes")}
                value={editedData.ponvTransfusionNotes || ""}
                onChange={(v) => updateField("ponvTransfusionNotes", v)}
                readOnly={!canWrite}
              />
            </div>
          )}
        </AccordionSection>

        {/* 10. Drug Use */}
        <AccordionSection value="drugUse" title={t("questionnaireTab.drugUse", "Drug Use")}>
          {editedData.noDrugUse ? (
            <NoneConfirmed t={t} label={t("questionnaireTab.noDrugUse", "No drug use confirmed")} />
          ) : (
            <div className="space-y-3">
              <CheckboxRecordDisplay
                data={editedData.drugUse}
                labelMap={{
                  thc: "THC / Cannabis",
                  cocaine: t("questionnaireTab.cocaine", "Cocaine"),
                  heroin: t("questionnaireTab.heroin", "Heroin"),
                  mdma: "MDMA / Ecstasy",
                  other: t("questionnaireTab.otherDrugs", "Other"),
                }}
              />
              <Field
                label={t("questionnaireTab.drugDetails", "Details")}
                value={editedData.drugUseDetails || ""}
                onChange={(v) => updateField("drugUseDetails", v)}
                readOnly={!canWrite}
              />
            </div>
          )}
        </AccordionSection>

        {/* 11. Outpatient Caregiver */}
        <AccordionSection value="caregiver" title={t("questionnaireTab.outpatientCaregiver", "Outpatient Caregiver")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field
              label={t("questionnaireTab.caregiverFirstName", "First Name")}
              value={editedData.outpatientCaregiverFirstName || ""}
              onChange={(v) => updateField("outpatientCaregiverFirstName", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.caregiverLastName", "Last Name")}
              value={editedData.outpatientCaregiverLastName || ""}
              onChange={(v) => updateField("outpatientCaregiverLastName", v)}
              readOnly={!canWrite}
            />
            <Field
              label={t("questionnaireTab.caregiverPhone", "Phone")}
              value={editedData.outpatientCaregiverPhone || ""}
              onChange={(v) => updateField("outpatientCaregiverPhone", v)}
              readOnly={!canWrite}
            />
          </div>
        </AccordionSection>

        {/* 12. Additional Notes */}
        <AccordionSection value="notes" title={t("questionnaireTab.additionalNotes", "Additional Notes")}>
          <div className="space-y-3">
            <TextAreaField
              label={t("questionnaireTab.additionalNotesField", "Notes")}
              value={editedData.additionalNotes || ""}
              onChange={(v) => updateField("additionalNotes", v)}
              readOnly={!canWrite}
            />
            <TextAreaField
              label={t("questionnaireTab.questionsForDoctor", "Questions for Doctor")}
              value={editedData.questionsForDoctor || ""}
              onChange={(v) => updateField("questionsForDoctor", v)}
              readOnly={!canWrite}
            />
          </div>
        </AccordionSection>
      </Accordion>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function AccordionSection({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border rounded-lg px-4">
      <AccordionTrigger className="text-sm font-medium py-3">{title}</AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={cn(readOnly && "bg-muted cursor-default")}
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={cn("min-h-[60px]", readOnly && "bg-muted cursor-default")}
      />
    </div>
  );
}

function NoneConfirmed({ t, label }: { t: any; label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <CheckCircle className="h-4 w-4 text-green-500" />
      <span>{label || t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}</span>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: any }) {
  const variant = status === "reviewed" ? "default" : "secondary";
  return (
    <Badge variant={variant} className="text-xs">
      {status === "submitted"
        ? t("questionnaireTab.statusSubmitted", "Submitted")
        : t("questionnaireTab.statusReviewed", "Reviewed")}
    </Badge>
  );
}

function CheckboxRecordDisplay({
  data,
  labelMap,
}: {
  data?: Record<string, boolean>;
  labelMap: Record<string, string>;
}) {
  if (!data) return null;
  const checked = Object.entries(data).filter(([, v]) => v);
  if (checked.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No items selected</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {checked.map(([key]) => (
        <Badge key={key} variant="secondary">
          {labelMap[key] || key}
        </Badge>
      ))}
    </div>
  );
}
