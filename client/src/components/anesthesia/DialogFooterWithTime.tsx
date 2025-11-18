import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { TimeAdjustInput } from "./TimeAdjustInput";

interface DialogFooterWithTimeProps {
  time?: number;
  onTimeChange?: (newTime: number) => void;
  onDelete?: () => void;
  onCancel: () => void;
  onSave: () => void;
  showDelete?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
}

export function DialogFooterWithTime({
  time,
  onTimeChange,
  onDelete,
  onCancel,
  onSave,
  showDelete = false,
  saveDisabled = false,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
}: DialogFooterWithTimeProps) {
  return (
    <div className="flex items-center justify-between gap-2 pt-4">
      {/* Left: Time navigation (compact) */}
      <div className="flex items-center gap-1">
        {time !== undefined && onTimeChange && (
          <TimeAdjustInput
            value={time}
            onChange={onTimeChange}
            data-testid="footer-time-input"
          />
        )}
      </div>
      
      {/* Right: Delete and Save buttons */}
      <div className="flex gap-2 ml-auto">
        {showDelete && onDelete && (
          <Button
            variant="destructive"
            size="icon"
            onClick={onDelete}
            data-testid="button-delete"
            className="h-9 w-9"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
        <Button
          onClick={() => {
            console.log('[BUTTON] Save button clicked in DialogFooterWithTime');
            onSave();
          }}
          data-testid="button-save"
          disabled={saveDisabled}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
