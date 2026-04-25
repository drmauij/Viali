import { useTranslation } from "react-i18next";

interface Props {
  groupId: string;
  hospitalIds: string[];
  range: string;
}

/**
 * Placeholder. Real Overview panels (KPI strip, leaderboard, heatmap,
 * source mix, movers, AI insights) ship in Tasks 9–11.
 */
export default function ChainFunnelsOverview(_props: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="text-sm text-muted-foreground p-12 text-center"
      data-testid="chain-funnels-overview-placeholder"
    >
      {t("chain.funnels.overviewComingSoon", "Overview panels coming next.")}
    </div>
  );
}
