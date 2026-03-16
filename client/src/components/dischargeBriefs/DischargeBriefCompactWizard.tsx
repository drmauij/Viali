import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import {
  Loader2,
  Check,
  X,
  Sparkles,
  FileText,
  Link2,
  LayoutList,
  FileSearch,
  ClipboardCheck,
  CalendarDays,
  Plus,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatDateForInput } from "@/lib/dateUtils";
import { DischargeBriefTemplateManager } from "./DischargeBriefTemplateManager";

// ---------------------------------------------------------------------------
// Types (shared with DischargeBriefWizard)
// ---------------------------------------------------------------------------

type BlockKey =
  | "anesthesia_record"
  | "surgery_notes"
  | "surgery_details"
  | "patient_notes"
  | "discharge_medications"
  | "follow_up_appointments";

type BriefType =
  | "surgery_discharge"
  | "anesthesia_discharge"
  | "anesthesia_overnight_discharge"
  | "prescription"
  | "surgery_report"
  | "surgery_estimate"
  | "generic";

interface BlockInfo {
  key: BlockKey;
  available: boolean;
  count?: number;
  notes?: Array<{
    id: string;
    title: string;
    createdAt: string;
    surgeryId?: string | null;
  }>;
}

interface TemplateInfo {
  id: string;
  name: string;
  procedureType?: string | null;
  briefType?: string | null;
}

interface DischargeBriefCompactWizardProps {
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
  preselectedBriefType?: BriefType;
  preselectedSurgeryId?: string;
  preselectedBlocks?: BlockKey[];
  preselectedMedicationSlotIds?: string[];
  onCreated?: (briefId: string) => void;
  isAdmin?: boolean;
  userId?: string;
  userUnitIds?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK_ICONS: Record<BlockKey, React.ElementType> = {
  anesthesia_record: FileText,
  surgery_notes: FileSearch,
  surgery_details: ClipboardCheck,
  patient_notes: LayoutList,
  discharge_medications: FileText,
  follow_up_appointments: CalendarDays,
};

const AUTO_BLOCKS: BlockKey[] = ["anesthesia_record", "surgery_details"];
const OPTIONAL_BLOCKS: BlockKey[] = [
  "surgery_notes",
  "patient_notes",
  "discharge_medications",
  "follow_up_appointments",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DischargeBriefCompactWizard({
  open,
  onOpenChange,
  patientId,
  hospitalId,
  surgeries = [],
  preselectedBriefType,
  preselectedSurgeryId,
  preselectedBlocks,
  preselectedMedicationSlotIds,
  onCreated,
  isAdmin = false,
  userId,
  userUnitIds = [],
}: DischargeBriefCompactWizardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ---- state ----
  const [selectedBlocks, setSelectedBlocks] = useState<BlockKey[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedMedicationSlotIds, setSelectedMedicationSlotIds] = useState<
    string[]
  >([]);
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<
    string[]
  >([]);
  const [surgeryId, setSurgeryId] = useState<string | null>(null);
  const [briefType, setBriefType] = useState<BriefType | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [language, setLanguage] = useState("de");
  const [annotations, setAnnotations] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState("");
  const [quickAddTime, setQuickAddTime] = useState("09:00");
  const [quickAddNotes, setQuickAddNotes] = useState("");
  const [isCreatingAppointment, setIsCreatingAppointment] = useState(false);
  const [showMedTemplateSelect, setShowMedTemplateSelect] = useState(false);
  const [isCreatingFromTemplate, setIsCreatingFromTemplate] = useState(false);

  // ---- reset / initialize on open ----
  useEffect(() => {
    if (open) {
      setSurgeryId(preselectedSurgeryId ?? null);
      setBriefType(preselectedBriefType ?? null);
      setSelectedBlocks(preselectedBlocks ?? []);
      setSelectedMedicationSlotIds(preselectedMedicationSlotIds ?? []);
      setSelectedNoteIds([]);
      setSelectedAppointmentIds([]);
      setTemplateId(null);
      setLanguage("de");
      setAnnotations("");
      setIsGenerating(false);
      setTemplateManagerOpen(false);
      setShowQuickAdd(false);
      setQuickAddDate("");
      setQuickAddTime("09:00");
      setQuickAddNotes("");
      setIsCreatingAppointment(false);
      setShowMedTemplateSelect(false);
      setIsCreatingFromTemplate(false);
    }
  }, [
    open,
    preselectedSurgeryId,
    preselectedBriefType,
    preselectedBlocks,
    preselectedMedicationSlotIds,
  ]);

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

  const { data: templates } = useQuery<TemplateInfo[]>({
    queryKey: [
      `/api/discharge-brief-templates/${hospitalId}${briefType ? `?briefType=${briefType}` : ""}`,
    ],
    enabled: open && !!hospitalId,
  });

  const { data: units } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: [`/api/units/${hospitalId}`],
    enabled: open && !!hospitalId,
  });

