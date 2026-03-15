import React from "react";
import {
  Heart,
  CircleDot,
  Blend,
  Plus,
  ChevronDown,
  ChevronRight,
  Clock,
  Pencil,
  ChevronsDownUp,
  ArrowUpDown,
} from "lucide-react";
import type { SwimlaneConfig, AdministrationGroup, AnesthesiaItem } from "./types";
import type { AnesthesiaTimeMarker } from "@/hooks/useEventState";
import type { TFunction } from "i18next";

/** Swimlane position — a SwimlaneConfig with a computed `top` offset. */
export type SwimlanePosition = SwimlaneConfig & { top: number };

export interface MedicationItemsSidebarProps {
  // Layout
  swimlanePositions: SwimlanePosition[];
  activeSwimlanes: SwimlaneConfig[];
  isDark: boolean;

  // Permissions
  canWrite: boolean;
  isAdmin: boolean;
  isTouchDevice: boolean;

  // Vitals tool mode
  activeToolMode: "hr" | "bp" | "spo2" | "blend" | "edit" | null;
  onBpToggle: () => void;
  onHrToggle: () => void;
  onSpo2Toggle: () => void;
  onBlendToggle: () => void;
  onEditToggle: () => void;

  // Collapse
  collapsedSwimlanes: Set<string>;
  toggleSwimlane: (swimlaneId: string) => void;

  // Time markers (Zeiten lane)
  timeMarkers: AnesthesiaTimeMarker[];
  onZeitenQuickAdd: () => void;
  onOpenBulkEditDialog: () => void;

  // Callbacks: dialogs & panels
  onShowEventsTimesPanel: () => void;
  onEnterReorderMode: () => void;
  onOpenMedicationConfig: (adminGroup: AdministrationGroup, editItem: AnesthesiaItem | null) => void;
  onOpenOnDemandDialog: (adminGroup: AdministrationGroup) => void;
  onAdminGroupHover: (info: { x: number; y: number; groupName: string } | null) => void;

  // Data
  anesthesiaRecordId?: string;
  administrationGroups: AdministrationGroup[];
  anesthesiaItems: AnesthesiaItem[];

  // i18n
  t: TFunction;
}

