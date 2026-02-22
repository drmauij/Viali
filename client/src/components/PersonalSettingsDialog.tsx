import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

interface PersonalSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone?: string | null;
  currentBriefSignature?: string | null;
  currentTimebutlerUrl?: string | null;
  hasKioskPin?: boolean;
}

export default function PersonalSettingsDialog({
  open,
  onOpenChange,
  currentPhone,
  currentBriefSignature,
  currentTimebutlerUrl,
}: PersonalSettingsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(currentPhone || "");
  const [briefSignature, setBriefSignature] = useState(currentBriefSignature || "");
  const [timebutlerUrl, setTimebutlerUrl] = useState(currentTimebutlerUrl || "");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone(currentPhone || "");
      setBriefSignature(currentBriefSignature || "");
      setTimebutlerUrl(currentTimebutlerUrl || "");
    }
  }, [open, currentPhone, currentBriefSignature, currentTimebutlerUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (timebutlerUrl && !timebutlerUrl.startsWith("https://")) {
      toast({
        title: t("common.error"),
        description: t("settings.invalidUrl", "Please enter a valid HTTPS URL"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest("PATCH", "/api/user/profile", {
        phone: phone || null,
        briefSignature: briefSignature || null,
        timebutlerIcsUrl: timebutlerUrl || null,
      });

      // Invalidate user query so TopBar/other components pick up the new values
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: t("common.success"),
        description: t("settings.profileSaved", "Personal settings saved"),
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("settings.profileError", "Failed to save personal settings"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="personal-settings-dialog">
        <DialogHeader>
          <DialogTitle>{t("settings.personalSettings", "Personal Settings")}</DialogTitle>
          <DialogDescription>
            {t("settings.personalSettingsDesc", "Update your personal information and integrations.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phone */}
          <div>
            <Label htmlFor="personal-phone">{t("settings.phone", "Phone Number")}</Label>
            <Input
              id="personal-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("settings.phonePlaceholder", "+41 79 123 45 67")}
              data-testid="input-phone"
            />
          </div>

          {/* Brief Signature */}
          <div>
            <Label htmlFor="personal-brief-signature">{t("settings.briefSignature", "Brief Signature")}</Label>
            <Textarea
              id="personal-brief-signature"
              value={briefSignature}
              onChange={(e) => setBriefSignature(e.target.value)}
              placeholder={t("settings.briefSignaturePlaceholder", "Dr. M. Schmidt\nOberarzt Anaesthesie")}
              rows={3}
              data-testid="input-brief-signature"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.briefSignatureHint", "Multi-line signature block shown on discharge briefs when you sign them.")}
            </p>
          </div>

          {/* Timebutler URL */}
          <div>
            <Label htmlFor="personal-timebutler-url">{t("settings.calendarUrl", "Calendar URL")}</Label>
            <Input
              id="personal-timebutler-url"
              type="url"
              value={timebutlerUrl}
              onChange={(e) => setTimebutlerUrl(e.target.value)}
              placeholder="https://cal.timebutler.de/calexport/..."
              data-testid="input-timebutler-url"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.timebutlerUrlHint", "Find this in Timebutler: Settings -> Synchronize -> Your sync URL")}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-save-profile">
            {isLoading ? t("common.saving", "Saving...") : t("common.save", "Save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
