import { useState, useMemo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
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
  Calendar,
  ArrowLeft,
  ArrowRightLeft,
  ChevronRight,
} from "lucide-react";
import { formatDate, isoToDisplayDate } from "@/lib/dateUtils";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { EditableCheckboxRecord } from "./EditableCheckboxRecord";
import { EditableAllergies } from "./EditableAllergies";
import { EditableMedications } from "./EditableMedications";
import { EditableConditions } from "./EditableConditions";

// ─── Types ──────────────────────────────────────────────────────────────

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
  referralSource?: string;
  referralSourceDetail?: string;
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

type SectionStatus = "clear" | "findings" | "noData";

type ConditionLabelEntry = {
  label: string;
  category: string;
  categoryLabel: string;
};

type ConditionLabelMap = Record<string, ConditionLabelEntry>;

interface QuestionnaireTabProps {
  patientId: string;
  hospitalId: string;
  canWrite: boolean;
  patientSex?: "M" | "F" | "O";
  questionnaireLinks: QuestionnaireLink[];
  onOpenSendDialog: () => void;
  patientRecord?: {
    firstName?: string;
    surname?: string;
    birthday?: string;
    email?: string | null;
    phone?: string | null;
  };
}

type FieldDiff = {
  key: string;
  questionnaireKey: string;
  label: string;
  patientValue: string;
  questionnaireValue: string;
};

// ─── Constants ──────────────────────────────────────────────────────────

const CATEGORY_ORDER: string[] = [
  "cardiovascular",
  "pulmonary",
  "gastrointestinal",
  "kidney",
  "metabolic",
  "neurological",
  "psychiatric",
  "skeletal",
  "coagulation",
  "infectious",
  "woman",
  "noxen",
  "children",
  "anesthesiaHistory",
  "dental",
  "ponvTransfusion",
];

// ─── Helpers ────────────────────────────────────────────────────────────

function computeStatus(
  noneConfirmed: boolean | undefined,
  hasFindings: boolean
): SectionStatus {
  if (noneConfirmed) return "clear";
  if (hasFindings) return "findings";
  return "noData";
}

function mergeStatuses(
  a: SectionStatus | undefined,
  b: SectionStatus | undefined
): SectionStatus | undefined {
  if (a === "findings" || b === "findings") return "findings";
  if (a === "clear" && b === "clear") return "clear";
  if (a === "clear" || b === "clear") return "clear";
  return undefined;
}

function hasCheckedConditions(
  conditions?: Record<string, { checked: boolean; notes?: string }>
): boolean {
  if (!conditions) return false;
  return Object.values(conditions).some((v) => v.checked);
}

function hasCheckedRecord(data?: Record<string, boolean>): boolean {
  if (!data) return false;
  return Object.values(data).some((v) => v);
}

