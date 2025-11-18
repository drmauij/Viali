import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, StopCircle, PlayCircle } from "lucide-react";
import { TimeAdjustInput } from "@/components/anesthesia/TimeAdjustInput";

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
  sheetDoseInput,
  onSheetDoseInputChange,
  sheetTimeInput,
  onSheetTimeInputChange,
}: FreeFlowManageDialogProps) {
  
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
          <DialogTitle>{freeFlowSheetSession?.label || 'Free-Flow Infusion'}</DialogTitle>
          <DialogDescription>
            Manage this free-flow infusion
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
                  <Label htmlFor="sheet-dose" className="text-xs">Quantity</Label>
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
                  <Label htmlFor="sheet-time" className="text-xs">Start Time</Label>
                  <TimeAdjustInput
                    value={sheetTimeInput}
                    onChange={onSheetTimeInputChange}
                    data-testid="input-sheet-time"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onSheetDelete}
                  data-testid="button-sheet-delete"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
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
                      Stop
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
                      Save
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
                      Start New
                    </Button>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
