import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Globe, Copy, Check, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";

type PortalLinkStatus = {
  active: boolean;
  link: {
    id: string;
    token: string;
    expiresAt: string;
    status: string;
    surgeryId: string | null;
    createdAt: string;
  } | null;
};

type CreateResponse = {
  link: PortalLinkStatus["link"];
  url: string;
  reused: boolean;
};

interface Props {
  patientId: string;
  canWrite: boolean;
}

// Small pill in the patient detail header showing whether the patient has an
// active portal link. Click → dialog with the URL (copy), create/revoke
// controls. The same /portal-link endpoints are also used by the
// share-flow auto-creation prompt in PatientDocumentsSection.
export function PatientPortalLinkBadge({ patientId, canWrite }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusKey = [`/api/patients/${patientId}/portal-link/status`];
  const { data: status, isLoading } = useQuery<PortalLinkStatus>({
    queryKey: statusKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/patients/${patientId}/portal-link/status`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (): Promise<CreateResponse> => {
      const res = await apiRequest("POST", `/api/patients/${patientId}/portal-link`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statusKey });
      toast({ title: t("portalLink.created", "Portal link created") });
    },
    onError: (error: Error) => {
      toast({ title: t("portalLink.createError", "Failed to create portal link"), description: error.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/patients/${patientId}/portal-link/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statusKey });
      toast({ title: t("portalLink.revoked", "Portal link revoked") });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t("portalLink.revokeError", "Failed to revoke portal link"), description: error.message, variant: "destructive" });
    },
  });

  if (isLoading || !status) return null;

  const portalUrl = status.link
    ? `${window.location.origin}/patient/${status.link.token}`
    : null;

  const handleCopy = async () => {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          status.active
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
            : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
        }`}
        data-testid="button-portal-link-status"
      >
        <Globe className="h-3 w-3" />
        {status.active && status.link
          ? t("portalLink.active", "Portal active") + ` · ${formatDate(status.link.expiresAt)}`
          : t("portalLink.noAccess", "Portal: no access")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("portalLink.title", "Patient Portal Access")}</DialogTitle>
          </DialogHeader>

          {status.active && portalUrl ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {t("portalLink.activeDescription", "The patient can access their portal until")} {formatDate(status.link!.expiresAt)}.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("portalLink.url", "Portal URL")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={portalUrl}
                    className="flex-1 px-3 py-2 text-xs font-mono border rounded-md bg-muted/50"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {canWrite && (
                <DialogFooter className="border-t pt-4">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => revokeMutation.mutate()}
                    disabled={revokeMutation.isPending}
                  >
                    {revokeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t("portalLink.revoke", "Revoke access")}
                  </Button>
                </DialogFooter>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {t(
                  "portalLink.noAccessDescription",
                  "This patient has no portal access yet. Generating a link grants the patient 90-day access to view documents and messages shared by the clinic.",
                )}
              </p>

              {canWrite && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t("portalLink.create", "Create portal link")}
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
