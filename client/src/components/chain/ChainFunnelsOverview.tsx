import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import KpiStrip from "./overview/KpiStrip";
import LocationsLeaderboard from "./overview/LocationsLeaderboard";
import SourceLocationHeatmap from "./overview/SourceLocationHeatmap";
import SourceMixDonut from "./overview/SourceMixDonut";
import MoversPanel from "./overview/MoversPanel";
import AiInsightsPlaceholder from "./overview/AiInsightsPlaceholder";

interface OverviewResponse {
  kpis: any;
  leaderboard: any[];
  heatmap: any;
  sourceMix: any;
  movers: any;
  currency: string | null;
}

interface Props {
  groupId: string;
  hospitalIds: string[];
  range: string;
}

export default function ChainFunnelsOverview({ groupId, hospitalIds, range }: Props) {
  const { t } = useTranslation();

  const url = `/api/chain/${groupId}/funnels-overview?hospitalIds=${hospitalIds.join(",")}&range=${range}`;
  const { data, isLoading, isError } = useQuery<OverviewResponse>({
    queryKey: [url],
    enabled: !!groupId && hospitalIds.length > 0,
  });

  if (hospitalIds.length === 0) {
    return (
      <div
        className="text-sm text-muted-foreground p-12 text-center"
        data-testid="overview-empty-locations"
      >
        {t("chain.funnels.selectAtLeastOne", "Select at least one clinic to see data.")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        {t("common.loading", "Loading...")}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-12 text-center text-destructive">
        {t("common.error", "Error loading overview.")}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="chain-funnels-overview">
      <KpiStrip kpis={data.kpis} currency={data.currency} />
      <LocationsLeaderboard rows={data.leaderboard} currency={data.currency} />
      <SourceLocationHeatmap data={data.heatmap} />
      <SourceMixDonut leads={data.sourceMix.leads} referrals={data.sourceMix.referrals} />
      <MoversPanel up={data.movers.up} down={data.movers.down} />
      <AiInsightsPlaceholder />
    </div>
  );
}
