import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale } from "lucide-react";

interface PatientWeightDialogProps {
  open: boolean;
  patientName?: string;
  onSave: (weight: string) => void;
}

export function PatientWeightDialog({ open, patientName, onSave }: PatientWeightDialogProps) {
  const { t } = useTranslation();
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    const weightNum = parseFloat(weight);
    
    if (!weight || isNaN(weightNum) || weightNum <= 0 || weightNum > 500) {
      setError(t('anesthesia.weightDialog.error'));
      return;
    }
    
    setError("");
    onSave(weight);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent 
        className="sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Scale className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {t('anesthesia.weightDialog.title')}
              </DialogTitle>
              {patientName && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t('anesthesia.weightDialog.patient')}: {patientName}
                </p>
              )}
            </div>
          </div>
          <DialogDescription>
            {t('anesthesia.weightDialog.description')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="weight" className="text-base">
              {t('anesthesia.weightDialog.weightLabel')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="weight"
                type="number"
                step="0.1"
                min="1"
                max="500"
                placeholder="70"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                className="text-lg"
                autoFocus
                data-testid="input-patient-weight"
              />
              <div className="flex items-center justify-center px-4 border rounded-md bg-muted text-muted-foreground font-medium">
                kg
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          
          <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
            <p className="font-medium mb-1">{t('anesthesia.weightDialog.whyNeeded')}</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>{t('anesthesia.weightDialog.reason1')}</li>
              <li>{t('anesthesia.weightDialog.reason2')}</li>
              <li>{t('anesthesia.weightDialog.reason3')}</li>
            </ul>
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button
            onClick={handleSave}
            size="lg"
            className="min-w-32"
            data-testid="button-save-weight"
          >
            {t('anesthesia.weightDialog.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
