import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import FlowsTable from "@/components/flows/FlowsTable";

export default function ChainCampaigns() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const groupId = (activeHospital as any)?.groupId ?? null;
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery<{ flows: any[] }>({
    queryKey: [`/api/chain/${groupId}/flows`],
    enabled: !!groupId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (flowId: string) => {
      await apiRequest("DELETE", `/api/chain/${groupId}/flows/${flowId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chain/${groupId}/flows`] });
      toast({
        title: t("chain.campaigns.deleted", "Campaign deleted"),
      });
      setPendingDelete(null);
    },
    onError: (e: any) => {
      toast({
        title: t("common.error", "Error"),
        description: e?.message ?? t("chain.campaigns.deleteFailed", "Could not delete campaign."),
        variant: "destructive",
      });
    },
  });

  if (!groupId) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="chain-campaigns-no-group">
        {t("chain.campaigns.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="chain-campaigns">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">{t("chain.campaigns.title", "Chain campaigns")}</h1>
        <Button onClick={() => navigate("/chain/campaigns/new")} data-testid="button-new-campaign">
          <Plus className="h-4 w-4 mr-2" />
          {t("chain.campaigns.new", "New campaign")}
        </Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">{t("common.loading", "Loading...")}</div>
      ) : (data?.flows ?? []).length === 0 ? (
        <div className="p-8 text-center text-muted-foreground" data-testid="chain-campaigns-empty">
          {t("chain.campaigns.empty", "No campaigns yet.")}
        </div>
      ) : (
        <FlowsTable
          flows={data?.flows ?? []}
          onRowClick={(row) => navigate(`/chain/campaigns/${row.id}`)}
          audienceColumn={{
            header: t("chain.campaigns.audience", "Audience"),
            cell: (row) => {
              const list = (row as any).audienceHospitals ?? [];
              if (list.length === 0) return <Badge variant="outline">—</Badge>;
              if (list.length === 1) return <Badge variant="outline">{list[0].hospitalName}</Badge>;
              return (
                <Badge variant="outline">
                  {t("chain.campaigns.nLocations", "{{n}} locations", { n: list.length })}
                </Badge>
              );
            },
          }}
          actions={(row) => {
            // Don't offer delete on already-sent campaigns — server refuses.
            if ((row as any).sentAt) return null;
            return (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setPendingDelete({ id: row.id, name: row.name })}
                data-testid={`button-delete-campaign-${row.id}`}
                title={t("chain.campaigns.delete", "Delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            );
          }}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chain.campaigns.deleteTitle", "Delete campaign?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "chain.campaigns.deleteBody",
                "{{name}} will be permanently deleted. This action cannot be undone.",
                { name: pendingDelete?.name ?? "" }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-campaign"
            >
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
