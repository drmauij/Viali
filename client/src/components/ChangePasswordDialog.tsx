import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  required?: boolean;
}

export default function ChangePasswordDialog({ open, onOpenChange, required = false }: ChangePasswordDialogProps) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({ 
        title: t('common.error'), 
        description: t('auth.passwordMismatch'), 
        variant: "destructive" 
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({ 
        title: t('common.error'), 
        description: t('auth.passwordTooShort'), 
        variant: "destructive" 
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword,
        newPassword
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to change password");
      }

      toast({ 
        title: t('common.success'), 
        description: t('auth.passwordChangeSuccess') 
      });

      // Reset form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Reload the page to refresh user state
      window.units?.href = "/";
    } catch (error: any) {
      toast({ 
        title: t('common.error'), 
        description: error.message || t('auth.passwordChangeError'), 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={required ? undefined : onOpenChange}>
      <DialogContent 
        data-testid="change-password-dialog"
        onInteractOutside={required ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={required ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {t('auth.changePassword')}
          </DialogTitle>
        </DialogHeader>
        
        {required && (
          <p className="text-sm text-muted-foreground mb-4">
            {t('auth.passwordChangeRequired')}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="current-password">{t('auth.currentPassword')}</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              data-testid="current-password-input"
            />
          </div>

          <div>
            <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              data-testid="new-password-input"
            />
          </div>

          <div>
            <Label htmlFor="confirm-password">{t('auth.confirmPassword')}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              data-testid="confirm-password-input"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
            data-testid="submit-password-change"
          >
            {isLoading ? t('auth.changingPassword') : t('auth.changePassword')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
