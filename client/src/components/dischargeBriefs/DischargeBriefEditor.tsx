import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import SignaturePad from "@/components/SignaturePad";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Save,
  PenLine,
  FileDown,
  ClipboardList,
  LockOpen,
  Loader2,
  X,
} from "lucide-react";
import { format } from "date-fns";

interface DischargeBriefData {
  id: string;
  briefType: string;
  language: string;
  content: string;
  isLocked: boolean;
  signature: string | null;
  signedBy: string | null;
  signedAt: string | null;
  createdBy: string;
  creator: { firstName: string; lastName: string };
  signer: { firstName: string; lastName: string } | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DischargeBriefEditorProps {
  briefId: string;
  onClose: () => void;
  isAdmin?: boolean;
}

type MobileTab = "edit" | "preview";

/**
 * Insert markdown syntax at the current cursor position in a textarea.
 * Returns the new content string and the cursor position to set after insertion.
 */
function insertMarkdownSyntax(
  textarea: HTMLTextAreaElement,
  content: string,
  syntax: string,
  wrap: boolean,
): { newContent: string; cursorPos: number } {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = content.slice(start, end);

  if (wrap) {
    // Wrap selected text (e.g., **selected**)
    const wrapped = `${syntax}${selectedText || "text"}${syntax}`;
    const newContent = content.slice(0, start) + wrapped + content.slice(end);
    const cursorPos = start + syntax.length + (selectedText ? selectedText.length : 4);
    return { newContent, cursorPos };
  } else {
    // Line prefix (e.g., ## , - , 1. )
    // Find the start of the current line
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const newContent = content.slice(0, lineStart) + syntax + content.slice(lineStart);
    const cursorPos = start + syntax.length;
    return { newContent, cursorPos };
  }
}

export function DischargeBriefEditor({
  briefId,
  onClose,
  isAdmin = false,
}: DischargeBriefEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("edit");
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);

  // Lazy-load the audit dialog only when needed
  const [AuditDialog, setAuditDialog] = useState<React.ComponentType<{
    briefId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }> | null>(null);

  // Fetch brief data
  const {
    data: brief,
    isLoading,
    isError,
  } = useQuery<DischargeBriefData>({
    queryKey: [`/api/discharge-briefs/${briefId}`],
    enabled: !!briefId,
  });

  // Sync fetched content into local state
  useEffect(() => {
    if (brief) {
      setContent(brief.content);
    }
  }, [brief]);

