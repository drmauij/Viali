import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ArrowRightLeft, ChevronLeft, Loader2, UserCheck, AlertTriangle, Undo2 } from "lucide-react";

interface FieldConflict {
  field: string;
  primaryValue: any;
  secondaryValue: any;
  recommendation: "primary" | "secondary" | "merge";
  reason: string;
}

interface FkUpdateCount {
  table: string;
  column: string;
  count: number;
}

interface PatientMergePreview {
  primaryScore: number;
  secondaryScore: number;
  fieldConflicts: FieldConflict[];
  fkUpdateCounts: FkUpdateCount[];
  totalAffectedRecords: number;
}

interface PatientMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  initialPatient1Id: string;
  initialPatient2Id: string;
}

type Step = "review" | "confirm";

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  sex: "Sex",
  address: "Address",
  street: "Street",
  postalCode: "Postal Code",
  city: "City",
  insuranceProvider: "Insurance Provider",
  insuranceNumber: "Insurance Number",
  healthInsuranceNumber: "Health Insurance Number",
  insurerGln: "Insurer GLN",
  emergencyContact: "Emergency Contact",
  otherAllergies: "Other Allergies",
  allergies: "Allergies",
  internalNotes: "Internal Notes",
  idCardFrontUrl: "ID Card (Front)",
  idCardBackUrl: "ID Card (Back)",
  insuranceCardFrontUrl: "Insurance Card (Front)",
  insuranceCardBackUrl: "Insurance Card (Back)",
};

const TABLE_LABELS: Record<string, string> = {
  surgeries: "Surgeries",
  cases: "Cases",
  patient_documents: "Documents",
  patient_episodes: "Episodes",
  patient_document_folders: "Document Folders",
  patient_notes: "Notes",
  patient_messages: "Messages",
  patient_chat_archives: "Chat Archives",
  patient_discharge_medications: "Discharge Medications",
  chat_conversations: "Chat Conversations",
  chat_mentions: "Chat Mentions",
  chat_attachments: "Chat Attachments",
  clinic_invoices: "Invoices",
  patient_questionnaire_links: "Questionnaires",
  clinic_appointments: "Appointments",
  external_surgery_requests: "External Requests",
  discharge_briefs: "Discharge Briefs",
  tardoc_invoices: "TARDOC Invoices",
  activities: "Activities",
  inventory_commits: "Inventory",
};

const MERGEABLE_FIELDS = new Set(["allergies", "internalNotes"]);