  const { data: medicationTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/hospitals", hospitalId, "discharge-medication-templates"],
    queryFn: async () => {
      const res = await fetch(
        `/api/hospitals/${hospitalId}/discharge-medication-templates`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: open && !!hospitalId,
  });

  const blocks: BlockInfo[] = blocksData ?? [];

  // ---- Auto-select medication slots linked to selected surgery ----
  useEffect(() => {
    if (!surgeryId || !blocksData || preselectedMedicationSlotIds?.length)
      return;
    const medBlock = blocksData.find((b) => b.key === "discharge_medications");
    if (!medBlock?.notes) return;
    const matchingIds = medBlock.notes
      .filter((n) => n.surgeryId === surgeryId)
      .map((n) => n.id);
    if (matchingIds.length > 0) {
      setSelectedMedicationSlotIds(matchingIds);
      setSelectedBlocks((prev) =>
        prev.includes("discharge_medications")
          ? prev
          : [...prev, "discharge_medications"],
      );
    }
  }, [surgeryId, blocksData, preselectedMedicationSlotIds]);

  // ---- toggle helpers ----
  const toggleBlock = useCallback(
    (key: BlockKey) => {
      if (briefType === "prescription" && key === "discharge_medications")
        return;
      setSelectedBlocks((prev) =>
        prev.includes(key) ? prev.filter((b) => b !== key) : [...prev, key],
      );
    },
    [briefType],
  );

  const toggleNoteId = useCallback((noteId: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(noteId)
        ? prev.filter((id) => id !== noteId)
        : [...prev, noteId],
    );
  }, []);

  const toggleMedicationSlotId = useCallback((slotId: string) => {
    setSelectedMedicationSlotIds((prev) =>
      prev.includes(slotId)
        ? prev.filter((id) => id !== slotId)
        : [...prev, slotId],
    );
  }, []);

  const toggleAppointmentId = useCallback((apptId: string) => {
    setSelectedAppointmentIds((prev) =>
      prev.includes(apptId)
        ? prev.filter((id) => id !== apptId)
        : [...prev, apptId],
    );
  }, []);

  // ---- create medication slot from template ----
  const handleCreateFromMedTemplate = useCallback(
    async (templateId: string) => {
      const template = medicationTemplates.find((t: any) => t.id === templateId);
      if (!template) return;
      setIsCreatingFromTemplate(true);
      try {
        // Map template items to medication items (same as DischargeMedicationsTab.loadTemplate)
        const items = (template.items || []).map((ti: any) => ({
          itemId: ti.itemId || null,
          customName: ti.customName || undefined,
          quantity: ti.quantity || 1,
          unitType: ti.unitType || "packs",
          administrationRoute: ti.administrationRoute || "p.o.",
          frequency: ti.frequency || "1-0-1-0",
          notes: ti.notes || "",
        }));

        // Auto-fill doctor from selected surgery's surgeon
        let doctorId: string | undefined;
        if (surgeryId) {
          const surgery = surgeries.find((s) => s.id === surgeryId);
          if (surgery && "surgeonId" in surgery) {
            doctorId = (surgery as any).surgeonId;
          }
        }

        const res = await apiRequest(
          "POST",
          `/api/patients/${patientId}/discharge-medications`,
          {
            hospitalId,
            surgeryId: surgeryId ?? undefined,
            doctorId: doctorId ?? undefined,
            items,
          },
        );
        const created = await res.json();

        // Auto-select the new slot and ensure block is selected
        setSelectedMedicationSlotIds((prev) => [...prev, created.id]);
        setSelectedBlocks((prev) =>
          prev.includes("discharge_medications")
            ? prev
            : [...prev, "discharge_medications"],
        );
        queryClient.invalidateQueries({ queryKey: [blocksQueryKey] });
        toast({
          title: t(
            "dischargeBriefs.wizard.medsCreatedFromTemplate",
            "Medications created from template",
          ),
        });
        setShowMedTemplateSelect(false);
      } catch (error: any) {
        toast({
          title: t("common.error", "Error"),
          description:
            error?.message ?? "Failed to create medications from template",
          variant: "destructive",
        });
      } finally {
        setIsCreatingFromTemplate(false);
      }
    },
    [
      medicationTemplates,
      patientId,
      hospitalId,
      surgeryId,
      surgeries,
      queryClient,
      blocksQueryKey,
      toast,
      t,
    ],
  );

