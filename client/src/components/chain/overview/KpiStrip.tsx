import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface Kpi {
  current: number | null;
  prev: number | null;
  deltaPct: number;
}
interface Props {
  kpis: {
    leads: Kpi;
    referrals: Kpi;
    bookings: Kpi;
    firstVisits: Kpi;
    paidRevenue: Kpi;
    conversionPct: Kpi;
  };
  currency: string | null;
}

function Delta({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  return pct > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600">
      <ArrowUp className="h-3 w-3" />
      {pct.toFixed(0)}%
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs text-rose-600">
      <ArrowDown className="h-3 w-3" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default function KpiStrip({ kpis, currency }: Props) {
  const { t } = useTranslation();

  const tile = (
    label: string,
    k: Kpi,
    formatter: (n: number) => string,
    testid: string,
  ) => (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold" data-testid={testid}>
          {k.current === null
            ? t("chain.funnels.mixedCurrencies", "Mixed currencies")
            : formatter(k.current)}
        </div>
        <Delta pct={k.deltaPct} />
      </CardContent>
    </Card>
  );

  const numFmt = (n: number) => n.toLocaleString();
  const moneyFmt = (n: number) => `${currency ?? ""} ${n.toLocaleString()}`.trim();
  const pctFmt = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      data-testid="overview-kpi-strip"
    >
      {tile(t("chain.funnels.kpi.leads", "Leads"), kpis.leads, numFmt, "kpi-leads")}
      {tile(t("chain.funnels.kpi.referrals", "Referrals"), kpis.referrals, numFmt, "kpi-referrals")}
      {tile(t("chain.funnels.kpi.bookings", "Bookings"), kpis.bookings, numFmt, "kpi-bookings")}
      {tile(t("chain.funnels.kpi.firstVisits", "First visits"), kpis.firstVisits, numFmt, "kpi-firstVisits")}
      {tile(t("chain.funnels.kpi.paidRevenue", "Paid revenue"), kpis.paidRevenue, moneyFmt, "kpi-revenue")}
      {tile(t("chain.funnels.kpi.conv", "Blended conv%"), kpis.conversionPct, pctFmt, "kpi-conv")}
    </div>
  );
}
