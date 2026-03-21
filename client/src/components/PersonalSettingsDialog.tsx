import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2, Loader2 } from "lucide-react";

interface PersonalSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone?: string | null;
  currentBriefSignature?: string | null;
  currentTimebutlerUrl?: string | null;
  currentProfileImageUrl?: string | null;
  hasKioskPin?: boolean;
}

export default function PersonalSettingsDialog({
  open,
  onOpenChange,
  currentPhone,
  currentBriefSignature,
  currentTimebutlerUrl,
  currentProfileImageUrl,
}: PersonalSettingsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(currentPhone || "");
  const [briefSignature, setBriefSignature] = useState(currentBriefSignature || "");
  const [timebutlerUrl, setTimebutlerUrl] = useState(currentTimebutlerUrl || "");
  const [isLoading, setIsLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [pendingImageStorageKey, setPendingImageStorageKey] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPhone(currentPhone || "");
      setBriefSignature(currentBriefSignature || "");
      setTimebutlerUrl(currentTimebutlerUrl || "");
      setPendingImageStorageKey(null);
      setRemoveImage(false);
      // Show existing image if available
      if (currentProfileImageUrl) {
        setProfileImagePreview(`/api/user/profile-image?t=${Date.now()}`);
      } else {
        setProfileImagePreview(null);
      }
    }
  }, [open, currentPhone, currentBriefSignature, currentTimebutlerUrl, currentProfileImageUrl]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      toast({ title: t("common.error"), description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("common.error"), description: "Image must be under 5MB", variant: "destructive" });
      return;
    }

    setImageUploading(true);
    try {
      // Get signed upload URL
      const urlRes = await fetch('/api/user/profile-image/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, storageKey } = await urlRes.json();

      // Upload to S3
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!s3Res.ok) throw new Error('Failed to upload image');

      // Show preview and store key for save
      setProfileImagePreview(URL.createObjectURL(file));
      setPendingImageStorageKey(storageKey);
      setRemoveImage(false);
    } catch (error) {
      console.error('Error uploading profile image:', error);
      toast({ title: t("common.error"), description: "Failed to upload image", variant: "destructive" });
    } finally {
      setImageUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setProfileImagePreview(null);
    setPendingImageStorageKey(null);
    setRemoveImage(true);
  };

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
      const profileData: Record<string, any> = {
        phone: phone || null,
        briefSignature: briefSignature || null,
        timebutlerIcsUrl: timebutlerUrl || null,
      };

      // Include image changes
      if (pendingImageStorageKey) {
        profileData.profileImageUrl = pendingImageStorageKey;
      } else if (removeImage) {
        profileData.profileImageUrl = null;
      }

      await apiRequest("PATCH", "/api/user/profile", profileData);

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

  const hasImage = profileImagePreview && !removeImage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="personal-settings-dialog" className="max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("settings.personalSettings", "Personal Settings")}</DialogTitle>
          <DialogDescription>
            {t("settings.personalSettingsDesc", "Update your personal information and integrations.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-2">
          {/* Profile Image */}
          <div>
            <Label>{t("settings.profileImage", "Profile Image")}</Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t("settings.profileImageHint", "Shown on your public booking page")}
            </p>
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                {hasImage ? (
                  <img
                    src={profileImagePreview!}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover border"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                {imageUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageUploading}
                >
                  {hasImage ? t("common.change", "Change") : t("common.upload", "Upload")}
                </Button>
                {hasImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t("common.remove", "Remove")}
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
            </div>
          </div>

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
