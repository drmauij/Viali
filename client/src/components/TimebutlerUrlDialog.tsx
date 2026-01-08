import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TimebutlerUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUrl?: string | null;
}

export default function TimebutlerUrlDialog({ open, onOpenChange, currentUrl }: TimebutlerUrlDialogProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(currentUrl || "");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setUrl(currentUrl || "");
    }
  }, [open, currentUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (url && !url.startsWith("https://")) {
      toast({ 
        title: t('common.error'), 
        description: t('settings.invalidUrl', 'Please enter a valid HTTPS URL'), 
        variant: "destructive" 
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("PUT", "/api/user/timebutler-url", { url: url || null });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save URL");
      }

      toast({ 
        title: t('common.success'), 
        description: url 
          ? t('settings.timebutlerUrlSaved', 'Timebutler sync URL saved') 
          : t('settings.timebutlerUrlRemoved', 'Timebutler sync URL removed')
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({ 
        title: t('common.error'), 
        description: error.message || t('settings.timebutlerUrlError', 'Failed to save Timebutler URL'), 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async () => {
    setUrl("");
    setIsLoading(true);
    try {
      const response = await apiRequest("PUT", "/api/user/timebutler-url", { url: null });
      if (!response.ok) throw new Error("Failed to remove URL");
      toast({ 
        title: t('common.success'), 
        description: t('settings.timebutlerUrlRemoved', 'Timebutler sync URL removed')
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="timebutler-url-dialog">
        <DialogHeader>
          <DialogTitle>{t('settings.timebutlerSync', 'Timebutler Sync')}</DialogTitle>
          <DialogDescription>
            {t('settings.timebutlerSyncDesc', 'Enter your personal Timebutler calendar export URL to sync your absences.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="timebutler-url">{t('settings.calendarUrl', 'Calendar URL')}</Label>
            <Input
              id="timebutler-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://cal.timebutler.de/calexport/..."
              data-testid="input-timebutler-url"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.timebutlerUrlHint', 'Find this in Timebutler: Settings → Synchronize → Your sync URL')}
            </p>
          </div>

          <div className="flex gap-2">
            {currentUrl && (
              <Button 
                type="button"
                variant="outline"
                onClick={handleRemove}
                disabled={isLoading}
                className="text-destructive"
                data-testid="button-remove-timebutler-url"
              >
                {t('common.remove', 'Remove')}
              </Button>
            )}
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={isLoading}
              data-testid="button-save-timebutler-url"
            >
              {isLoading ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
