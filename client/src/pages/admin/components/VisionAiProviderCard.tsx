import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Eye, RefreshCw } from "lucide-react";

export function VisionAiProviderCard({ hospitalId, currentProvider }: { hospitalId?: string; currentProvider?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [selectedProvider, setSelectedProvider] = useState<"openai" | "pixtral">(
    (currentProvider as "openai" | "pixtral") || "openai"
  );

  useEffect(() => {
    setSelectedProvider((currentProvider as "openai" | "pixtral") || "openai");
  }, [currentProvider]);

  const updateProviderMutation = useMutation({
    mutationFn: async (provider: "openai" | "pixtral") => {
      const response = await apiRequest("PATCH", `/api/hospitals/${hospitalId}`, {
        visionAiProvider: provider,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: t("common.success"),
        description: t("admin.visionAiProviderUpdated", "Vision AI provider updated successfully"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || "Failed to update vision AI provider",
        variant: "destructive"
      });
    },
  });

  if (!hospitalId) return null;

  const handleProviderChange = (provider: "openai" | "pixtral") => {
    setSelectedProvider(provider);
    updateProviderMutation.mutate(provider);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
            <Eye className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-base">{t("admin.visionAi", "Vision AI Provider")}</CardTitle>
            <CardDescription>
              {t("admin.visionAiDescription", "AI model for analyzing camera images (vitals OCR, inventory)")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleProviderChange("openai")}
            disabled={updateProviderMutation.isPending}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedProvider === "openai"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
            data-testid="button-select-openai"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <span className="font-medium text-sm">OpenAI GPT-4o</span>
              <span className="text-xs text-muted-foreground">gpt-4o-mini</span>
            </div>
          </button>

          <button
            onClick={() => handleProviderChange("pixtral")}
            disabled={updateProviderMutation.isPending}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedProvider === "pixtral"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
            data-testid="button-select-pixtral"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="font-medium text-sm">Mistral Pixtral</span>
              <span className="text-xs text-muted-foreground">pixtral-large-latest</span>
            </div>
          </button>
        </div>

        {updateProviderMutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{t("common.saving", "Saving...")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
