import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Camera, CameraOff, Loader2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CameraDevice {
  id: string;
  cameraId: string;
  name: string;
  surgeryRoomId?: string | null;
  isActive?: boolean;
  lastSeenAt?: string | null;
}

interface CameraConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cameraDevices: CameraDevice[];
  isLoadingDevices: boolean;
  currentCameraDeviceId: string | null;
  autoCaptureEnabled: boolean;
  onSave: (cameraDeviceId: string | null, autoCaptureEnabled: boolean) => void;
  isSaving: boolean;
}

export function CameraConnectionDialog({
  open,
  onOpenChange,
  cameraDevices,
  isLoadingDevices,
  currentCameraDeviceId,
  autoCaptureEnabled,
  onSave,
  isSaving,
}: CameraConnectionDialogProps) {
  const { t } = useTranslation();
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(currentCameraDeviceId);
  const [autoCapture, setAutoCapture] = useState(autoCaptureEnabled);

  useEffect(() => {
    if (open) {
      setSelectedCameraId(currentCameraDeviceId);
      setAutoCapture(autoCaptureEnabled);
    }
  }, [open, currentCameraDeviceId, autoCaptureEnabled]);

  const handleSave = () => {
    onSave(selectedCameraId, autoCapture);
  };

  const handleDisconnect = () => {
    onSave(null, false);
  };

  const selectedCamera = cameraDevices.find(d => d.id === selectedCameraId);
  const isConnected = !!currentCameraDeviceId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {t('anesthesia.op.cameraDialog.title', 'Camera Connection')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isLoadingDevices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cameraDevices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CameraOff className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {t('anesthesia.op.cameraDialog.noDevices', 'No camera devices registered for this hospital.')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('anesthesia.op.cameraDialog.contactAdmin', 'Contact your administrator to set up camera devices.')}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t('anesthesia.op.cameraDialog.selectCamera', 'Select Camera')}</Label>
                <Select 
                  value={selectedCameraId || ""} 
                  onValueChange={(value) => setSelectedCameraId(value || null)}
                >
                  <SelectTrigger data-testid="select-camera-device">
                    <SelectValue placeholder={t('anesthesia.op.cameraDialog.selectPlaceholder', 'Choose a camera...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {cameraDevices.map((device) => (
                      <SelectItem key={device.id} value={device.id} data-testid={`camera-option-${device.id}`}>
                        <div className="flex items-center gap-2">
                          <span>{device.name}</span>
                          {device.lastSeenAt && (
                            <span className="text-xs text-muted-foreground">
                              ({device.cameraId})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCameraId && (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-capture" className="text-base">
                      {t('anesthesia.op.cameraDialog.autoCapture', 'Auto-Capture')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('anesthesia.op.cameraDialog.autoCaptureDesc', 'Automatically fetch and process vitals from camera images')}
                    </p>
                  </div>
                  <Switch
                    id="auto-capture"
                    checked={autoCapture}
                    onCheckedChange={setAutoCapture}
                    data-testid="toggle-auto-capture"
                  />
                </div>
              )}

              {selectedCameraId && autoCapture && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {t('anesthesia.op.cameraDialog.autoCaptureInfo', 'When enabled, the system will periodically fetch the latest camera image and use AI to extract vital signs automatically.')}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {isConnected && (
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isSaving}
              className="w-full sm:w-auto"
              data-testid="button-disconnect-camera"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CameraOff className="h-4 w-4 mr-2" />}
              {t('anesthesia.op.cameraDialog.disconnect', 'Disconnect')}
            </Button>
          )}
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="flex-1 sm:flex-none"
              data-testid="button-cancel-camera"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || cameraDevices.length === 0}
              className="flex-1 sm:flex-none"
              data-testid="button-save-camera"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('common.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
