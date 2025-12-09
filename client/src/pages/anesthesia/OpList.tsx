import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Calendar, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import OPCalendar from "@/components/anesthesia/OPCalendar";
import SurgerySummaryDialog from "@/components/anesthesia/SurgerySummaryDialog";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";
import { DuplicateRecordsDialog } from "@/components/anesthesia/DuplicateRecordsDialog";
import { SurgeryPlanningTable } from "@/components/shared/SurgeryPlanningTable";
import { useModule } from "@/contexts/ModuleContext";
import { apiRequest } from "@/lib/queryClient";
import type { Surgery } from "@shared/schema";

const SURGERY_CONTEXT_KEY = "oplist_surgery_context";

interface TimeMarker {
  id: string;
  code: string;
  label: string;
  time: number | null;
}

interface AnesthesiaRecordWithCounts {
  id: string;
  surgeryId: string;
  createdAt: string;
  updatedAt: string;
  timeMarkers?: TimeMarker[];
  dataCounts: {
    vitals: number;
    medications: number;
    events: number;
  };
  totalDataPoints: number;
}

function shouldUsePacuMode(timeMarkers?: TimeMarker[]): boolean {
  if (!timeMarkers) return false;
  const x2Marker = timeMarkers.find(m => m.code === 'X2');
  const pMarker = timeMarkers.find(m => m.code === 'P');
  const hasX2 = x2Marker?.time != null;
  const hasP = pMarker?.time != null;
  return hasX2 && !hasP;
}

type ViewMode = "calendar" | "table";

