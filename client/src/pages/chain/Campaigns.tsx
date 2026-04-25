import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import FlowsTable from "@/components/flows/FlowsTable";

export default function ChainCampaigns() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const groupId = (activeHospital as any)?.groupId ?? null;

  const { data, isLoading } = useQuery<{ flows: any[] }>({
    queryKey: [`/api/chain/${groupId}/flows`],
    enabled: !!groupId,
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
              return <Badge variant="outline">{t("chain.campaigns.nLocations", "{{n}} locations", { n: list.length })}</Badge>;
            },
          }}
        />
      )}
    </div>
  );
}
