import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Lock,
  Download,
  Eye,
  Pencil,
  Trash2,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/dateUtils";
import { useState } from "react";
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

interface DischargeBrief {
  id: string;
  briefType: string;
  language: string;
  content: string | null;
  isLocked: boolean;
  signature: string | null;
  signedBy: string | null;
  signedAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  creator: { firstName: string | null; lastName: string | null };
  signer: { firstName: string | null; lastName: string | null } | null;
}

interface DischargeBriefCardProps {
  brief: DischargeBrief;
  patientId: string;
  canWrite?: boolean;
  isAdmin?: boolean;
  onEdit: (briefId: string) => void;
  onAudit?: (briefId: string) => void;
}

const BRIEF_TYPE_LABELS: Record<string, string> = {
  surgery_discharge: "Surgery",
  anesthesia_discharge: "Anesthesia",
  anesthesia_overnight_discharge: "Anesthesia + Overnight",
  surgery_estimate: "Surgery Estimate",
};

const LANG_LABELS: Record<string, string> = {
  de: "DE",
  en: "EN",
  fr: "FR",
  it: "IT",
};

export function DischargeBriefCard({
  brief,
  patientId,
  canWrite = false,
  isAdmin = false,
  onEdit,
  onAudit,
}: DischargeBriefCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/discharge-briefs/${brief.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/patients/${patientId}/discharge-briefs`],
      });
      toast({ description: t("dischargeBriefs.deleted", "Brief deleted") });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        description: error.message || t("common.error"),
      });
    },
  });

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/discharge-briefs/${brief.id}/export-pdf`,
      );
      const data = await res.json();
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        description: error.message || "Failed to export PDF",
      });
    } finally {
      setExporting(false);
    }
  };

  const status = brief.isLocked ? "signed" : "draft";
  const creatorName = brief.creator
    ? `${brief.creator.firstName || ""} ${brief.creator.lastName || ""}`.trim()
    : "";

  return (
    <>
      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {BRIEF_TYPE_LABELS[brief.briefType] || brief.briefType}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {LANG_LABELS[brief.language] || brief.language}
              </Badge>
              {status === "signed" ? (
                <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <Lock className="h-3 w-3 mr-1" />
                  {t("dischargeBriefs.signed", "Signed")}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  {t("dischargeBriefs.draft", "Draft")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {creatorName && `${creatorName} · `}
              {brief.createdAt && formatDateTime(brief.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(brief.id)}
            title={brief.isLocked ? t("common.view", "View") : t("common.edit", "Edit")}
          >
            {brief.isLocked ? (
              <Eye className="h-4 w-4" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleExportPdf}
            disabled={exporting}
            title={t("dischargeBriefs.exportPdf", "Export PDF")}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>

          {isAdmin && onAudit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAudit(brief.id)}
              title={t("dischargeBriefs.viewAudit", "View Audit")}
            >
              <ClipboardList className="h-4 w-4" />
            </Button>
          )}

          {canWrite && !brief.isLocked && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteConfirmOpen(true)}
              className="text-destructive hover:text-destructive"
              title={t("common.delete", "Delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.confirmDelete", "Confirm Delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "dischargeBriefs.deleteConfirm",
                "Are you sure you want to delete this discharge brief? This action cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
            >
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
