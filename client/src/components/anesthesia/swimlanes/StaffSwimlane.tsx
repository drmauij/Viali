import { useTimelineContext } from '../TimelineContext';
import type { StaffPoint } from '@/hooks/useEventState';

/**
 * StaffSwimlane Component
 * 
 * Handles rendering and interactions for the staff assignment swimlane.
 * 
 * Features:
 * - Displays staff names (doctors, nurses, assistants) as clickable overlays
 * - Interactive layers for adding new staff entries for each role
 * - Hover tooltips showing staff entry details
 * - Click handlers for editing existing staff assignments
 * - Snaps staff timestamps to 1-minute intervals
 * - Supports three staff roles: Doctor, Nurse, Assistant
 * 
 * Staff data is managed through the TimelineContext's eventState.
 */

const ONE_MINUTE = 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

export interface StaffSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  userName: string; // Current user's name for prefilling
  onStaffDialogOpen: (pending: { time: number; role: 'doctor' | 'nurse' | 'assistant' }) => void;
  onStaffEditDialogOpen: (editing: { 
    id: string; 
    time: number; 
    name: string; 
    role: 'doctor' | 'nurse' | 'assistant'; 
    index: number;
  }) => void;
}

export function StaffSwimlane({
  swimlanePositions,
  isTouchDevice,
  userName,
  onStaffDialogOpen,
  onStaffEditDialogOpen,
}: StaffSwimlaneProps) {
  const {
    eventState,
    currentTime,
    chartInitTime,
    currentZoomStart,
    currentZoomEnd,
    activeToolMode,
    formatTime,
    data,
    collapsedSwimlanes,
  } = useTimelineContext();

  const { staffData } = eventState;

  // Calculate visible range
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  return (
    <>
      {/* Staff values as DOM overlays */}
      {!collapsedSwimlanes.has('staff') && (Object.entries(staffData) as [string, StaffPoint[]][]).flatMap(([role, entries]) =>
        entries.map((entry: StaffPoint, index: number) => {
          const { id, timestamp, name } = entry;
          const staffLane = swimlanePositions.find(lane => lane.id === `staff-${role}`);
          if (!staffLane) return null;
          
          const xFraction = (timestamp - visibleStart) / visibleRange;
          
          if (xFraction < 0 || xFraction > 1) return null;
          
          const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 30px)`;
          
          return (
            <div
              key={`staff-${role}-${timestamp}-${index}`}
              className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono text-sm px-2"
              style={{
                left: leftPosition,
                top: `${staffLane.top + (staffLane.height / 2) - 10}px`,
                minWidth: '60px',
                height: '20px',
              }}
              onClick={() => {
                onStaffEditDialogOpen({
                  id,
                  time: timestamp,
                  name,
                  role: role as 'doctor' | 'nurse' | 'assistant',
                  index,
                });
              }}
              title={`${name} (${role}) at ${formatTime(new Date(timestamp))}`}
              data-testid={`staff-${role}-${index}`}
            >
              <span className="group-hover:scale-110 transition-transform text-slate-700 dark:text-slate-300">
                {name}
              </span>
            </div>
          );
        })
      )}
    </>
  );
}
