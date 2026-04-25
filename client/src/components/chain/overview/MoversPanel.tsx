import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp } from "lucide-react";

interface Mover {
  source: string;
  hospitalId: string;
  hospitalName: string;
  current: number;
  prev: number;
  deltaPct: number;
}
interface Props { up: Mover[]; down: Mover[]; }

function MoverRow({ m, dir }: { m: Mover; dir: "up" | "down" }) {
  const Icon = dir === "up" ? ArrowUp : ArrowDown;
  const tone = dir === "up" ? "text-emerald-600" : "text-rose-600";
  const sign = m.deltaPct >= 0 ? "+" : "";
  return (
    <li
      className="flex items-center justify-between text-sm py-2 border-b last:border-b-0"
      data-testid={`mover-${dir}-${m.source}-${m.hospitalId}`}
    >
      <span>
        <span className="font-medium">{m.source}</span>
        <span className="text-muted-foreground"> @ {m.hospitalName}</span>
      </span>
      <span className={`inline-flex items-center gap-1 ${tone}`}>
        <span className="text-muted-foreground tabular-nums">{m.prev} → {m.current}</span>
        <Icon className="h-3 w-3" />
        <span className="tabular-nums">{sign}{m.deltaPct.toFixed(0)}%</span>
      </span>
    </li>
  );
}

export default function MoversPanel({ up, down }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("chain.funnels.movers", "Movers")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              {t("chain.funnels.topUp", "Top up (≥ +20% vs prior period)")}
            </div>
            {up.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2" data-testid="movers-up-empty">
                {t("chain.funnels.noMovers", "—")}
              </div>
            ) : (
              <ul data-testid="movers-up-list">
                {up.map(m => <MoverRow key={`${m.source}|${m.hospitalId}`} m={m} dir="up" />)}
              </ul>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              {t("chain.funnels.topDown", "Top down (≤ −20% vs prior period)")}
            </div>
            {down.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2" data-testid="movers-down-empty">
                {t("chain.funnels.noMovers", "—")}
              </div>
            ) : (
              <ul data-testid="movers-down-list">
                {down.map(m => <MoverRow key={`${m.source}|${m.hospitalId}`} m={m} dir="down" />)}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
