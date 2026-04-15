import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { formatDistanceToNow } from "date-fns";

interface Props {
  hospitalId: string;
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

export default function MarketingAiInsights({ hospitalId, startDate, endDate }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeHospital = useActiveHospital();
  const isAdmin = activeHospital?.role === "admin";

  const key = ["marketing-ai-analysis", hospitalId, startDate, endDate];

  const { data, isLoading: loadingCache } = useQuery<AnalysisResponse | null>({
    queryKey: key,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/business/${hospitalId}/ai-analysis?startDate=${startDate}&endDate=${endDate}`,
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("fetch failed");
      return (await res.json()) as AnalysisResponse;
    },
    enabled: !!hospitalId && !!startDate && !!endDate,
  });

  const generate = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await apiRequest(
        "POST",
        `/api/business/${hospitalId}/ai-analysis`,
        { startDate, endDate, force },
      );
      if (!res.ok) throw new Error("generation failed");
      return (await res.json()) as AnalysisResponse;
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(key, fresh);
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

  return (
    <Card className="mb-6" data-testid="marketing-ai-insights">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t("business.marketing.aiInsights.title")}
            </CardTitle>
            <CardDescription>
              {t("business.marketing.aiInsights.description")}
            </CardDescription>
          </div>
          {current && !generate.isPending && (
            <div className="flex gap-2">
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generate.mutate(true)}
                  data-testid="regenerate-button"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {t("business.marketing.aiInsights.regenerateButton")}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loadingCache && <div className="text-sm text-muted-foreground">…</div>}

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

        {current && !generate.isPending && (
          <div className={current.stale ? "opacity-60 space-y-4" : "space-y-4"}>
            {current.stale && (
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
                when: formatDistanceToNow(new Date(current.generatedAt), { addSuffix: true }),
                user: current.generatedBy,
              })}
            </p>
            {current.stale && (
              <Button size="sm" onClick={() => generate.mutate(false)} data-testid="generate-new-button">
                <Sparkles className="h-4 w-4 mr-2" />
                {t("business.marketing.aiInsights.generateButton")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