export const MedicationItemsSidebar = React.memo(function MedicationItemsSidebar({
  swimlanePositions,
  activeSwimlanes,
  isDark,
  canWrite,
  isAdmin,
  isTouchDevice,
  activeToolMode,
  onBpToggle,
  onHrToggle,
  onSpo2Toggle,
  onBlendToggle,
  onEditToggle,
  collapsedSwimlanes,
  toggleSwimlane,
  timeMarkers,
  onZeitenQuickAdd,
  onOpenBulkEditDialog,
  onShowEventsTimesPanel,
  onEnterReorderMode,
  onOpenMedicationConfig,
  onOpenOnDemandDialog,
  onAdminGroupHover,
  anesthesiaRecordId,
  administrationGroups,
  anesthesiaItems,
  t,
}: MedicationItemsSidebarProps) {
  return (
    <div className="absolute left-0 top-0 w-[200px] h-full border-r border-border z-30 bg-background">
      {/* Y-axis scales - manually rendered on right side of white area */}
      <div className="absolute top-[32px] h-[380px] w-full pointer-events-none z-50">
        {/* First scale: 20-220 with 20-unit steps (11 values) - close to grid, grid extends 0 to 240 for top and bottom padding */}
        {[20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((val) => {
          const yPercent = ((240 - val) / 240) * 100;
          return (
            <div
              key={`scale1-${val}`}
              className="absolute text-xs font-medium text-foreground"
              style={{
                right: '60px',
                top: `${yPercent}%`,
                transform: 'translateY(-50%)'
              }}
            >
              {val}
            </div>
          );
        })}

        {/* Second scale: 50-100 with 10-unit steps (6 values) - purple, closest to grid, extends 45 to 105 for padding */}
        {[50, 60, 70, 80, 90, 100].map((val) => {
          const yPercent = ((105 - val) / 60) * 100;
          return (
            <div
              key={`scale2-${val}`}
              className="absolute text-xs font-bold"
              style={{
                right: '28px',
                top: `${yPercent}%`,
                transform: 'translateY(-50%)',
                color: '#8b5cf6'
              }}
            >
              {val}
            </div>
          );
        })}
      </div>

      {/* Vitals icon buttons */}
      <div className="absolute top-[32px] h-[380px] w-full flex flex-col items-start justify-center gap-2 pl-4">
        <button
          onClick={onBpToggle}
          disabled={!canWrite}
          className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
            activeToolMode === 'bp'
              ? 'border-foreground bg-foreground/20'
              : 'border-border bg-background hover:border-foreground hover:bg-foreground/10'
          } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="button-vitals-bp"
          title={t('timeline.bloodPressure', 'Blood Pressure (NIBP)')}
        >
          <ChevronsDownUp className={`w-5 h-5 transition-colors ${activeToolMode === 'bp' ? 'text-foreground' : 'text-foreground/70 hover:text-foreground'}`} />
        </button>
        <button
          onClick={onHrToggle}
          disabled={!canWrite}
          className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
            activeToolMode === 'hr'
              ? 'border-red-500 bg-red-500/20'
              : 'border-border bg-background hover:border-red-500 hover:bg-red-500/10'
          } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="button-vitals-heart"
          title={t('timeline.heartRate', 'Heart Rate')}
        >
          <Heart className={`w-5 h-5 transition-colors ${activeToolMode === 'hr' ? 'text-red-500' : 'hover:text-red-500'}`} />
        </button>
        <button
          onClick={onSpo2Toggle}
          disabled={!canWrite}
          className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
            activeToolMode === 'spo2'
              ? 'border-blue-500 bg-blue-500/20'
              : 'border-border bg-background hover:border-blue-500 hover:bg-blue-500/10'
          } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="button-vitals-oxygen"
          title={t('timeline.oxygenation', 'Oxygenation (SpO2)')}
        >
          <CircleDot className={`w-5 h-5 transition-colors ${activeToolMode === 'spo2' ? 'text-blue-500' : 'hover:text-blue-500'}`} />
        </button>
        <button
          onClick={onBlendToggle}
          disabled={!canWrite}
          className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
            activeToolMode === 'blend'
              ? 'border-purple-500 bg-purple-500/20'
              : 'border-border bg-background hover:border-purple-500 hover:bg-purple-500/10'
          } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="button-vitals-combo"
          title={t('timeline.sequentialVitals', 'Sequential Vitals Mode')}
        >
          <Blend className={`w-5 h-5 transition-colors ${activeToolMode === 'blend' ? 'text-purple-500' : 'hover:text-purple-500'}`} />
        </button>
        <button
          onClick={onEditToggle}
          disabled={!canWrite}
          className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
            activeToolMode === 'edit'
              ? 'border-amber-500 bg-amber-500/20'
              : 'border-border bg-background hover:border-amber-500 hover:bg-amber-500/10'
          } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="button-vitals-edit"
          title={t('timeline.editMode', 'Edit Mode - Move Vital Points')}
        >
          <Pencil className={`w-5 h-5 transition-colors ${activeToolMode === 'edit' ? 'text-amber-500' : 'hover:text-amber-500'}`} />
        </button>
      </div>

      {/* Swimlane labels */}
      {swimlanePositions.map((lane) => {
        // Find the corresponding swimlane config to access metadata
        const swimlaneConfig = activeSwimlanes.find(s => s.id === lane.id);

        const isZeitenLane = lane.id === "zeiten";
        const isEreignisseLane = lane.id === "ereignisse";
        const isMedParent = lane.id === "medikamente";
        const isVentParent = lane.id === "ventilation";
        const isOutputParent = lane.id === "output";
        const isOthersParent = lane.id === "others";
        const isVentChild = lane.id.startsWith("ventilation-");
        const isOutputChild = lane.id.startsWith("output-");
        const isOthersChild = lane.id === "bis";
        const isTofLane = lane.id === "tof";

        // Only the main parent swimlanes are collapsible
        const isCollapsibleParent = isMedParent || isVentParent || isOutputParent || isOthersParent;

        // Determine styling based on hierarchyLevel field
        let labelClass = "";
        if (swimlaneConfig?.hierarchyLevel === 'parent' || isCollapsibleParent || lane.id === "zeiten" || lane.id === "ereignisse" || isTofLane || lane.id === "herzrhythmus" || lane.id === "position") {
          // Level 1: Main parent swimlanes (collapsible)
          labelClass = "text-sm font-semibold";
        } else if (swimlaneConfig?.hierarchyLevel === 'group') {
          // Level 2: Administration group headers (non-collapsible, bold, smaller)
          labelClass = "text-xs font-semibold";
        } else if (swimlaneConfig?.hierarchyLevel === 'entry') {
          // Entry lane (e.g., Vent. Params) - bold, smaller text
          labelClass = "text-xs font-semibold";
        } else if (swimlaneConfig?.hierarchyLevel === 'item' || isVentChild || isOutputChild || isOthersChild) {
          // Level 3: Individual items (non-collapsible, not bold, smaller)
          labelClass = "text-xs";
        } else {
          // Default
          labelClass = "text-sm";
        }

        // Apply same darker background logic to label area as swimlane area
        let labelBackgroundColor: string;
        if (swimlaneConfig?.hierarchyLevel === 'group') {
          // Match the darker background used in swimlane area for group headers
          labelBackgroundColor = isDark ? "hsl(150, 45%, 8%)" : "hsl(150, 50%, 75%)";
        } else {
          labelBackgroundColor = isDark ? lane.colorDark : lane.colorLight;
        }

        // Remove border-b from group headers
        const shouldShowBorder = swimlaneConfig?.hierarchyLevel !== 'group';

        return (
          <div
            key={lane.id}
            className={`absolute w-full flex items-center justify-between px-2 ${shouldShowBorder ? 'border-b' : ''}`}
            style={{
              top: `${lane.top}px`,
              height: `${lane.height}px`,
              backgroundColor: labelBackgroundColor,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }}
          >
            {isZeitenLane ? (
              // For Times swimlane, show next timepoint button and times icon
              <div className="flex items-center justify-between gap-1 flex-1">
                <button
                  onClick={onZeitenQuickAdd}
                  disabled={!canWrite}
                  className={`flex items-center gap-1 text-left bg-primary/10 text-foreground px-2 py-1 rounded text-xs hover:bg-primary/20 transition-colors pointer-events-auto truncate flex-1 max-w-[140px] ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                  data-testid="button-next-timepoint"
                  title={(() => {
                    const nextMarker = timeMarkers.find(m => m.time === null);
                    return nextMarker
                      ? `${t('anesthesia.timeline.zeitenTooltip.next', 'Next')}: ${t(`anesthesia.timeline.timeMarkerLabels.${nextMarker.code}`, nextMarker.label)}`
                      : t('anesthesia.timeline.zeitenTooltip.allMarkersPlaced', 'All times set');
                  })()}
                >
                  {(() => {
                    const nextMarker = timeMarkers.find(m => m.time === null);
                    if (nextMarker) {
                      return (
                        <>
                          <ChevronRight className="w-4 h-4 shrink-0" />
                          <span className="truncate text-[11px]">{t(`anesthesia.timeline.timeMarkerLabels.${nextMarker.code}`, nextMarker.label)}</span>
                        </>
                      );
                    } else {
                      return <span className="text-[11px]">{t('anesthesia.timeline.zeitenTooltip.allMarkersPlaced', 'All times set')}</span>;
                    }
                  })()}
                </button>
                <button
                  onClick={onOpenBulkEditDialog}
                  className="hover:bg-background/10 transition-colors rounded p-0.5 pointer-events-auto"
                  data-testid="button-edit-anesthesia-times"
                  title={t('anesthesia.timeline.bulkEditTimes.title', 'Edit Anesthesia Times')}
                >
                  <Clock className="w-4 h-4 text-foreground/70 group-hover:text-foreground shrink-0" />
                </button>
              </div>
            ) : isEreignisseLane ? (
              // For Events swimlane, make entire label area clickable to toggle panel
              <button
                onClick={onShowEventsTimesPanel}
                className="flex items-center gap-1 flex-1 text-left hover:bg-background/10 transition-colors rounded px-1 -mx-1 pointer-events-auto"
                data-testid="button-toggle-events-panel"
                title={t('timeline.viewEventsTimes', 'View Events & Times')}
              >
                <span className={`${labelClass} text-black dark:text-white`}>
                  {lane.label}
                </span>
              </button>
            ) : isCollapsibleParent ? (
              // For collapsible parent swimlanes, make entire label area clickable to toggle
              <div className="flex items-center justify-between flex-1">
                <button
                  onClick={() => toggleSwimlane(lane.id)}
                  className="flex items-center gap-1 flex-1 text-left hover:bg-background/10 transition-colors rounded px-1 -mx-1 pointer-events-auto"
                  data-testid={`button-toggle-${lane.id}`}
                  title={collapsedSwimlanes.has(lane.id) ? "Expand" : "Collapse"}
                >
                  {collapsedSwimlanes.has(lane.id) ? (
                    <ChevronRight className="w-4 h-4 text-foreground/70 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-foreground/70 shrink-0" />
                  )}
                  <span className={`${labelClass} text-black dark:text-white`}>
                    {lane.label}
                  </span>
                </button>
                {isMedParent && !collapsedSwimlanes.has(lane.id) && (
                  <>
                    {/* Reorder button - admin only */}
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEnterReorderMode();
                        }}
                        className="hover:bg-background/10 transition-colors rounded p-1 pointer-events-auto ml-1"
                        data-testid="button-reorder-medications"
                        title={t("anesthesia.timeline.reorderMedications")}
                      >
                        <ArrowUpDown className="w-4 h-4 text-foreground/70" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : swimlaneConfig?.hierarchyLevel === 'group' ? (
              // For administration group headers, make entire label area clickable to configure medications (admin only)
              isAdmin ? (
                <>
                  <button
                    onClick={() => {
                      // Find the corresponding admin group by matching lane ID format: admingroup-${group.id}
                      const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                      if (adminGroup) {
                        onOpenMedicationConfig(adminGroup, null);
                      }
                    }}
                    onMouseMove={(e) => {
                      if (isTouchDevice) return;
                      const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                      if (adminGroup) {
                        onAdminGroupHover({
                          x: e.clientX,
                          y: e.clientY,
                          groupName: adminGroup.name,
                        });
                      }
                    }}
                    onMouseLeave={() => onAdminGroupHover(null)}
                    className="flex items-center gap-1 flex-1 text-left cursor-pointer pointer-events-auto"
                    data-testid={`button-configure-${lane.id}`}
                    title={t('timeline.configureMedications', 'Configure Medications')}
                  >
                    <span className={`${labelClass} text-black dark:text-white`}>
                      {lane.label}
                    </span>
                  </button>
                  {/* Plus button for on-demand medications (admin users) */}
                  {canWrite && anesthesiaRecordId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                        if (adminGroup) {
                          onOpenOnDemandDialog(adminGroup);
                        }
                      }}
                      className="ml-1 p-2 rounded-full bg-primary/10 hover:bg-primary/20 active:bg-primary/30 transition-colors pointer-events-auto touch-manipulation"
                      data-testid={`button-add-on-demand-admin-${lane.id}`}
                      title={t("anesthesia.timeline.addOnDemandMedication", "Add On-Demand Medication")}
                    >
                      <Plus className="w-5 h-5 text-primary" />
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1 flex-1">
                  <span className={`${labelClass} text-black dark:text-white`}>
                    {lane.label}
                  </span>
                  {/* Plus button to add on-demand medications (available for all users) */}
                  {canWrite && anesthesiaRecordId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                        if (adminGroup) {
                          onOpenOnDemandDialog(adminGroup);
                        }
                      }}
                      className="ml-1 p-2 rounded-full bg-primary/10 hover:bg-primary/20 active:bg-primary/30 transition-colors pointer-events-auto touch-manipulation"
                      data-testid={`button-add-on-demand-${lane.id}`}
                      title={t("anesthesia.timeline.addOnDemandMedication", "Add On-Demand Medication")}
                    >
                      <Plus className="w-5 h-5 text-primary" />
                    </button>
                  )}
                </div>
              )
            ) : swimlaneConfig?.hierarchyLevel === 'item' && lane.itemId ? (
              // For medication item labels, make them clickable to edit (admin only)
              // Also show cumulative dose badge on the right side
              <>
                {isAdmin ? (
                  <button
                    onClick={() => {
                      // Find the medication item using the itemId property from the lane
                      const medicationItem = anesthesiaItems.find(item => item.id === lane.itemId);
                      if (medicationItem && medicationItem.administrationGroup) {
                        // Find the admin group by ID (administrationGroup field stores the UUID)
                        const adminGroup = administrationGroups.find(g => g.id === medicationItem.administrationGroup);
                        if (adminGroup) {
                          onOpenMedicationConfig(adminGroup, medicationItem);
                        }
                      }
                    }}
                    className="flex items-center gap-1 flex-1 text-left hover:bg-background/10 transition-colors rounded px-1 -mx-1 cursor-pointer min-w-0"
                    data-testid={`button-edit-medication-${lane.id}`}
                    title={t('timeline.editMedicationConfig', 'Edit Medication Configuration')}
                  >
                    <span className={`${labelClass} text-black dark:text-white truncate`}>
                      {lane.label}
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className={`${labelClass} text-black dark:text-white truncate`}>
                      {lane.label}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1 flex-1">
                {isCollapsibleParent && (
                  <button
                    onClick={() => toggleSwimlane(lane.id)}
                    className="p-0.5 rounded hover:bg-background/50 transition-colors group pointer-events-auto"
                    data-testid={`button-toggle-${lane.id}`}
                    title={collapsedSwimlanes.has(lane.id) ? "Expand" : "Collapse"}
                  >
                    {collapsedSwimlanes.has(lane.id) ? (
                      <ChevronRight className="w-4 h-4 text-foreground/70 group-hover:text-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-foreground/70 group-hover:text-foreground transition-colors" />
                    )}
                  </button>
                )}
                <span className={`${labelClass} text-black dark:text-white`}>
                  {lane.label}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
