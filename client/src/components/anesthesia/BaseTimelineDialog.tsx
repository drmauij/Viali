import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";

interface BaseTimelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  className?: string;
  testId?: string;
  time?: number;
  onTimeChange?: (time: number) => void;
  onSave?: () => void;
  onDelete?: () => void;
  onCancel: () => void;
  saveDisabled?: boolean;
  showDelete?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  children: React.ReactNode;
}

export function BaseTimelineDialog({
  open,
  onOpenChange,
  title,
  description,
  className = "sm:max-w-[425px]",
  testId,
  time,
  onTimeChange,
  onSave,
  onDelete,
  onCancel,
  saveDisabled = false,
  showDelete = false,
  saveLabel,
  cancelLabel,
  children,
}: BaseTimelineDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className} data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooterWithTime
          time={time}
          onTimeChange={onTimeChange}
          showDelete={showDelete}
          onDelete={onDelete}
          onCancel={onCancel}
          onSave={onSave}
          saveDisabled={saveDisabled}
          saveLabel={saveLabel}
          cancelLabel={cancelLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
