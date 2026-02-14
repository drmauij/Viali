import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, StopCircle, PlayCircle, Copy } from "lucide-react";
import { TimeAdjustInput } from "@/components/anesthesia/TimeAdjustInput";
import { useTranslation } from "react-i18next";

interface FreeFlowSession {
  swimlaneId: string;
  startTime: number;
  dose: string;
  label: string;
}

interface FreeFlowSheetSession {
  swimlaneId: string;
  startTime: number;
  dose: string;
  label: string;
  clickMode?: 'segment' | 'label';
}

interface FreeFlowManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freeFlowSheetSession: FreeFlowSheetSession | null;
  freeFlowSessions: Record<string, FreeFlowSession[]>;
  infusionData: Record<string, [number, string][]>;
  onSheetSave: () => void;
  onSheetDelete: () => void;
  onSheetStop: () => void;
  onSheetStartNew: () => void;
  onSheetDuplicate?: () => void;
  sheetDoseInput: string;
  onSheetDoseInputChange: (value: string) => void;
  sheetTimeInput: number;
  onSheetTimeInputChange: (value: number) => void;
}

export function FreeFlowManageDialog({
  open,
  onOpenChange,
  freeFlowSheetSession,
  freeFlowSessions,
  infusionData,
  onSheetSave,
  onSheetDelete,
  onSheetStop,
  onSheetStartNew,
  onSheetDuplicate,
  sheetDoseInput,
  onSheetDoseInputChange,
  sheetTimeInput,
  onSheetTimeInputChange,
}: FreeFlowManageDialogProps) {
  const { t } = useTranslation();

  // Sync session data to form when session changes
  useEffect(() => {
    if (freeFlowSheetSession) {
      onSheetDoseInputChange(freeFlowSheetSession.dose);
      onSheetTimeInputChange(freeFlowSheetSession.startTime);
    }
  }, [freeFlowSheetSession]);

  const handleClose = () => {
    onOpenChange(false);
    onSheetDoseInputChange("");
    onSheetTimeInputChange(0);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      }
    }}>
      <DialogContent className="sm:max-w-[450px]" data-testid="dialog-freeflow-sheet">
        <DialogHeader>
          <DialogTitle>{freeFlowSheetSession?.label || t('anesthesia.timeline.freeFlowInfusion', 'Free-Flow Infusion')}</DialogTitle>
          <DialogDescription>
            {t('anesthesia.timeline.manageFreeFlow', 'Manage this free-flow infusion')}
          </DialogDescription>
        </DialogHeader>
        
        {freeFlowSheetSession && (() => {
          const { swimlaneId, clickMode } = freeFlowSheetSession;
          
          // Determine running state
          const hasActiveSession = (freeFlowSessions[swimlaneId] || []).length > 0;
          const existingData = infusionData[swimlaneId] || [];
          const sortedData = [...existingData].sort((a, b) => b[0] - a[0]);
          const latestDoseMarker = sortedData.find(([_, val]) => val !== "");
          const latestStopMarker = sortedData.find(([_, val]) => val === "");
          const isRunning = latestDoseMarker && 
            (!latestStopMarker || latestDoseMarker[0] >= latestStopMarker[0]) &&
            hasActiveSession;
          
          return (
            <>
              {/* Parameters - always visible */}
              <div className="grid gap-3 mb-4">
                <div className="grid gap-2">
                  <Label htmlFor="sheet-dose" className="text-xs">{t('anesthesia.timeline.quantity', 'Quantity')}</Label>
                  <Input
                    id="sheet-dose"
                    type="number"
                    inputMode="decimal"
                    data-testid="input-sheet-dose"
                    value={sheetDoseInput}
                    onChange={(e) => onSheetDoseInputChange(e.target.value)}
                    placeholder="e.g., 1000"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sheet-time" className="text-xs">{t('anesthesia.timeline.startTime', 'Start Time')}</Label>
                  <TimeAdjustInput
                    value={sheetTimeInput}
                    onChange={onSheetTimeInputChange}
                    data-testid="input-sheet-time"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onSheetDelete}
                    data-testid="button-sheet-delete"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t('common.delete', 'Delete')}
                  </Button>
                  
                  <div className="flex gap-2">
                    {/* Stop button (when running) */}
                    {isRunning && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={onSheetStop}
                        data-testid="button-sheet-stop"
                      >
                        <StopCircle className="w-4 h-4 mr-1" />
                        {t('anesthesia.timeline.stop', 'Stop')}
                      </Button>
                    )}
                    
                    {/* Save button (when clicking label) */}
                    {clickMode === 'label' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onSheetSave}
                        data-testid="button-sheet-save"
                        disabled={!sheetDoseInput.trim()}
                      >
                        {t('common.save', 'Save')}
                      </Button>
                    )}
                    
                    {/* Start New button (when clicking segment) */}
                    {clickMode === 'segment' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onSheetStartNew}
                        data-testid="button-sheet-start-new"
                      >
                        <PlayCircle className="w-4 h-4 mr-1" />
                        {t('anesthesia.timeline.startNew', 'Start New')}
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Duplicate button - creates a parallel infusion */}
                {isRunning && onSheetDuplicate && (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs text-muted-foreground text-center">
                      {t('anesthesia.timeline.createParallelInfusion', 'Create a parallel infusion:')}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onSheetDuplicate}
                      data-testid="button-sheet-duplicate"
                      className="w-full"
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      {t('anesthesia.timeline.duplicateParallel', 'Duplicate (Parallel Infusion)')}
                    </Button>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
