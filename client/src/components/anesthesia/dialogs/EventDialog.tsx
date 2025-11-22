import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/hooks/useEventsQuery";
import { COMMON_EVENTS } from "@/constants/commonEvents";

interface EventToEdit {
  id: string;
  time: number;
  text: string;
  eventType?: string | null;
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
  const [eventType, setEventType] = useState<string | null>(null);

  // Initialize mutation hooks
  const createEvent = useCreateEvent(anesthesiaRecordId || "");
  const updateEvent = useUpdateEvent(anesthesiaRecordId || "");
  const deleteEvent = useDeleteEvent(anesthesiaRecordId || "");

  // Sync editing event data to form
  useEffect(() => {
    if (editingEvent) {
      setEventTextInput(editingEvent.text);
      setEventEditTime(editingEvent.time);
      setEventType(editingEvent.eventType || null);
    } else {
      setEventTextInput("");
      setEventEditTime(Date.now());
      setEventType(null);
    }
  }, [editingEvent]);

  const handleSave = () => {
    if (!eventTextInput?.trim()) return;
    if (!anesthesiaRecordId) return;

    if (editingEvent) {
      // Edit existing event - preserve the original eventType
      updateEvent.mutate(
        {
          id: editingEvent.id,
          timestamp: new Date(eventEditTime).toISOString(),
          description: eventTextInput.trim(),
          eventType: eventType, // Preserve icon type
        },
        {
          onSuccess: () => {
            onEventUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingEvent) {
      // Create new event - manual entry always has null eventType
      createEvent.mutate(
        {
          anesthesiaRecordId,
          timestamp: new Date(pendingEvent.time).toISOString(),
          description: eventTextInput.trim(),
          eventType: null, // Manual entries have no icon type
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

  const handleQuickEvent = (eventLabel: string, eventType: string) => {
    if (!anesthesiaRecordId || !pendingEvent) {
      // Fallback: just fill the text input if we can't save immediately
      setEventTextInput(eventLabel);
      return;
    }

    // Immediately save the common event with ISO string timestamp
    createEvent.mutate(
      {
        anesthesiaRecordId,
        timestamp: new Date(pendingEvent.time).toISOString(),
        description: eventLabel,
        eventType,
      },
      {
        onSuccess: () => {
          onEventCreated?.();
          handleClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" data-testid="dialog-event-comment">
        <DialogHeader>
          <DialogTitle>{editingEvent ? "Edit Event" : "Add Event"}</DialogTitle>
          <DialogDescription>
            {editingEvent ? "Edit or delete the event comment" : "Quick select a common event or enter custom text"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {!editingEvent && (
            <div className="grid gap-2">
              <Label>Common Events</Label>
              <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto p-1">
                {COMMON_EVENTS.map((event) => {
                  const IconComponent = event.icon;
                  return (
                    <Button
                      key={event.label}
                      variant="outline"
                      className="justify-start h-auto py-2 px-3"
                      onClick={() => handleQuickEvent(event.label, event.type)}
                      data-testid={`button-quick-event-${event.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <IconComponent className="w-4 h-4 mr-2 shrink-0" />
                      <span className="text-sm">{event.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="event-text">Event Comment</Label>
            <Textarea
              id="event-text"
              data-testid="input-event-text"
              value={eventTextInput}
              onChange={(e) => setEventTextInput(e.target.value)}
              placeholder="Enter event description..."
              rows={4}
              autoFocus={!!editingEvent}
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
          saveDisabled={!eventTextInput?.trim()}
          saveLabel={editingEvent ? "Save" : "Add"}
        />
      </DialogContent>
    </Dialog>
  );
}
