import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/hooks/useEventsQuery";
import { COMMON_EVENTS } from "@/constants/commonEvents";
import { useTranslation } from "react-i18next";

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
  readOnly?: boolean;
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
  readOnly = false,
}: EventDialogProps) {
  const [eventTextInput, setEventTextInput] = useState("");
  const [eventEditTime, setEventEditTime] = useState<number>(Date.now());
  const [eventType, setEventType] = useState<string | null>(null);
  const { t } = useTranslation();

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

  // Translate event type to label
  const getEventLabel = (eventType: string): string => {
    const eventTypeMap: Record<string, string> = {
      'team_timeout': t('anesthesia.timeline.teamTimeout'),
      'intubation': t('anesthesia.timeline.intubation'),
      'extubation': t('anesthesia.timeline.extubation'),
      'eye_protection': t('anesthesia.timeline.eyeProtection'),
      'warm_touch': t('anesthesia.timeline.warmTouch'),
      'position_proofed': t('anesthesia.timeline.positionProofed'),
    };
    return eventTypeMap[eventType] || eventType;
  };

  const handleQuickEvent = (eventType: string) => {
    const translatedLabel = getEventLabel(eventType);
    
    if (!anesthesiaRecordId || !pendingEvent) {
      // Fallback: just fill the text input if we can't save immediately
      setEventTextInput(translatedLabel);
      return;
    }

    // Immediately save the common event with ISO string timestamp
    createEvent.mutate(
      {
        anesthesiaRecordId,
        timestamp: new Date(pendingEvent.time).toISOString(),
        description: translatedLabel,
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
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingEvent ? t("anesthesia.timeline.editEvent") : t("anesthesia.timeline.addEvent")}
      description={editingEvent ? t("anesthesia.timeline.editDeleteEvent") : t("anesthesia.timeline.quickSelectEvent")}
      className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
      testId="dialog-event-comment"
      time={editingEvent ? eventEditTime : pendingEvent?.time}
      onTimeChange={setEventEditTime}
      showDelete={!!editingEvent && !readOnly}
      onDelete={editingEvent && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={handleSave}
      saveDisabled={!eventTextInput?.trim() || readOnly}
      saveLabel={editingEvent ? t('common.save') : t('common.add')}
    >
      <div className="grid gap-4 py-4">
        {!editingEvent && !readOnly && (
          <div className="grid gap-2">
            <Label>{t("anesthesia.timeline.commonEvents")}</Label>
            <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto p-1">
              {COMMON_EVENTS.map((event) => {
                const IconComponent = event.icon;
                return (
                  <Button
                    key={event.type}
                    variant="outline"
                    className="justify-start h-auto py-2 px-3"
                    onClick={() => handleQuickEvent(event.type)}
                    data-testid={`button-quick-event-${event.type}`}
                  >
                    <IconComponent className="w-4 h-4 mr-2 shrink-0" />
                    <span className="text-sm">{getEventLabel(event.type)}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="event-text">{t("anesthesia.timeline.eventComment")}</Label>
          <Textarea
            id="event-text"
            data-testid="input-event-text"
            value={eventTextInput}
            onChange={(e) => setEventTextInput(e.target.value)}
            placeholder={t("anesthesia.timeline.enterEventDescription")}
            rows={4}
            autoFocus={!!editingEvent}
            disabled={readOnly}
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
