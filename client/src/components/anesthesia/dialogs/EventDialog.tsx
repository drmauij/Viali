import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/hooks/useEventsQuery";

interface EventToEdit {
  id: string;
  time: number;
  description: string;
}

interface PendingEvent {
  time: number;
}

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingEvent: EventToEdit | null;
  pendingEvent: PendingEvent | null;
  onEventCreated?: () => void;
  onEventUpdated?: () => void;
  onEventDeleted?: () => void;
}

export function EventDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingEvent,
  pendingEvent,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
}: EventDialogProps) {
  const [eventTextInput, setEventTextInput] = useState("");
  const [eventEditTime, setEventEditTime] = useState<number>(Date.now());

  // Initialize mutation hooks
  const createEvent = useCreateEvent(anesthesiaRecordId || "");
  const updateEvent = useUpdateEvent(anesthesiaRecordId || "");
  const deleteEvent = useDeleteEvent(anesthesiaRecordId || "");

  // Sync editing event data to form
  useEffect(() => {
    if (editingEvent) {
      setEventTextInput(editingEvent.description);
      setEventEditTime(editingEvent.time);
    } else {
      setEventTextInput("");
      setEventEditTime(Date.now());
    }
  }, [editingEvent]);

  const handleSave = () => {
    if (!eventTextInput.trim()) return;
    if (!anesthesiaRecordId) return;

    if (editingEvent) {
      // Edit existing event
      updateEvent.mutate(
        {
          id: editingEvent.id,
          timestamp: new Date(eventEditTime),
          description: eventTextInput.trim(),
        },
        {
          onSuccess: () => {
            onEventUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingEvent) {
      // Create new event
      createEvent.mutate(
        {
          anesthesiaRecordId,
          timestamp: new Date(pendingEvent.time),
          description: eventTextInput.trim(),
        },
        {
          onSuccess: () => {
            onEventCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingEvent) return;
    if (!anesthesiaRecordId) return;

    deleteEvent.mutate(editingEvent.id, {
      onSuccess: () => {
        onEventDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setEventTextInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-event-comment">
        <DialogHeader>
          <DialogTitle>{editingEvent ? "Edit Event" : "Add Event"}</DialogTitle>
          <DialogDescription>
            {editingEvent ? "Edit or delete the event comment" : "Add an event to the timeline"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="event-text">Event Comment</Label>
            <Textarea
              id="event-text"
              data-testid="input-event-text"
              value={eventTextInput}
              onChange={(e) => setEventTextInput(e.target.value)}
              placeholder="Enter event description..."
              rows={4}
              autoFocus
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={editingEvent ? eventEditTime : pendingEvent?.time}
          onTimeChange={setEventEditTime}
          showDelete={!!editingEvent}
          onDelete={editingEvent ? handleDelete : undefined}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!eventTextInput.trim()}
          saveLabel={editingEvent ? "Save" : "Add"}
        />
      </DialogContent>
    </Dialog>
  );
}
