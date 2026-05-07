import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dateUtils";

export interface OpenTaskInfo {
  id: string;
  title: string;
  status: 'planned' | 'done' | 'missed' | 'cancelled';
  plannedAt: number;
  subtype?: string;
  actionHint?: string;
  note?: string;
  kind?: 'task' | 'iv_fluid';
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: OpenTaskInfo | null;
  onMarkDone: (taskId: string) => Promise<void> | void;
}

export function PostopTaskCompleteDialog({ open, onOpenChange, task, onMarkDone }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  if (!task) return null;

  const handleMark = async () => {
    setBusy(true);
    try {
      await onMarkDone(task.id);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const isDone = task.status === 'done';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            {task.subtype && task.subtype !== 'generic' && (
              <Badge variant="secondary">{task.subtype}</Badge>
            )}
            <Badge variant={isDone ? 'default' : task.status === 'missed' ? 'destructive' : 'outline'}>
              {task.status}
            </Badge>
          </div>
          <div className="text-muted-foreground">
            <span className="text-xs">{t('postopOrders.task.plannedAt', 'Planned at')}: </span>
            {formatDateTime(new Date(task.plannedAt))}
          </div>
          {task.actionHint && (
            <div>
              <div className="text-xs text-muted-foreground">{t('postopOrders.editor.actionHint', 'Action')}</div>
              <div>{task.actionHint}</div>
            </div>
          )}
          {task.note && (
            <div>
              <div className="text-xs text-muted-foreground">{t('postopOrders.editor.note', 'Note')}</div>
              <div className="whitespace-pre-wrap">{task.note}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('postopOrders.editor.cancel', 'Cancel')}
          </Button>
          {!isDone && (
            <Button onClick={handleMark} disabled={busy}>
              {t('postopOrders.task.markDone', 'Mark as done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
