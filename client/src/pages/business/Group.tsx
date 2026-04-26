import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { uploadLogo } from "@/lib/uploadLogo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChainTeamSection } from "@/pages/chain/Team";
import { ServicesCatalog } from "@/pages/clinic/Services";
import Branding from "@/pages/admin/Branding";
import { useTranslation } from "react-i18next";
import { Copy, Check, RefreshCw } from "lucide-react";
import type { BookingTheme } from "@shared/schema";

/**
 * `/chain/admin` — chain settings page (chain name + logo).
 *
 * Phase A originally shipped this with three tabs: Settings, Shortcuts,
 * and Admins. After Phases C and D added dedicated pages for those
 * concerns (`/chain/funnels`, `/chain/flows`, `/chain/locations`,
 * `/chain/team`), the Shortcuts and Admins tabs became redundant and
 * were removed — this page is now strictly chain-level settings.
 *
 * Platform-admin-only actions (rename group, add/remove member hospitals,
 * regenerate booking token) still live in `/platform/groups`.
 */

type Overview = {
  group: {
    id: string;
    name: string;
    bookingToken: string | null;
    logoUrl: string | null;
    bookingTheme: BookingTheme | null;
  };
  members: Array<{ id: string; name: string; address: string | null }>;
  counts: {
    patientCount: number;
    treatmentsThisMonth: number;
    bookingsThisWeek: number;
  };
};


