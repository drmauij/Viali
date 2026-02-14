import { useState } from 'react';
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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

  // State for hover tooltip
  const [staffHoverInfo, setStaffHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
    role: string;
  } | null>(null);

  // Calculate visible range
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  // Check if staff parent swimlane exists (to avoid rendering child overlays on parent area)
  const staffParentLane = swimlanePositions.find(lane => lane.id === 'staff');
  const isStaffExpanded = !collapsedSwimlanes.has("staff") && staffParentLane;

  return (
    <>
      {/* Interactive layers for staff swimlanes - to add staff entries */}
      {!activeToolMode && isStaffExpanded && ['doctor', 'nurse', 'assistant'].map((role) => {
        const staffLane = swimlanePositions.find(lane => lane.id === `staff-${role}`);
        if (!staffLane) return null;
        
        // Only render if this is actually a child lane (not overlapping with parent)
        const isChildLane = staffParentLane && staffLane.top > staffParentLane.top;
        if (!isChildLane) return null;
        
        return (
          <div
            key={`staff-interactive-${role}`}
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${staffLane.top}px`,
              height: `${staffLane.height}px`,
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
              
              setStaffHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time,
                role: role.charAt(0).toUpperCase() + role.slice(1)
              });
            }}
            onMouseLeave={() => setStaffHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;
              
              onStaffDialogOpen({ time, role: role as 'doctor' | 'nurse' | 'assistant' });
            }}
            data-testid={`interactive-staff-${role}-lane`}
          />
        );
      })}

      {/* Tooltip for staff entry */}
      {staffHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: staffHoverInfo.x + 10,
            top: staffHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.staff.clickToAdd', 'Click to add {{role}}', { role: staffHoverInfo.role.toLowerCase() })}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(staffHoverInfo.time))}
          </div>
        </div>
      )}

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
