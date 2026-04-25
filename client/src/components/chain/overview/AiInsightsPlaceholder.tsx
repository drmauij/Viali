import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function AiInsightsPlaceholder() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t("chain.funnels.aiInsights", "AI insights")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t(
            "chain.funnels.aiPlaceholder",
            "Chain-level AI insights are coming in a follow-up. The single-clinic AI Insights card on /business/funnels still works for each clinic individually.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}
