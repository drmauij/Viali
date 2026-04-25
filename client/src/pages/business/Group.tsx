import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";

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
  };
  members: Array<{ id: string; name: string; address: string | null }>;
  counts: {
    patientCount: number;
    treatmentsThisMonth: number;
    bookingsThisWeek: number;
  };
};


export default function BusinessGroup() {
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
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Chain name and logo for {group.name}.
        </p>
      </div>

      <ChainSettingsForm
        group={group}
        onSave={(patch) => saveSettings.mutate(patch)}
        saving={saveSettings.isPending}
      />

      <section className="border border-dashed rounded p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-medium text-foreground">Looking for something else?</div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Add, edit, or archive clinics → <span className="font-mono">/chain/locations</span></li>
          <li>Manage chain admins and view staff → <span className="font-mono">/chain/team</span></li>
          <li>
            Renaming the group or regenerating the booking token are platform-admin
            actions; contact Viali support if you need those.
          </li>
        </ul>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// Chain Settings form (Settings tab). Lets a group admin edit the chain's
// name and upload/remove its logo. Logo handling mirrors the per-clinic
// Settings flow (client/src/pages/admin/Settings.tsx): 400×400 JPEG
// compression via canvas, stored as a data URL.
// ----------------------------------------------------------------------
async function compressChainLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxSize = 400;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas 2d unavailable"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
    try {
      const dataUrl = await compressChainLogo(file);
      setLogoUrl(dataUrl);
    } catch {
      setUploadError("Compression failed.");
    }
  };

  return (
    <section className="border rounded p-4 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-medium">Chain settings</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Edit your chain's name and logo. Changes apply to every clinic
          in the chain.
        </p>
      </div>

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
                  <span>{logoUrl ? "Replace" : "Upload"}</span>
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
    </section>
  );
}
