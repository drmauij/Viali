import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTimelineContext } from '../TimelineContext';
import type { EventComment, AnesthesiaTimeMarker } from '@/hooks/useEventState';
import { getEventIcon } from '@/constants/commonEvents';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InventoryUsageItem {
  id: string;
  itemId: string;
  calculatedQty: number;
  overrideQty: number | null;
}

interface InventoryCommit {
  id: string;
  rolledBackAt: string | null;
  items: Array<{
    itemId: string;
    quantity: number;
  }>;
}

/**
 * EventsSwimlane Component
 * 
 * Renders interactive overlays and visual indicators for:
 * - Event Comments (ereignisse swimlane) - User-entered annotations/notes on timeline
 * - Time Markers (zeiten swimlane) - Standardized anesthesia procedure markers (A1, X1, etc.)
 * 
 * Handles mouse/touch interactions for adding, editing, and deleting events and markers.
 */

const ONE_MINUTE = 60 * 1000;

interface EventsSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onEventDialogOpen: (pending: { time: number } | null) => void;
  onEventEditDialogOpen: (event: EventComment) => void;
  onTimeMarkerEditDialogOpen: (marker: { index: number; marker: AnesthesiaTimeMarker }) => void;
}

export function EventsSwimlane({
  swimlanePositions,
  isTouchDevice,
  onEventDialogOpen,
  onEventEditDialogOpen,
  onTimeMarkerEditDialogOpen,
}: EventsSwimlaneProps) {
  const {
    eventState,
    inventoryCommitState,
    currentTime,
    chartInitTime,
    currentZoomStart,
    currentZoomEnd,
    isDark,
    activeToolMode,
    formatTime,
    snapToInterval,
    data,
    saveTimeMarkersMutation,
    anesthesiaRecordId,
  } = useTimelineContext();

  const { eventComments, timeMarkers } = eventState;
  const { toast } = useToast();
  const { t } = useTranslation();

  // Destructure inventory commit state from context (shared with UnifiedTimeline quick-add button)
  const {
    hasPendingCommits,
    inventoryLoading,
    commitsLoading,
    inventoryError,
    commitsError,
    x2ReminderShownRef,
  } = inventoryCommitState;

  // State for showing commit reminder dialog (local to this component)
  const [showCommitReminder, setShowCommitReminder] = useState(false);

  // NOTE: Removed local inventory queries - now using shared inventoryCommitState from context
  // NOTE: Removed committedQuantities, getFinalQty, hasPendingCommits - now from context
  // NOTE: x2ReminderShownRef and showCommitReminder moved above, hasPendingCommits from context

  // Hover state for event comments
  const [eventHoverInfo, setEventHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ event: EventComment; x: number; y: number } | null>(null);

  // Hover state for time markers
  const [zeitenHoverInfo, setZeitenHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
    nextMarker: string | null;
    existingMarker?: { code: string; label: string; time: number };
  } | null>(null);

  // Find swimlane positions
  const eventsLane = swimlanePositions.find(lane => lane.id === 'ereignisse');
  const zeitenLane = swimlanePositions.find(lane => lane.id === 'zeiten');

  // Calculate visible range
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  /**
   * Handle clicking on Zeiten swimlane to place next time marker or edit existing
   */
  const handleZeitenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const xPercent = x / rect.width;
    let time = visibleStart + (xPercent * visibleRange);

    // Always snap to 1-minute intervals for time markers
    time = snapToInterval(time, ONE_MINUTE);

    // Check if we're clicking on an existing marker (within 3 minutes threshold)
    const threeMinutes = 3 * 60 * 1000;
    const existingMarkerIndex = timeMarkers.findIndex(m =>
      m.time !== null && Math.abs(m.time - time) < threeMinutes
    );

    if (existingMarkerIndex !== -1) {
      // Edit existing marker
      onTimeMarkerEditDialogOpen({
        index: existingMarkerIndex,
        marker: timeMarkers[existingMarkerIndex],
      });
    } else {
      // Place next unplaced marker
      const nextMarkerIndex = timeMarkers.findIndex(m => m.time === null);
      if (nextMarkerIndex !== -1) {
        const nextMarker = timeMarkers[nextMarkerIndex];
        
        // Check if trying to set PACU End (P) with pending commits (BLOCKING)
        if (nextMarker.code === 'P' && hasPendingCommits) {
          // Show different message based on state: loading, error, or actual pending commits
          if (inventoryLoading || commitsLoading) {
            toast({
              title: t("anesthesia.timeline.toasts.cannotSetPacuEnd", "Cannot set PACU End"),
              description: t("anesthesia.timeline.toasts.stillLoadingInventory", "Still loading inventory status. Please wait a moment and try again."),
              variant: "destructive",
            });
          } else if (inventoryError || commitsError) {
            toast({
              title: t("anesthesia.timeline.toasts.cannotSetPacuEnd", "Cannot set PACU End"),
              description: t("anesthesia.timeline.toasts.unableToVerifyInventory", "Unable to verify inventory status. Please check your connection and try again."),
              variant: "destructive",
            });
          } else {
            toast({
              title: t("anesthesia.timeline.toasts.cannotSetPacuEnd", "Cannot set PACU End"),
              description: t("anesthesia.timeline.toasts.commitInventoryFirst", "Please commit all inventory items before marking PACU End."),
              variant: "destructive",
            });
          }
          return;
        }

        // Check if setting X2 (Anesthesia End) with pending commits (NON-BLOCKING REMINDER)
        // Show reminder dialog only once per session
        const shouldShowX2Reminder = 
          nextMarker.code === 'X2' && 
          hasPendingCommits && 
          !x2ReminderShownRef.current;

        const updatedMarkers = [...timeMarkers];
        updatedMarkers[nextMarkerIndex] = {
          ...updatedMarkers[nextMarkerIndex],
          time,
        };
        eventState.setTimeMarkers(updatedMarkers);
        
        // Save to database
        if (anesthesiaRecordId && saveTimeMarkersMutation) {
          console.log('[TIME_MARKERS] Swimlane click - triggering save mutation');
          saveTimeMarkersMutation.mutate({
            anesthesiaRecordId,
            timeMarkers: updatedMarkers,
          });
        }

        // Show X2 reminder dialog after marker is set
        if (shouldShowX2Reminder) {
          console.log('[X2_CHECK] Showing reminder dialog');
          x2ReminderShownRef.current = true;
          setShowCommitReminder(true);
        }
      }
    }
  };

  /**
   * Handle clicking on Events swimlane to add new event comment
   */
  const handleEventsClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const xPercent = x / rect.width;
    let time = visibleStart + (xPercent * visibleRange);

    // Snap to 1-minute intervals
    time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

    // SAFEGUARD: Validate time is reasonable (not 0, not NaN, not in ancient past)
    const MIN_VALID_TIMESTAMP = new Date('2020-01-01').getTime();
    if (!time || isNaN(time) || time < MIN_VALID_TIMESTAMP) {
      console.warn('[EVENTS-CLICK] Invalid time calculated:', time, '- falling back to currentTime');
      time = currentTime;
    }

    console.log('[EVENTS-CLICK] Click ACCEPTED - opening dialog');
    onEventDialogOpen({ time });
  };

  return (
    <>
      {/* Interactive layer for Zeiten swimlane - to place time markers */}
      {!activeToolMode && zeitenLane && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${zeitenLane.top}px`,
            height: `${zeitenLane.height}px`,
            zIndex: 35,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Always snap to 1-minute intervals for time markers
            time = snapToInterval(time, ONE_MINUTE);

            // Check if we're hovering over an existing marker (within 3 minutes threshold)
            const threeMinutes = 3 * 60 * 1000;
            const existingMarker = timeMarkers.find(m =>
              m.time !== null && Math.abs(m.time - time) < threeMinutes
            );

            // Find next unplaced marker
            const nextMarkerIndex = timeMarkers.findIndex(m => m.time === null);
            const nextMarker = nextMarkerIndex !== -1 ? timeMarkers[nextMarkerIndex] : null;

            setZeitenHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time: existingMarker ? existingMarker.time! : time,
              nextMarker: nextMarker ? `${nextMarker.code} - ${nextMarker.label}` : null,
              existingMarker: existingMarker ? {
                code: existingMarker.code,
                label: existingMarker.label,
                time: existingMarker.time!
              } : undefined
            });
          }}
          onMouseLeave={() => setZeitenHoverInfo(null)}
          onClick={handleZeitenClick}
          data-testid="interactive-zeiten-lane"
        />
      )}

      {/* Tooltip for Zeiten entry */}
      {zeitenHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: zeitenHoverInfo.x + 10,
            top: zeitenHoverInfo.y - 40,
          }}
        >
          {zeitenHoverInfo.existingMarker ? (
            <>
              <div className="text-sm font-semibold text-primary">
                {zeitenHoverInfo.existingMarker.code} - {t(`anesthesia.timeline.timeMarkerLabels.${zeitenHoverInfo.existingMarker.code}`, zeitenHoverInfo.existingMarker.label)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTime(zeitenHoverInfo.existingMarker.time)}
              </div>
              <div className="text-xs text-muted-foreground italic mt-1">
                {t('anesthesia.timeline.zeitenTooltip.clickToEdit', 'Click to edit')}
              </div>
            </>
          ) : zeitenHoverInfo.nextMarker ? (
            <>
              <div className="text-sm font-semibold text-primary">
                {t('anesthesia.timeline.zeitenTooltip.place', 'Place')}: {t(`anesthesia.timeline.timeMarkerLabels.${zeitenHoverInfo.nextMarker}`, zeitenHoverInfo.nextMarker)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTime(zeitenHoverInfo.time)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t('anesthesia.timeline.zeitenTooltip.allMarkersPlaced', 'All markers placed')}
            </div>
          )}
        </div>
      )}

      {/* Interactive layer for Events swimlane - to add event comments */}
      {(!activeToolMode || activeToolMode === 'edit') && eventsLane && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${eventsLane.top}px`,
            height: `${eventsLane.height}px`,
            zIndex: 35,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to 1-minute intervals
            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            setEventHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time
            });
          }}
          onMouseLeave={() => setEventHoverInfo(null)}
          onClick={handleEventsClick}
          data-testid="interactive-events-lane"
        />
      )}

      {/* Tooltip for events entry */}
      {eventHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: eventHoverInfo.x + 10,
            top: eventHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add event
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(eventHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Inline popup for existing events */}
      {hoveredEvent && !isTouchDevice && (() => {
        const HoverIconComponent = getEventIcon(hoveredEvent.event.eventType);
        return (
          <div
            className="fixed z-50 pointer-events-none"
            style={{
              left: hoveredEvent.x,
              top: hoveredEvent.y - 20,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-background border-2 border-primary rounded-lg shadow-xl max-w-md p-4 relative">
              <div className="flex items-center gap-2 mb-2">
                <HoverIconComponent className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Event Comment</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatTime(hoveredEvent.event.time)}
                </span>
              </div>
              <div className="text-sm text-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {hoveredEvent.event.text}
              </div>
              <div className="text-xs text-muted-foreground mt-2 italic">
                Click to edit
              </div>
              {/* Arrow pointing down to the icon - double layer for border effect */}
              <div
                className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
                style={{
                  bottom: '-12px',
                  borderLeft: '12px solid transparent',
                  borderRight: '12px solid transparent',
                  borderTop: '12px solid hsl(var(--primary))',
                }}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
                style={{
                  bottom: '-10px',
                  borderLeft: '10px solid transparent',
                  borderRight: '10px solid transparent',
                  borderTop: '10px solid hsl(var(--background))',
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* Time marker badges on the timeline */}
      {timeMarkers.filter(m => m.time !== null).map((marker) => {
        const xFraction = (marker.time! - visibleStart) / visibleRange;

        // Only render if in visible range
        if (xFraction < 0 || xFraction > 1) return null;

        if (!zeitenLane) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 16px)`;

        return (
          <div
            key={marker.id}
            className="absolute z-40 pointer-events-none flex items-center justify-center"
            style={{
              left: leftPosition,
              top: `${zeitenLane.top + 4}px`,
              width: '32px',
              height: '32px',
            }}
          >
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold shadow-md"
              style={{
                backgroundColor: marker.bgColor,
                color: marker.color,
              }}
              data-testid={`time-marker-${marker.code}`}
            >
              {marker.code}
            </div>
          </div>
        );
      })}

      {/* Event comment icons on the timeline */}
      {eventComments.map((event) => {
        const xFraction = (event.time - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) {
          return null;
        }

        if (!eventsLane) {
          return null;
        }

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 12px)`;
        const IconComponent = getEventIcon(event.eventType);

        return (
          <div
            key={event.id}
            className="absolute z-40 cursor-pointer flex items-center justify-center group"
            style={{
              left: leftPosition,
              top: `${eventsLane.top + 8}px`,
              width: '24px',
              height: '24px',
            }}
            onClick={() => {
              onEventEditDialogOpen(event);
            }}
            onMouseEnter={(e) => {
              if (!isTouchDevice) {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredEvent({
                  event,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                });
              }
            }}
            onMouseLeave={() => setHoveredEvent(null)}
            data-testid={`event-icon-${event.id}`}
          >
            <IconComponent className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
          </div>
        );
      })}

      {/* Friendly reminder dialog for inventory commit after X2 */}
      <AlertDialog open={showCommitReminder} onOpenChange={setShowCommitReminder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventory Commit Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              You've marked Anesthesia End. Don't forget to commit the inventory items that were used during this procedure.
              <br /><br />
              You can commit them from the Inventory tab when you're ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction data-testid="button-close-commit-reminder">Got it, thanks!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
