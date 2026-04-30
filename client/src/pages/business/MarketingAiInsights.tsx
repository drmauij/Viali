import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { formatDistanceToNow } from "date-fns";
import { funnelsUrl, type FunnelsScope } from "@/lib/funnelsApi";

interface Props {
  scope: FunnelsScope;
  startDate: string;
  endDate: string;
}

interface AnalysisResponse {
  payload: {
    summary: string[];
    trends: string[];
    insights: string[];
    suggestedActions: string[];
  };
  generatedAt: string;
  generatedBy: string;
  cached: boolean;
  stale: boolean;
}

export default function MarketingAiInsights({ scope, startDate, endDate }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeHospital = useActiveHospital();
  const isAdmin = activeHospital?.role === "admin";

  // The parent (Funnels.tsx) initialises `referralFrom` to "" and only
  // populates it once ReferralFunnel fires `onEarliestDate`. The AI card is
  // rendered above ReferralFunnel and on tabs where it doesn't render at
  // all, so dates can be empty when the user clicks Generate. Fall back to
  // a 365-day lookback so the request always has a valid YYYY-MM-DD range
  // — enough history to contain mature cohorts but bounded.
  const { effectiveStartDate, effectiveEndDate } = useMemo(() => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const fallbackEnd = fmt(today);
    const past = new Date(today);
    past.setDate(past.getDate() - 365);
    const fallbackStart = fmt(past);
    return {
      effectiveStartDate: startDate || fallbackStart,
      effectiveEndDate: endDate || fallbackEnd,
    };
  }, [startDate, endDate]);

  // All hooks must be called unconditionally (Rules of Hooks).
  // For chain scope, we skip network calls via `enabled: false` and gate via JSX below.
  const hospitalId = scope.groupId ? "" : (scope.hospitalIds[0] ?? "");
  const url = scope.groupId
    ? null
    : funnelsUrl("ai-analysis", scope, { startDate: effectiveStartDate, endDate: effectiveEndDate });
  const key = ["marketing-ai-analysis", hospitalId, effectiveStartDate, effectiveEndDate];

  const { data, isLoading: loadingCache } = useQuery<AnalysisResponse | null>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(url!, { credentials: "include" });
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);
      return (await res.json()) as AnalysisResponse | null;
    },
    enabled: !!url && !!hospitalId && !!effectiveStartDate && !!effectiveEndDate,
  });

  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const NOTES_MAX = 500;

  const generate = useMutation({
    mutationFn: async (force: boolean) => {
      const postUrl = funnelsUrl("ai-analysis", scope);
      if (!postUrl) throw new Error("scope not addressable");
      const trimmed = notes.trim();
      const body: Record<string, unknown> = {
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        force,
      };
      if (trimmed.length > 0) body.operatorNotes = trimmed;
      const res = await apiRequest("POST", postUrl, body);
      if (!res.ok) throw new Error("generation failed");
      return (await res.json()) as AnalysisResponse;
    },
    onSuccess: (fresh) => {
      // Notes-bearing results aren't cached server-side — keep them in
      // local mutation state only so the cached baseline (no-notes) view
      // isn't overwritten in the React Query cache.
      if (notes.trim().length === 0) {
        queryClient.setQueryData(key, fresh);
      }
      setExpanded(true);
    },
  });

  const sections = useMemo(() => {
    const p = data?.payload ?? generate.data?.payload;
    if (!p) return null;
    return [
      { label: t("business.marketing.aiInsights.sections.summary"), items: p.summary },
      { label: t("business.marketing.aiInsights.sections.trends"), items: p.trends },
      { label: t("business.marketing.aiInsights.sections.insights"), items: p.insights },
      { label: t("business.marketing.aiInsights.sections.suggestedActions"), items: p.suggestedActions },
    ];
  }, [data, generate.data, t]);

  const current = generate.data ?? data;

  const hasResult = !!current && !generate.isPending;

  // JSX-level gate: chain scope has no AI endpoint yet (Task 11).
  // All hooks above have already been called unconditionally.
  if (scope.groupId) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="marketing-ai-chain-placeholder">
        Chain AI insights coming soon.
      </div>
    );
  }
  if (scope.hospitalIds.length === 0) return null;

  return (
    <Card className="mb-6" data-testid="marketing-ai-insights">
      <CardHeader
        className={hasResult ? "cursor-pointer py-3" : undefined}
        onClick={hasResult ? () => setExpanded((v) => !v) : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t("business.marketing.aiInsights.title")}
              {hasResult && !expanded && (
                <span className="text-xs font-normal text-muted-foreground truncate">
                  · {t("business.marketing.aiInsights.generatedBy", {
                    when: formatDistanceToNow(new Date(current!.generatedAt), { addSuffix: true }),
                    user: current!.generatedBy,
                  })}
                </span>
              )}
            </CardTitle>
            {(!hasResult || expanded) && (
              <CardDescription>
                {t("business.marketing.aiInsights.description")}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasResult && isAdmin && expanded && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  generate.mutate(true);
                }}
                data-testid="regenerate-button"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {t("business.marketing.aiInsights.regenerateButton")}
              </Button>
            )}
            {hasResult && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                aria-label={expanded ? "Collapse" : "Expand"}
                data-testid="toggle-button"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {(!hasResult || expanded) && (
        <CardContent>
          {loadingCache && <div className="text-sm text-muted-foreground">…</div>}

          {!loadingCache && !generate.isPending && (
            <div className="mb-4 space-y-1.5" data-testid="operator-notes-block">
              <Label htmlFor="ai-operator-notes" className="text-xs text-muted-foreground">
                {t("business.marketing.aiInsights.notesLabel", "Optional context for the AI")}
              </Label>
              <Textarea
                id="ai-operator-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                placeholder={t(
                  "business.marketing.aiInsights.notesPlaceholder",
                  "e.g. new surgeon onboarded April 14, Klaviyo flow paused, Meta creative refresh in progress",
                )}
                rows={2}
                maxLength={NOTES_MAX}
                className="text-sm"
                data-testid="operator-notes-input"
              />
              <p className="text-[10px] text-muted-foreground">
                {t(
                  "business.marketing.aiInsights.notesHint",
                  "Operational context the data can't see. Notes-bearing analyses are not cached.",
                )}
                {" "}
                ({notes.length}/{NOTES_MAX})
              </p>
            </div>
          )}

          {!loadingCache && !current && !generate.isPending && !generate.error && (
            <Button onClick={() => generate.mutate(false)} data-testid="generate-button">
              <Sparkles className="h-4 w-4 mr-2" />
              {t("business.marketing.aiInsights.generateButton")}
            </Button>
          )}

          {generate.isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("business.marketing.aiInsights.loading")}
            </div>
          )}

          {generate.error && !generate.isPending && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                {t("business.marketing.aiInsights.errorTitle")}
              </p>
              <Button size="sm" onClick={() => generate.mutate(false)}>
                {t("business.marketing.aiInsights.errorRetry")}
              </Button>
            </div>
          )}

          {hasResult && (
            <div className={current!.stale ? "opacity-60 space-y-4" : "space-y-4"}>
              {current!.stale && (
                <p className="text-xs text-muted-foreground">
                  {t("business.marketing.aiInsights.staleNotice")}
                </p>
              )}
              {sections!.map(({ label, items }) => (
                items.length > 0 && (
                  <div key={label}>
                    <h4 className="text-sm font-semibold mb-1">{label}</h4>
                    <ul className="list-disc ml-5 space-y-1">
                      {items.map((it, i) => (
                        <li key={i} className="text-sm">{it}</li>
                      ))}
                    </ul>
                  </div>
                )
              ))}
              <p className="text-xs text-muted-foreground">
                {t("business.marketing.aiInsights.generatedBy", {
                  when: formatDistanceToNow(new Date(current!.generatedAt), { addSuffix: true }),
                  user: current!.generatedBy,
                })}
              </p>
              {current!.stale && (
                <Button size="sm" onClick={() => generate.mutate(false)} data-testid="generate-new-button">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("business.marketing.aiInsights.generateButton")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
