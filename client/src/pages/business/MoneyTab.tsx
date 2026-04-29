import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale } from "@/lib/dateUtils";

interface MoneySummary {
  revenue: { surgery: number; treatment: number; total: number };
  cost:    { staff: number; materials: number; total: number };
  margin:  { value: number; percent: number; deltaPp_vs_prev: number };
  byDay:   Array<{ date: string; revenue: number; staffCost: number; materialsCost: number }>;
}

interface TopProc {
  procedure: string;
  count: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

interface InventoryPoint { date: string; value: number; }

interface Props {
  hospitalId: string;
  range: "30d" | "90d" | "365d";
}

export default function MoneyTab({ hospitalId, range }: Props) {
  const { t } = useTranslation();

  const summary = useQuery<MoneySummary>({
    queryKey: [`/api/business/${hospitalId}/money-summary?range=${range}`],
    enabled: !!hospitalId,
  });

  const topProcs = useQuery<TopProc[]>({
    queryKey: [`/api/business/${hospitalId}/top-procedures-by-margin?range=${range}&limit=5`],
    enabled: !!hospitalId,
  });

  const invTrend = useQuery<InventoryPoint[]>({
    queryKey: [`/api/business/${hospitalId}/inventory-value-trend?days=30`],
    enabled: !!hospitalId,
  });

  if (summary.isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (summary.isError || !summary.data) {
    return <div className="text-center text-red-500 py-12">{t('common.errorLoadingData', 'Error loading data')}</div>;
  }

  const s = summary.data;
  const staffPct = s.cost.total > 0 ? (s.cost.staff / s.cost.total) * 100 : 0;
  const matPct = s.cost.total > 0 ? (s.cost.materials / s.cost.total) * 100 : 0;
  const latestInv = invTrend.data && invTrend.data.length > 0 ? invTrend.data[invTrend.data.length - 1].value : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">{t('business.money.revenue', 'Revenue')}</div>
            <div className="text-2xl font-bold">{formatCurrencyLocale(s.revenue.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('business.money.surgeryShare', 'Surgery {{v}} · Treatments {{t}}', {
                v: formatCurrencyLocale(s.revenue.surgery),
                t: formatCurrencyLocale(s.revenue.treatment),
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">{t('business.money.costs', 'Costs')}</div>
            <div className="text-2xl font-bold">{formatCurrencyLocale(s.cost.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('business.money.costSplit', 'Staff {{a}}% · Materials {{b}}%', {
                a: staffPct.toFixed(0),
                b: matPct.toFixed(0),
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">{t('business.money.margin', 'Margin')}</div>
            <div className={`text-2xl font-bold ${s.margin.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrencyLocale(s.margin.value)}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {s.margin.deltaPp_vs_prev >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(s.margin.deltaPp_vs_prev).toFixed(1)} pp {t('business.money.vsPrev', 'vs prev period')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">{t('business.money.marginPercent', 'Margin %')}</div>
            <div className="text-2xl font-bold">{(s.margin.percent * 100).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {s.margin.deltaPp_vs_prev >= 0 ? '↑' : '↓'} {Math.abs(s.margin.deltaPp_vs_prev).toFixed(1)} pp
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('business.money.trendTitle', 'Revenue & cost over time')}</CardTitle>
          <CardDescription>{t('business.money.trendDesc', 'Daily totals attributed by surgery payment date and treatment performance date')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.byDay}>
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={10} />
                <ReTooltip formatter={(v: unknown) => formatCurrencyLocale(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" stackId="rev" fill="#3b82f6" name={t('business.money.revenueCol', 'Revenue') as string} />
                <Bar dataKey="staffCost" stackId="cost" fill="#a855f7" name={t('business.money.staffCost', 'Staff cost') as string} />
                <Bar dataKey="materialsCost" stackId="cost" fill="#22c55e" name={t('business.money.materialsCost', 'Materials cost') as string} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('business.money.treatmentFootnote', 'Treatment material costs estimated from price markup; items without supplier or patient price are excluded.')}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('business.money.topProceduresTitle', 'Top procedures by margin')}</CardTitle>
          </CardHeader>
          <CardContent>
            {topProcs.isLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('business.money.procedure', 'Procedure')}</TableHead>
                    <TableHead className="text-right">{t('business.money.count', 'Count')}</TableHead>
                    <TableHead className="text-right">{t('business.money.revenueCol', 'Revenue')}</TableHead>
                    <TableHead className="text-right">{t('business.money.marginCol', 'Margin')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topProcs.data ?? []).map((row) => (
                    <TableRow key={row.procedure}>
                      <TableCell className="font-medium">{row.procedure}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{formatCurrencyLocale(row.revenue)}</TableCell>
                      <TableCell className={`text-right ${row.margin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrencyLocale(row.margin)} ({(row.marginPercent * 100).toFixed(0)}%)
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('business.money.inventoryOnHand', 'Inventory on hand')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {latestInv !== null ? formatCurrencyLocale(latestInv) : '—'}
            </div>
            <div className="h-[80px]">
              {invTrend.data && invTrend.data.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={invTrend.data}>
                    <Bar dataKey="value" fill="#64748b" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-muted-foreground">{t('business.money.noInventoryHistory', 'No inventory history yet')}</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
