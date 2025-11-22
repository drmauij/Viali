import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/hooks/useEventsQuery";
import { Clock, ArrowDown, ArrowUp, Sun, Eye, Users } from "lucide-react";

// Common events with icons
const COMMON_EVENTS = [
  { label: "Team Timeout", icon: Users },
  { label: "Intubation", icon: ArrowDown },
  { label: "Extubation", icon: ArrowUp },
  { label: "Eye Protection", icon: Eye },
  { label: "Warm Touch", icon: Sun },
];

interface EventToEdit {
  id: string;
  time: number;
  text: string;
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
      setEventTextInput(editingEvent.text);
      setEventEditTime(editingEvent.time);
    } else {
      setEventTextInput("");
      setEventEditTime(Date.now());
    }
  }, [editingEvent]);

  const handleSave = () => {
    if (!eventTextInput?.trim()) return;
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

  const handleQuickEvent = (eventLabel: string) => {
    setEventTextInput(eventLabel);
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
                      onClick={() => handleQuickEvent(event.label)}
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
