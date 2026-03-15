import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Link as LinkIcon, RefreshCw, Trash2, Settings, ExternalLink } from "lucide-react";

export function BookingTokenSection({ hospitalId, isAdmin }: { hospitalId: string | undefined; isAdmin: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedProviderId, setCopiedProviderId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showProviderLinks, setShowProviderLinks] = useState(false);
  const [slotDuration, setSlotDuration] = useState<string>("30");
  const [maxDays, setMaxDays] = useState<string>("90");
  const [minHours, setMinHours] = useState<string>("2");

  const { data: tokenData } = useQuery<{ bookingToken: string | null; bookingSettings: any }>({
    queryKey: [`/api/admin/${hospitalId}/booking-token`],
    enabled: !!hospitalId && isAdmin,
  });

  // Fetch bookable providers to show per-provider links
  const { data: bookableProviders } = useQuery<any[]>({
    queryKey: [`/api/clinic/${hospitalId}/bookable-providers`],
    enabled: !!hospitalId && isAdmin && !!tokenData?.bookingToken,
  });

  // Fetch all clinic providers to allow toggling visibility
  const { data: allProviders } = useQuery<any[]>({
    queryKey: [`/api/clinic/${hospitalId}/clinic-providers`],
    enabled: !!hospitalId && isAdmin && !!tokenData?.bookingToken,
  });

  // Mutation to update provider booking settings
  const updateProviderMutation = useMutation({
    mutationFn: async ({ userId, isBookable, bookingServiceName, bookingLocation }: { userId: string; isBookable: boolean; bookingServiceName?: string; bookingLocation?: string }) => {
      return apiRequest('PUT', `/api/clinic/${hospitalId}/clinic-providers/${userId}`, {
        isBookable,
        bookingServiceName,
        bookingLocation,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0];
        return typeof k === 'string' && (k.includes('/clinic-providers') || k.includes('/bookable-providers'));
      }});
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update provider', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (tokenData?.bookingSettings) {
      const s = tokenData.bookingSettings;
      if (s.slotDurationMinutes) setSlotDuration(String(s.slotDurationMinutes));
      if (s.maxAdvanceDays) setMaxDays(String(s.maxAdvanceDays));
      if (s.minAdvanceHours) setMinHours(String(s.minAdvanceHours));
    }
  }, [tokenData?.bookingSettings]);

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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/booking-token`] });
      toast({ title: t("common.success"), description: "Settings saved" });
      setShowSettings(false);
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
              <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
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

            {/* Settings panel */}
            {showSettings && (
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
                <Button size="sm" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                  {saveSettingsMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Save Settings
                </Button>
              </div>
            )}

            {/* Per-provider settings and direct links */}
            {allProviders && allProviders.length > 0 && (
              <div>
                <button
                  onClick={() => setShowProviderLinks(!showProviderLinks)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  {showProviderLinks ? "▾" : "▸"} Direct links per provider ({bookableProviders?.length || 0})
                </button>
                {showProviderLinks && (
                  <div className="mt-2 space-y-3">
                    {allProviders.map((p: any) => {
                      const providerUrl = `${bookingUrl}?provider=${p.userId}`;
                      const isCopied = copiedProviderId === p.userId;
                      const isBookable = p.isBookable ?? false;
                      return (
                        <div key={p.userId} className={`p-3 rounded-lg border ${isBookable ? 'bg-muted/50 border-border' : 'bg-transparent border-dashed border-muted'}`}>
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isBookable}
                              onCheckedChange={(checked) => {
                                updateProviderMutation.mutate({
                                  userId: p.userId,
                                  isBookable: !!checked,
                                  bookingServiceName: p.bookingServiceName || undefined,
                                  bookingLocation: p.bookingLocation || undefined,
                                });
                              }}
                            />
                            <span className={`text-sm font-medium flex-1 truncate ${!isBookable ? 'text-muted-foreground' : ''}`}>
                              {p.user?.firstName} {p.user?.lastName}
                            </span>
                            {isBookable && (
                              <>
                                <Input
                                  value={providerUrl}
                                  readOnly
                                  className="max-w-[220px] bg-background text-xs font-mono h-7"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 shrink-0"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(providerUrl);
                                      setCopiedProviderId(p.userId);
                                      setTimeout(() => setCopiedProviderId(null), 2000);
                                    } catch { /* ignore */ }
                                  }}
                                >
                                  {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                </Button>
                              </>
                            )}
                          </div>
                          {isBookable && (
                            <div className="mt-2 ml-8 grid grid-cols-2 gap-2">
                              <Input
                                placeholder="Service (e.g. Plastische Chirurgie Beratung)"
                                defaultValue={p.bookingServiceName || ''}
                                className="h-7 text-xs"
                                onBlur={(e) => {
                                  if (e.target.value !== (p.bookingServiceName || '')) {
                                    updateProviderMutation.mutate({
                                      userId: p.userId,
                                      isBookable: true,
                                      bookingServiceName: e.target.value,
                                      bookingLocation: p.bookingLocation || undefined,
                                    });
                                  }
                                }}
                              />
                              <Input
                                placeholder="Location (e.g. Gaissbergstr. 45)"
                                defaultValue={p.bookingLocation || ''}
                                className="h-7 text-xs"
                                onBlur={(e) => {
                                  if (e.target.value !== (p.bookingLocation || '')) {
                                    updateProviderMutation.mutate({
                                      userId: p.userId,
                                      isBookable: true,
                                      bookingServiceName: p.bookingServiceName || undefined,
                                      bookingLocation: e.target.value,
                                    });
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
