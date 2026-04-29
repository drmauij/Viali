import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Redirect, useLocation } from "wouter";
import MoneyTab from "./MoneyTab";
import PipelineTab from "./PipelineTab";

export default function CostAnalytics() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [range, setRange] = useState<"30d" | "90d" | "365d">("30d");
  const [showBackToChain, setShowBackToChain] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    setShowBackToChain(sessionStorage.getItem("chain.drilledInto") === "true");
  }, []);

  const isManager = activeHospital?.role === 'admin' || activeHospital?.role === 'manager';

  // Redirect staff users to Administration - they cannot access Dashboard (costs/analytics)
  if (!isManager) {
    return <Redirect to="/business/administration" />;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      {showBackToChain && (
        <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6 py-2 bg-blue-500/5 border-b border-blue-500/20 text-sm flex items-center gap-2">
          <button
            onClick={() => { sessionStorage.removeItem("chain.drilledInto"); navigate("/chain"); }}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            data-testid="back-to-chain-breadcrumb"
          >
            ← {t("business.backToChain", "Back to Chain overview")}
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-cost-analytics-title">
            {activeHospital?.name ?? t('business.costs.title')}
          </h1>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as any)}>
          <SelectTrigger className="w-[180px]" data-testid="select-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">{t('business.range.30d', 'Last 30 days')}</SelectItem>
            <SelectItem value="90d">{t('business.range.90d', 'Last 90 days')}</SelectItem>
            <SelectItem value="365d">{t('business.range.365d', 'Last year')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Two-tab dashboard: Money + Pipeline */}
      <Tabs defaultValue="money" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="money" data-testid="tab-money">
            {t('business.tabs.money', 'Money')}
          </TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline">
            {t('business.tabs.pipeline', 'Pipeline')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="money" className="mt-6">
          <MoneyTab hospitalId={activeHospital?.id ?? ''} range={range} />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-6">
          <PipelineTab hospitalId={activeHospital?.id ?? ''} range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
