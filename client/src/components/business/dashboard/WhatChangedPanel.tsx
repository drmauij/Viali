import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightItem } from "./types";

interface Props {
  hospitalId: string;
  // When true, only show critical-severity insights (e.g. booking pipeline
  // drops). Useful for embedding inside a tab where the alert needs to be
  // visible right next to the related charts.
  onlyCritical?: boolean;
  // When true, hide critical-severity insights. Used at the top of the
  // dashboard so critical alerts don't appear in two places at once —
  // they're owned by the Pipeline tab via `onlyCritical`.
  excludeCritical?: boolean;
}

// `critical` is intentionally loud — pulse + thicker red border — because it
// signals a hit to incoming bookings, which is the user's top priority.
const SEVERITY_STYLES: Record<InsightItem["severity"], string> = {
  critical: "border-2 border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-200 font-medium",
  positive: "border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  negative: "border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  neutral:  "border border-muted bg-muted/30 text-foreground",
};

function SeverityIcon({ severity }: { severity: InsightItem["severity"] }) {
  if (severity === "critical") return <AlertTriangle className="h-5 w-5 shrink-0" />;
  if (severity === "positive") return <TrendingUp className="h-4 w-4 shrink-0" />;
  if (severity === "negative") return <TrendingDown className="h-4 w-4 shrink-0" />;
  return <Minus className="h-4 w-4 shrink-0" />;
}

export default function WhatChangedPanel({ hospitalId, onlyCritical, excludeCritical }: Props) {
  const insights = useQuery<{ insights: InsightItem[] }>({
    queryKey: [`/api/business/${hospitalId}/insights`],
    enabled: !!hospitalId,
  });

  // Stay silent while loading or when there's nothing to flag — keeps the
  // dashboard load clean. Loud "all quiet" placeholders disabled per
  // 2026-05-17 design feedback.
  if (insights.isLoading) return null;

  const allItems = insights.data?.insights ?? [];
  const items = onlyCritical
    ? allItems.filter((i) => i.severity === "critical")
    : excludeCritical
      ? allItems.filter((i) => i.severity !== "critical")
      : allItems;
  if (items.length === 0) return null;

  const critical = items.filter((i) => i.severity === "critical");
  const rest = items.filter((i) => i.severity !== "critical");

  return (
    <div className="space-y-3">
      {critical.length > 0 && (
        <div className="space-y-2">
          {critical.map((it) => (
            <div
              key={it.id}
              className={cn(
                "rounded-lg px-4 py-3 text-sm flex items-start gap-3",
                SEVERITY_STYLES[it.severity],
              )}
              data-testid={`insight-${it.id}`}
              role="alert"
            >
              <SeverityIcon severity={it.severity} />
              <div className="leading-snug text-base">{it.message}</div>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rest.map((it) => (
            <div
              key={it.id}
              className={cn("rounded-lg px-3 py-2.5 text-sm flex items-start gap-2", SEVERITY_STYLES[it.severity])}
              data-testid={`insight-${it.id}`}
            >
              <SeverityIcon severity={it.severity} />
              <div className="leading-snug">{it.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
