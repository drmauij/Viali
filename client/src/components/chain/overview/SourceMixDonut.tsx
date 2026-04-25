import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface Slice {
  source: string;
  count: number;
  pct: number;
}

interface Props {
  leads: Slice[];
  referrals: Slice[];
}

const COLORS = [
  "#3d8bfd",
  "#10b981",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#6366f1",
  "#f97316",
];

function Donut({
  data,
  emptyLabel,
}: {
  data: Slice[];
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="source"
          innerRadius={50}
          outerRadius={80}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, _name: string, item: any) => [
            `${v} (${item.payload.pct.toFixed(0)}%)`,
            item.payload.source,
          ]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function SourceMixDonut({ leads, referrals }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("chain.funnels.sourceMix", "Source mix")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("chain.funnels.leadsBySource", "Leads by source")}
            </div>
            <Donut
              data={leads}
              emptyLabel={t("chain.funnels.empty", "No data")}
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t(
                "chain.funnels.referralsBySource",
                "Referrals by source",
              )}
            </div>
            <Donut
              data={referrals}
              emptyLabel={t("chain.funnels.empty", "No data")}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
