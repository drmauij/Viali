import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, RefreshCw, Eye, EyeOff, AlertTriangle, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface LeadConfig {
  configured: boolean;
  enabled: boolean;
  webhookUrl: string;
  conversionsUrl: string;
  hasApiKey: boolean;
  lastReceivedAt: string | null;
  createdAt: string | null;
}

export function ApiKeyCard() {
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const hospitalId = activeHospital?.id;

  const { data: config, isLoading } = useQuery<LeadConfig>({
    queryKey: [`/api/admin/${hospitalId}/lead-config`],
    enabled: !!hospitalId,
  });

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/${hospitalId}/lead-config/generate-key`);
      return res.json();
    },
    onSuccess: (data: { apiKey: string }) => {
      setGeneratedKey(data.apiKey);
      setShowKey(true);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/lead-config`] });
      toast({ title: "API key generated", description: "Copy the key now -- it will not be shown again." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate API key", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/${hospitalId}/lead-config`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/lead-config`] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to toggle webhook", variant: "destructive" });
    },
  });

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    });
  }

  if (isLoading || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-key text-blue-600"></i>
            API Key
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-key text-blue-600"></i>
            API Key
          </CardTitle>
          <div className="flex items-center gap-2">
            {config.configured ? (
              config.enabled ? (
                <Badge variant="default" className="bg-green-600">Active</Badge>
              ) : (
                <Badge variant="secondary">Disabled</Badge>
              )
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Webhook URL */}
        <div className="space-y-2">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input value={config.webhookUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(config.webhookUrl, "Webhook URL")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conversions URL */}
        <div className="space-y-2">
          <Label>Conversions URL</Label>
          <div className="flex gap-2">
            <Input value={config.conversionsUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(config.conversionsUrl, "Conversions URL")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label>API Key</Label>
          {generatedKey ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={showKey ? generatedKey : "•".repeat(32)}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(generatedKey, "API key")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-amber-600 text-xs">
                <AlertTriangle className="h-3 w-3" />
                <span>Save this key now. It will not be shown again after you leave this page.</span>
              </div>
            </div>
          ) : config.hasApiKey ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Key is set (hidden for security)</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmRegenerate(true)}
                disabled={generateKeyMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => generateKeyMutation.mutate()}
              disabled={generateKeyMutation.isPending}
              size="sm"
            >
              {generateKeyMutation.isPending ? "Generating..." : "Generate API Key"}
            </Button>
          )}
        </div>

        {/* Enable/Disable Toggle */}
        {config.configured && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Webhook Enabled</Label>
              <p className="text-xs text-muted-foreground">
                When disabled, incoming leads will be rejected with a 403 error.
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
              disabled={toggleMutation.isPending}
            />
          </div>
        )}

        {/* Last Received */}
        {config.lastReceivedAt && (
          <div className="text-sm text-muted-foreground">
            Last lead received:{" "}
            <span className="font-medium text-foreground">
              {formatDistanceToNow(new Date(config.lastReceivedAt), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Docs link */}
        <div className="pt-2 border-t">
          <a
            href="/api"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            data-testid="link-api-docs"
          >
            Full API documentation
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>

      {/* Regenerate confirmation dialog */}
      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate the current API key. Any existing integrations using the old key will stop working immediately. You will need to update them with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                generateKeyMutation.mutate();
                setConfirmRegenerate(false);
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
