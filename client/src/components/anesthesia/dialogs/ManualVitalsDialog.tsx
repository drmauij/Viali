import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TimeAdjustInput } from "@/components/anesthesia/TimeAdjustInput";
import { Heart, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ManualVitalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTime: number;
  initialValues?: {
    hr?: number;
    sys?: number;
    dia?: number;
    spo2?: number;
  };
  onSave: (data: {
    hr?: number;
    sys?: number;
    dia?: number;
    spo2?: number;
    time: number;
  }) => void;
}

export function ManualVitalsDialog({
  open,
  onOpenChange,
  initialTime,
  initialValues,
  onSave,
}: ManualVitalsDialogProps) {
  const { t } = useTranslation();
  const [time, setTime] = useState(initialTime);
  const [hr, setHr] = useState<string>("");
  const [sys, setSys] = useState<string>("");
  const [dia, setDia] = useState<string>("");
  const [spo2, setSpo2] = useState<string>("");

  const hrRef = useRef<HTMLInputElement>(null);
  const sysRef = useRef<HTMLInputElement>(null);
  const diaRef = useRef<HTMLInputElement>(null);
  const spo2Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTime(initialTime);
      // Pre-fill with existing values if provided, otherwise reset to empty
      setHr(initialValues?.hr !== undefined ? String(initialValues.hr) : "");
      setSys(initialValues?.sys !== undefined ? String(initialValues.sys) : "");
      setDia(initialValues?.dia !== undefined ? String(initialValues.dia) : "");
      setSpo2(initialValues?.spo2 !== undefined ? String(initialValues.spo2) : "");
      // Focus first input when dialog opens
      setTimeout(() => hrRef.current?.focus(), 100);
    }
  }, [open, initialTime, initialValues]);

  const handleKeyDown = (e: React.KeyboardEvent, nextRef: React.RefObject<HTMLInputElement> | null) => {
    if (e.key === 'Tab' && nextRef) {
      e.preventDefault();
      nextRef.current?.focus();
    } else if (e.key === 'Enter') {
      handleSave();
    }
  };

  const handleSave = () => {
    const data: any = { time };
    
    if (hr.trim()) {
      const hrValue = parseInt(hr);
      if (!isNaN(hrValue) && hrValue >= 0 && hrValue <= 300) {
        data.hr = hrValue;
      }
    }
    
    if (sys.trim()) {
      const sysValue = parseInt(sys);
      if (!isNaN(sysValue) && sysValue >= 0 && sysValue <= 300) {
        data.sys = sysValue;
      }
    }
    
    if (dia.trim()) {
      const diaValue = parseInt(dia);
      if (!isNaN(diaValue) && diaValue >= 0 && diaValue <= 300) {
        data.dia = diaValue;
      }
    }
    
    if (spo2.trim()) {
      const spo2Value = parseInt(spo2);
      if (!isNaN(spo2Value) && spo2Value >= 0 && spo2Value <= 100) {
        data.spo2 = spo2Value;
      }
    }

    // Only save if at least one vital is provided
    if (data.hr !== undefined || data.sys !== undefined || data.dia !== undefined || data.spo2 !== undefined) {
      onSave(data);
      onOpenChange(false);
    }
  };

  const hasAnyValue = hr.trim() || sys.trim() || dia.trim() || spo2.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-manual-vitals">
        <DialogHeader>
          <DialogTitle>{t('dialogs.manualVitalSigns')}</DialogTitle>
          <DialogDescription>
            {t('dialogs.manualVitalsDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="hr" className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                {t('dialogs.heartRate')}
              </Label>
              <Input
                id="hr"
                ref={hrRef}
                type="number"
                value={hr}
                onChange={(e) => setHr(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, sysRef)}
                placeholder="e.g., 75"
                min="0"
                max="300"
                data-testid="input-hr"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="spo2" className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                {t('dialogs.spo2')}
              </Label>
              <Input
                id="spo2"
                ref={spo2Ref}
                type="number"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, null)}
                placeholder="e.g., 98"
                min="0"
                max="100"
                data-testid="input-spo2"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sys">{t('dialogs.systolic')}</Label>
              <Input
                id="sys"
                ref={sysRef}
                type="number"
                value={sys}
                onChange={(e) => setSys(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, diaRef)}
                placeholder="e.g., 120"
                min="0"
                max="300"
                data-testid="input-sys"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dia">{t('dialogs.diastolic')}</Label>
              <Input
                id="dia"
                ref={diaRef}
                type="number"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, spo2Ref)}
                placeholder="e.g., 80"
                min="0"
                max="300"
                data-testid="input-dia"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('common.time')}</Label>
            <TimeAdjustInput
              value={time}
              onChange={setTime}
              data-testid="input-vital-time"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasAnyValue}
            data-testid="button-save"
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