  // ---- labels ----
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
        follow_up_appointments: t(
          "dischargeBriefs.blocks.followUpAppointments",
          "Follow-Up Appointments",
        ),
      };
      return labels[key];
    },
    [t],
  );

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
        prescription: t("dischargeBriefs.types.prescription", "Prescription"),
        surgery_report: t("dischargeBriefs.types.surgeryReport", "Surgery Report"),
        surgery_estimate: t("dischargeBriefs.types.surgeryEstimate", "Surgery Estimate"),
        generic: t("dischargeBriefs.types.generic", "Generic"),
      };
      return labels[bt];
    },
    [t],
  );

  const surgeryLabel = useCallback(
    (s: { plannedSurgery: string | null; plannedDate: Date | string }) => {
      return `${s.plannedSurgery ?? t("common.untitled", "Untitled")} - ${formatDate(s.plannedDate)}`;
    },
    [t],
  );

  // ---- generate ----
  const canGenerate = !!briefType && !!language && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    try {
      const finalBlocks = surgeryId
        ? [...AUTO_BLOCKS, ...selectedBlocks]
        : selectedBlocks;

      const res = await apiRequest(
        "POST",
        `/api/patients/${patientId}/discharge-briefs/generate`,
        {
          blocks: finalBlocks,
          briefType,
          language,
          templateId: templateId ?? null,
          surgeryId: surgeryId ?? null,
          annotations: annotations || null,
          selectedNoteIds:
            selectedBlocks.includes("patient_notes") &&
            selectedNoteIds.length > 0
              ? selectedNoteIds
              : null,
          selectedMedicationSlotIds:
            selectedBlocks.includes("discharge_medications") &&
            selectedMedicationSlotIds.length > 0
              ? selectedMedicationSlotIds
              : null,
          selectedAppointmentIds:
            selectedBlocks.includes("follow_up_appointments") &&
            selectedAppointmentIds.length > 0
              ? selectedAppointmentIds
              : null,
        },
      );
      const data = await res.json();
      const briefId = data.id ?? data.briefId ?? null;
      queryClient.invalidateQueries({
        queryKey: [`/api/patients/${patientId}/discharge-briefs`],
      });
      toast({
        title: t(
          "dischargeBriefs.wizard.generateSuccess",
          "Brief generated successfully",
        ),
      });
      onOpenChange(false);
      if (briefId) onCreated?.(briefId);
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
    canGenerate,
    patientId,
    selectedBlocks,
    briefType,
    language,
    templateId,
    surgeryId,
    annotations,
    selectedNoteIds,
    selectedMedicationSlotIds,
    selectedAppointmentIds,
    queryClient,
    toast,
    t,
    onOpenChange,
    onCreated,
  ]);

  // ---- derived ----
  const autoBlocks = surgeryId
    ? blocks.filter((b) => AUTO_BLOCKS.includes(b.key))
    : [];
  const optionalBlocks = blocks.filter((b) => OPTIONAL_BLOCKS.includes(b.key));

  const dialogTitle = preselectedBriefType
    ? t("dischargeBriefs.compact.generateType", "Generate {{type}}", {
        type: briefTypeLabel(preselectedBriefType),
      })
    : t("dischargeBriefs.compact.generateBrief", "Generate Brief");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {t(
              "dischargeBriefs.compact.description",
              "Configure and generate an AI discharge brief.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5">
          {/* ── Brief Type (hidden if pre-filled) ── */}
          {!preselectedBriefType && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("dischargeBriefs.wizard.stepBriefType", "Brief Type")}
              </Label>
              <Select
                value={briefType ?? ""}
                onValueChange={(v) => setBriefType(v as BriefType)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "dischargeBriefs.wizard.stepBriefType",
                      "Brief Type",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "surgery_discharge",
                      "anesthesia_discharge",
                      "anesthesia_overnight_discharge",
                      "prescription",
                      "surgery_report",
                      "surgery_estimate",
                      "generic",
                    ] as BriefType[]
                  ).map((bt) => (
                    <SelectItem key={bt} value={bt}>
                      {briefTypeLabel(bt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Surgery (hidden if pre-filled) ── */}
          {!preselectedSurgeryId && surgeries.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("dischargeBriefs.wizard.stepSurgery", "Surgery")}
                <span className="text-muted-foreground font-normal ml-1">
                  ({t("common.optional", "optional")})
                </span>
              </Label>
              <Select
                value={surgeryId ?? "_none"}
                onValueChange={(v) =>
                  setSurgeryId(v === "_none" ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "dischargeBriefs.wizard.selectSurgery",
                      "Select surgery...",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">
                    {t(
                      "dischargeBriefs.wizard.noSurgery",
                      "No surgery (standalone)",
                    )}
                  </SelectItem>
                  {surgeries.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {surgeryLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Included Data ── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("dischargeBriefs.compact.includedData", "Included Data")}
            </Label>

            {blocksLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Auto-included blocks */}
                {autoBlocks.map((block) => {
                  const Icon = BLOCK_ICONS[block.key] ?? FileText;
                  return (
                    <div
                      key={block.key}
                      className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm">
                        {blockLabel(block.key)}
                      </span>
                      <Badge
                        variant="secondary"
                        className="bg-primary/10 text-primary border-0 text-xs"
                      >
                        <Check className="h-3 w-3 mr-0.5" />
                        {t("dischargeBriefs.wizard.autoIncluded", "Auto")}
                      </Badge>
                    </div>
                  );
                })}

                {/* Optional blocks with inline sub-items */}
                {optionalBlocks.map((block) => {
                  const Icon = BLOCK_ICONS[block.key] ?? FileText;
                  const isSelected = selectedBlocks.includes(block.key);
                  const isRequired =
                    briefType === "prescription" &&
                    block.key === "discharge_medications";
                  const showSubItems =
                    (isSelected || isRequired) &&
                    ((block.notes && block.notes.length > 0) ||
                      block.key === "follow_up_appointments" ||
                      block.key === "discharge_medications");

                  return (
                    <div key={block.key}>
                      {isRequired ? (
                        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-sm">
                            {blockLabel(block.key)}
                          </span>
                          <Badge
                            variant="secondary"
                            className="bg-primary/10 text-primary border-0 text-xs"
                          >
                            <Check className="h-3 w-3 mr-0.5" />
                            {t("dischargeBriefs.wizard.required", "Required")}
                          </Badge>
                        </div>
                      ) : (
                        <label
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
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
                          <span className="flex-1 text-sm">
                            {blockLabel(block.key)}
                          </span>
                          {block.available ? (
                            <Badge
                              variant="secondary"
                              className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs"
                            >
                              <Check className="h-3 w-3 mr-0.5" />
                              {t("common.available", "Available")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-0 text-xs"
                            >
                              <X className="h-3 w-3 mr-0.5" />
                              {t("common.unavailable", "N/A")}
                            </Badge>
                          )}
                        </label>
                      )}

                      {/* Inline sub-items when block is selected */}
                      {showSubItems && (
                        <div className="pl-4 pt-1 space-y-1">
                          {block.notes?.map((item) => (
                            <label
                              key={item.id}
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={
                                  block.key === "patient_notes"
                                    ? selectedNoteIds.includes(item.id)
                                    : block.key === "discharge_medications"
                                      ? selectedMedicationSlotIds.includes(item.id)
                                      : selectedAppointmentIds.includes(item.id)
                                }
                                onCheckedChange={() => {
                                  if (block.key === "patient_notes")
                                    toggleNoteId(item.id);
                                  else if (block.key === "discharge_medications")
                                    toggleMedicationSlotId(item.id);
                                  else toggleAppointmentId(item.id);
                                }}
                              />
                              <span className="flex-1 truncate">
                                {item.title}
                              </span>
                              {item.surgeryId === surgeryId && surgeryId && (
                                <Badge
                                  variant="secondary"
                                  className="bg-primary/10 text-primary border-0 text-xs shrink-0"
                                >
                                  <Link2 className="h-3 w-3 mr-0.5" />
                                  {t("dischargeBriefs.wizard.linked", "Linked")}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatDate(item.createdAt)}
                              </span>
                            </label>
                          ))}

                          {/* Quick-create medications from template */}
                          {block.key === "discharge_medications" &&
                            medicationTemplates.length > 0 && (
                              <>
                                {showMedTemplateSelect ? (
                                  <div className="rounded border bg-muted/30 p-2 space-y-2">
                                    <Select
                                      onValueChange={(v) =>
                                        handleCreateFromMedTemplate(v)
                                      }
                                      disabled={isCreatingFromTemplate}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue
                                          placeholder={t(
                                            "dischargeBriefs.wizard.selectMedTemplate",
                                            "Select medication template...",
                                          )}
                                        />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {medicationTemplates.map(
                                          (tmpl: any) => (
                                            <SelectItem
                                              key={tmpl.id}
                                              value={tmpl.id}
                                            >
                                              {tmpl.name}
                                              {tmpl.items?.length
                                                ? ` (${tmpl.items.length})`
                                                : ""}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                    <div className="flex gap-1.5 justify-end">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() =>
                                          setShowMedTemplateSelect(false)
                                        }
                                        disabled={isCreatingFromTemplate}
                                      >
                                        {t("common.cancel", "Cancel")}
                                      </Button>
                                      {isCreatingFromTemplate && (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs w-full justify-start"
                                    onClick={() =>
                                      setShowMedTemplateSelect(true)
                                    }
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    {t(
                                      "dischargeBriefs.wizard.createFromMedTemplate",
                                      "Create from Template",
                                    )}
                                  </Button>
                                )}
                              </>
                            )}

                          {/* Quick-add appointment form */}
                          {block.key === "follow_up_appointments" && (
                            <>
                              {showQuickAdd ? (
                                <div className="rounded border bg-muted/30 p-2 space-y-2">
                                  <div className="flex gap-2">
                                    <DateInput
                                      value={quickAddDate}
                                      onChange={(v) => setQuickAddDate(v)}
                                      className="h-8 text-xs"
                                      min={formatDateForInput(new Date())}
                                    />
                                    <TimeInput
                                      value={quickAddTime}
                                      onChange={(v) => setQuickAddTime(v)}
                                      className="h-8 text-xs w-24"
                                    />
                                  </div>
                                  <Input
                                    value={quickAddNotes}
                                    onChange={(e) => setQuickAddNotes(e.target.value)}
                                    placeholder={t("dischargeBriefs.wizard.appointmentDescPlaceholder", "e.g. Wound check, suture removal...")}
                                    className="h-8 text-xs"
                                  />
                                  <div className="flex gap-1.5 justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setShowQuickAdd(false);
                                        setQuickAddDate("");
                                        setQuickAddTime("09:00");
                                        setQuickAddNotes("");
                                      }}
                                      disabled={isCreatingAppointment}
                                    >
                                      {t("common.cancel", "Cancel")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={!quickAddDate || !quickAddTime || isCreatingAppointment}
                                      onClick={async () => {
                                        setIsCreatingAppointment(true);
                                        try {
                                          const res = await apiRequest("POST", `/api/patients/${patientId}/follow-up-appointments`, {
                                            appointmentDate: quickAddDate,
                                            startTime: quickAddTime,
                                            notes: quickAddNotes || undefined,
                                            surgeryId: surgeryId ?? undefined,
                                          });
                                          const created = await res.json();
                                          setSelectedAppointmentIds((prev) => [...prev, created.id]);
                                          queryClient.invalidateQueries({ queryKey: [blocksQueryKey] });
                                          toast({ title: t("dischargeBriefs.wizard.appointmentCreated", "Appointment created") });
                                          setShowQuickAdd(false);
                                          setQuickAddDate("");
                                          setQuickAddTime("09:00");
                                          setQuickAddNotes("");
                                        } catch (error: any) {
                                          toast({
                                            title: t("common.error", "Error"),
                                            description: error?.message ?? "Failed to create appointment",
                                            variant: "destructive",
                                          });
                                        } finally {
                                          setIsCreatingAppointment(false);
                                        }
                                      }}
                                    >
                                      {isCreatingAppointment ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      ) : (
                                        <Plus className="h-3 w-3 mr-1" />
                                      )}
                                      {t("common.add", "Add")}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs w-full justify-start"
                                  onClick={() => setShowQuickAdd(true)}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  {t("dischargeBriefs.wizard.addAppointment", "Add Appointment")}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Template (optional) ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {t("dischargeBriefs.wizard.stepTemplate", "Template")}
                <span className="text-muted-foreground font-normal ml-1">
                  ({t("common.optional", "optional")})
                </span>
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setTemplateManagerOpen(true)}
              >
                <Settings className="h-3.5 w-3.5 mr-1" />
                {t("dischargeBriefs.wizard.manageTemplates", "Manage")}
              </Button>
            </div>
            <Select
              value={templateId ?? "_none"}
              onValueChange={(v) =>
                setTemplateId(v === "_none" ? null : v)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">
                  {t(
                    "dischargeBriefs.wizard.noTemplate",
                    "No template",
                  )}
                </SelectItem>
                {(templates ?? []).map((tmpl) => (
                  <SelectItem key={tmpl.id} value={tmpl.id}>
                    <span className="flex items-center gap-2">
                      {tmpl.name}
                      {!tmpl.briefType && (
                        <Badge variant="outline" className="text-xs">
                          {t("dischargeBriefs.templates.allTypes", "All Types")}
                        </Badge>
                      )}
                      {tmpl.briefType && tmpl.briefType !== briefType && (
                        <Badge variant="secondary" className="text-xs">
                          {briefTypeLabel(tmpl.briefType as BriefType)}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Language ── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("dischargeBriefs.wizard.stepLanguage", "Language")}
            </Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">Deutsch (DE)</SelectItem>
                <SelectItem value="en">English (EN)</SelectItem>
                <SelectItem value="fr">Français (FR)</SelectItem>
                <SelectItem value="it">Italiano (IT)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Additional Notes ── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t(
                "dischargeBriefs.wizard.additionalNotes",
                "Additional Notes",
              )}
              <span className="text-muted-foreground font-normal ml-1">
                ({t("common.optional", "optional")})
              </span>
            </Label>
            <Textarea
              value={annotations}
              onChange={(e) => setAnnotations(e.target.value)}
              placeholder={t(
                "dischargeBriefs.wizard.annotationsPlaceholder",
                "Any additional instructions for the AI...",
              )}
              rows={2}
            />
          </div>

        </div>

        {/* ── Generate Button (sticky footer) ── */}
        <div className="pt-4 border-t">
          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("dischargeBriefs.wizard.generating", "Generating...")}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {t("dischargeBriefs.wizard.generateBrief", "Generate Brief")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Manage Templates Dialog */}
      <Dialog
        open={templateManagerOpen}
        onOpenChange={(open) => {
          setTemplateManagerOpen(open);
          if (!open) {
            queryClient.invalidateQueries({
              queryKey: [`/api/discharge-brief-templates/${hospitalId}`],
            });
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("dischargeBriefs.templates.title", "Brief Templates")}
            </DialogTitle>
            <DialogDescription>
              {t("dischargeBriefs.templates.description", "Reference templates used to guide AI-generated briefs.")}
            </DialogDescription>
          </DialogHeader>
          <DischargeBriefTemplateManager
            hospitalId={hospitalId}
            isAdmin={isAdmin}
            userId={userId}
            userUnitIds={userUnitIds}
            units={units ?? []}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
