import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MarketingResponse {
  sources: Array<{
    name: string;
    byLocation: Array<{ hospitalId: string; hospitalName: string; leads: number; firstVisits: number }>;
    totals: { leads: number; firstVisits: number; conversionPct: number };
  }>;
  locations: Array<{ hospitalId: string; hospitalName: string }>;
  alerts: Array<{ kind: "source_drop"; source: string; currentLeads: number; prevLeads: number; deltaPct: number }>;
}

export default function ChainMarketing() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const groupId = (activeHospital as any)?.groupId ?? null;
  const [range, setRange] = useState<"30d" | "90d" | "365d">("30d");

  const { data, isLoading, isError } = useQuery<MarketingResponse>({
    queryKey: [`/api/chain/${groupId}/marketing?range=${range}`],
    enabled: !!groupId,
  });

  // Build the heatmap matrix: rows = sources, cols = locations (filling gaps with zeros)
  const matrix = useMemo(() => {
    if (!data) return [] as Array<{ source: string; totals: MarketingResponse["sources"][number]["totals"]; cells: Array<{ hospitalId: string; hospitalName: string; leads: number; firstVisits: number }> }>;
    return data.sources.map(src => ({
      source: src.name,
      totals: src.totals,
      cells: data.locations.map(loc => {
        const found = src.byLocation.find(c => c.hospitalId === loc.hospitalId);
        return found ?? { hospitalId: loc.hospitalId, hospitalName: loc.hospitalName, leads: 0, firstVisits: 0 };
      }),
    }));
  }, [data]);

  if (!groupId) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="chain-marketing-no-group">
        {t("chain.marketing.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("common.loading", "Loading...")}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive">
        {t("common.error", "Error loading chain marketing.")}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="chain-marketing">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">{t("chain.marketing.title", "Chain marketing")}</h1>
        <Select value={range} onValueChange={(v) => setRange(v as any)}>
          <SelectTrigger className="w-[180px]" data-testid="select-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">{t("business.range.30d", "Last 30 days")}</SelectItem>
            <SelectItem value="90d">{t("business.range.90d", "Last 90 days")}</SelectItem>
            <SelectItem value="365d">{t("business.range.365d", "Last year")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Source × Location heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chain.marketing.heatmap", "Source × Location — leads")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("chain.marketing.source", "Source")}</TableHead>
                  {data.locations.map(loc => (
                    <TableHead key={loc.hospitalId} className="text-right">{loc.hospitalName}</TableHead>
                  ))}
                  <TableHead className="text-right">{t("chain.marketing.total", "Total")}</TableHead>
                  <TableHead className="text-right">{t("chain.marketing.conv", "Conv")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={data.locations.length + 3} className="text-center text-muted-foreground py-4">
                      {t("chain.marketing.empty", "No leads recorded in this period.")}
                    </TableCell>
                  </TableRow>
                ) : matrix.map(row => {
                  const max = Math.max(...row.cells.map(c => c.leads), 1);
                  return (
                    <TableRow key={row.source}>
                      <TableCell className="font-medium">{row.source}</TableCell>
                      {row.cells.map(c => {
                        const intensity = Math.min(c.leads / max, 1);
                        const bg = `rgba(61, 139, 253, ${0.08 + intensity * 0.25})`;
                        return (
                          <TableCell
                            key={c.hospitalId}
                            className="text-right"
                            style={{ backgroundColor: c.leads > 0 ? bg : undefined }}
                          >
                            {c.leads}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-semibold">{row.totals.leads}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{row.totals.conversionPct.toFixed(0)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("chain.marketing.alertsTitle", "Alerts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.alerts.map(a => (
                <li key={a.source} className="text-amber-600">
                  ⚠ {t("chain.marketing.sourceDrop", "{{source}} leads dropped {{pct}}% ({{prev}} → {{current}})", {
                    source: a.source,
                    pct: Math.abs(a.deltaPct).toFixed(0),
                    prev: a.prevLeads,
                    current: a.currentLeads,
                  })}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
