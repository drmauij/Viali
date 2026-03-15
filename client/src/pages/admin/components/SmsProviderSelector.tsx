import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function SmsProviderSelector({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: providerData } = useQuery<{ provider: string }>({
    queryKey: [`/api/admin/${hospitalId}/integrations/sms-provider`],
    enabled: !!hospitalId,
  });

  const setProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await apiRequest("PUT", `/api/admin/${hospitalId}/integrations/sms-provider`, { provider });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/sms-provider`] });
      toast({ title: t("common.success"), description: "SMS provider updated" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to update SMS provider", variant: "destructive" });
    },
  });

  if (!hospitalId) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground">SMS Provider</h3>
          <p className="text-sm text-muted-foreground">
            Choose which SMS provider to use for this hospital
          </p>
        </div>
        <Select
          value={providerData?.provider || 'auto'}
          onValueChange={(value) => setProviderMutation.mutate(value)}
          disabled={setProviderMutation.isPending}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automatic (recommended)</SelectItem>
            <SelectItem value="aspsms">ASPSMS only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        <strong>Automatic:</strong> Tries ASPSMS first, then Vonage. Hospital-specific credentials take priority over default.
      </p>
    </div>
  );
}
