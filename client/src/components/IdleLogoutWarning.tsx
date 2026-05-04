import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface IdleLogoutWarningProps {
  open: boolean;
  secondsRemaining: number;
  onStay: () => void;
  onLogout: () => void;
}

/**
 * Countdown modal shown before staff sessions are auto-logged-out for inactivity.
 * The countdown text mirrors the server-side cutoff — the server is the source
 * of truth, this dialog is purely UX so the user has a chance to stay signed in.
 */
export function IdleLogoutWarning({ open, secondsRemaining, onStay, onLogout }: IdleLogoutWarningProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onStay(); }}>
      <DialogContent data-testid="idle-logout-warning">
        <DialogHeader>
          <DialogTitle>{t("auth.idleWarning.title", "About to log you out")}</DialogTitle>
          <DialogDescription>
            {t(
              "auth.idleWarning.body",
              "You've been inactive. We'll log you out in {{seconds}}s for security on shared workstations.",
              { seconds: secondsRemaining },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onLogout} data-testid="idle-logout-now">
            {t("auth.idleWarning.logoutNow", "Log out now")}
          </Button>
          <Button onClick={onStay} data-testid="idle-stay-signed-in">
            {t("auth.idleWarning.stay", "Stay signed in")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
