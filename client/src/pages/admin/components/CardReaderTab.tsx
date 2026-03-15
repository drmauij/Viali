import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Copy, Check, RefreshCw, CreditCard, Loader2 } from "lucide-react";

export function CardReaderTab({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: cardReaderTokenData } = useQuery<{ cardReaderToken: string | null }>({
    queryKey: [`/api/admin/${hospitalId}/card-reader-token`],
    enabled: !!hospitalId,
  });

  const generateCardReaderTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/${hospitalId}/card-reader-token/generate`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/card-reader-token`] });
      toast({ title: t("common.success"), description: t("admin.cardReaderTokenGenerated", "Card reader token generated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to generate token", variant: "destructive" });
    },
  });

  const deleteCardReaderTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/admin/${hospitalId}/card-reader-token`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/card-reader-token`] });
      toast({ title: t("common.success"), description: t("admin.cardReaderTokenRevoked", "Card reader token revoked") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to revoke token", variant: "destructive" });
    },
  });

  const [tokenCopied, setTokenCopied] = useState(false);
  const handleCopyToken = async () => {
    const token = cardReaderTokenData?.cardReaderToken;
    if (token) {
      try {
        await navigator.clipboard.writeText(token);
        setTokenCopied(true);
        toast({ title: t("common.success"), description: t("admin.tokenCopied", "Token copied to clipboard") });
        setTimeout(() => setTokenCopied(false), 2000);
      } catch (err) {
        toast({ title: t("common.error"), description: t("admin.failedToCopy", "Failed to copy"), variant: "destructive" });
      }
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {t("admin.cardReaderTitle", "Card Reader")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.cardReaderDescription", "API token for the insurance card reader bridge application. The bridge reads patient data from smart cards and sends it to Viali.")}
            </p>
          </div>
        </div>

        {cardReaderTokenData?.cardReaderToken ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Input
                value={cardReaderTokenData.cardReaderToken}
                readOnly
                className="flex-1 bg-background text-sm font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyToken}
              >
                {tokenCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateCardReaderTokenMutation.mutate()}
                disabled={generateCardReaderTokenMutation.isPending}
              >
                {generateCardReaderTokenMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t("admin.regenerateToken", "Regenerate Token")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => {
                  if (confirm(t("admin.revokeCardReaderTokenConfirm", "Are you sure you want to revoke this token? The card reader bridge will stop working."))) {
                    deleteCardReaderTokenMutation.mutate();
                  }
                }}
                disabled={deleteCardReaderTokenMutation.isPending}
              >
                {deleteCardReaderTokenMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                {t("admin.revokeToken", "Revoke Token")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {t("admin.noCardReaderToken", "No card reader token has been generated yet.")}
            </p>
            <Button
              size="sm"
              onClick={() => generateCardReaderTokenMutation.mutate()}
              disabled={generateCardReaderTokenMutation.isPending}
            >
              {generateCardReaderTokenMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t("admin.generateToken", "Generate Token")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