/** Normalize strings for comparison: trim, lowercase, collapse whitespace, treat empty/null/undefined as "" */
function normalize(val: string | null | undefined): string {
  return (val ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function computeBmi(heightCm: string | undefined, weightKg: string | undefined): string | null {
  const h = parseFloat(heightCm || "");
  const w = parseFloat(weightKg || "");
  if (!h || !w || h <= 0 || w <= 0) return null;
  const bmi = w / ((h / 100) ** 2);
  return bmi.toFixed(1);
}

const REFERRAL_SOURCE_LABELS: Record<string, string> = {
  social: "Social Media",
  search_engine: "Search Engine",
  llm: "AI Assistant",
  word_of_mouth: "Personal Recommendation",
  belegarzt: "Referring Doctor",
  other: "Other",
};

const REFERRAL_DETAIL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  bing: "Bing",
};

function formatReferralSource(source: string, detail?: string): string {
  const sourceLabel = REFERRAL_SOURCE_LABELS[source] || source;
  if (!detail) return sourceLabel;
  if (source === "other" || source === "word_of_mouth") return `${sourceLabel} — ${detail}`;
  const detailLabel = REFERRAL_DETAIL_LABELS[detail] || detail;
  return `${sourceLabel} — ${detailLabel}`;
}


// ─── Hooks ──────────────────────────────────────────────────────────────

function useConditionLabelMap(hospitalId: string, t: any): ConditionLabelMap {
  const { data: settings } = useHospitalAnesthesiaSettings(hospitalId);

  return useMemo(() => {
    const map: ConditionLabelMap = {};
    if (!settings?.illnessLists) return map;

    const categoryLabels: Record<string, string> = {
      cardiovascular: t("anesthesia.settings.cardiovascular", "Cardiovascular"),
      pulmonary: t("anesthesia.settings.pulmonary", "Pulmonary"),
      gastrointestinal: t(
        "anesthesia.settings.gastrointestinal",
        "Gastrointestinal"
      ),
      kidney: t("anesthesia.settings.kidney", "Kidney"),
      metabolic: t("anesthesia.settings.metabolic", "Metabolic"),
      neurological: t("anesthesia.settings.neurological", "Neurological"),
      psychiatric: t("anesthesia.settings.psychiatric", "Psychiatric"),
      skeletal: t("anesthesia.settings.skeletal", "Skeletal"),
      coagulation: t("anesthesia.settings.coagulation", "Coagulation"),
      infectious: t(
        "anesthesia.settings.infectiousDiseases",
        "Infectious Diseases"
      ),
      woman: t("anesthesia.settings.gynecology", "Gynecology"),
      noxen: t("anesthesia.settings.substanceUse", "Substance Use"),
      children: t("anesthesia.settings.pediatric", "Pediatric"),
      anesthesiaHistory: t(
        "anesthesia.settings.anesthesiaHistory",
        "Anesthesia & Surgical History"
      ),
      dental: t("anesthesia.settings.dentalStatus", "Dental Status"),
      ponvTransfusion: t(
        "anesthesia.settings.ponvTransfusion",
        "PONV & Transfusion History"
      ),
    };

    for (const [category, items] of Object.entries(settings.illnessLists)) {
      if (!Array.isArray(items)) continue;
      const categoryLabel = categoryLabels[category] || category;
      for (const item of items) {
        map[item.id] = {
          label: item.label,
          category,
          categoryLabel,
        };
      }
    }

    return map;
  }, [settings, t]);
}

// ─── Main Component ─────────────────────────────────────────────────────

export function QuestionnaireTab({
  patientId,
  hospitalId,
  canWrite,
  patientSex,
  questionnaireLinks,
  onOpenSendDialog,
  patientRecord,
}: QuestionnaireTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const conditionLabelMap = useConditionLabelMap(hospitalId, t);
  const { data: settings } = useHospitalAnesthesiaSettings(hospitalId);

  // Filter to only submitted/reviewed responses
  const availableResponses = useMemo(
    () =>
      questionnaireLinks.filter(
        (q) =>
          (q.status === "submitted" || q.status === "reviewed") &&
          q.response?.id
      ),
    [questionnaireLinks]
  );

  // null = list view, set = detail view
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const activeLink = useMemo(() => {
    if (!selectedLinkId || availableResponses.length === 0) return null;
    return (
      availableResponses.find((q) => q.id === selectedLinkId) || null
    );
  }, [availableResponses, selectedLinkId]);

  // Editable copy of the response
  const [editedData, setEditedData] = useState<Record<string, any> | null>(
    null
  );
  const [isDirty, setIsDirty] = useState(false);

  // Controlled accordion state
  const [openSections, setOpenSections] = useState<string[]>([]);

  // Initialize editedData when activeLink changes
  const initEdit = useCallback((link: typeof activeLink) => {
    if (link?.response) {
      setEditedData({ ...link.response });
      setIsDirty(false);
    }
  }, []);

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

  const updateField = useCallback((field: string, value: any) => {
    setEditedData((prev) => (prev ? { ...prev, [field]: value } : prev));
    setIsDirty(true);
  }, []);

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
        description: t(
          "questionnaireTab.savedDesc",
          "Questionnaire data updated."
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error", "Error"),
        description:
          error.message || t("questionnaireTab.saveError", "Failed to save"),
        variant: "destructive",
      });
    },
  });

  // ─── Field diffs (patient record vs questionnaire) ─────────────────
  const fieldDiffs = useMemo<FieldDiff[]>(() => {
    if (!editedData || !patientRecord) return [];
    const comparisons: Array<{ key: string; questionnaireKey: string; label: string; patient: string | null | undefined; questionnaire: string | null | undefined }> = [
      { key: "firstName", questionnaireKey: "patientFirstName", label: t("questionnaireTab.firstName", "First Name"), patient: patientRecord.firstName, questionnaire: editedData.patientFirstName },
      { key: "surname", questionnaireKey: "patientLastName", label: t("questionnaireTab.lastName", "Last Name"), patient: patientRecord.surname, questionnaire: editedData.patientLastName },
      { key: "birthday", questionnaireKey: "patientBirthday", label: t("questionnaireTab.birthday", "Date of Birth"), patient: patientRecord.birthday, questionnaire: editedData.patientBirthday },
      { key: "email", questionnaireKey: "patientEmail", label: t("questionnaireTab.email", "Email"), patient: patientRecord.email, questionnaire: editedData.patientEmail },
      { key: "phone", questionnaireKey: "patientPhone", label: t("questionnaireTab.phone", "Phone"), patient: patientRecord.phone, questionnaire: editedData.patientPhone },
    ];
    return comparisons
      .filter((c) => normalize(c.patient) !== normalize(c.questionnaire))
      .map((c) => ({
        key: c.key,
        questionnaireKey: c.questionnaireKey,
        label: c.label,
        patientValue: c.patient ?? "",
        questionnaireValue: (c.questionnaire as string) ?? "",
      }));
  }, [editedData, patientRecord, t]);

  const fieldDiffMap = useMemo(
    () => new Map(fieldDiffs.map((d) => [d.questionnaireKey, d])),
    [fieldDiffs]
  );

  // Mutation to update patient record fields (when "Use questionnaire value" is chosen)
  const updatePatientMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      return await apiRequest("PATCH", `/api/patients/${patientId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/patients");
        },
      });
      toast({
        title: t("questionnaireTab.patientUpdated", "Patient record updated"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resolveField = useCallback(
    (diff: FieldDiff, direction: "usePatient" | "useQuestionnaire") => {
      if (direction === "usePatient") {
        // Update questionnaire field with patient record value
        updateField(diff.questionnaireKey, diff.patientValue);
      } else {
        // Update patient record with questionnaire value
        updatePatientMutation.mutate({ [diff.key]: diff.questionnaireValue });
        // Also need to refresh to clear the diff — the patient query invalidation handles this
      }
    },
    [updateField, updatePatientMutation]
  );

  // ─── Section statuses ───────────────────────────────────────────────
  const sectionStatuses = useMemo(() => {
    const d = editedData;
    if (!d) return {} as Record<string, SectionStatus | undefined>;

    return {
      allergies: computeStatus(
        d.noAllergies,
        (d.allergies?.length ?? 0) > 0 || !!d.allergiesNotes
      ),
      medications: computeStatus(
        d.noMedications,
        (d.medications?.length ?? 0) > 0 || !!d.medicationsNotes
      ),
      conditions: computeStatus(
        d.noConditions,
        hasCheckedConditions(d.conditions)
      ),
      lifestyle: computeStatus(
        d.noSmokingAlcohol,
        !!d.smokingStatus || !!d.alcoholStatus
      ),
      surgeries: computeStatus(
        d.noPreviousSurgeries && d.noAnesthesiaProblems,
        !!d.previousSurgeries || !!d.previousAnesthesiaProblems
      ),
      dental: computeStatus(
        d.noDentalIssues,
        hasCheckedRecord(d.dentalIssues) || !!d.dentalNotes
      ),
      ponv: computeStatus(
        d.noPonvIssues,
        hasCheckedRecord(d.ponvTransfusionIssues) ||
          !!d.ponvTransfusionNotes
      ),
      drugUse: computeStatus(
        d.noDrugUse,
        hasCheckedRecord(d.drugUse) || !!d.drugUseDetails
      ),
      womensHealth:
        patientSex === "F"
          ? computeStatus(
              false,
              !!d.pregnancyStatus || d.breastfeeding || !!d.womanHealthNotes
            )
          : undefined,
    };
  }, [editedData, patientSex]);

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

  // ─── List View (no response selected) ──────────────────────────────
  if (!selectedLinkId || !activeLink || !editedData) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t("questionnaireTab.responseCount", "{{count}} questionnaire(s)", {
              count: availableResponses.length,
            })}
          </h3>
          {canWrite && (
            <Button variant="outline" size="sm" onClick={onOpenSendDialog}>
              <Send className="h-4 w-4 mr-2" />
              {t("questionnaireTab.sendQuestionnaire", "Send Questionnaire")}
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {availableResponses.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelectedLinkId(q.id)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left text-sm transition-all hover:bg-muted/50 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">
                  {q.submittedAt ? formatDate(q.submittedAt) : t("questionnaireTab.noDate", "No date")}
                </span>
                <StatusBadge status={q.status} t={t} />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Back button + response header ──────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSelectedLinkId(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("questionnaireTab.backToList", "Back to list")}
        </button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {activeLink.submittedAt && (
            <>
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(activeLink.submittedAt)}</span>
            </>
          )}
          <StatusBadge status={activeLink.status} t={t} />
        </div>
      </div>

      {/* ─── Accordion Sections ───────────────────────────────────────── */}
      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={setOpenSections}
        className="space-y-2"
      >
        {/* 1. Personal Info — full width */}
        <AccordionSection
          value="personal"
          title={t("questionnaireTab.personalInfo", "Personal Info")}
          status={fieldDiffs.length > 0 ? "findings" : undefined}
        >
          <div className="space-y-3">
            {/* Only show identity fields that differ from patient record */}
            {fieldDiffs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {fieldDiffMap.has("patientFirstName") && (
                  <ComparisonField
                    label={t("questionnaireTab.firstName", "First Name")}
                    value={editedData.patientFirstName || ""}
                    onChange={(v) => updateField("patientFirstName", v)}
                    readOnly={!canWrite}
                    diff={fieldDiffMap.get("patientFirstName")}
                    onResolve={resolveField}
                    canWrite={canWrite}
                    t={t}
                  />
                )}
                {fieldDiffMap.has("patientLastName") && (
                  <ComparisonField
                    label={t("questionnaireTab.lastName", "Last Name")}
                    value={editedData.patientLastName || ""}
                    onChange={(v) => updateField("patientLastName", v)}
                    readOnly={!canWrite}
                    diff={fieldDiffMap.get("patientLastName")}
                    onResolve={resolveField}
                    canWrite={canWrite}
                    t={t}
                  />
                )}
                {fieldDiffMap.has("patientBirthday") && (
                  <ComparisonField
                    label={t("questionnaireTab.birthday", "Date of Birth")}
                    value={editedData.patientBirthday || ""}
                    onChange={(v) => updateField("patientBirthday", v)}
                    readOnly={!canWrite}
                    diff={fieldDiffMap.get("patientBirthday")}
                    onResolve={resolveField}
                    canWrite={canWrite}
                    t={t}
                    displayTransform={isoToDisplayDate}
                  />
                )}
                {fieldDiffMap.has("patientEmail") && (
                  <ComparisonField
                    label={t("questionnaireTab.email", "Email")}
                    value={editedData.patientEmail || ""}
                    onChange={(v) => updateField("patientEmail", v)}
                    readOnly={!canWrite}
                    diff={fieldDiffMap.get("patientEmail")}
                    onResolve={resolveField}
                    canWrite={canWrite}
                    t={t}
                  />
                )}
                {fieldDiffMap.has("patientPhone") && (
                  <div className="space-y-1">
                    <Label className={cn("text-xs text-muted-foreground", canWrite && "text-amber-600 font-medium")}>
                      {t("questionnaireTab.phone", "Phone")}
                    </Label>
                    {canWrite ? (
                      <>
                        <PhoneInputWithCountry
                          value={editedData.patientPhone || ""}
                          onChange={(v) => updateField("patientPhone", v)}
                          className="ring-1 ring-amber-400"
                        />
                        <DiffResolver
                          diff={fieldDiffMap.get("patientPhone")!}
                          onResolve={resolveField}
                          canWrite={canWrite}
                          t={t}
                        />
                      </>
                    ) : (
                      <p className="text-sm py-2 px-3 bg-muted/50 rounded-md min-h-[36px]">{editedData.patientPhone || "–"}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {fieldDiffs.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                {t("questionnaireTab.personalInfoMatches", "Personal details match patient record")}
              </p>
            )}
            {/* Height | Weight | BMI — always shown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("questionnaireTab.bmi", "BMI")}
                </Label>
                <p className="text-sm py-2 px-3 bg-muted/50 rounded-md min-h-[36px]">{computeBmi(editedData.height, editedData.weight) ?? "–"}</p>
              </div>
            </div>

            {editedData.referralSource && (
              <Field
                label={t("questionnaireTab.referralSource", "Referral Source")}
                value={formatReferralSource(editedData.referralSource, editedData.referralSourceDetail)}
                onChange={() => {}}
                readOnly
              />
            )}
          </div>
        </AccordionSection>

        {/* Allergies & Medications */}
        <AccordionSection
          value="allergiesMedications"
          title={t("questionnaireTab.allergiesMedications", "Allergies & Medications")}
          status={mergeStatuses(sectionStatuses.allergies, sectionStatuses.medications)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.allergies", "Allergies")}
                </h4>
                <EditableAllergies
                  allergies={editedData.allergies}
                  noAllergies={editedData.noAllergies}
                  canWrite={canWrite}
                  allergyList={settings?.allergyList || []}
                  onAllergiesChange={(v) => updateField("allergies", v)}
                  onNoAllergiesChange={(v) => updateField("noAllergies", v)}
                />
                <Field
                  label={t("questionnaireTab.allergiesNotes", "Notes")}
                  value={editedData.allergiesNotes || ""}
                  onChange={(v) => updateField("allergiesNotes", v)}
                  readOnly={!canWrite}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.medicationsTitle", "Medications")}
                </h4>
                <EditableMedications
                  medications={editedData.medications}
                  noMedications={editedData.noMedications}
                  canWrite={canWrite}
                  onMedicationsChange={(v) => updateField("medications", v)}
                  onNoMedicationsChange={(v) => updateField("noMedications", v)}
                />
                <Field
                  label={t("questionnaireTab.medicationsNotes", "Notes")}
                  value={editedData.medicationsNotes || ""}
                  onChange={(v) => updateField("medicationsNotes", v)}
                  readOnly={!canWrite}
                />
              </CardContent>
            </Card>
          </div>
        </AccordionSection>

        {/* Medical Conditions — full width */}
        <AccordionSection
          value="conditions"
          title={t("questionnaireTab.conditions", "Medical Conditions")}
          status={sectionStatuses.conditions}
        >
          <EditableConditions
            conditions={editedData.conditions}
            noConditions={editedData.noConditions}
            canWrite={canWrite}
            conditionLabelMap={conditionLabelMap}
            illnessLists={settings?.illnessLists}
            onConditionsChange={(v) => updateField("conditions", v)}
            onNoConditionsChange={(v) => updateField("noConditions", v)}
          />
        </AccordionSection>

        {/* Lifestyle & Drug Use */}
        <AccordionSection
          value="lifestyleDrugs"
          title={t("questionnaireTab.lifestyleDrugs", "Lifestyle & Drug Use")}
          status={mergeStatuses(sectionStatuses.lifestyle, sectionStatuses.drugUse)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.lifestyle", "Lifestyle")}
                </h4>
                {editedData.noSmokingAlcohol ? (
                  <NoneConfirmed
                    t={t}
                    label={t(
                      "questionnaireTab.noSmokingAlcohol",
                      "No smoking or alcohol use confirmed"
                    )}
                  />
                ) : (
                  <>
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
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.drugUse", "Drug Use")}
                </h4>
                <EditableCheckboxRecord
                  data={editedData.drugUse}
                  options={[
                    { id: "thc", label: "THC / Cannabis" },
                    { id: "cocaine", label: t("questionnaireTab.cocaine", "Cocaine") },
                    { id: "heroin", label: t("questionnaireTab.heroin", "Heroin") },
                    { id: "mdma", label: "MDMA / Ecstasy" },
                    { id: "other", label: t("questionnaireTab.otherDrugs", "Other") },
                  ]}
                  noneConfirmed={editedData.noDrugUse}
                  canWrite={canWrite}
                  onDataChange={(v) => updateField("drugUse", v)}
                  onNoneConfirmedChange={(v) => updateField("noDrugUse", v)}
                  noneLabel={t("questionnaireTab.noDrugUse", "No drug use confirmed")}
                />
                <Field
                  label={t("questionnaireTab.drugDetails", "Details")}
                  value={editedData.drugUseDetails || ""}
                  onChange={(v) => updateField("drugUseDetails", v)}
                  readOnly={!canWrite}
                />
              </CardContent>
            </Card>
          </div>
        </AccordionSection>

        {/* Surgeries & Dental */}
        <AccordionSection
          value="surgeriesDental"
          title={t("questionnaireTab.surgeriesDental", "Surgeries & Dental Status")}
          status={mergeStatuses(sectionStatuses.surgeries, sectionStatuses.dental)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.previousSurgeries", "Previous Surgeries & Anesthesia")}
                </h4>
                {editedData.noPreviousSurgeries ? (
                  <NoneConfirmed
                    t={t}
                    label={t(
                      "questionnaireTab.noPreviousSurgeries",
                      "No previous surgeries confirmed"
                    )}
                  />
                ) : (
                  <TextAreaField
                    label={t(
                      "questionnaireTab.prevSurgeries",
                      "Previous Surgeries"
                    )}
                    value={editedData.previousSurgeries || ""}
                    onChange={(v) => updateField("previousSurgeries", v)}
                    readOnly={!canWrite}
                  />
                )}
                {editedData.noAnesthesiaProblems ? (
                  <NoneConfirmed
                    t={t}
                    label={t(
                      "questionnaireTab.noAnesthesiaProblems",
                      "No anesthesia problems confirmed"
                    )}
                  />
                ) : (
                  <TextAreaField
                    label={t(
                      "questionnaireTab.anesthesiaProblems",
                      "Anesthesia Problems"
                    )}
                    value={editedData.previousAnesthesiaProblems || ""}
                    onChange={(v) =>
                      updateField("previousAnesthesiaProblems", v)
                    }
                    readOnly={!canWrite}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.dental", "Dental Status")}
                </h4>
                <EditableCheckboxRecord
                  data={editedData.dentalIssues}
                  options={settings?.illnessLists?.dental || [
                    { id: "dentures", label: t("questionnaireTab.dentalDentures", "Dentures") },
                    { id: "crowns", label: t("questionnaireTab.dentalCrowns", "Crowns") },
                    { id: "implants", label: t("questionnaireTab.dentalImplants", "Implants") },
                    { id: "looseTeeth", label: t("questionnaireTab.dentalLooseTeeth", "Loose Teeth") },
                    { id: "damagedTeeth", label: t("questionnaireTab.dentalDamagedTeeth", "Damaged Teeth") },
                  ]}
                  fallbackLabels={{
                    dentures: t("questionnaireTab.dentalDentures", "Dentures"),
                    crowns: t("questionnaireTab.dentalCrowns", "Crowns"),
                    implants: t("questionnaireTab.dentalImplants", "Implants"),
                    looseTeeth: t("questionnaireTab.dentalLooseTeeth", "Loose Teeth"),
                    damagedTeeth: t("questionnaireTab.dentalDamagedTeeth", "Damaged Teeth"),
                  }}
                  noneConfirmed={editedData.noDentalIssues}
                  canWrite={canWrite}
                  onDataChange={(v) => updateField("dentalIssues", v)}
                  onNoneConfirmedChange={(v) => updateField("noDentalIssues", v)}
                  noneLabel={t("questionnaireTab.noDentalIssues", "No dental issues confirmed")}
                />
                <Field
                  label={t("questionnaireTab.dentalNotes", "Notes")}
                  value={editedData.dentalNotes || ""}
                  onChange={(v) => updateField("dentalNotes", v)}
                  readOnly={!canWrite}
                />
              </CardContent>
            </Card>
          </div>
        </AccordionSection>

        {/* PONV & Transfusion — full width */}
        <AccordionSection
          value="ponv"
          title={t("questionnaireTab.ponvTransfusion", "PONV & Transfusion")}
          status={sectionStatuses.ponv}
        >
          <EditableCheckboxRecord
            data={editedData.ponvTransfusionIssues}
            options={settings?.illnessLists?.ponvTransfusion || [
              { id: "ponvPrevious", label: t("questionnaireTab.ponvPrevious", "Previous PONV") },
              { id: "ponvFamily", label: t("questionnaireTab.ponvFamily", "Family PONV") },
              { id: "bloodTransfusion", label: t("questionnaireTab.bloodTransfusion", "Blood Transfusion") },
              { id: "transfusionReaction", label: t("questionnaireTab.transfusionReaction", "Transfusion Reaction") },
            ]}
            fallbackLabels={{
              ponvPrevious: t("questionnaireTab.ponvPrevious", "Previous PONV"),
              ponvFamily: t("questionnaireTab.ponvFamily", "Family PONV"),
              bloodTransfusion: t("questionnaireTab.bloodTransfusion", "Blood Transfusion"),
              transfusionReaction: t("questionnaireTab.transfusionReaction", "Transfusion Reaction"),
            }}
            noneConfirmed={editedData.noPonvIssues}
            canWrite={canWrite}
            onDataChange={(v) => updateField("ponvTransfusionIssues", v)}
            onNoneConfirmedChange={(v) => updateField("noPonvIssues", v)}
            noneLabel={t("questionnaireTab.noPonvIssues", "No PONV/transfusion issues confirmed")}
          />
          <Field
            label={t("questionnaireTab.ponvNotes", "Notes")}
            value={editedData.ponvTransfusionNotes || ""}
            onChange={(v) => updateField("ponvTransfusionNotes", v)}
            readOnly={!canWrite}
          />
        </AccordionSection>

        {/* Women's Health (only if sex=F) — full width */}
        {patientSex === "F" && (
          <AccordionSection
            value="womensHealth"
            title={t("questionnaireTab.womensHealth", "Women's Health")}
            status={sectionStatuses.womensHealth}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label={t(
                  "questionnaireTab.pregnancyStatus",
                  "Pregnancy Status"
                )}
                value={editedData.pregnancyStatus || ""}
                onChange={(v) => updateField("pregnancyStatus", v)}
                readOnly={!canWrite}
              />
              {canWrite ? (
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    id="breastfeeding"
                    checked={editedData.breastfeeding || false}
                    onCheckedChange={(checked) =>
                      updateField("breastfeeding", !!checked)
                    }
                  />
                  <Label htmlFor="breastfeeding" className="font-normal">
                    {t("questionnaireTab.breastfeeding", "Breastfeeding")}
                  </Label>
                </div>
              ) : (
                <Field
                  label={t("questionnaireTab.breastfeeding", "Breastfeeding")}
                  value={editedData.breastfeeding ? t("common.yes", "Yes") : t("common.no", "No")}
                  onChange={() => {}}
                  readOnly
                />
              )}
            </div>
            <TextAreaField
              label={t("questionnaireTab.womanHealthNotes", "Notes")}
              value={editedData.womanHealthNotes || ""}
              onChange={(v) => updateField("womanHealthNotes", v)}
              readOnly={!canWrite}
            />
          </AccordionSection>
        )}

        {/* Caregiver & Notes */}
        <AccordionSection
          value="caregiverNotes"
          title={t("questionnaireTab.caregiverNotes", "Caregiver & Additional Notes")}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.outpatientCaregiver", "Outpatient Caregiver")}
                </h4>
                <Field
                  label={t("questionnaireTab.caregiverFirstName", "First Name")}
                  value={editedData.outpatientCaregiverFirstName || ""}
                  onChange={(v) =>
                    updateField("outpatientCaregiverFirstName", v)
                  }
                  readOnly={!canWrite}
                />
                <Field
                  label={t("questionnaireTab.caregiverLastName", "Last Name")}
                  value={editedData.outpatientCaregiverLastName || ""}
                  onChange={(v) =>
                    updateField("outpatientCaregiverLastName", v)
                  }
                  readOnly={!canWrite}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("questionnaireTab.caregiverPhone", "Phone")}
                  </Label>
                  {canWrite ? (
                    <PhoneInputWithCountry
                      value={editedData.outpatientCaregiverPhone || ""}
                      onChange={(v) => updateField("outpatientCaregiverPhone", v)}
                    />
                  ) : (
                    <p className="text-sm py-2 px-3 bg-muted/50 rounded-md min-h-[36px]">{editedData.outpatientCaregiverPhone || "–"}</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("questionnaireTab.additionalNotes", "Additional Notes")}
                </h4>
                <TextAreaField
                  label={t("questionnaireTab.additionalNotesField", "Notes")}
                  value={editedData.additionalNotes || ""}
                  onChange={(v) => updateField("additionalNotes", v)}
                  readOnly={!canWrite}
                />
                <TextAreaField
                  label={t(
                    "questionnaireTab.questionsForDoctor",
                    "Questions for Doctor"
                  )}
                  value={editedData.questionsForDoctor || ""}
                  onChange={(v) => updateField("questionsForDoctor", v)}
                  readOnly={!canWrite}
                />
              </CardContent>
            </Card>
          </div>
        </AccordionSection>
      </Accordion>

      {/* ─── Dirty indicator + Save ───────────────────────────────────── */}
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
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function AccordionSection({
  value,
  title,
  status,
  children,
}: {
  value: string;
  title: string;
  status?: SectionStatus;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem
      value={value}
      id={`section-${value}`}
      className="border rounded-lg px-4"
    >
      <AccordionTrigger className="text-sm font-medium py-3">
        <span className="flex items-center gap-2">
          {status === "clear" && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          )}
          {status === "findings" && (
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          )}
          {title}
        </span>
      </AccordionTrigger>
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
  if (readOnly) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className="text-sm py-2 px-3 bg-muted/50 rounded-md min-h-[36px]">{value || "–"}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  if (readOnly) {
    if (!value?.trim()) return null;
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className="text-sm py-2 px-3 bg-muted/50 rounded-md whitespace-pre-wrap">{value}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[60px]"
      />
    </div>
  );
}

function NoneConfirmed({ t, label }: { t: any; label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <CheckCircle className="h-4 w-4 text-green-500" />
      <span>
        {label ||
          t(
            "questionnaireTab.noneConfirmed",
            "None (confirmed by patient)"
          )}
      </span>
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

function DiffResolver({
  diff,
  onResolve,
  canWrite,
  t,
}: {
  diff: FieldDiff;
  onResolve: (diff: FieldDiff, direction: "usePatient" | "useQuestionnaire") => void;
  canWrite: boolean;
  t: any;
}) {
  const displayPatient = diff.key === "birthday"
    ? isoToDisplayDate(diff.patientValue)
    : diff.patientValue;

  return (
    <div className="flex items-center gap-2 mt-1 text-xs">
      <ArrowRightLeft className="h-3 w-3 text-amber-500 shrink-0" />
      <span className="text-muted-foreground truncate">
        {t("questionnaireTab.patientRecord", "Record")}: <span className="font-medium text-foreground">{displayPatient || "–"}</span>
      </span>
      {canWrite && (
        <div className="flex gap-1 ml-auto shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[11px]"
            onClick={() => onResolve(diff, "usePatient")}
          >
            {t("questionnaireTab.usePatientValue", "Use record")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[11px]"
            onClick={() => onResolve(diff, "useQuestionnaire")}
          >
            {t("questionnaireTab.useQuestionnaireValue", "Use questionnaire")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ComparisonField({
  label,
  value,
  onChange,
  readOnly,
  diff,
  onResolve,
  canWrite,
  t,
  displayTransform,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  diff?: FieldDiff;
  onResolve: (diff: FieldDiff, direction: "usePatient" | "useQuestionnaire") => void;
  canWrite: boolean;
  t: any;
  displayTransform?: (v: string) => string;
}) {
  const displayValue = displayTransform ? displayTransform(value) : value;
  if (readOnly) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className="text-sm py-2 px-3 bg-muted/50 rounded-md min-h-[36px]">{displayValue || "–"}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className={cn(
        "text-xs text-muted-foreground",
        diff && "text-amber-600 font-medium"
      )}>
        {label}
      </Label>
      <Input
        value={displayTransform ? displayValue : value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(diff && "ring-1 ring-amber-400")}
      />
      {diff && (
        <DiffResolver diff={diff} onResolve={onResolve} canWrite={canWrite} t={t} />
      )}
    </div>
  );
}
