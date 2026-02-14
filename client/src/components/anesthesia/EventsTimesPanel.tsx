import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X, MessageSquare, Clock } from "lucide-react";
import { formatTime, formatElapsedTime } from "@/lib/dateUtils";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface EventComment {
  id: string;
  time: number;
  text: string;
}

interface AnesthesiaTimeMarker {
  id: string;
  code: string;
  label: string;
  color: string;
  bgColor: string;
  time: number | null;
}

interface EventsTimesPanelProps {
  open: boolean;
  onClose: () => void;
  events: EventComment[];
  timeMarkers: AnesthesiaTimeMarker[];
  onEventClick?: (event: EventComment) => void;
  onTimeMarkerClick?: (marker: AnesthesiaTimeMarker, index: number) => void;
}

export function EventsTimesPanel({
  open,
  onClose,
  events,
  timeMarkers,
  onEventClick,
  onTimeMarkerClick,
}: EventsTimesPanelProps) {
  const { t } = useTranslation();
  // Combine events and time markers into a single sorted list
  const combinedItems = [
    ...events.map(event => ({
      type: 'event' as const,
      time: event.time,
      data: event,
    })),
    ...timeMarkers
      .map((marker, index) => ({
        type: 'time' as const,
        time: marker.time,
        data: marker,
        index,
      }))
      .filter(item => item.time !== null), // Only include set time markers
  ]
    .sort((a, b) => (b.time || 0) - (a.time || 0)); // Recent first

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
          data-testid="events-times-overlay"
        />
      )}

      {/* Sliding Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-background border-l shadow-xl z-50 transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        data-testid="events-times-panel"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">{t('anesthesia.timeline.eventsTimesPanel.title', 'Events & Times')}</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-panel"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {combinedItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>{t('anesthesia.timeline.eventsTimesPanel.empty', 'No events or times recorded yet')}</p>
                </div>
              ) : (
                combinedItems.map((item, idx) => {
                  if (item.type === 'event') {
                    const event = item.data as EventComment;
                    return (
                      <button
                        key={`event-${event.id}`}
                        onClick={() => onEventClick?.(event)}
                        className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                        data-testid={`event-item-${idx}`}
                      >
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {t('anesthesia.timeline.eventsTimesPanel.eventBadge', 'Event')}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatTime(new Date(event.time))}
                              </span>
                            </div>
                            <p className="text-sm break-words">{event.text}</p>
                          </div>
                        </div>
                      </button>
                    );
                  } else {
                    const marker = item.data as AnesthesiaTimeMarker;
                    return (
                      <button
                        key={`time-${marker.id}`}
                        onClick={() => onTimeMarkerClick?.(marker, item.index!)}
                        className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                        data-testid={`time-item-${idx}`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              backgroundColor: marker.bgColor,
                              color: marker.color,
                            }}
                          >
                            {marker.code}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {t('anesthesia.timeline.eventsTimesPanel.timeMarkerBadge', 'Time Marker')}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {marker.time && formatTime(new Date(marker.time))}
                              </span>
                              {marker.time && (
                                <Badge variant="secondary" className="text-xs font-normal" data-testid={`elapsed-time-panel-${marker.code}`}>
                                  {formatElapsedTime(marker.time)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium">{marker.label}</p>
                          </div>
                        </div>
                      </button>
                    );
                  }
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
