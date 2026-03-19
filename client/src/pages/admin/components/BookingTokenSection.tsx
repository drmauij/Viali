import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Link as LinkIcon, RefreshCw, Trash2, ExternalLink } from "lucide-react";

export function BookingTokenSection({ hospitalId, isAdmin }: { hospitalId: string | undefined; isAdmin: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [slotDuration, setSlotDuration] = useState<string>("30");
  const [maxDays, setMaxDays] = useState<string>("90");
  const [minHours, setMinHours] = useState<string>("2");
  const [enableReferral, setEnableReferral] = useState(false);

  const { data: tokenData } = useQuery<{ bookingToken: string | null; bookingSettings: any; enableReferralOnBooking?: boolean }>({
    queryKey: [`/api/admin/${hospitalId}/booking-token`],
    enabled: !!hospitalId && isAdmin,
  });

  useEffect(() => {
    if (tokenData?.bookingSettings) {
      const s = tokenData.bookingSettings;
      if (s.slotDurationMinutes) setSlotDuration(String(s.slotDurationMinutes));
      if (s.maxAdvanceDays) setMaxDays(String(s.maxAdvanceDays));
      if (s.minAdvanceHours) setMinHours(String(s.minAdvanceHours));
    }
    if (tokenData?.enableReferralOnBooking !== undefined) setEnableReferral(tokenData.enableReferralOnBooking);
  }, [tokenData?.bookingSettings, tokenData?.enableReferralOnBooking]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/${hospitalId}/booking-token/generate`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/booking-token`] });
      toast({ title: t("common.success"), description: "Booking link generated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/${hospitalId}/booking-token`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/booking-token`] });
      toast({ title: t("common.success"), description: "Booking link disabled" });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/${hospitalId}/booking-settings`, {
        slotDurationMinutes: parseInt(slotDuration) || 30,
        maxAdvanceDays: parseInt(maxDays) || 90,
        minAdvanceHours: parseInt(minHours) || 2,
        enableReferralOnBooking: enableReferral,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/booking-token`] });
      toast({ title: t("common.success"), description: "Settings saved" });
    },
  });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const bookingUrl = tokenData?.bookingToken ? `${baseUrl}/book/${tokenData.bookingToken}` : null;

  const handleCopy = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              Patient Booking Page
            </h3>
            <p className="text-sm text-muted-foreground">
              Public booking page where patients can schedule appointments with bookable providers
            </p>
          </div>
        </div>

        {tokenData?.bookingToken ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Input
                value={bookingUrl || ""}
                readOnly
                className="flex-1 bg-background text-sm font-mono"
              />
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <RefreshCw className="h-4 w-4 mr-2" />}
                Regenerate Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => {
                  if (confirm("Are you sure you want to disable the booking link? Patients won't be able to book appointments online.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <Trash2 className="h-4 w-4 mr-2" />}
                Disable Link
              </Button>
            </div>

            {/* Booking Settings — always visible */}
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
              <h4 className="text-sm font-medium">Booking Settings</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Slot Duration (min)</Label>
                  <Input
                    type="number"
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(e.target.value)}
                    min={5}
                    max={120}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Advance (days)</Label>
                  <Input
                    type="number"
                    value={maxDays}
                    onChange={(e) => setMaxDays(e.target.value)}
                    min={1}
                    max={365}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Min Advance (hours)</Label>
                  <Input
                    type="number"
                    value={minHours}
                    onChange={(e) => setMinHours(e.target.value)}
                    min={0}
                    max={168}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableReferral"
                  checked={enableReferral}
                  onChange={(e) => setEnableReferral(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="enableReferral" className="text-xs text-muted-foreground">
                  Ask patients how they found you when booking
                </Label>
              </div>
              <Button size="sm" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                {saveSettingsMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                Save Settings
              </Button>
            </div>

          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              No booking link has been generated yet.
            </p>
            <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <LinkIcon className="h-4 w-4 mr-2" />}
              Generate Link
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
