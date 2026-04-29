import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/dateUtils";
import type { Treatment, TreatmentLine } from "@shared/schema";

type Session = Treatment & { lines: TreatmentLine[] };

interface Props {
  sessions: Session[];
  servicesMap: Record<string, { name: string }>;
  itemsMap: Record<string, { name: string }>;
  onCopyLines: (lines: TreatmentLine[]) => void;
}

export function HistorySummaryCard({
  sessions,
  servicesMap,
  itemsMap,
  onCopyLines,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  const recent = sessions.slice(0, 3);
  if (!recent.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("treatments.previousTreatments", "Previous treatments")}{" "}
          ({sessions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recent.map((s) => {
          const isOpen = expanded === s.id;
          const labels = s.lines
            .slice(0, 3)
            .map((l) =>
              l.serviceId
                ? servicesMap[l.serviceId]?.name
                : itemsMap[l.itemId ?? ""]?.name,
            )
            .filter(Boolean) as string[];
          const more = s.lines.length - labels.length;
          const total = s.lines.reduce(
            (sum, l) => sum + parseFloat((l.total as string) ?? "0"),
            0,
          );

          return (
            <div key={s.id} className="border rounded p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 flex-1 text-left"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-medium whitespace-nowrap">
                    {format(new Date(s.performedAt), "d MMM yyyy")}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {labels.join(", ")}
                    {more > 0 ? ` +${more} more` : ""}
                  </span>
                  <span className="ml-auto font-medium whitespace-nowrap">
                    {formatCurrency(total)}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCopyLines(s.lines)}
                  title={t("treatments.copyLines", "Copy lines")}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {t("treatments.copy", "Copy")}
                </Button>
              </div>

              {isOpen && (
                <div className="mt-2 pl-6 space-y-1">
                  {s.lines.map((l) => (
                    <div key={l.id} className="flex items-start gap-1 text-xs">
                      <div className="flex-1">
                        {l.serviceId && servicesMap[l.serviceId] && (
                          <span className="font-medium">
                            {servicesMap[l.serviceId].name}
                          </span>
                        )}
                        {l.itemId && itemsMap[l.itemId] && (
                          <span
                            className={
                              l.serviceId ? "text-muted-foreground" : "font-medium"
                            }
                          >
                            {l.serviceId ? " · " : ""}
                            {itemsMap[l.itemId].name}
                          </span>
                        )}
                        {(l.dose || l.doseUnit) && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {l.dose}
                            {l.doseUnit ? " " + l.doseUnit : ""}
                          </span>
                        )}
                        {(l.zones as string[])?.length > 0 && (
                          <span className="text-muted-foreground">
                            , {(l.zones as string[]).join(", ")}
                          </span>
                        )}
                      </div>
                      <span className="font-medium ml-2">
                        {formatCurrency((l.total as string) ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
