import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Pencil, Lock, Unlock, Trash2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";

interface AuditEntry {
  id: string;
  recordType: string;
  recordId: string;
  action: string;
  userId: string;
  timestamp: string;
  oldValue: any;
  newValue: any;
  reason: string | null;
  user: {
    firstName: string | null;
    lastName: string | null;
  };
}

interface DischargeBriefAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  briefId: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Shield; label: string; color: string }> = {
  create: { icon: Sparkles, label: "Created", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  update: { icon: Pencil, label: "Edited", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  lock: { icon: Lock, label: "Signed & Locked", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  unlock: { icon: Unlock, label: "Unlocked", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  delete: { icon: Trash2, label: "Deleted", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

export function DischargeBriefAuditDialog({
  open,
  onOpenChange,
  briefId,
}: DischargeBriefAuditDialogProps) {
  const { t } = useTranslation();

  const { data: entries = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: [`/api/discharge-briefs/${briefId}/audit`],
    enabled: open && !!briefId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("dischargeBriefs.auditTrail", "Audit Trail")}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t("dischargeBriefs.noAuditEntries", "No audit entries found")}
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const config = ACTION_CONFIG[entry.action] || ACTION_CONFIG.create;
              const Icon = config.icon;
              const userName = entry.user
                ? `${entry.user.firstName || ""} ${entry.user.lastName || ""}`.trim()
                : "Unknown";

              return (
                <div
                  key={entry.id}
                  className="flex gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="shrink-0 mt-0.5">
                    <div className={`p-1.5 rounded-full ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {userName}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {entry.timestamp &&
                        format(new Date(entry.timestamp), "dd.MM.yyyy HH:mm:ss")}
                    </p>
                    {entry.reason && (
                      <p className="text-xs mt-1 italic">
                        {t("dischargeBriefs.reason", "Reason")}: {entry.reason}
                      </p>
                    )}
                    {entry.newValue?.anonymizedText && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          {t("dischargeBriefs.aiDataSent", "AI data sent")} ({entry.newValue.replacements || "0 replacements"})
                        </summary>
                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                          {entry.newValue.anonymizedText}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
