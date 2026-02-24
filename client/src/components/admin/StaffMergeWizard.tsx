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
import { ArrowRightLeft, Check, ChevronLeft, ChevronRight, Loader2, UserCheck, AlertTriangle, Undo2 } from "lucide-react";

interface FieldConflict {
  field: string;
  primaryValue: any;
  secondaryValue: any;
  recommended: "primary" | "secondary";
  reason: string;
}

interface RoleConflict {
  roleId: string;
  hospitalId: string;
  unitId: string;
  role: string;
  action: "transfer" | "merge";
  details: string;
}

interface MergePreview {
  primaryUser: Record<string, any>;
  secondaryUser: Record<string, any>;
  fieldConflicts: FieldConflict[];
  roleConflicts: RoleConflict[];
  fkUpdateCounts: Record<string, number>;
  orphanMatches: Array<{ recordId: string; name: string; confidence: number }>;
}

interface StaffMergeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  initialUser1Id: string;
  initialUser2Id: string;
}

type WizardStep = "select" | "fields" | "roles" | "confirm";

function isDummyEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.endsWith("@staff.local") || email.endsWith("@internal.local");
}

function UserCard({
  user,
  selected,
  onSelect,
  recommended,
}: {
  user: Record<string, any>;
  selected: boolean;
  onSelect: () => void;
  recommended: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 p-4 border-2 rounded-lg text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/50"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm">
          {user.firstName} {user.lastName}
        </span>
        {selected && <Check className="h-4 w-4 text-primary" />}
      </div>
      <div className={`text-xs ${isDummyEmail(user.email) ? "text-muted-foreground italic" : "text-muted-foreground"}`}>
        {user.email || "No email"}
      </div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {user.canLogin && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            Can login
          </Badge>
        )}
        {!isDummyEmail(user.email) && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600">
            Real email
          </Badge>
        )}
        {recommended && (
          <Badge variant="default" className="text-[10px] px-1 py-0">
            Recommended
          </Badge>
        )}
      </div>
    </button>
  );
}

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  staffType: "Staff Type",
  hourlyRate: "Hourly Rate",
  weeklyTargetHours: "Weekly Target Hours",
  briefSignature: "Brief Signature",
  profileImageUrl: "Profile Image",
  timebutlerIcsUrl: "Timebutler URL",
  adminNotes: "Admin Notes",
};