  // Load audit dialog component on demand
  useEffect(() => {
    if (auditDialogOpen && !AuditDialog) {
      import("./DischargeBriefAuditDialog").then((mod) => {
        setAuditDialog(() => mod.DischargeBriefAuditDialog);
      });
    }
  }, [auditDialogOpen, AuditDialog]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/discharge-briefs/${briefId}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/discharge-briefs/${briefId}`],
      });
      toast({ title: t("dischargeBrief.saved", "Saved") });
    },
    onError: (error: Error) => {
      toast({
        title: t("dischargeBrief.saveError", "Failed to save"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sign mutation
  const signMutation = useMutation({
    mutationFn: async (signature: string) => {
      await apiRequest("POST", `/api/discharge-briefs/${briefId}/sign`, {
        signature,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/discharge-briefs/${briefId}`],
      });
      toast({ title: t("dischargeBrief.signed", "Brief signed") });
    },
    onError: (error: Error) => {
      toast({
        title: t("dischargeBrief.signError", "Failed to sign"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Export PDF mutation
  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/discharge-briefs/${briefId}/export-pdf`,
      );
      return (await res.json()) as { pdfUrl: string };
    },
    onSuccess: (data) => {
      window.open(data.pdfUrl, "_blank");
      toast({ title: t("dischargeBrief.pdfExported", "PDF exported") });
    },
    onError: (error: Error) => {
      toast({
        title: t("dischargeBrief.pdfError", "Failed to export PDF"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Unlock mutation
  const unlockMutation = useMutation({
    mutationFn: async (reason: string) => {
      await apiRequest("POST", `/api/discharge-briefs/${briefId}/unlock`, {
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/discharge-briefs/${briefId}`],
      });
      setUnlockDialogOpen(false);
      setUnlockReason("");
      toast({ title: t("dischargeBrief.unlocked", "Brief unlocked") });
    },
    onError: (error: Error) => {
      toast({
        title: t("dischargeBrief.unlockError", "Failed to unlock"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toolbar action handler
  const handleToolbar = useCallback(
    (syntax: string, wrap: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { newContent, cursorPos } = insertMarkdownSyntax(
        textarea,
        content,
        syntax,
        wrap,
      );
      setContent(newContent);

      // Restore focus and cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [content],
  );

  // Handle signature from the SignaturePad
  const handleSignature = useCallback(
    (base64: string) => {
      setSignatureDialogOpen(false);
      signMutation.mutate(base64);
    },
    [signMutation],
  );

  const handleUnlockConfirm = useCallback(() => {
    if (!unlockReason.trim()) return;
    unlockMutation.mutate(unlockReason.trim());
  }, [unlockReason, unlockMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !brief) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">
          {t("dischargeBrief.loadError", "Failed to load brief")}
        </p>
        <Button variant="outline" onClick={onClose}>
          {t("common.close", "Close")}
        </Button>
      </div>
    );
  }

  const isLocked = brief.isLocked;
  const isSigned = !!brief.signedAt;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-muted/30">
        <Badge variant="secondary">{brief.briefType}</Badge>
        <Badge variant="outline">{brief.language.toUpperCase()}</Badge>
        <span className="text-sm text-muted-foreground">
          {format(new Date(brief.createdAt), "dd MMM yyyy, HH:mm")}
        </span>
        {isSigned ? (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            {t("dischargeBrief.signed", "Signed")}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-slate-100 text-slate-600">
            {t("dischargeBrief.draft", "Draft")}
          </Badge>
        )}
        {isLocked && (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            {t("dischargeBrief.locked", "Locked")}
          </Badge>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Markdown toolbar - hidden when locked */}
      {!isLocked && (
        <div className="flex items-center gap-1 px-4 py-2 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleToolbar("**", true)}
            title={t("dischargeBrief.bold", "Bold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleToolbar("*", true)}
            title={t("dischargeBrief.italic", "Italic")}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleToolbar("## ", false)}
            title={t("dischargeBrief.heading2", "Heading 2")}
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleToolbar("### ", false)}
            title={t("dischargeBrief.heading3", "Heading 3")}
          >
            <Heading3 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleToolbar("- ", false)}
            title={t("dischargeBrief.bulletList", "Bullet list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleToolbar("1. ", false)}
            title={t("dischargeBrief.numberedList", "Numbered list")}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile tab toggle (visible below md breakpoint) */}
      <div className="flex md:hidden border-b">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            mobileTab === "edit"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMobileTab("edit")}
        >
          {t("dischargeBrief.edit", "Edit")}
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            mobileTab === "preview"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMobileTab("preview")}
        >
          {t("dischargeBrief.preview", "Preview")}
        </button>
      </div>

      {/* Editor + Preview area */}
      <div className="flex-1 min-h-0 flex">
        {/* Desktop: split view */}
        {/* Mobile: show based on active tab */}

        {/* Editor pane */}
        <div
          className={`flex-1 min-h-0 ${
            mobileTab === "preview" ? "hidden md:flex" : "flex"
          } flex-col`}
        >
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={isLocked}
            className="flex-1 resize-none rounded-none border-0 border-r font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder={t(
              "dischargeBrief.editorPlaceholder",
              "Write your discharge brief in Markdown...",
            )}
          />
        </div>

        {/* Preview pane */}
        <div
          className={`flex-1 min-h-0 overflow-auto ${
            mobileTab === "edit" ? "hidden md:block" : "block"
          } p-4`}
        >
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t bg-muted/30">
        {!isLocked && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            size="sm"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("dischargeBrief.save", "Save")}
          </Button>
        )}

        {!isLocked && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSignatureDialogOpen(true)}
            disabled={signMutation.isPending}
          >
            {signMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PenLine className="h-4 w-4 mr-2" />
            )}
            {t("dischargeBrief.sign", "Sign")}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => exportPdfMutation.mutate()}
          disabled={exportPdfMutation.isPending}
        >
          {exportPdfMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4 mr-2" />
          )}
          {t("dischargeBrief.exportPdf", "Export PDF")}
        </Button>

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuditDialogOpen(true)}
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            {t("dischargeBrief.viewAudit", "View Audit")}
          </Button>
        )}

        {isLocked && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnlockDialogOpen(true)}
            disabled={unlockMutation.isPending}
          >
            {unlockMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LockOpen className="h-4 w-4 mr-2" />
            )}
            {t("dischargeBrief.unlockForAmendment", "Unlock for Amendment")}
          </Button>
        )}

        {/* Signer info */}
        {isSigned && brief.signer && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t("dischargeBrief.signedByAt", "Signed by {{name}} on {{date}}", {
              name: `${brief.signer.firstName} ${brief.signer.lastName}`,
              date: format(new Date(brief.signedAt!), "dd MMM yyyy, HH:mm"),
            })}
          </span>
        )}
      </div>

      {/* Signature dialog */}
      <SignaturePad
        isOpen={signatureDialogOpen}
        onClose={() => setSignatureDialogOpen(false)}
        onSave={handleSignature}
        title={t("dischargeBrief.signBrief", "Sign Discharge Brief")}
      />

      {/* Unlock reason dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("dischargeBrief.unlockForAmendment", "Unlock for Amendment")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-3">
              {t(
                "dischargeBrief.unlockReasonPrompt",
                "Please provide a reason for unlocking this brief.",
              )}
            </p>
            <Textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder={t(
                "dischargeBrief.unlockReasonPlaceholder",
                "Reason for amendment...",
              )}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUnlockDialogOpen(false);
                setUnlockReason("");
              }}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleUnlockConfirm}
              disabled={!unlockReason.trim() || unlockMutation.isPending}
            >
              {unlockMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t("dischargeBrief.unlock", "Unlock")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit dialog (lazy loaded) */}
      {AuditDialog && (
        <AuditDialog
          briefId={briefId}
          open={auditDialogOpen}
          onOpenChange={setAuditDialogOpen}
        />
      )}
    </div>
  );
}
