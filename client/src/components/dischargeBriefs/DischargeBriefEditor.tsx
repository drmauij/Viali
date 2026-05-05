import { useState, useCallback, useEffect } from "react";
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
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { cn } from "@/lib/utils";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Save,
  PenLine,
  FileDown,
  UserCheck,
  ClipboardList,
  LockOpen,
  Loader2,
  X,
  TableIcon,
  Plus,
  Minus,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import { formatDateTime } from "@/lib/dateUtils";

interface DischargeBriefData {
  id: string;
  patientId: string;
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

export function DischargeBriefEditor({
  briefId,
  onClose,
  isAdmin = false,
}: DischargeBriefEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [signAsDialogOpen, setSignAsDialogOpen] = useState(false);
  const [signAsUserId, setSignAsUserId] = useState("");
  const [signAsPassword, setSignAsPassword] = useState("");
  const [signAsVerified, setSignAsVerified] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const activeHospital = useActiveHospital();

  // Lazy-load the audit dialog only when needed
  const [AuditDialog, setAuditDialog] = useState<React.ComponentType<{
    briefId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }> | null>(null);

  // Tiptap editor
  const [undoRedoState, setUndoRedoState] = useState({ canUndo: false, canRedo: false });
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: "",
    editable: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none dark:prose-invert focus:outline-none min-h-[300px] px-4 py-3",
      },
    },
    onTransaction: ({ editor: e }) => {
      setUndoRedoState({ canUndo: e.can().undo(), canRedo: e.can().redo() });
    },
  });

  // Fetch brief data
  const {
    data: brief,
    isLoading,
    isError,
  } = useQuery<DischargeBriefData>({
    queryKey: [`/api/discharge-briefs/${briefId}`],
    enabled: !!briefId,
  });

  // Sync content when brief loads
  useEffect(() => {
    if (brief && editor) {
      editor.commands.setContent(brief.content || "");
    }
  }, [brief, editor]);

  // Sync editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!brief?.isLocked);
    }
  }, [brief?.isLocked, editor]);

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
      const html = editor?.getHTML() || "";
      await apiRequest("PATCH", `/api/discharge-briefs/${briefId}`, {
        content: html,
      });
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
    mutationFn: async (payload: { signature: string; signAsUserId?: string }) => {
      await apiRequest("POST", `/api/discharge-briefs/${briefId}/sign`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/discharge-briefs/${briefId}`],
      });
      if (brief?.patientId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/patients/${brief.patientId}/discharge-briefs`],
        });
      }
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

  // Export PDF mutation — auto-saves current editor content first
  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      // Save latest editor content before generating PDF
      if (editor && !brief?.isLocked) {
        const html = editor.getHTML();
        await apiRequest("PATCH", `/api/discharge-briefs/${briefId}`, {
          content: html,
        });
      }
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
      // Also invalidate the briefs list so the card reflects the unlocked state
      if (brief?.patientId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/patients/${brief.patientId}/discharge-briefs`],
        });
      }
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

  // Fetch hospital users for "Sign as..." dialog
  const { data: hospitalUsers = [] } = useQuery<
    { id: string; firstName: string; lastName: string; email: string }[]
  >({
    queryKey: [`/api/hospitals/${activeHospital?.id}/users`],
    enabled: signAsDialogOpen && !!activeHospital?.id,
  });

  // Verify credentials for "Sign as..." flow
  const verifyMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/verify-for-signing", {
        userId,
        password,
      });
      return (await res.json()) as {
        valid: boolean;
        user: { id: string; firstName: string; lastName: string; briefSignature: string | null };
      };
    },
    onSuccess: () => {
      setSignAsVerified(true);
      setSignAsDialogOpen(false);
      setSignatureDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: t("dischargeBrief.verifyFailed", "Verification failed"),
        description: t("dischargeBrief.invalidPassword", "Invalid password"),
        variant: "destructive",
      });
    },
  });

  // Handle signature from the SignaturePad
  const handleSignature = useCallback(
    (base64: string) => {
      setSignatureDialogOpen(false);
      const payload: { signature: string; signAsUserId?: string } = { signature: base64 };
      if (signAsVerified && signAsUserId) {
        payload.signAsUserId = signAsUserId;
      }
      signMutation.mutate(payload as any);
      // Reset sign-as state
      setSignAsVerified(false);
      setSignAsUserId("");
      setSignAsPassword("");
    },
    [signMutation, signAsVerified, signAsUserId],
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
          {formatDateTime(brief.createdAt)}
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

      {/* Tiptap toolbar - hidden when locked */}
      {!brief?.isLocked && editor && (
        <div className="flex items-center gap-1 px-4 py-2 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!undoRedoState.canUndo}
            title={t("dischargeBrief.undo", "Undo")}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!undoRedoState.canRedo}
            title={t("dischargeBrief.redo", "Redo")}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", editor.isActive("bold") && "bg-accent")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title={t("dischargeBrief.bold", "Bold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              editor.isActive("italic") && "bg-accent",
            )}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title={t("dischargeBrief.italic", "Italic")}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              editor.isActive("heading", { level: 2 }) && "bg-accent",
            )}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            title={t("dischargeBrief.heading2", "Heading 2")}
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              editor.isActive("heading", { level: 3 }) && "bg-accent",
            )}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            title={t("dischargeBrief.heading3", "Heading 3")}
          >
            <Heading3 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              editor.isActive("bulletList") && "bg-accent",
            )}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title={t("dischargeBrief.bulletList", "Bullet list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              editor.isActive("orderedList") && "bg-accent",
            )}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title={t("dischargeBrief.numberedList", "Numbered list")}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              editor.isActive("taskList") && "bg-accent",
            )}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title={t("dischargeBrief.taskList", "Checklist")}
          >
            <ListChecks className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  editor.isActive("table") && "bg-accent",
                )}
                title={t("dischargeBrief.table", "Table")}
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {editor.isActive("table") ? (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.chain().focus().addRowBefore().run()
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("dischargeBrief.addRowAbove", "Add row above")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.chain().focus().addRowAfter().run()
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("dischargeBrief.addRowBelow", "Add row below")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.chain().focus().deleteRow().run()
                    }
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    {t("dischargeBrief.deleteRow", "Delete row")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      editor.chain().focus().addColumnBefore().run()
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("dischargeBrief.addColumnBefore", "Add column before")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.chain().focus().addColumnAfter().run()
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("dischargeBrief.addColumnAfter", "Add column after")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.chain().focus().deleteColumn().run()
                    }
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    {t("dischargeBrief.deleteColumn", "Delete column")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() =>
                      editor.chain().focus().deleteTable().run()
                    }
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("dischargeBrief.deleteTable", "Delete table")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({
                        rows: 3,
                        cols: 3,
                        withHeaderRow: true,
                      })
                      .run()
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("dischargeBrief.insertTable", "Insert table")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 min-h-0 overflow-auto">
        <EditorContent editor={editor} />
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

        {!isLocked && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSignAsUserId("");
              setSignAsPassword("");
              setSignAsVerified(false);
              setSignAsDialogOpen(true);
            }}
            disabled={signMutation.isPending}
          >
            <UserCheck className="h-4 w-4 mr-2" />
            {t("dischargeBrief.signAs", "Sign as...")}
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
              date: formatDateTime(brief.signedAt!),
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

      {/* Sign as... dialog */}
      <Dialog open={signAsDialogOpen} onOpenChange={(open) => {
        setSignAsDialogOpen(open);
        if (!open) {
          setSignAsUserId("");
          setSignAsPassword("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("dischargeBrief.signAsTitle", "Sign as another user")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("dischargeBrief.selectUser", "User")}</Label>
              <Select value={signAsUserId} onValueChange={setSignAsUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("dischargeBrief.selectUserPlaceholder", "Select user...")} />
                </SelectTrigger>
                <SelectContent>
                  {hospitalUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("dischargeBrief.password", "Password")}</Label>
              <Input
                type="password"
                value={signAsPassword}
                onChange={(e) => setSignAsPassword(e.target.value)}
                placeholder={t("dischargeBrief.enterPassword", "Enter password...")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && signAsUserId && signAsPassword) {
                    verifyMutation.mutate({ userId: signAsUserId, password: signAsPassword });
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSignAsDialogOpen(false)}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={() => verifyMutation.mutate({ userId: signAsUserId, password: signAsPassword })}
              disabled={!signAsUserId || !signAsPassword || verifyMutation.isPending}
            >
              {verifyMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t("dischargeBrief.verifyAndSign", "Verify & Sign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
