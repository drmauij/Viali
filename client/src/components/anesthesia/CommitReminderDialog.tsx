import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

interface CommitReminderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: () => void;
  uncommittedCount: number;
  isBlocking?: boolean;
}

export function CommitReminderDialog({
  isOpen,
  onClose,
  onCommit,
  uncommittedCount,
  isBlocking = false,
}: CommitReminderDialogProps) {
  const { t } = useTranslation();

  const handleCommit = () => {
    onCommit();
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent data-testid="commit-reminder-dialog">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <AlertDialogTitle>
              {isBlocking 
                ? t('anesthesia.op.commitRequiredTitle')
                : t('anesthesia.op.commitReminderTitle')
              }
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {isBlocking ? (
              <>
                {t('anesthesia.op.commitRequiredDescription', { count: uncommittedCount })}
                <br /><br />
                <strong>{t('anesthesia.op.commitBeforeContinuing')}</strong>
              </>
            ) : (
              t('anesthesia.op.commitReminderDescription', { count: uncommittedCount })
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!isBlocking && (
            <AlertDialogCancel data-testid="button-later">
              {t('anesthesia.op.later')}
            </AlertDialogCancel>
          )}
          <AlertDialogAction onClick={handleCommit} data-testid="button-commit-now">
            {t('anesthesia.op.commitNow')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
