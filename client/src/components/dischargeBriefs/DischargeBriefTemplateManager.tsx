import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Upload,
  FolderUp,
  CheckCircle2,
  XCircle,
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DischargeBriefTemplate {
  id: string;
  hospitalId: string;
  briefType: string;
  name: string;
  description: string | null;
  templateContent: string;
  procedureType: string | null;
  assignedUserId: string | null;
  visibility: "personal" | "unit" | "hospital";
  sharedWithUnitId: string | null;
  createdBy: string;
  createdAt: string;
}

interface UnitInfo {
  id: string;
  name: string;
}

interface DischargeBriefTemplateManagerProps {
  hospitalId: string;
  isAdmin?: boolean;
  userId?: string;
  userUnitIds?: string[];
  units?: UnitInfo[];
}

const BRIEF_TYPES = [
  { value: "_all", label: "All Brief Types" },
  { value: "surgery_discharge", label: "Surgery Discharge" },
  { value: "anesthesia_discharge", label: "Anesthesia Discharge" },
  { value: "anesthesia_overnight_discharge", label: "Anesthesia + Overnight" },
  { value: "surgery_report", label: "Surgery Report" },
  { value: "surgery_estimate", label: "Surgery Estimate" },
  { value: "generic", label: "Generic" },
];

const BRIEF_TYPE_LABELS: Record<string, string> = {
  surgery_discharge: "Surgery",
  anesthesia_discharge: "Anesthesia",
  anesthesia_overnight_discharge: "Anesthesia + Overnight",
  surgery_report: "Surgery Report",
  surgery_estimate: "Surgery Estimate",
  generic: "Generic",
  _all: "All Types",
};

const VISIBILITY_LABELS: Record<string, string> = {
  personal: "Personal",
  unit: "Unit",
  hospital: "Hospital",
};