export default function BusinessGroup() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();

  const { data: overview, isLoading: overviewLoading, error: overviewError } =
    useQuery<Overview>({
      queryKey: ["/api/business/group/overview"],
      queryFn: () =>
        apiRequest("GET", "/api/business/group/overview").then((r) => r.json()),
      enabled: !!activeHospital?.id,
    });

  const saveSettings = useMutation({
    mutationFn: async (vars: { name?: string; logoUrl?: string | null }) => {
      const res = await apiRequest(
        "PATCH",
        "/api/business/group/settings",
        vars,
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/business/group/overview"] });
      toast({ title: "Chain settings saved" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save settings",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (overviewLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"
          data-testid="loading-spinner"
        />
      </div>
    );
  }

  if (overviewError || !overview) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Chain settings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          You don&apos;t have chain admin access for the active location, or
          this location isn&apos;t part of a chain yet. Contact Viali support if
          you believe this is a mistake.
        </p>
      </div>
    );
  }

  const { group } = overview;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="business-group-page">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">{t("chain.admin.title", "Settings")}</h1>
        <p className="text-muted-foreground mt-1">
          {t(
            "chain.admin.subtitle",
            "Chain-wide settings, booking link, team, and shared services",
          )}
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings" data-testid="tab-chain-settings">Settings</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-chain-team">Team</TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-chain-services">Services</TabsTrigger>
          <TabsTrigger value="booking" data-testid="tab-chain-booking">Booking</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <ChainSettingsForm
            group={group}
            onSave={(patch) => saveSettings.mutate(patch)}
            saving={saveSettings.isPending}
          />
        </TabsContent>

        <TabsContent value="team">
          <ChainTeamSection />
        </TabsContent>

        <TabsContent value="services">
          <ServicesCatalog forceCatalogScope="group" />
        </TabsContent>

        <TabsContent value="booking" className="space-y-6">
          <ChainBookingTokenCard
            groupId={group.id}
            bookingToken={group.bookingToken}
          />
          <Branding scope={{ kind: "group", id: group.id }} initialTheme={group.bookingTheme ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Chain Settings form (Settings tab). Compresses + uploads the logo to S3
// (`/api/public/logos/group/<uuid>.jpg`) and stores the URL on the group;
// existing data-URL logos in the DB still render fine.

function ChainSettingsForm({
  group,
  onSave,
  saving,
}: {
  group: { id: string; name: string; logoUrl: string | null };
  onSave: (patch: { name?: string; logoUrl?: string | null }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(group.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(group.logoUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Re-sync if the parent refetches with new data (e.g. after save).
  useEffect(() => {
    setName(group.name);
    setLogoUrl(group.logoUrl);
  }, [group.id, group.name, group.logoUrl]);

  const dirty = name.trim() !== group.name || logoUrl !== group.logoUrl;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Please pick an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image too large (max 5 MB).");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadLogo(file, "group");
      setLogoUrl(url);
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium block">Logo</label>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 border rounded flex items-center justify-center bg-muted overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Chain logo"
                className="w-full h-full object-contain"
                data-testid="chain-logo-thumb"
              />
            ) : (
              <span className="text-xs text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept="image/*"
                id="chain-logo-upload"
                className="hidden"
                onChange={handleFile}
                data-testid="chain-logo-input"
              />
              <label htmlFor="chain-logo-upload">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  data-testid="chain-logo-upload-btn"
                >
                  <span>{uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}</span>
                </Button>
              </label>
              {logoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLogoUrl(null)}
                  data-testid="chain-logo-remove-btn"
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG or JPG, max 5 MB. Compressed to 400×400 before upload.
            </p>
            {uploadError && (
              <p className="text-xs text-destructive">{uploadError}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium block" htmlFor="chain-name-input">
          Chain name
        </label>
        <Input
          id="chain-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-sm"
          data-testid="chain-name-input"
        />
      </div>

      <div className="flex gap-2">
        <Button
          disabled={!dirty || !name.trim() || saving}
          onClick={() => {
            const patch: { name?: string; logoUrl?: string | null } = {};
            if (name.trim() !== group.name) patch.name = name.trim();
            if (logoUrl !== group.logoUrl) patch.logoUrl = logoUrl;
            onSave(patch);
          }}
          data-testid="chain-settings-save"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setName(group.name);
              setLogoUrl(group.logoUrl);
              setUploadError(null);
            }}
            data-testid="chain-settings-reset"
          >
            Reset
          </Button>
        )}
      </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------
// Chain booking link — shows the public /book/g/<token> URL, with
// copy-to-clipboard and a regenerate button. Regenerating invalidates the
// previous URL immediately, so we confirm before doing it.
// ----------------------------------------------------------------------
function ChainBookingTokenCard({
  groupId,
  bookingToken,
}: {
  groupId: string;
  bookingToken: string | null;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirmingRegen, setConfirmingRegen] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const url = bookingToken ? `${baseUrl}/book/g/${bookingToken}` : null;

  const regenerate = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/business/group/booking-token").then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/business/group/overview"] });
      setConfirmingRegen(false);
      toast({ title: t("chain.admin.bookingTokenRegenerated", "Booking link regenerated") });
    },
    onError: (err: Error) =>
      toast({
        title: t("common.error", "Error"),
        description: err.message,
        variant: "destructive",
      }),
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: t("common.error", "Error"), description: t("chain.admin.copyFailed", "Could not copy"), variant: "destructive" });
    }
  };

  return (
    <Card data-testid="chain-booking-token-card">
      <CardContent className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-medium">{t("chain.admin.bookingLinkTitle", "Chain booking link")}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "chain.admin.bookingLinkHelp",
              "Public booking page that lists every clinic in the chain. Share this URL with patients or embed it on your website.",
            )}
          </p>
        </div>

        {url ? (
          <div className="flex items-center gap-2">
            <Input value={url} readOnly className="font-mono text-xs" data-testid="chain-booking-token-input" />
            <Button
              variant="outline"
              size="icon"
              onClick={copy}
              title={t("common.copy", "Copy")}
              data-testid="chain-booking-token-copy"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("chain.admin.noBookingToken", "No booking link yet. Click Generate to create one.")}
          </p>
        )}

        {!confirmingRegen ? (
          <Button
            variant={url ? "ghost" : "default"}
            size="sm"
            onClick={() => (url ? setConfirmingRegen(true) : regenerate.mutate())}
            disabled={regenerate.isPending}
            data-testid="chain-booking-token-regen"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {url
              ? t("chain.admin.regenerateBookingToken", "Regenerate")
              : t("chain.admin.generateBookingToken", "Generate")}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 border border-dashed rounded p-3">
            <p className="text-xs">
              {t(
                "chain.admin.regenerateConfirm",
                "Regenerating will break the existing URL immediately. Anyone with the old link will see a 'not found' page. Continue?",
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
                data-testid="chain-booking-token-regen-confirm"
              >
                {regenerate.isPending
                  ? t("common.saving", "Saving…")
                  : t("chain.admin.regenerateBookingToken", "Regenerate")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingRegen(false)}
                disabled={regenerate.isPending}
              >
                {t("common.cancel", "Cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