function formatFieldValue(value: any): string {
  if (value == null || value === "") return "(empty)";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export default function PatientMergeDialog({
  open,
  onOpenChange,
  hospitalId,
  initialPatient1Id,
  initialPatient2Id,
}: PatientMergeDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("review");
  const [primaryId, setPrimaryId] = useState(initialPatient1Id);
  const [secondaryId, setSecondaryId] = useState(initialPatient2Id);
  const [fieldChoices, setFieldChoices] = useState<
    Record<string, { chosen: "primary" | "secondary" | "merge"; value: any }>
  >({});

  // Reset when dialog opens with new patients
  useEffect(() => {
    if (open) {
      setStep("review");
      setPrimaryId(initialPatient1Id);
      setSecondaryId(initialPatient2Id);
      setFieldChoices({});
    }
  }, [open, initialPatient1Id, initialPatient2Id]);

  // Fetch preview
  const {
    data: preview,
    isLoading: previewLoading,
  } = useQuery<PatientMergePreview>({
    queryKey: ["patient-merge-preview", hospitalId, primaryId, secondaryId],
    queryFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/${hospitalId}/patient-merge/preview`,
        { primaryPatientId: primaryId, secondaryPatientId: secondaryId }
      );
      return res.json();
    },
    enabled: open && !!primaryId && !!secondaryId && primaryId !== secondaryId,
  });

  // Fetch both patient records for display
  const { data: primaryPatient } = useQuery<Record<string, any>>({
    queryKey: [`/api/hospitals/${hospitalId}/patients/${primaryId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/hospitals/${hospitalId}/patients/${primaryId}`);
      return res.json();
    },
    enabled: open && !!primaryId,
  });

  const { data: secondaryPatient } = useQuery<Record<string, any>>({
    queryKey: [`/api/hospitals/${hospitalId}/patients/${secondaryId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/hospitals/${hospitalId}/patients/${secondaryId}`);
      return res.json();
    },
    enabled: open && !!secondaryId,
  });

  // Initialize field choices from preview recommendations
  useEffect(() => {
    if (preview?.fieldConflicts) {
      const initial: Record<string, { chosen: "primary" | "secondary" | "merge"; value: any }> = {};
      for (const fc of preview.fieldConflicts) {
        initial[fc.field] = {
          chosen: fc.recommendation,
          value:
            fc.recommendation === "primary"
              ? fc.primaryValue
              : fc.recommendation === "secondary"
                ? fc.secondaryValue
                : fc.primaryValue, // merge: backend handles combination
        };
      }
      setFieldChoices(initial);
    }
  }, [preview?.fieldConflicts]);

  // Determine which patient is recommended primary based on score
  const recommendedPrimaryIsCurrent = useMemo(() => {
    if (!preview) return true;
    return preview.primaryScore >= preview.secondaryScore;
  }, [preview]);

  // Execute merge mutation
  const mergeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/${hospitalId}/patient-merge/execute`,
        { primaryPatientId: primaryId, secondaryPatientId: secondaryId, fieldChoices }
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/patients`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/patient-duplicates`] });
      onOpenChange(false);
      toast({
        title: t("patients.mergeSuccess", "Patients merged successfully"),
        description: t("patients.mergeSuccessDescription", "All records have been updated."),
        action: (
          <ToastAction altText="Undo merge" onClick={() => handleUndo(data.mergeId)}>
            <Undo2 className="h-3 w-3 mr-1" />
            {t("common.undo", "Undo")}
          </ToastAction>
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("patients.mergeError", "Merge failed"),
        description: error.message || "An error occurred during merge",
        variant: "destructive",
      });
    },
  });

  const handleUndo = async (mergeId: string) => {
    try {
      await apiRequest(
        "POST",
        `/api/admin/${hospitalId}/patient-merge/undo/${mergeId}`
      );
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/patients`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/patient-duplicates`] });
      toast({
        title: t("patients.mergeUndone", "Merge undone"),
        description: t("patients.mergeUndoneDescription", "Both patients have been restored."),
      });
    } catch (error: any) {
      toast({
        title: t("patients.undoError", "Undo failed"),
        description: error.message || "Failed to undo merge",
        variant: "destructive",
      });
    }
  };

  const handleSwap = () => {
    setPrimaryId((prev) => {
      setSecondaryId(prev);
      return secondaryId;
    });
  };

  const handleFieldChoice = (field: string, chosen: "primary" | "secondary" | "merge") => {
    const conflict = preview?.fieldConflicts.find((fc) => fc.field === field);
    if (conflict) {
      setFieldChoices((prev) => ({
        ...prev,
        [field]: {
          chosen,
          value:
            chosen === "primary"
              ? conflict.primaryValue
              : chosen === "secondary"
                ? conflict.secondaryValue
                : conflict.primaryValue, // merge: backend handles
        },
      }));
    }
  };

  // Aggregate FK counts by table for display
  const fkSummary = useMemo(() => {
    if (!preview) return [];
    const byTable: Record<string, number> = {};
    for (const fk of preview.fkUpdateCounts) {
      byTable[fk.table] = (byTable[fk.table] || 0) + fk.count;
    }
    return Object.entries(byTable)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => ({
        table,
        label: TABLE_LABELS[table] || table,
        count,
      }));
  }, [preview]);

  // Field choices where secondary or merge was chosen (for confirm summary)
  const nonDefaultChoices = useMemo(() => {
    return Object.entries(fieldChoices).filter(
      ([, choice]) => choice.chosen !== "primary"
    );
  }, [fieldChoices]);

  const primaryName = primaryPatient
    ? `${primaryPatient.surname || ""} ${primaryPatient.firstName || ""}`.trim()
    : "...";
  const secondaryName = secondaryPatient
    ? `${secondaryPatient.surname || ""} ${secondaryPatient.firstName || ""}`.trim()
    : "...";

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            {t("patients.mergePatients", "Merge Patients")}
          </DialogTitle>
          <DialogDescription>
            {step === "review" &&
              t("patients.mergeReviewDesc", "Review conflicts and choose which field values to keep.")}
            {step === "confirm" &&
              t("patients.mergeConfirmDesc", "Review the changes and confirm the merge.")}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          {(["review", "confirm"] as const).map((s, i) => (
            <span
              key={s}
              className={`px-2 py-0.5 rounded ${
                s === step ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {i + 1}
            </span>
          ))}
        </div>

        {previewLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !preview ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Unable to load merge preview.
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <div className="pr-4">
              {/* Step 1: Review & Select */}
              {step === "review" && (
                <div className="space-y-5">
                  {/* Header: Primary vs Secondary with Swap */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border rounded-lg p-3">
                      <Label className="text-xs text-muted-foreground">
                        {t("patients.primaryKeep", "Keep (Primary)")}
                      </Label>
                      <div className="font-semibold text-sm mt-1 flex items-center gap-2">
                        {primaryName}
                        {recommendedPrimaryIsCurrent && (
                          <Badge variant="default" className="text-[10px] px-1 py-0">
                            {t("patients.recommended", "Recommended")}
                          </Badge>
                        )}
                      </div>
                      {primaryPatient?.email && (
                        <div className="text-xs text-muted-foreground mt-0.5">{primaryPatient.email}</div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleSwap} title="Swap primary/secondary">
                      <ArrowRightLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 border rounded-lg p-3">
                      <Label className="text-xs text-muted-foreground">
                        {t("patients.secondaryArchive", "Archive (Secondary)")}
                      </Label>
                      <div className="font-semibold text-sm mt-1 flex items-center gap-2">
                        {secondaryName}
                        {!recommendedPrimaryIsCurrent && (
                          <Badge variant="default" className="text-[10px] px-1 py-0">
                            {t("patients.recommended", "Recommended")}
                          </Badge>
                        )}
                      </div>
                      {secondaryPatient?.email && (
                        <div className="text-xs text-muted-foreground mt-0.5">{secondaryPatient.email}</div>
                      )}
                    </div>
                  </div>

                  {/* Field conflicts */}
                  {preview.fieldConflicts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">
                        {t("patients.fieldConflicts", "Field Conflicts")}
                      </h4>
                      {preview.fieldConflicts.map((fc) => (
                        <div key={fc.field} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                              {FIELD_LABELS[fc.field] || fc.field}
                            </span>
                            <span className="text-xs text-muted-foreground">{fc.reason}</span>
                          </div>
                          <RadioGroup
                            value={fieldChoices[fc.field]?.chosen || fc.recommendation}
                            onValueChange={(v) =>
                              handleFieldChoice(fc.field, v as "primary" | "secondary" | "merge")
                            }
                            className="space-y-2"
                          >
                            <div className="flex items-start gap-2">
                              <RadioGroupItem value="primary" id={`${fc.field}-primary`} />
                              <Label
                                htmlFor={`${fc.field}-primary`}
                                className="text-xs font-normal flex-1 cursor-pointer"
                              >
                                <span className="font-medium">Primary: </span>
                                <span>
                                  {formatFieldValue(fc.primaryValue)}
                                </span>
                              </Label>
                            </div>
                            <div className="flex items-start gap-2">
                              <RadioGroupItem value="secondary" id={`${fc.field}-secondary`} />
                              <Label
                                htmlFor={`${fc.field}-secondary`}
                                className="text-xs font-normal flex-1 cursor-pointer"
                              >
                                <span className="font-medium">Secondary: </span>
                                <span>
                                  {formatFieldValue(fc.secondaryValue)}
                                </span>
                              </Label>
                            </div>
                            {MERGEABLE_FIELDS.has(fc.field) && (
                              <div className="flex items-start gap-2">
                                <RadioGroupItem value="merge" id={`${fc.field}-merge`} />
                                <Label
                                  htmlFor={`${fc.field}-merge`}
                                  className="text-xs font-normal flex-1 cursor-pointer"
                                >
                                  <span className="font-medium">
                                    {t("patients.mergeBoth", "Merge both")}
                                  </span>
                                </Label>
                              </div>
                            )}
                          </RadioGroup>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Records to move */}
                  {fkSummary.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">
                        {t("patients.recordsToMove", "Records to Move")}
                      </h4>
                      <div className="border rounded-lg divide-y text-sm">
                        {fkSummary.map(({ table, label, count }) => (
                          <div key={table} className="px-3 py-2 flex justify-between">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-medium">{count}</span>
                          </div>
                        ))}
                        <div className="px-3 py-2 flex justify-between font-medium">
                          <span>{t("patients.total", "Total")}</span>
                          <span>{preview.totalAffectedRecords}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Confirm */}
              {step === "confirm" && (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          {t(
                            "patients.mergeConfirmWarning",
                            "This will permanently merge these two patient records."
                          )}
                        </p>
                        <p className="text-amber-700 dark:text-amber-300 mt-1 text-xs">
                          {t(
                            "patients.mergeConfirmUndo",
                            "You can undo this operation from the success notification."
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg divide-y text-sm">
                    <div className="p-3">
                      <span className="text-muted-foreground">
                        {t("patients.mergeAction", "Merge {{secondary}} into {{primary}}", {
                          secondary: secondaryName,
                          primary: primaryName,
                        })}
                      </span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">
                        {t("patients.secondaryWillBeArchived", "Secondary patient will be archived")}
                      </span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">
                        {t("patients.recordsAffected", "Records affected")}
                      </span>
                      <span className="font-medium">{preview.totalAffectedRecords}</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">
                        {t("patients.fieldConflictsResolved", "Field conflicts resolved")}
                      </span>
                      <span className="font-medium">{preview.fieldConflicts.length}</span>
                    </div>
                  </div>

                  {/* Highlight non-default field choices */}
                  {nonDefaultChoices.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">
                        {t("patients.overriddenFields", "Overridden Fields")}
                      </h4>
                      <div className="border rounded-lg divide-y text-sm">
                        {nonDefaultChoices.map(([field, choice]) => (
                          <div key={field} className="p-3 flex justify-between items-center">
                            <span className="text-muted-foreground">
                              {FIELD_LABELS[field] || field}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {choice.chosen === "merge"
                                ? t("patients.merged", "Merged")
                                : t("patients.fromSecondary", "From secondary")}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={step === "review" ? () => onOpenChange(false) : () => setStep("review")}
          >
            {step === "review" ? (
              t("common.cancel", "Cancel")
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("common.back", "Back")}
              </>
            )}
          </Button>
          {step === "confirm" ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => mergeMutation.mutate()}
              disabled={mergeMutation.isPending}
            >
              {mergeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {t("patients.merging", "Merging...")}
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-1" />
                  {t("patients.confirmMerge", "Confirm Merge")}
                </>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setStep("confirm")}
              disabled={!preview || previewLoading}
            >
              {t("common.next", "Next")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