export function DischargeBriefTemplateManager({
  hospitalId,
  isAdmin = false,
  userId,
  userUnitIds = [],
  units: unitsList = [],
}: DischargeBriefTemplateManagerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<DischargeBriefTemplate | null>(null);
  const [deleteTemplate, setDeleteTemplate] =
    useState<DischargeBriefTemplate | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Bulk import state
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<
    Array<{
      name: string;
      status: "pending" | "processing" | "done" | "error";
      error?: string;
      templateName?: string;
    }>
  >([]);
  const [bulkImporting, setBulkImporting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    briefType: "surgery_discharge",
    procedureType: "",
    templateContent: "",
    visibility: (isAdmin ? "hospital" : "personal") as "personal" | "unit" | "hospital",
    sharedWithUnitId: null as string | null,
  });

  // Tiptap editor for template content
  const lastExternalContent = useRef("");
  const templateEditor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    editable: true,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none dark:prose-invert focus:outline-none min-h-[200px] px-3 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastExternalContent.current = html;
      setForm((f) => ({ ...f, templateContent: html }));
    },
  });

  // Sync editor content when form.templateContent changes externally
  // (editing existing template, file import, or dialog reset)
  useEffect(() => {
    if (templateEditor && form.templateContent !== lastExternalContent.current) {
      const currentHtml = templateEditor.getHTML();
      if (currentHtml !== form.templateContent) {
        templateEditor.commands.setContent(form.templateContent || "");
      }
      lastExternalContent.current = form.templateContent;
    }
  }, [form.templateContent, templateEditor]);

  const { data: templates = [], isLoading } = useQuery<
    DischargeBriefTemplate[]
  >({
    queryKey: [`/api/discharge-brief-templates/${hospitalId}`],
    enabled: !!hospitalId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      await apiRequest("POST", "/api/discharge-brief-templates", {
        ...data,
        hospitalId,
        briefType: data.briefType === "_all" ? null : data.briefType,
        description: data.description || null,
        procedureType: data.procedureType || null,
        visibility: data.visibility,
        sharedWithUnitId: data.visibility === "unit" ? data.sharedWithUnitId : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/discharge-brief-templates/${hospitalId}`],
      });
      setDialogOpen(false);
      resetForm();
      toast({
        description: t(
          "dischargeBriefs.templates.created",
          "Template created",
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: typeof form;
    }) => {
      await apiRequest("PATCH", `/api/discharge-brief-templates/${id}`, {
        ...data,
        briefType: data.briefType === "_all" ? null : data.briefType,
        description: data.description || null,
        procedureType: data.procedureType || null,
        visibility: data.visibility,
        sharedWithUnitId: data.visibility === "unit" ? data.sharedWithUnitId : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/discharge-brief-templates/${hospitalId}`],
      });
      setDialogOpen(false);
      setEditingTemplate(null);
      resetForm();
      toast({
        description: t(
          "dischargeBriefs.templates.updated",
          "Template updated",
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/discharge-brief-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/discharge-brief-templates/${hospitalId}`],
      });
      setDeleteTemplate(null);
      toast({
        description: t(
          "dischargeBriefs.templates.deleted",
          "Template deleted",
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      briefType: "surgery_discharge",
      procedureType: "",
      templateContent: "",
      visibility: isAdmin ? "hospital" : "personal",
      sharedWithUnitId: null,
    });
  };

  const handleAdd = () => {
    setEditingTemplate(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (template: DischargeBriefTemplate) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      description: template.description || "",
      briefType: template.briefType ?? "_all",
      procedureType: template.procedureType || "",
      templateContent: template.templateContent,
      visibility: template.visibility || "hospital",
      sharedWithUnitId: template.sharedWithUnitId || null,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    // Strip HTML tags to check if there's actual text content
    const textContent = form.templateContent.replace(/<[^>]*>/g, "").trim();
    if (!form.name.trim() || !textContent) return;
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";

    setIsExtracting(true);
    try {
      // Convert file to base64
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );

      const res = await apiRequest(
        "POST",
        "/api/discharge-brief-templates/extract-text",
        {
          fileData: base64,
          fileName: file.name,
          mimeType: file.type,
        },
      );
      const data = await res.json();

      if (data.text) {
        // Convert plain text to simple HTML paragraphs for the WYSIWYG editor
        const html = data.text
          .split(/\n\n+/)
          .map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
          .join("");
        setForm((f) => ({ ...f, templateContent: html }));
        toast({
          description: t(
            "dischargeBriefs.templates.importSuccess",
            "Document content extracted successfully",
          ),
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        description:
          error.message ||
          t(
            "dischargeBriefs.templates.importError",
            "Failed to extract text from document",
          ),
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    if (bulkInputRef.current) bulkInputRef.current.value = "";
    setBulkFiles(
      fileList.map((f) => ({ name: f.name, status: "pending" as const })),
    );
    setBulkImportOpen(true);

    // Start processing
    processBulkImport(fileList);
  };

  const processBulkImport = async (files: File[]) => {
    setBulkImporting(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Mark current as processing
      setBulkFiles((prev) =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: "processing" } : f,
        ),
      );

      try {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );

        const res = await apiRequest(
          "POST",
          "/api/discharge-brief-templates/import-file",
          {
            fileData: base64,
            fileName: file.name,
            mimeType: file.type,
            hospitalId,
          },
        );
        const template = await res.json();

        setBulkFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: "done", templateName: template.name }
              : f,
          ),
        );
      } catch (error: any) {
        setBulkFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? {
                  ...f,
                  status: "error",
                  error: error.message || "Import failed",
                }
              : f,
          ),
        );
      }
    }

    setBulkImporting(false);
    queryClient.invalidateQueries({
      queryKey: [`/api/discharge-brief-templates/${hospitalId}`],
    });
  };

  const bulkDoneCount = bulkFiles.filter(
    (f) => f.status === "done" || f.status === "error",
  ).length;
  const bulkProgress =
    bulkFiles.length > 0 ? (bulkDoneCount / bulkFiles.length) * 100 : 0;

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="overflow-hidden space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          {t(
            "dischargeBriefs.templates.title",
            "Brief Templates",
          )}
        </h2>
        <div className="flex items-center gap-2">
          <input
            ref={bulkInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            multiple
            className="hidden"
            onChange={handleBulkFileSelect}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkInputRef.current?.click()}
          >
            <FolderUp className="h-4 w-4 mr-1" />
            {t("dischargeBriefs.templates.bulkImport", "Bulk Import")}
          </Button>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            {t("dischargeBriefs.templates.add", "Add Template")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t("dischargeBriefs.templates.noTemplates", "No templates yet. Create one to guide AI generation.")}
          </h3>
          <p className="text-muted-foreground mb-4">
            {t("dischargeBriefs.templates.description", "Reference templates used to guide AI-generated discharge briefs.")}
          </p>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            {t("dischargeBriefs.templates.add", "Add Template")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => {
            const canModify = isAdmin || tpl.assignedUserId === userId;
            return (
              <div
                key={tpl.id}
                className="bg-card border border-border rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground break-words">{tpl.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {BRIEF_TYPE_LABELS[tpl.briefType ?? "_all"] || tpl.briefType || "All Types"}
                      </Badge>
                      <Badge
                        variant={tpl.visibility === "hospital" ? "default" : tpl.visibility === "unit" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {VISIBILITY_LABELS[tpl.visibility] || tpl.visibility}
                      </Badge>
                      {tpl.procedureType && (
                        <Badge variant="secondary" className="text-xs">
                          {tpl.procedureType}
                        </Badge>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {tpl.description}
                      </p>
                    )}
                  </div>
                  {canModify && (
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(tpl)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTemplate(tpl)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog — sticky header + footer */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditingTemplate(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] !p-0 flex flex-col overflow-hidden">
          {/* Fixed header */}
          <div className="shrink-0 border-b bg-background px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate
                  ? t(
                      "dischargeBriefs.templates.editTemplate",
                      "Edit Template",
                    )
                  : t(
                      "dischargeBriefs.templates.addTemplate",
                      "Add Template",
                    )}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "dischargeBriefs.templates.dialogDescription",
                  "Define a reference template that the AI will use as a guide for structure and tone.",
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("dischargeBriefs.templates.name", "Name")} *</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder={t(
                    "dischargeBriefs.templates.namePlaceholder",
                    "e.g. Standard Rhinoplasty Brief",
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  {t("dischargeBriefs.templates.briefType", "Brief Type")} *
                </Label>
                <Select
                  value={form.briefType}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, briefType: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRIEF_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        {bt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {t(
                    "dischargeBriefs.templates.procedureType",
                    "Procedure Type",
                  )}{" "}
                  ({t("common.optional", "optional")})
                </Label>
                <Input
                  value={form.procedureType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, procedureType: e.target.value }))
                  }
                  placeholder={t(
                    "dischargeBriefs.templates.procedureTypePlaceholder",
                    "e.g. Rhinoplasty, Abdominoplasty",
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  {t("dischargeBriefs.templates.visibility", "Visibility")} *
                </Label>
                <Select
                  value={form.visibility}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      visibility: v as "personal" | "unit" | "hospital",
                      sharedWithUnitId: v === "unit" ? f.sharedWithUnitId : null,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">
                      {t("dischargeBriefs.templates.visibilityPersonal", "Personal (only me)")}
                    </SelectItem>
                    <SelectItem value="unit">
                      {t("dischargeBriefs.templates.visibilityUnit", "Unit (shared with unit)")}
                    </SelectItem>
                    {isAdmin && (
                      <SelectItem value="hospital">
                        {t("dischargeBriefs.templates.visibilityHospital", "Hospital (everyone)")}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {form.visibility === "unit" && unitsList.length > 0 && (
                <div className="space-y-2">
                  <Label>
                    {t("dischargeBriefs.templates.sharedWithUnit", "Share with Unit")} *
                  </Label>
                  <Select
                    value={form.sharedWithUnitId ?? ""}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, sharedWithUnitId: v || null }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("dischargeBriefs.templates.selectUnit", "Select a unit")} />
                    </SelectTrigger>
                    <SelectContent>
                      {unitsList.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>
                  {t("dischargeBriefs.templates.descriptionField", "Description")}{" "}
                  ({t("common.optional", "optional")})
                </Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder={t(
                    "dischargeBriefs.templates.descriptionPlaceholder",
                    "Short description of when to use this template",
                  )}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {t(
                      "dischargeBriefs.templates.templateContent",
                      "Template Content",
                    )}{" "}
                    *
                  </Label>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={handleFileImport}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {isExtracting
                        ? t("dischargeBriefs.templates.extracting", "Extracting...")
                        : t("dischargeBriefs.templates.importFile", "Import from file")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "dischargeBriefs.templates.templateContentHelp",
                    "Paste or write a reference discharge brief. The AI will adapt the clinical data to match this format, structure, and tone.",
                  )}
                </p>
                {templateEditor && (
                  <div className="rounded-md border">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/30">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", templateEditor.isActive("bold") && "bg-accent")}
                        onClick={() => templateEditor.chain().focus().toggleBold().run()}
                      >
                        <Bold className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", templateEditor.isActive("italic") && "bg-accent")}
                        onClick={() => templateEditor.chain().focus().toggleItalic().run()}
                      >
                        <Italic className="h-3.5 w-3.5" />
                      </Button>
                      <div className="w-px h-4 bg-border mx-0.5" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", templateEditor.isActive("heading", { level: 2 }) && "bg-accent")}
                        onClick={() => templateEditor.chain().focus().toggleHeading({ level: 2 }).run()}
                      >
                        <Heading2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", templateEditor.isActive("heading", { level: 3 }) && "bg-accent")}
                        onClick={() => templateEditor.chain().focus().toggleHeading({ level: 3 }).run()}
                      >
                        <Heading3 className="h-3.5 w-3.5" />
                      </Button>
                      <div className="w-px h-4 bg-border mx-0.5" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", templateEditor.isActive("bulletList") && "bg-accent")}
                        onClick={() => templateEditor.chain().focus().toggleBulletList().run()}
                      >
                        <List className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", templateEditor.isActive("orderedList") && "bg-accent")}
                        onClick={() => templateEditor.chain().focus().toggleOrderedList().run()}
                      >
                        <ListOrdered className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <EditorContent editor={templateEditor} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fixed footer */}
          <div className="shrink-0 border-t bg-background px-6 py-4">
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingTemplate(null);
                  resetForm();
                }}
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  isSaving ||
                  !form.name.trim() ||
                  !form.templateContent.replace(/<[^>]*>/g, "").trim()
                }
              >
                {isSaving && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingTemplate
                  ? t("common.save", "Save")
                  : t("common.create", "Create")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Progress Dialog */}
      <Dialog
        open={bulkImportOpen}
        onOpenChange={(open) => {
          if (!open && !bulkImporting) {
            setBulkImportOpen(false);
            setBulkFiles([]);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderUp className="h-5 w-5" />
              {t("dischargeBriefs.templates.bulkImportTitle", "Importing Templates")}
            </DialogTitle>
            <DialogDescription>
              {bulkImporting
                ? t(
                    "dischargeBriefs.templates.bulkImportProcessing",
                    "Extracting text and generating metadata with AI...",
                  )
                : t(
                    "dischargeBriefs.templates.bulkImportDone",
                    "Import complete.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Progress value={bulkProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {bulkDoneCount} / {bulkFiles.length}
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {bulkFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded border text-sm"
                >
                  {file.status === "pending" && (
                    <div className="h-4 w-4 mt-0.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  )}
                  {file.status === "processing" && (
                    <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-blue-500 shrink-0" />
                  )}
                  {file.status === "done" && (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                  )}
                  {file.status === "error" && (
                    <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    {file.status === "done" && file.templateName && (
                      <p className="text-xs text-muted-foreground truncate">
                        → {file.templateName}
                      </p>
                    )}
                    {file.status === "error" && file.error && (
                      <p className="text-xs text-destructive">{file.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {!bulkImporting && (
            <DialogFooter>
              <Button
                onClick={() => {
                  setBulkImportOpen(false);
                  setBulkFiles([]);
                }}
              >
                {t("common.close", "Close")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTemplate}
        onOpenChange={() => setDeleteTemplate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.confirmDelete", "Confirm Delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "dischargeBriefs.templates.deleteConfirm",
                "Are you sure you want to delete this template? This action cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTemplate && deleteMutation.mutate(deleteTemplate.id)
              }
              className="bg-destructive text-destructive-foreground"
            >
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
