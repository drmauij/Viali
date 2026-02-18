import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  Link2,
  LayoutList,
  FileSearch,
  Languages,
  ClipboardCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DischargeBriefWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  hospitalId: string;
  surgeries?: Array<{
    id: string;
    plannedSurgery: string | null;
    plannedDate: Date | string;
    status: string;
  }>;
  onCreated?: (briefId: string) => void;
}

type BlockKey =
  | "anesthesia_record"
  | "surgery_notes"
  | "surgery_details"
  | "patient_notes"
  | "discharge_medications";

type BriefType =
  | "surgery_discharge"
  | "anesthesia_discharge"
  | "anesthesia_overnight_discharge";

interface BlockInfo {
  key: BlockKey;
  available: boolean;
  count?: number;
  notes?: Array<{ id: string; title: string; createdAt: string }>;
}

interface TemplateInfo {
  id: string;
  name: string;
  procedureType?: string | null;
}

const TOTAL_STEPS = 6;

const BLOCK_ICONS: Record<BlockKey, React.ElementType> = {
  anesthesia_record: FileText,
  surgery_notes: FileSearch,
  surgery_details: ClipboardCheck,
  patient_notes: LayoutList,
  discharge_medications: FileText,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DischargeBriefWizard({
  open,
  onOpenChange,
  patientId,
  hospitalId,
  surgeries = [],
  onCreated,
}: DischargeBriefWizardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ---- wizard state ----
  const [step, setStep] = useState(1);
  const [selectedBlocks, setSelectedBlocks] = useState<BlockKey[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [surgeryId, setSurgeryId] = useState<string | null>(null);
  const [briefType, setBriefType] = useState<BriefType | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [language, setLanguage] = useState("de");
  const [annotations, setAnnotations] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBriefId, setGeneratedBriefId] = useState<string | null>(null);

  // ---- reset on open/close ----
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedBlocks([]);
      setSelectedNoteIds([]);
      setSurgeryId(null);
      setBriefType(null);
      setTemplateId(null);
      setLanguage("de");
      setAnnotations("");
      setIsGenerating(false);
      setGeneratedBriefId(null);
    }
  }, [open]);

  // ---- data fetching ----

  const blocksQueryKey = useMemo(
    () =>
      `/api/patients/${patientId}/discharge-brief-data${surgeryId ? `?surgeryId=${surgeryId}` : ""}`,
    [patientId, surgeryId],
  );

  const { data: blocksData, isLoading: blocksLoading } = useQuery<BlockInfo[]>({
    queryKey: [blocksQueryKey],
    enabled: open && !!patientId,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<
    TemplateInfo[]
  >({
    queryKey: [
      `/api/discharge-brief-templates/${hospitalId}${briefType ? `?briefType=${briefType}` : ""}`,
    ],
    enabled: open && !!hospitalId && !!briefType,
  });

  // ---- derived ----
  const blocks: BlockInfo[] = blocksData ?? [];

  // ---- block toggle helpers ----
  const toggleBlock = useCallback((key: BlockKey) => {
    setSelectedBlocks((prev) =>
      prev.includes(key) ? prev.filter((b) => b !== key) : [...prev, key],
    );
  }, []);

  const toggleNoteId = useCallback((noteId: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(noteId)
        ? prev.filter((id) => id !== noteId)
        : [...prev, noteId],
    );
  }, []);

  // ---- step validation ----
  const canProceed = useMemo(() => {
    switch (step) {
      case 1:
        return selectedBlocks.length > 0;
      case 2:
        return true; // surgery is optional (standalone)
      case 3:
        return !!briefType;
      case 4:
        return true; // template is optional
      case 5:
        return !!language;
      case 6:
        return !isGenerating;
      default:
        return false;
    }
  }, [step, selectedBlocks, briefType, language, isGenerating]);

  // ---- navigation ----
  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS && canProceed) setStep((s) => s + 1);
  }, [step, canProceed]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((s) => s - 1);
  }, [step]);

  // ---- generate ----
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/patients/${patientId}/discharge-briefs/generate`,
        {
          blocks: selectedBlocks,
          briefType,
          language,
          templateId: templateId ?? null,
          surgeryId: surgeryId ?? null,
          annotations: annotations || null,
          selectedNoteIds:
            selectedBlocks.includes("patient_notes") && selectedNoteIds.length > 0
              ? selectedNoteIds
              : null,
        },
      );
      const data = await res.json();
      setGeneratedBriefId(data.id ?? data.briefId ?? null);
      queryClient.invalidateQueries({
        queryKey: [`/api/patients/${patientId}/discharge-briefs`],
      });
      toast({
        title: t(
          "dischargeBriefs.wizard.generateSuccess",
          "Brief generated successfully",
        ),
      });
    } catch (error: any) {
      console.error("Failed to generate discharge brief:", error);
      toast({
        title: t("common.error", "Error"),
        description:
          error?.message ??
          t(
            "dischargeBriefs.wizard.generateError",
            "Failed to generate the discharge brief. Please try again.",
          ),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    patientId,
    selectedBlocks,
    briefType,
    language,
    templateId,
    surgeryId,
    annotations,
    selectedNoteIds,
    queryClient,
    toast,
    t,
  ]);

  // ---- step metadata ----
  const stepMeta: { label: string; icon: React.ElementType }[] = [
    {
      label: t("dischargeBriefs.wizard.stepBlocks", "Info Blocks"),
      icon: LayoutList,
    },
    {
      label: t("dischargeBriefs.wizard.stepSurgery", "Surgery"),
      icon: Link2,
    },
    {
      label: t("dischargeBriefs.wizard.stepBriefType", "Brief Type"),
      icon: FileText,
    },
    {
      label: t("dischargeBriefs.wizard.stepTemplate", "Template"),
      icon: FileSearch,
    },
    {
      label: t("dischargeBriefs.wizard.stepLanguage", "Language"),
      icon: Languages,
    },
    {
      label: t("dischargeBriefs.wizard.stepGenerate", "Generate"),
      icon: Sparkles,
    },
  ];

  // ---- block label helper ----
  const blockLabel = useCallback(
    (key: BlockKey) => {
      const labels: Record<BlockKey, string> = {
        anesthesia_record: t(
          "dischargeBriefs.blocks.anesthesiaRecord",
          "Anesthesia Record",
        ),
        surgery_notes: t(
          "dischargeBriefs.blocks.surgeryNotes",
          "Surgery Notes",
        ),
        surgery_details: t(
          "dischargeBriefs.blocks.surgeryDetails",
          "Surgery Details",
        ),
        patient_notes: t(
          "dischargeBriefs.blocks.patientNotes",
          "Patient Notes",
        ),
        discharge_medications: t(
          "dischargeBriefs.blocks.dischargeMedications",
          "Discharge Medications",
        ),
      };
      return labels[key];
    },
    [t],
  );

  // ---- brief type labels ----
  const briefTypeLabel = useCallback(
    (bt: BriefType) => {
      const labels: Record<BriefType, string> = {
        surgery_discharge: t(
          "dischargeBriefs.types.surgeryDischarge",
          "Surgery Discharge",
        ),
        anesthesia_discharge: t(
          "dischargeBriefs.types.anesthesiaDischarge",
          "Anesthesia Discharge",
        ),
        anesthesia_overnight_discharge: t(
          "dischargeBriefs.types.anesthesiaOvernightDischarge",
          "Anesthesia + Overnight",
        ),
      };
      return labels[bt];
    },
    [t],
  );

  // ---- format surgery label ----
  const surgeryLabel = useCallback(
    (s: { plannedSurgery: string | null; plannedDate: Date | string }) => {
      const date = new Date(s.plannedDate);
      const formatted = `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
      return `${s.plannedSurgery ?? t("common.untitled", "Untitled")} - ${formatted}`;
    },
    [t],
  );

  // =========================================================================
  // Step renderers
  // =========================================================================

  const renderStepBlocks = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          "dischargeBriefs.wizard.selectBlocksDescription",
          "Select the data blocks to include in the discharge brief.",
        )}
      </p>

      {blocksLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="max-h-[340px]">
          <div className="space-y-2">
            {blocks.map((block) => {
              const Icon = BLOCK_ICONS[block.key] ?? FileText;
              const isSelected = selectedBlocks.includes(block.key);

              return (
                <div key={block.key}>
                  <label
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleBlock(block.key)}
                    />
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium">
                      {blockLabel(block.key)}
                      {block.count != null && (
                        <span className="ml-1 text-muted-foreground font-normal">
                          ({block.count})
                        </span>
                      )}
                    </span>
                    {block.available ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {t("common.available", "Available")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-0"
                      >
                        <X className="h-3 w-3 mr-1" />
                        {t("common.unavailable", "Unavailable")}
                      </Badge>
                    )}
                  </label>

                  {/* Sub-list for patient_notes */}
                  {block.key === "patient_notes" &&
                    isSelected &&
                    block.notes &&
                    block.notes.length > 0 && (
                      <div className="ml-10 mt-1 space-y-1">
                        {block.notes.map((note) => (
                          <label
                            key={note.id}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={selectedNoteIds.includes(note.id)}
                              onCheckedChange={() => toggleNoteId(note.id)}
                            />
                            <span className="flex-1 truncate">
                              {note.title}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const renderStepSurgery = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          "dischargeBriefs.wizard.linkSurgeryDescription",
          "Link this brief to a surgery or create a standalone brief.",
        )}
      </p>

      <div className="space-y-2">
        <Label>{t("dischargeBriefs.wizard.surgery", "Surgery")}</Label>
        <Select
          value={surgeryId ?? "__standalone__"}
          onValueChange={(val) =>
            setSurgeryId(val === "__standalone__" ? null : val)
          }
        >
          <SelectTrigger>
            <SelectValue
              placeholder={t(
                "dischargeBriefs.wizard.selectSurgery",
                "Select a surgery",
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__standalone__">
              {t(
                "dischargeBriefs.wizard.standalone",
                "Standalone (no surgery)",
              )}
            </SelectItem>
            {surgeries.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  {surgeryLabel(s)}
                  <Badge variant="outline" className="text-xs ml-1">
                    {s.status}
                  </Badge>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderStepBriefType = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          "dischargeBriefs.wizard.briefTypeDescription",
          "Choose the type of discharge brief to generate.",
        )}
      </p>

      <RadioGroup
        value={briefType ?? ""}
        onValueChange={(val) => {
          setBriefType(val as BriefType);
          // Reset template when type changes
          setTemplateId(null);
        }}
        className="space-y-2"
      >
        {(
          [
            "surgery_discharge",
            "anesthesia_discharge",
            "anesthesia_overnight_discharge",
          ] as BriefType[]
        ).map((bt) => (
          <label
            key={bt}
            className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
              briefType === bt
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <RadioGroupItem value={bt} />
            <span className="text-sm font-medium">{briefTypeLabel(bt)}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );

  const renderStepTemplate = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          "dischargeBriefs.wizard.templateDescription",
          "Optionally select a reference template to guide the AI output.",
        )}
      </p>

      <div className="space-y-2">
        <Label>{t("dischargeBriefs.wizard.template", "Template")}</Label>
        {templatesLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading", "Loading...")}
          </div>
        ) : (
          <Select
            value={templateId ?? "__generic__"}
            onValueChange={(val) =>
              setTemplateId(val === "__generic__" ? null : val)
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t(
                  "dischargeBriefs.wizard.selectTemplate",
                  "Select a template",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__generic__">
                {t(
                  "dischargeBriefs.wizard.genericTemplate",
                  "Generic (no template)",
                )}
              </SelectItem>
              {(templates ?? []).map((tmpl) => (
                <SelectItem key={tmpl.id} value={tmpl.id}>
                  <span className="flex items-center gap-2">
                    {tmpl.name}
                    {tmpl.procedureType && (
                      <Badge variant="outline" className="text-xs ml-1">
                        {tmpl.procedureType}
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );

  const renderStepLanguage = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("dischargeBriefs.wizard.language", "Language")}</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="de">Deutsch</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">Fran\u00e7ais</SelectItem>
            <SelectItem value="it">Italiano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>
          {t("dischargeBriefs.wizard.annotations", "Additional Annotations")}
        </Label>
        <Textarea
          value={annotations}
          onChange={(e) => setAnnotations(e.target.value)}
          placeholder={t(
            "dischargeBriefs.wizard.annotationsPlaceholder",
            "Optional notes or instructions for the AI...",
          )}
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "dischargeBriefs.wizard.annotationsHint",
            "These notes will be passed to the AI to guide the output.",
          )}
        </p>
      </div>
    </div>
  );

  const renderStepGenerate = () => {
    if (generatedBriefId) {
      return (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium">
              {t(
                "dischargeBriefs.wizard.generationComplete",
                "Brief generated successfully",
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("dischargeBriefs.wizard.briefId", "Brief ID")}:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {generatedBriefId}
              </code>
            </p>
          </div>
          <div className="flex gap-2">
            {onCreated && (
              <Button onClick={() => onCreated(generatedBriefId)}>
                {t("dischargeBriefs.wizard.openEditor", "Open in Editor")}
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.close", "Close")}
            </Button>
          </div>
        </div>
      );
    }

    const selectedSurgery = surgeries.find((s) => s.id === surgeryId);

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t(
            "dischargeBriefs.wizard.reviewDescription",
            "Review your selections and generate the discharge brief.",
          )}
        </p>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("dischargeBriefs.wizard.selectedBlocks", "Data Blocks")}
            </span>
            <span className="font-medium">
              {selectedBlocks.map((b) => blockLabel(b)).join(", ")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("dischargeBriefs.wizard.surgery", "Surgery")}
            </span>
            <span className="font-medium">
              {selectedSurgery
                ? surgeryLabel(selectedSurgery)
                : t("dischargeBriefs.wizard.standalone", "Standalone (no surgery)")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("dischargeBriefs.wizard.briefType", "Brief Type")}
            </span>
            <span className="font-medium">
              {briefType ? briefTypeLabel(briefType) : "-"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("dischargeBriefs.wizard.template", "Template")}
            </span>
            <span className="font-medium">
              {templateId
                ? (templates ?? []).find((tmpl) => tmpl.id === templateId)?.name ??
                  templateId
                : t(
                    "dischargeBriefs.wizard.genericTemplate",
                    "Generic (no template)",
                  )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("dischargeBriefs.wizard.language", "Language")}
            </span>
            <span className="font-medium">
              {{ de: "Deutsch", en: "English", fr: "Fran\u00e7ais", it: "Italiano" }[language] ?? language}
            </span>
          </div>
          {annotations && (
            <div className="pt-1 border-t">
              <span className="text-muted-foreground">
                {t("dischargeBriefs.wizard.annotations", "Annotations")}
              </span>
              <p className="mt-0.5 text-xs whitespace-pre-wrap">{annotations}</p>
            </div>
          )}
          {selectedBlocks.includes("patient_notes") &&
            selectedNoteIds.length > 0 && (
              <div className="pt-1 border-t">
                <span className="text-muted-foreground">
                  {t(
                    "dischargeBriefs.wizard.selectedNotes",
                    "Selected Notes",
                  )}
                </span>
                <p className="mt-0.5 font-medium">
                  {selectedNoteIds.length}{" "}
                  {t("dischargeBriefs.wizard.notesSelected", "note(s) selected")}
                </p>
              </div>
            )}
        </div>
      </div>
    );
  };

  // ---- step renderer dispatch ----
  const renderStep = () => {
    switch (step) {
      case 1:
        return renderStepBlocks();
      case 2:
        return renderStepSurgery();
      case 3:
        return renderStepBriefType();
      case 4:
        return renderStepTemplate();
      case 5:
        return renderStepLanguage();
      case 6:
        return renderStepGenerate();
      default:
        return null;
    }
  };

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header with step indicators */}
        <div className="border-b px-6 pt-5 pb-4">
          <DialogHeader className="mb-3">
            <DialogTitle>
              {t("dischargeBriefs.wizard.title", "Generate Discharge Brief")}
            </DialogTitle>
            <DialogDescription>
              {stepMeta[step - 1]?.label}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-1.5">
            {stepMeta.map((meta, idx) => {
              const stepNum = idx + 1;
              const isCompleted = stepNum < step;
              const isCurrent = stepNum === step;

              return (
                <div key={stepNum} className="flex items-center gap-1.5">
                  {idx > 0 && (
                    <div
                      className={`h-px w-4 ${
                        isCompleted ? "bg-primary" : "bg-border"
                      }`}
                    />
                  )}
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      stepNum
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 min-h-[260px]">{renderStep()}</div>

        {/* Footer navigation */}
        {!generatedBriefId && (
          <DialogFooter className="border-t px-6 py-3 sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={step === 1 || isGenerating}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("common.back", "Back")}
            </Button>

            {step < TOTAL_STEPS ? (
              <Button size="sm" onClick={goNext} disabled={!canProceed}>
                {t("common.next", "Next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || !canProceed}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("dischargeBriefs.wizard.generating", "Generating...")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t("dischargeBriefs.wizard.generate", "Generate")}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
