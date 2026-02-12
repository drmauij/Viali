import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserCircle, AlertCircle, Download, X, Wifi, WifiOff, RefreshCw, Users, Camera, CameraOff, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { useTranslation } from "react-i18next";
import { getPositionDisplayLabel, getArmDisplayLabel } from "@/components/surgery/PatientPositionFields";

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'stale';

interface PatientInfoHeaderProps {
  patient: any;
  surgery: any;
  preOpAssessment: any;
  selectedAllergies: string[];
  otherAllergies: string;
  cave: string;
  allergyList?: Array<{ id: string; label: string }>;
  patientAge: number | null;
  isPreOpLoading: boolean;
  onDownloadPDF: () => void;
  onClose: () => void;
  onOpenAllergiesDialog: () => void;
  connectionState?: ConnectionState;
  viewers?: number;
  onForceReconnect?: () => void;
  cameraDeviceName?: string | null;
  isCameraConnected?: boolean;
  onOpenCameraDialog?: () => void;
}

export function PatientInfoHeader({
  patient,
  surgery,
  preOpAssessment,
  selectedAllergies,
  otherAllergies,
  cave,
  allergyList = [],
  patientAge,
  isPreOpLoading,
  onDownloadPDF,
  onClose,
  onOpenAllergiesDialog,
  connectionState = 'disconnected',
  viewers = 0,
  onForceReconnect,
  cameraDeviceName,
  isCameraConnected = false,
  onOpenCameraDialog,
}: PatientInfoHeaderProps) {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === 'de';
  const [showProcedureDialog, setShowProcedureDialog] = useState(false);

  const getConnectionIcon = () => {
    switch (connectionState) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting':
        return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'stale':
        return <WifiOff className="h-4 w-4 text-amber-500" />;
      case 'disconnected':
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />;
    }
  };

  const getConnectionLabel = () => {
    switch (connectionState) {
      case 'connected':
        return t('anesthesia.op.connectionStatus.connected', 'Live');
      case 'connecting':
        return t('anesthesia.op.connectionStatus.connecting', 'Connecting...');
      case 'stale':
        return t('anesthesia.op.connectionStatus.stale', 'Reconnecting...');
      case 'disconnected':
      default:
        return t('anesthesia.op.connectionStatus.disconnected', 'Offline');
    }
  };

  return (
    <div className="shrink-0 bg-background relative">
      {/* Action Buttons - Fixed top-right */}
      <div className="absolute right-2 top-2 md:right-4 md:top-4 z-10 flex items-center gap-2">
        {/* Camera Connection Indicator */}
        {onOpenCameraDialog && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  isCameraConnected 
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
                onClick={onOpenCameraDialog}
                data-testid="camera-connection-indicator"
              >
                {isCameraConnected ? (
                  <Camera className="h-4 w-4" />
                ) : (
                  <CameraOff className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {isCameraConnected 
                    ? (cameraDeviceName || t('anesthesia.op.cameraStatus.connected', 'Camera'))
                    : t('anesthesia.op.cameraStatus.notConnected', 'No Camera')
                  }
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isCameraConnected 
                  ? t('anesthesia.op.cameraStatus.connectedTooltip', 'Auto-capture active') + (cameraDeviceName ? `: ${cameraDeviceName}` : '')
                  : t('anesthesia.op.cameraStatus.notConnectedTooltip', 'Click to connect a camera for auto-capture')
                }
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Connection Status Indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                connectionState === 'connected' 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                  : connectionState === 'connecting' || connectionState === 'stale'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
              onClick={() => {
                if (connectionState !== 'connected' && onForceReconnect) {
                  onForceReconnect();
                }
              }}
              data-testid="connection-status-indicator"
            >
              {getConnectionIcon()}
              <span className="hidden sm:inline">{getConnectionLabel()}</span>
              {connectionState === 'connected' && viewers > 1 && (
                <span className="flex items-center gap-0.5 ml-1 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {viewers}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {connectionState === 'connected' 
                ? t('anesthesia.op.connectionStatus.connectedTooltip', 'Real-time sync active') + (viewers > 1 ? ` (${viewers} ${t('anesthesia.op.connectionStatus.viewers', 'viewers')})` : '')
                : connectionState === 'connecting' || connectionState === 'stale'
                  ? t('anesthesia.op.connectionStatus.reconnectingTooltip', 'Attempting to reconnect...')
                  : t('anesthesia.op.connectionStatus.disconnectedTooltip', 'Click to reconnect')
              }
            </p>
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          onClick={onDownloadPDF}
          data-testid="button-download-pdf"
          title={t('anesthesia.op.downloadCompleteRecordPDF')}
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="button-close-op"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="px-4 md:px-6 py-3 pr-12 md:pr-14">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4 md:flex-wrap">
          {/* Patient Name & Icon */}
          <div className="flex items-center gap-3">
            <UserCircle className="h-8 w-8 text-blue-500" />
            <div>
              <h2 className="font-bold text-base md:text-lg">
                {patient ? `${patient.firstName || ''} ${patient.surname || ''}`.trim() || t('anesthesia.op.patientFallback') : t('anesthesia.op.loadingData')}
              </h2>
              <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                {patient?.birthday && (
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {formatDate(patient.birthday)}{patientAge !== null && ` • ${patientAge} ${t('anesthesia.op.yearsOld')}`}
                  </p>
                )}
                {preOpAssessment && (
                  <div className="flex items-center gap-3 font-semibold text-sm">
                    {preOpAssessment.height && (
                      <>
                        <span className="text-foreground">{preOpAssessment.height} {t('anesthesia.op.cm')}</span>
                        <span className="text-muted-foreground">•</span>
                      </>
                    )}
                    {preOpAssessment.weight && (
                      <span className="text-foreground">{preOpAssessment.weight} {t('anesthesia.op.kg')}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Surgery Info - Compact clickable card */}
          <div
            className="px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg cursor-pointer hover:bg-primary/15 transition-colors flex items-center gap-2"
            onClick={() => setShowProcedureDialog(true)}
            data-testid="button-procedure-details"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary/70">{t('anesthesia.op.procedure').toUpperCase()}</p>
              <p className="font-semibold text-sm text-primary truncate">{surgery.plannedSurgery}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary/50 shrink-0" />
          </div>

          {/* Procedure Details Dialog */}
          <Dialog open={showProcedureDialog} onOpenChange={setShowProcedureDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t('anesthesia.op.procedure')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isGerman ? 'Eingriff' : 'Procedure'}</p>
                  <p className="font-semibold text-base mt-0.5">{surgery.plannedSurgery}</p>
                </div>

                {surgery.surgeon && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isGerman ? 'Chirurg' : 'Surgeon'}</p>
                    <p className="font-semibold text-base mt-0.5">{surgery.surgeon}</p>
                    {surgery.surgeonPhone && (
                      <a href={`tel:${surgery.surgeonPhone}`} className="text-xs text-primary underline mt-0.5 block" data-testid="link-surgeon-phone">
                        {surgery.surgeonPhone}
                      </a>
                    )}
                  </div>
                )}

                {surgery.plannedDate && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isGerman ? 'Datum & Dauer' : 'Date & Duration'}</p>
                    <p className="font-semibold text-base mt-0.5">
                      {formatDate(surgery.plannedDate)}
                      {surgery.actualEndTime && (() => {
                        const mins = Math.round((new Date(surgery.actualEndTime).getTime() - new Date(surgery.plannedDate).getTime()) / 60000);
                        if (mins <= 0) return '';
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        return ` · ${h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m} min`}`;
                      })()}
                    </p>
                  </div>
                )}

                {(surgery.patientPosition || surgery.leftArmPosition || surgery.rightArmPosition) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isGerman ? 'Lagerung' : 'Positioning'}</p>
                    <p className="font-semibold text-base mt-0.5">
                      {[
                        surgery.patientPosition && getPositionDisplayLabel(surgery.patientPosition, isGerman),
                        surgery.leftArmPosition && `${isGerman ? 'L. Arm' : 'L. Arm'}: ${getArmDisplayLabel(surgery.leftArmPosition, isGerman)}`,
                        surgery.rightArmPosition && `${isGerman ? 'R. Arm' : 'R. Arm'}: ${getArmDisplayLabel(surgery.rightArmPosition, isGerman)}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                )}

                {surgery.notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isGerman ? 'Bemerkungen' : 'Notes'}</p>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{surgery.notes}</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Allergies & CAVE - Clickable Display */}
          {(selectedAllergies.length > 0 || otherAllergies || cave) && (
            <div 
              onClick={onOpenAllergiesDialog}
              className="flex items-start gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
              data-testid="allergies-cave-warning"
            >
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex gap-4 flex-wrap flex-1">
                {(selectedAllergies.length > 0 || otherAllergies) && (
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('anesthesia.op.allergies').toUpperCase()}</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : 
                        [
                          ...selectedAllergies.map(id => 
                            allergyList.find(a => a.id === id)?.label || id
                          ),
                          ...(otherAllergies ? [otherAllergies] : [])
                        ].join(", ")
                      }
                    </p>
                  </div>
                )}
                {cave && (
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('anesthesia.op.cave').toUpperCase()}</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : cave}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
