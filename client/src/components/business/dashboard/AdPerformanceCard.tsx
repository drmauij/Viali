import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Megaphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale } from "@/lib/dateUtils";

interface AdPerformanceMonth {
  month: string;
  totalBudget: number;
  totalLeads: number;
  totalConfirmed: number;
  totalKept: number;
  totalPaid: number;
  totalRevenue: number;
}

interface Props {
  hospitalId: string;
  range: string;
}

// Range matching: "all" -> include all months; "YYYY" -> include months
// whose prefix matches the year. Anything else (legacy "Nd") falls back to
// the most recent 12 months.
function monthMatches(month: string, range: string): boolean {
  if (range === "all" || !range) return true;
  if (/^\d{4}$/.test(range)) return month.startsWith(range);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 7);
  return month >= cutoffStr;
}

export default function AdPerformanceCard({ hospitalId, range }: Props) {
  const { t } = useTranslation();
  const query = useQuery<AdPerformanceMonth[]>({
    queryKey: [`/api/business/${hospitalId}/ad-performance`],
    enabled: !!hospitalId,
  });

  const totals = useMemo(() => {
    const rows = (query.data ?? []).filter((m) => monthMatches(m.month, range));
    const sum = rows.reduce(
      (acc, m) => ({
        budget: acc.budget + (m.totalBudget ?? 0),
        leads: acc.leads + (m.totalLeads ?? 0),
        confirmed: acc.confirmed + (m.totalConfirmed ?? 0),
        kept: acc.kept + (m.totalKept ?? 0),
        paid: acc.paid + (m.totalPaid ?? 0),
        revenue: acc.revenue + (m.totalRevenue ?? 0),
      }),
      { budget: 0, leads: 0, confirmed: 0, kept: 0, paid: 0, revenue: 0 },
    );
    const roi = sum.budget > 0 ? (sum.revenue - sum.budget) / sum.budget : null;
    const cpa = sum.paid > 0 ? sum.budget / sum.paid : null;
    return { ...sum, roi, cpa, months: rows.length };
  }, [query.data, range]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          {t("business.pipeline.adPerfTitle", "Ad performance")}
        </CardTitle>
        <CardDescription>
          {t("business.pipeline.adPerfDesc", "Paid acquisition rolled up for the selected period — see /business/funnels for the full breakdown.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : totals.months === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            {t("business.pipeline.noAdData", "No ad-budget data for this period.")}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-muted-foreground uppercase">{t("business.pipeline.adSpend", "Ad spend")}</div>
              <div className="text-xl font-bold">{formatCurrencyLocale(totals.budget)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">{t("business.pipeline.adBookings", "Paid bookings")}</div>
              <div className="text-xl font-bold">{totals.paid}</div>
              <div className="text-xs text-muted-foreground">
                {totals.cpa != null
                  ? t("business.pipeline.cpa", "{{v}} per booking", { v: formatCurrencyLocale(totals.cpa) })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">{t("business.pipeline.adRevenue", "Attributed revenue")}</div>
              <div className="text-xl font-bold">{formatCurrencyLocale(totals.revenue)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">{t("business.pipeline.adRoi", "ROI")}</div>
              <div className={`text-xl font-bold ${totals.roi != null && totals.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : totals.roi != null ? "text-red-600 dark:text-red-400" : ""}`}>
                {totals.roi == null ? "—" : `${(totals.roi * 100).toFixed(0)}%`}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