export default function StaffMergeWizard({
  open,
  onOpenChange,
  hospitalId,
  initialUser1Id,
  initialUser2Id,
}: StaffMergeWizardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>("select");
  const [primaryUserId, setPrimaryUserId] = useState(initialUser1Id);
  const [secondaryUserId, setSecondaryUserId] = useState(initialUser2Id);
  const [fieldChoices, setFieldChoices] = useState<
    Record<string, { chosen: "primary" | "secondary"; value: any }>
  >({});

  // Reset when dialog opens with new users
  useEffect(() => {
    if (open) {
      setStep("select");
      setPrimaryUserId(initialUser1Id);
      setSecondaryUserId(initialUser2Id);
      setFieldChoices({});
    }
  }, [open, initialUser1Id, initialUser2Id]);

  // Fetch preview
  const {
    data: preview,
    isLoading: previewLoading,
    refetch: refetchPreview,
  } = useQuery<MergePreview>({
    queryKey: [`staff-merge-preview`, hospitalId, primaryUserId, secondaryUserId],
    queryFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/${hospitalId}/staff-merge/preview`,
        { primaryUserId, secondaryUserId }
      );
      return res.json();
    },
    enabled: open && !!primaryUserId && !!secondaryUserId && primaryUserId !== secondaryUserId,
  });

  // Initialize field choices from preview recommendations
  useEffect(() => {
    if (preview?.fieldConflicts) {
      const initial: Record<string, { chosen: "primary" | "secondary"; value: any }> = {};
      for (const fc of preview.fieldConflicts) {
        initial[fc.field] = {
          chosen: fc.recommended,
          value:
            fc.recommended === "primary"
              ? fc.primaryValue
              : fc.secondaryValue,
        };
      }
      setFieldChoices(initial);
    }
  }, [preview?.fieldConflicts]);

  // Auto-recommend primary user
  const recommendedPrimaryId = useMemo(() => {
    if (!preview) return null;
    const u1 = preview.primaryUser;
    const u2 = preview.secondaryUser;

    // Prefer: real email > canLogin > more roles
    let score1 = 0, score2 = 0;
    if (!isDummyEmail(u1.email)) score1 += 3;
    if (!isDummyEmail(u2.email)) score2 += 3;
    if (u1.canLogin) score1 += 2;
    if (u2.canLogin) score2 += 2;

    return score1 >= score2 ? u1.id : u2.id;
  }, [preview]);

  // Execute merge mutation
  const mergeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/${hospitalId}/staff-merge/execute`,
        { primaryUserId, secondaryUserId, fieldChoices }
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/users`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/staff-duplicates`] });
      onOpenChange(false);
      toast({
        title: t("admin.mergeSuccess", "Users merged successfully"),
        description: t("admin.mergeSuccessDescription", "All records have been updated."),
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
        title: t("admin.mergeError", "Merge failed"),
        description: error.message || "An error occurred during merge",
        variant: "destructive",
      });
    },
  });

  const handleUndo = async (mergeId: string) => {
    try {
      await apiRequest(
        "POST",
        `/api/admin/${hospitalId}/staff-merge/undo/${mergeId}`
      );
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/users`] });
      toast({
        title: t("admin.mergeUndone", "Merge undone"),
        description: t("admin.mergeUndoneDescription", "Both users have been restored."),
      });
    } catch (error: any) {
      toast({
        title: t("admin.undoError", "Undo failed"),
        description: error.message || "Failed to undo merge",
        variant: "destructive",
      });
    }
  };

  const handleSwap = () => {
    const tmp = primaryUserId;
    setPrimaryUserId(secondaryUserId);
    setSecondaryUserId(tmp);
  };

  const handleFieldChoice = (field: string, chosen: "primary" | "secondary") => {
    const conflict = preview?.fieldConflicts.find((fc) => fc.field === field);
    if (conflict) {
      setFieldChoices((prev) => ({
        ...prev,
        [field]: {
          chosen,
          value: chosen === "primary" ? conflict.primaryValue : conflict.secondaryValue,
        },
      }));
    }
  };

  const totalAffectedRecords = useMemo(() => {
    if (!preview) return 0;
    return Object.values(preview.fkUpdateCounts).reduce((sum, n) => sum + n, 0);
  }, [preview]);

  const steps: WizardStep[] = ["select", "fields", "roles", "confirm"];
  const currentStepIdx = steps.indexOf(step);
  const hasFieldConflicts = (preview?.fieldConflicts.length ?? 0) > 0;
  const hasRoleConflicts = (preview?.roleConflicts.length ?? 0) > 0;

  const canAdvance = () => {
    if (step === "select") return !!preview && !previewLoading;
    if (step === "fields") return true;
    if (step === "roles") return true;
    return true;
  };

  const handleNext = () => {
    if (step === "select") {
      setStep(hasFieldConflicts ? "fields" : hasRoleConflicts ? "roles" : "confirm");
    } else if (step === "fields") {
      setStep(hasRoleConflicts ? "roles" : "confirm");
    } else if (step === "roles") {
      setStep("confirm");
    }
  };

  const handleBack = () => {
    if (step === "confirm") {
      setStep(hasRoleConflicts ? "roles" : hasFieldConflicts ? "fields" : "select");
    } else if (step === "roles") {
      setStep(hasFieldConflicts ? "fields" : "select");
    } else if (step === "fields") {
      setStep("select");
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            {t("admin.mergeUsers", "Merge Staff Members")}
          </DialogTitle>
          <DialogDescription>
            {step === "select" && t("admin.mergeStep1", "Select which user to keep as the primary record.")}
            {step === "fields" && t("admin.mergeStep2", "Choose which field values to keep for conflicting data.")}
            {step === "roles" && t("admin.mergeStep3", "Review how roles will be merged.")}
            {step === "confirm" && t("admin.mergeStep4", "Review the changes and confirm the merge.")}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          {steps.map((s, i) => (
            <span key={s} className={`px-2 py-0.5 rounded ${i === currentStepIdx ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
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
              {/* Step 1: Select Primary */}
              {step === "select" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.selectPrimaryDescription", "The primary user will be kept. The secondary user will be archived, and all their records will be reassigned to the primary.")}
                  </p>
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("admin.primaryKeep", "Keep (Primary)")}</Label>
                      <UserCard
                        user={preview.primaryUser}
                        selected={primaryUserId === preview.primaryUser.id}
                        onSelect={() => {
                          setPrimaryUserId(preview.primaryUser.id);
                          setSecondaryUserId(preview.secondaryUser.id);
                        }}
                        recommended={recommendedPrimaryId === preview.primaryUser.id}
                      />
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" size="sm" onClick={handleSwap} title="Swap">
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">{t("admin.secondaryArchive", "Archive (Secondary)")}</Label>
                      <UserCard
                        user={preview.secondaryUser}
                        selected={primaryUserId === preview.secondaryUser.id}
                        onSelect={() => {
                          setPrimaryUserId(preview.secondaryUser.id);
                          setSecondaryUserId(preview.primaryUser.id);
                        }}
                        recommended={recommendedPrimaryId === preview.secondaryUser.id}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Resolve Field Conflicts */}
              {step === "fields" && (
                <div className="space-y-3">
                  {preview.fieldConflicts.map((fc) => (
                    <div key={fc.field} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          {FIELD_LABELS[fc.field] || fc.field}
                        </span>
                        <span className="text-xs text-muted-foreground">{fc.reason}</span>
                      </div>
                      <RadioGroup
                        value={fieldChoices[fc.field]?.chosen || fc.recommended}
                        onValueChange={(v) => handleFieldChoice(fc.field, v as "primary" | "secondary")}
                        className="space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="primary" id={`${fc.field}-primary`} />
                          <Label htmlFor={`${fc.field}-primary`} className="text-xs font-normal flex-1 cursor-pointer">
                            <span className="font-medium">Primary: </span>
                            <span className={isDummyEmail(String(fc.primaryValue)) && fc.field === "email" ? "italic text-muted-foreground" : ""}>
                              {fc.primaryValue == null ? "(empty)" : String(fc.primaryValue)}
                            </span>
                          </Label>
                        </div>
                        <div className="flex items-start gap-2">
                          <RadioGroupItem value="secondary" id={`${fc.field}-secondary`} />
                          <Label htmlFor={`${fc.field}-secondary`} className="text-xs font-normal flex-1 cursor-pointer">
                            <span className="font-medium">Secondary: </span>
                            <span className={isDummyEmail(String(fc.secondaryValue)) && fc.field === "email" ? "italic text-muted-foreground" : ""}>
                              {fc.secondaryValue == null ? "(empty)" : String(fc.secondaryValue)}
                            </span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 3: Review Role Merge */}
              {step === "roles" && (
                <div className="space-y-3">
                  {preview.roleConflicts.map((rc, idx) => (
                    <div key={idx} className="border rounded-lg p-3 flex items-center gap-3">
                      <Badge variant={rc.action === "merge" ? "default" : "secondary"}>
                        {rc.action === "merge" ? "Merge" : "Transfer"}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{rc.role}</div>
                        <div className="text-xs text-muted-foreground">{rc.details}</div>
                      </div>
                    </div>
                  ))}
                  {preview.roleConflicts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No role conflicts to resolve.
                    </p>
                  )}
                </div>
              )}

              {/* Step 4: Confirm */}
              {step === "confirm" && (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          {t("admin.mergeConfirmWarning", "This will permanently merge these two user records.")}
                        </p>
                        <p className="text-amber-700 dark:text-amber-300 mt-1 text-xs">
                          {t("admin.mergeConfirmUndo", "You can undo this operation from the success notification.")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg divide-y text-sm">
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">Primary (keep)</span>
                      <span className="font-medium">
                        {preview.primaryUser.firstName} {preview.primaryUser.lastName}
                      </span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">Secondary (archive)</span>
                      <span className="font-medium">
                        {preview.secondaryUser.firstName} {preview.secondaryUser.lastName}
                      </span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">Records affected</span>
                      <span className="font-medium">{totalAffectedRecords}</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">Field conflicts resolved</span>
                      <span className="font-medium">{preview.fieldConflicts.length}</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-muted-foreground">Roles to merge/transfer</span>
                      <span className="font-medium">{preview.roleConflicts.length}</span>
                    </div>
                    {preview.orphanMatches.length > 0 && (
                      <div className="p-3 flex justify-between">
                        <span className="text-muted-foreground">Orphan entries to link</span>
                        <span className="font-medium">{preview.orphanMatches.length}</span>
                      </div>
                    )}
                  </div>
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
            onClick={step === "select" ? () => onOpenChange(false) : handleBack}
          >
            {step === "select" ? (
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
              onClick={() => mergeMutation.mutate()}
              disabled={mergeMutation.isPending}
            >
              {mergeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {t("admin.merging", "Merging...")}
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-1" />
                  {t("admin.confirmMerge", "Confirm Merge")}
                </>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              {t("common.next", "Next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
