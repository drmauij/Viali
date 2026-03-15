import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Trash2, Eye, EyeOff, MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/dateUtils";

export function AspsmsIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [aspsmsUserKey, setAspsmsUserKey] = useState("");
  const [aspsmsPassword, setAspsmsPassword] = useState("");
  const [aspsmsOriginator, setAspsmsOriginator] = useState("");
  const [aspsmsEnabled, setAspsmsEnabled] = useState(false);
  const [showUserKey, setShowUserKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [showTestDialog, setShowTestDialog] = useState(false);

  // ASPSMS config query
  const { data: aspsmsConfigData, isLoading: aspsmsLoading } = useQuery<{
    hospitalId: string;
    isEnabled?: boolean;
    hasUserKey?: boolean;
    hasPassword?: boolean;
    originator?: string | null;
    lastTestedAt?: string;
    lastTestStatus?: string;
    lastTestError?: string;
  }>({
    queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`],
    enabled: !!hospitalId,
  });

  // Credits query
  const { data: creditsData, refetch: refetchCredits } = useQuery<{ credits: string; statusInfo: string }>({
    queryKey: [`/api/admin/${hospitalId}/integrations/aspsms/credits`],
    enabled: !!hospitalId && !!aspsmsConfigData?.hasUserKey && !!aspsmsConfigData?.hasPassword,
  });

  // Sync state when data is fetched
  useEffect(() => {
    if (aspsmsConfigData) {
      setAspsmsEnabled(aspsmsConfigData.isEnabled || false);
    }
  }, [aspsmsConfigData]);

  // Save config mutation
  const saveAspsmsConfigMutation = useMutation({
    mutationFn: async (data: { userKey?: string; password?: string; originator?: string; isEnabled: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/${hospitalId}/integrations/aspsms`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms/credits`] });
      toast({ title: t("common.success"), description: "ASPSMS configuration saved" });
      setAspsmsUserKey("");
      setAspsmsPassword("");
      setAspsmsOriginator("");
      setShowUserKey(false);
      setShowPassword(false);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to save ASPSMS configuration", variant: "destructive" });
    },
  });

  // Test mutation
  const testAspsmsMutation = useMutation({
    mutationFn: async (testNumber?: string) => {
      const response = await apiRequest("POST", `/api/admin/${hospitalId}/integrations/aspsms/test`, { testPhoneNumber: testNumber });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: "Test SMS sent successfully! Check your phone." });
      setShowTestDialog(false);
      setTestPhoneNumber("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`] });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to send test SMS", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteAspsmsConfigMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/admin/${hospitalId}/integrations/aspsms`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms/credits`] });
      toast({ title: t("common.success"), description: "ASPSMS configuration removed" });
      setAspsmsEnabled(false);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to remove ASPSMS configuration", variant: "destructive" });
    },
  });

  if (!hospitalId) return null;

  const isConfigured = aspsmsConfigData?.hasUserKey && aspsmsConfigData?.hasPassword;

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">ASPSMS</h3>
              <p className="text-sm text-muted-foreground">Send SMS messages via ASPSMS with custom sender name</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={aspsmsEnabled}
              onCheckedChange={(checked) => {
                setAspsmsEnabled(checked);
                saveAspsmsConfigMutation.mutate({ isEnabled: checked });
              }}
              disabled={saveAspsmsConfigMutation.isPending || !isConfigured}
            />
            <span className={`text-sm ${aspsmsEnabled && isConfigured ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {aspsmsEnabled && isConfigured ? t("common.enabled", "Enabled") : t("common.disabled", "Disabled")}
            </span>
          </div>
        </div>

        {aspsmsLoading ? (
          <div className="text-center py-4">
            <i className="fas fa-spinner fa-spin text-xl text-primary"></i>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Status */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{t("admin.status", "Status")}:</span>
              {isConfigured ? (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <i className="fas fa-check-circle"></i>
                  Credentials configured
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <i className="fas fa-exclamation-triangle"></i>
                  Credentials not configured
                </span>
              )}
            </div>

            {/* Credits Display */}
            {isConfigured && creditsData && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Credits:</span>
                <span className="font-medium text-foreground">{creditsData.credits}</span>
                <Button variant="ghost" size="sm" onClick={() => refetchCredits()} className="h-6 px-2">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}

            {aspsmsConfigData?.lastTestedAt && (
              <div className="text-sm text-muted-foreground">
                <span>Last test:</span>{" "}
                <span>{formatDateTime(aspsmsConfigData.lastTestedAt)}</span>
                {aspsmsConfigData.lastTestStatus === 'success' ? (
                  <span className="ml-2 text-green-500">✓ Success</span>
                ) : aspsmsConfigData.lastTestStatus === 'failed' ? (
                  <span className="ml-2 text-red-500">✗ Failed{aspsmsConfigData.lastTestError ? `: ${aspsmsConfigData.lastTestError}` : ''}</span>
                ) : null}
              </div>
            )}

            {/* Credentials Form */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <Label htmlFor="aspsms-user-key">UserKey</Label>
                <div className="flex gap-2">
                  <Input
                    id="aspsms-user-key"
                    type={showUserKey ? "text" : "password"}
                    value={aspsmsUserKey}
                    onChange={(e) => setAspsmsUserKey(e.target.value)}
                    placeholder={aspsmsConfigData?.hasUserKey ? "••••••••" : "Enter UserKey"}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setShowUserKey(!showUserKey)}>
                    {showUserKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="aspsms-password">API Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="aspsms-password"
                    type={showPassword ? "text" : "password"}
                    value={aspsmsPassword}
                    onChange={(e) => setAspsmsPassword(e.target.value)}
                    placeholder={aspsmsConfigData?.hasPassword ? "••••••••" : "Enter API Password"}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="aspsms-originator">Originator (Sender Name)</Label>
                <Input
                  id="aspsms-originator"
                  type="text"
                  value={aspsmsOriginator}
                  onChange={(e) => setAspsmsOriginator(e.target.value.substring(0, 11))}
                  placeholder={aspsmsConfigData?.originator || "Clinic name (max 11 chars)"}
                  maxLength={11}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sender name shown on the SMS (max 11 alphanumeric characters). Defaults to hospital name if empty.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTestDialog(true)}
                  disabled={testAspsmsMutation.isPending || !isConfigured}
                >
                  {testAspsmsMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Test SMS
                </Button>
                <Button
                  onClick={() => {
                    const shouldAutoEnable = !isConfigured && (aspsmsUserKey || aspsmsPassword);
                    const enabled = shouldAutoEnable ? true : aspsmsEnabled;
                    if (shouldAutoEnable) setAspsmsEnabled(true);
                    saveAspsmsConfigMutation.mutate({
                      userKey: aspsmsUserKey || undefined,
                      password: aspsmsPassword || undefined,
                      originator: aspsmsOriginator || undefined,
                      isEnabled: enabled,
                    });
                  }}
                  disabled={saveAspsmsConfigMutation.isPending || (!aspsmsUserKey && !aspsmsPassword && !aspsmsOriginator)}
                >
                  {saveAspsmsConfigMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-save mr-2"></i>}
                  {t("common.save", "Save")}
                </Button>
                {isConfigured && (
                  <Button
                    variant="destructive"
                    onClick={() => deleteAspsmsConfigMutation.mutate()}
                    disabled={deleteAspsmsConfigMutation.isPending}
                  >
                    {deleteAspsmsConfigMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <Trash2 className="h-4 w-4 mr-2" />}
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <h4 className="font-medium mb-2">How to set up ASPSMS</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Create an ASPSMS account at <a href="https://www.aspsms.ch" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aspsms.ch</a></li>
                <li>Find your UserKey and API Password in your ASPSMS account settings</li>
                <li>Enter your credentials above and set a sender name (originator)</li>
                <li>Use the "Test SMS" button to verify the configuration</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>Note:</strong> SMS messages will show the originator name as sender. Standard ASPSMS credit rates apply.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Test SMS Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test SMS (ASPSMS)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="aspsms-test-phone">Phone Number</Label>
              <PhoneInputWithCountry
                id="aspsms-test-phone"
                value={testPhoneNumber}
                onChange={(value) => setTestPhoneNumber(value)}
                placeholder="791234567"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter a phone number to receive the test SMS.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => testAspsmsMutation.mutate(testPhoneNumber || undefined)}
                disabled={testAspsmsMutation.isPending || !testPhoneNumber}
              >
                {testAspsmsMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                Send Test
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
