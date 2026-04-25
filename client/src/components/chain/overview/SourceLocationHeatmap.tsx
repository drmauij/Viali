import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type Metric = "leads" | "referrals" | "bookingPct" | "firstVisitPct" | "paidPct";

interface Cell {
  source: string;
  hospitalId: string;
  leads: number;
  referrals: number;
  bookingPct: number;
  firstVisitPct: number;
  paidPct: number;
}

interface Props {
  data: {
    sources: string[];
    locations: Array<{ hospitalId: string; hospitalName: string }>;
    cells: Cell[];
  };
}

export default function SourceLocationHeatmap({ data }: Props) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<Metric>("leads");

  const cellMap = new Map<string, Cell>(
    data.cells.map((c) => [`${c.source}|${c.hospitalId}`, c]),
  );
  const max = Math.max(...data.cells.map((c) => Number(c[metric] ?? 0)), 1);

  const isCount = metric === "leads" || metric === "referrals";
  const fmt = (v: number) =>
    isCount ? v.toLocaleString() : `${v.toFixed(0)}%`;

  const metricLabels: Record<Metric, string> = {
    leads: t("chain.funnels.col.leads", "Leads"),
    referrals: t("chain.funnels.col.referrals", "Referrals"),
    bookingPct: t("chain.funnels.col.bookingPct", "Booking%"),
    firstVisitPct: t("chain.funnels.col.firstVisitPct", "First-visit%"),
    paidPct: t("chain.funnels.col.paidPct", "Paid%"),
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <CardTitle className="text-base">
          {t("chain.funnels.heatmap", "Source × Location")}
        </CardTitle>
        <div className="flex flex-wrap gap-1">
          {(
            [
              "leads",
              "referrals",
              "bookingPct",
              "firstVisitPct",
              "paidPct",
            ] as Metric[]
          ).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={metric === m ? "default" : "outline"}
              onClick={() => setMetric(m)}
              data-testid={`metric-${m}`}
            >
              {metricLabels[m]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {data.sources.length === 0 || data.locations.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 text-center">
            {t(
              "chain.funnels.heatmapEmpty",
              "No data for the selected scope.",
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("chain.funnels.source", "Source")}
                  </TableHead>
                  {data.locations.map((loc) => (
                    <TableHead key={loc.hospitalId} className="text-right">
                      {loc.hospitalName}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sources.map((src) => (
                  <TableRow key={src}>
                    <TableCell className="font-medium">{src}</TableCell>
                    {data.locations.map((loc) => {
                      const c = cellMap.get(`${src}|${loc.hospitalId}`);
                      const value = c ? Number(c[metric] ?? 0) : 0;
                      const intensity = Math.min(value / max, 1);
                      const bg = `rgba(61, 139, 253, ${0.08 + intensity * 0.25})`;
                      return (
                        <TableCell
                          key={loc.hospitalId}
                          className="text-right"
                          style={{
                            backgroundColor: value > 0 ? bg : undefined,
                          }}
                        >
                          {value > 0 ? fmt(value) : "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
