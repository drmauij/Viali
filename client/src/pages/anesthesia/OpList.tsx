import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Calendar, TableProperties, FileText } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import OPCalendar from "@/components/anesthesia/OPCalendar";
import SurgerySummaryDialog from "@/components/anesthesia/SurgerySummaryDialog";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";
import { DuplicateRecordsDialog } from "@/components/anesthesia/DuplicateRecordsDialog";
import { SurgeryPlanningTable } from "@/components/shared/SurgeryPlanningTable";
import { ExternalReservationsPanel, ExternalRequestsBadge } from "@/components/surgery/ExternalReservationsPanel";
import { useModule } from "@/contexts/ModuleContext";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import type { Surgery } from "@shared/schema";

const preloadOp = () => import("@/pages/anesthesia/Op");

const SURGERY_CONTEXT_KEY = "oplist_surgery_context";
const VIEW_MODE_KEY = "oplist_view_mode";
const TABLE_TAB_KEY = "oplist_table_tab";

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
type TableTab = "current" | "past";

export default function OpList() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { activeModule } = useModule();
  const activeHospital = useActiveHospital();
  const hasExternalSurgeryToken = !!activeHospital?.externalSurgeryToken;
  const showExternalRequests = hasExternalSurgeryToken && activeHospital?.unitType === 'or' && activeHospital?.role === 'admin';
  const [openRequestsFromUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('openRequests') === 'true';
  });
  
  // Initialize viewMode from sessionStorage to persist across navigation
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = sessionStorage.getItem(VIEW_MODE_KEY);
    return (saved === "calendar" || saved === "table") ? saved : "calendar";
  });
  const [tableTab, setTableTab] = useState<TableTab>(() => {
    const saved = sessionStorage.getItem(TABLE_TAB_KEY);
    return (saved === "current" || saved === "past") ? saved : "current";
  });
  
  // Preload the Op (Anesthesia Record) chunk so it opens instantly
  useEffect(() => {
    preloadOp();
  }, []);

  // Persist viewMode changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  // Persist tableTab changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(TABLE_TAB_KEY, tableTab);
  }, [tableTab]);

  
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
      setLocation(`/anesthesia/preop/${selectedSurgeryId}`);
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

  const handleOpenSurgeryPreOp = () => {
    if (selectedSurgeryId) {
      // Save context before navigating away
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: selectedSurgeryId,
        patientId: selectedPatientId
      }));
      setSummaryOpen(false);
      setLocation(`/surgery/preop/${selectedSurgeryId}`);
    }
  };

  const handleEditPatient = () => {
    if (selectedPatientId) {
      // Save context before navigating away
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: selectedSurgeryId,
        patientId: selectedPatientId
      }));
      setSummaryOpen(false);
      // Navigate to patient detail page with openEdit param to trigger edit dialog
      const basePath = activeModule === 'surgery' ? '/surgery' : '/anesthesia';
      setLocation(`${basePath}/patients/${selectedPatientId}?openEdit=true`);
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
        
        <div className="flex items-center gap-3">
          {showExternalRequests && (
            <ExternalReservationsPanel
              defaultOpen={openRequestsFromUrl}
              trigger={
                <Button 
                  variant="outline" 
                  className="relative"
                  data-testid="button-external-requests"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t('anesthesia.opList.requests')}
                  <ExternalRequestsBadge />
                </Button>
              }
            />
          )}

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
      </div>

      {/* Calendar or Table View */}
      <div>
        {viewMode === "calendar" ? (
          <OPCalendar onEventClick={handleEventClick} />
        ) : (
          <div className="px-4">
            <Tabs value={tableTab} onValueChange={(v) => setTableTab(v as TableTab)}>
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="current" data-testid="tab-current-surgeries">
                  {t('surgeryPlanning.currentAndFuture')}
                </TabsTrigger>
                <TabsTrigger value="past" data-testid="tab-past-surgeries">
                  {t('surgeryPlanning.past')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="current" className="mt-4">
                <SurgeryPlanningTable
                  moduleContext="anesthesia"
                  onSurgeryClick={handleTableSurgeryClick}
                  dateFrom={(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return today;
                  })()}
                  dateTo={(() => {
                    const future = new Date();
                    future.setFullYear(future.getFullYear() + 1);
                    future.setHours(23, 59, 59, 999);
                    return future;
                  })()}
                  showFilters={true}
                />
              </TabsContent>
              <TabsContent value="past" className="mt-4">
                <SurgeryPlanningTable
                  moduleContext="anesthesia"
                  onSurgeryClick={handleTableSurgeryClick}
                  dateFrom={(() => {
                    const past = new Date();
                    past.setFullYear(past.getFullYear() - 2);
                    past.setHours(0, 0, 0, 0);
                    return past;
                  })()}
                  dateTo={(() => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    yesterday.setHours(23, 59, 59, 999);
                    return yesterday;
                  })()}
                  showFilters={true}
                />
              </TabsContent>
            </Tabs>
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
          onOpenSurgeryPreOp={handleOpenSurgeryPreOp}
          onEditPatient={handleEditPatient}
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
