import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslation } from "react-i18next";
import { RevenueTrendBody } from "./RevenueTrendChart";
import { TopProceduresBody } from "./TopProceduresCard";
import { SurgeonContributionBody } from "./SurgeonContributionCard";
import type { MoneySummary } from "./types";

type View = "trend" | "procedures" | "providers";

interface Props {
  hospitalId: string;
  range: string;
  summary: MoneySummary;
  onMonthClick?: (month: string) => void;
}

export default function MoneyChartsCard({ hospitalId, range, summary, onMonthClick }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("trend");

  const hasPrev = !!summary.byMonthPrev && summary.byMonthPrev.length > 0;

  const titleByView: Record<View, string> = {
    trend: t("business.money.trendTitle", "Revenue & cost over time"),
    procedures: t("business.money.topProceduresTitle", "Top procedures by margin"),
    providers: t("business.leadership.surgeonContributionTitle", "Revenue by provider"),
  };

  const descByView: Record<View, string> = {
    trend: hasPrev
      ? t("business.money.trendDescWithYoY", "Monthly totals — revenue, cost, margin. Dashed line is prior year revenue for comparison.")
      : t("business.money.trendDescMonthly", "Monthly totals — revenue, total cost, and margin"),
    procedures: t("business.money.topProceduresDesc", "All-time, past surgeries only. Procedures with no recorded cost are excluded."),
    providers: t("business.leadership.surgeonContributionDesc", "Top 10 providers by realized revenue for the selected period."),
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">{titleByView[view]}</CardTitle>
            <CardDescription>{descByView[view]}</CardDescription>
          </div>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            size="sm"
            variant="outline"
            className="shrink-0"
          >
            <ToggleGroupItem value="trend">
              {t("business.money.toggleTrend", "Trend")}
            </ToggleGroupItem>
            <ToggleGroupItem value="procedures">
              {t("business.money.toggleProcedures", "Top procedures")}
            </ToggleGroupItem>
            <ToggleGroupItem value="providers">
              {t("business.money.toggleProviders", "By provider")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {view === "trend" && <RevenueTrendBody summary={summary} onMonthClick={onMonthClick} />}
        {view === "procedures" && <TopProceduresBody hospitalId={hospitalId} />}
        {view === "providers" && <SurgeonContributionBody hospitalId={hospitalId} range={range} />}
      </CardContent>
    </Card>
  );
}