// Calculate date range for table view (past 30 days to next 60 days for comprehensive view)
function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + 60);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default function OpList() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { activeModule } = useModule();
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [tableViewDates, setTableViewDates] = useState(() => getDefaultDateRange());
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSurgeryOpen, setEditSurgeryOpen] = useState(false);
  const [duplicateRecords, setDuplicateRecords] = useState<AnesthesiaRecordWithCounts[]>([]);
  const [duplicatesDialogOpen, setDuplicatesDialogOpen] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Restore Surgery Summary dialog state when returning from Pre-OP/Anesthesia Record
  useEffect(() => {
    const savedContext = sessionStorage.getItem(SURGERY_CONTEXT_KEY);
    if (savedContext) {
      try {
        const { surgeryId, patientId } = JSON.parse(savedContext);
        setSelectedSurgeryId(surgeryId);
        setSelectedPatientId(patientId);
        setSummaryOpen(true);
        sessionStorage.removeItem(SURGERY_CONTEXT_KEY);
      } catch (e) {
        console.error("Failed to restore surgery context:", e);
      }
    }
  }, []);

  const handleEventClick = (surgeryId: string, patientId: string) => {
    setSelectedSurgeryId(surgeryId);
    setSelectedPatientId(patientId);
    setSummaryOpen(true);
  };

  const handleTableSurgeryClick = (surgery: Surgery) => {
    setSelectedSurgeryId(surgery.id);
    setSelectedPatientId(surgery.patientId);
    setSummaryOpen(true);
  };

  const handleEditSurgery = () => {
    setSummaryOpen(false);
    setEditSurgeryOpen(true);
  };

  const handleOpenPreOp = () => {
    if (selectedPatientId && selectedSurgeryId) {
      // Save context before navigating away
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: selectedSurgeryId,
        patientId: selectedPatientId
      }));
      setSummaryOpen(false);
      setLocation(`/anesthesia/patients/${selectedPatientId}?openPreOp=${selectedSurgeryId}`);
    }
  };

  const navigateToAnesthesiaRecord = useCallback((surgeryIdToUse: string, recordIdToUse?: string, usePacuMode?: boolean) => {
    if (selectedPatientId) {
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: surgeryIdToUse,
        patientId: selectedPatientId
      }));
    }
    setSummaryOpen(false);
    setDuplicatesDialogOpen(false);
    // Use PACU path if X2 marker is set but P is not
    const modePath = usePacuMode ? 'pacu' : 'op';
    // Include recordId in URL if specified (for opening specific record when duplicates exist)
    const url = recordIdToUse 
      ? `/anesthesia/${modePath}/${surgeryIdToUse}?recordId=${recordIdToUse}`
      : `/anesthesia/${modePath}/${surgeryIdToUse}`;
    setLocation(url);
  }, [selectedPatientId, setLocation]);

  const checkForDuplicateRecords = useCallback(async (surgeryId: string): Promise<AnesthesiaRecordWithCounts[]> => {
    try {
      const response = await apiRequest("GET", `/api/anesthesia/records/surgery/${surgeryId}/all`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error("Failed to check for duplicate records:", error);
      return [];
    }
  }, []);

  const handleOpenAnesthesia = async () => {
    if (!selectedSurgeryId || !selectedPatientId) return;
    
    setIsCheckingDuplicates(true);
    
    try {
      const records = await checkForDuplicateRecords(selectedSurgeryId);
      
      if (records.length > 1) {
        // Multiple records found - show selection dialog
        setDuplicateRecords(records);
        setDuplicatesDialogOpen(true);
        setSummaryOpen(false);
      } else if (records.length === 1) {
        // Single record - use it directly and include recordId
        const record = records[0];
        const usePacuMode = shouldUsePacuMode(record.timeMarkers);
        navigateToAnesthesiaRecord(selectedSurgeryId, record.id, usePacuMode);
      } else {
        // No records exist yet - let Op.tsx create one
        navigateToAnesthesiaRecord(selectedSurgeryId);
      }
    } catch (error) {
      console.error("Error checking for duplicates:", error);
      // On error, just proceed with normal navigation
      navigateToAnesthesiaRecord(selectedSurgeryId);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleSelectDuplicateRecord = async (recordId: string) => {
    // Navigate to the selected record with its specific recordId
    if (selectedSurgeryId) {
      // Fetch the specific record to check time markers
      let usePacuMode = false;
      try {
        const response = await apiRequest("GET", `/api/anesthesia/records/${recordId}`);
        if (response.ok) {
          const record = await response.json();
          usePacuMode = shouldUsePacuMode(record.timeMarkers);
        }
      } catch (e) {
        // If fetch fails, default to OP mode
      }
      navigateToAnesthesiaRecord(selectedSurgeryId, recordId, usePacuMode);
    }
  };

  const handleRefreshDuplicates = async () => {
    if (!selectedSurgeryId) return;
    const records = await checkForDuplicateRecords(selectedSurgeryId);
    setDuplicateRecords(records);
    
    // If only one record remains, auto-close dialog and navigate
    if (records.length <= 1) {
      setDuplicatesDialogOpen(false);
      if (records.length === 1) {
        // Check markers for the remaining record and include recordId
        const record = records[0];
        const usePacuMode = shouldUsePacuMode(record.timeMarkers);
        navigateToAnesthesiaRecord(selectedSurgeryId, record.id, usePacuMode);
      }
    }
  };

  const handleOpenSurgeryDocumentation = () => {
    if (selectedSurgeryId && selectedPatientId) {
      // Save context before navigating away
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: selectedSurgeryId,
        patientId: selectedPatientId
      }));
      setSummaryOpen(false);
      setLocation(`/surgery/op/${selectedSurgeryId}`);
    }
  };

  return (
    <div className="container mx-auto px-0 py-6 pb-24">
      {/* Header */}
      <div className="mb-6 px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">{t('anesthesia.op.scheduleTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('anesthesia.op.scheduleSubtitle')}
          </p>
        </div>
        
        {/* View Toggle */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && setViewMode(value as ViewMode)}
          className="border rounded-lg"
        >
          <ToggleGroupItem
            value="calendar"
            aria-label={t('surgeryPlanning.calendarView')}
            data-testid="toggle-calendar-view"
          >
            <Calendar className="h-4 w-4 mr-2" />
            {t('surgeryPlanning.calendarView')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            aria-label={t('surgeryPlanning.tableView')}
            data-testid="toggle-table-view"
          >
            <TableProperties className="h-4 w-4 mr-2" />
            {t('surgeryPlanning.tableView')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Calendar or Table View */}
      <div className="min-h-[600px]">
        {viewMode === "calendar" ? (
          <OPCalendar onEventClick={handleEventClick} />
        ) : (
          <div className="px-4 space-y-4">
            <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('common.from')}:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("w-[140px] justify-start text-left font-normal")}
                      data-testid="button-date-from"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {format(tableViewDates.start, "dd.MM.yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={tableViewDates.start}
                      onSelect={(date) => {
                        if (date) {
                          const newStart = new Date(date);
                          newStart.setHours(0, 0, 0, 0);
                          setTableViewDates(prev => {
                            if (newStart > prev.end) {
                              const newEnd = new Date(newStart);
                              newEnd.setDate(newEnd.getDate() + 30);
                              newEnd.setHours(23, 59, 59, 999);
                              return { start: newStart, end: newEnd };
                            }
                            return { ...prev, start: newStart };
                          });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('common.to')}:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("w-[140px] justify-start text-left font-normal")}
                      data-testid="button-date-to"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {format(tableViewDates.end, "dd.MM.yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={tableViewDates.end}
                      disabled={(date) => date < tableViewDates.start}
                      onSelect={(date) => {
                        if (date) {
                          const newEnd = new Date(date);
                          newEnd.setHours(23, 59, 59, 999);
                          setTableViewDates(prev => ({ ...prev, end: newEnd }));
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTableViewDates(getDefaultDateRange())}
                data-testid="button-reset-dates"
              >
                {t('common.reset')}
              </Button>
            </div>
            <SurgeryPlanningTable
              moduleContext="anesthesia"
              onSurgeryClick={handleTableSurgeryClick}
              dateFrom={tableViewDates.start}
              dateTo={tableViewDates.end}
              showFilters={true}
            />
          </div>
        )}
      </div>

      {/* Surgery Summary Dialog */}
      {selectedSurgeryId && (
        <SurgerySummaryDialog
          open={summaryOpen}
          onOpenChange={setSummaryOpen}
          surgeryId={selectedSurgeryId}
          onEditSurgery={handleEditSurgery}
          onOpenPreOp={handleOpenPreOp}
          onOpenAnesthesia={handleOpenAnesthesia}
          onOpenSurgeryDocumentation={handleOpenSurgeryDocumentation}
          activeModule={activeModule}
        />
      )}

      {/* Edit Surgery Dialog */}
      {editSurgeryOpen && selectedSurgeryId && (
        <EditSurgeryDialog
          surgeryId={selectedSurgeryId}
          onClose={() => {
            setEditSurgeryOpen(false);
            setSummaryOpen(true); // Return to summary when closing edit
          }}
        />
      )}

      {/* Duplicate Records Dialog */}
      {selectedSurgeryId && duplicateRecords.length > 0 && (
        <DuplicateRecordsDialog
          open={duplicatesDialogOpen}
          onOpenChange={setDuplicatesDialogOpen}
          records={duplicateRecords}
          surgeryId={selectedSurgeryId}
          onSelectRecord={handleSelectDuplicateRecord}
          onRefresh={handleRefreshDuplicates}
        />
      )}
    </div>
  );
}
