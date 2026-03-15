import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AllergyOption {
  id: string;
  label: string;
}

interface AllergiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId?: string;
  currentAllergies: string[];
  currentOtherAllergies: string;
  currentCave: string;
  allergyOptions: AllergyOption[];
  preOpAssessmentId?: string;
  surgeryId?: string;
  onSaved?: (data: {
    allergies: string[];
    otherAllergies: string;
    cave: string;
  }) => void;
}

export function AllergiesDialog({
  open,
  onOpenChange,
  patientId,
  currentAllergies,
  currentOtherAllergies,
  currentCave,
  allergyOptions,
  preOpAssessmentId,
  surgeryId,
  onSaved,
}: AllergiesDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [tempSelectedAllergies, setTempSelectedAllergies] = useState<string[]>([...currentAllergies]);
  const [tempOtherAllergies, setTempOtherAllergies] = useState(currentOtherAllergies);
  const [tempCave, setTempCave] = useState(currentCave);

  const handleToggleAllergy = (allergyId: string) => {
    setTempSelectedAllergies(prev =>
      prev.includes(allergyId)
        ? prev.filter(id => id !== allergyId)
        : [...prev, allergyId]
    );
  };

  const handleSave = async () => {
    try {
      // Save allergies to patient
      if (patientId) {
        await apiRequest('PATCH', `/api/patients/${patientId}`, {
          allergies: tempSelectedAllergies,
          otherAllergies: tempOtherAllergies,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}`] });
      }

      // Save CAVE to preOp assessment
      if (preOpAssessmentId) {
        await apiRequest('PATCH', `/api/anesthesia/preop/${preOpAssessmentId}`, {
          cave: tempCave,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/${surgeryId}`] });
      }

      onSaved?.({
        allergies: tempSelectedAllergies,
        otherAllergies: tempOtherAllergies,
        cave: tempCave,
      });

      onOpenChange(false);
      toast({
        title: t('common.saved'),
        description: t('anesthesia.op.allergiesSaved'),
      });
    } catch (error) {
      console.error('Error saving allergies/CAVE:', error);
      toast({
        title: t('anesthesia.op.error'),
        description: t('anesthesia.op.errorSaving'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('anesthesia.op.editAllergiesCave')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Allergies List - Checkboxes from Anesthesia Settings */}
          <div className="space-y-2">
            <Label>{t('anesthesia.op.allergies')}</Label>
            <div className="border rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {allergyOptions.length > 0 ? (
                allergyOptions.map((allergy) => (
                  <div key={allergy.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`allergy-${allergy.id}`}
                      checked={tempSelectedAllergies.includes(allergy.id)}
                      onCheckedChange={() => handleToggleAllergy(allergy.id)}
                      data-testid={`checkbox-allergy-${allergy.id}`}
                    />
                    <Label
                      htmlFor={`allergy-${allergy.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {allergy.label}
                    </Label>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t('anesthesia.op.noAllergyOptionsConfigured')}</p>
              )}
            </div>
          </div>

          {/* Other Allergies - Free Text */}
          <div className="space-y-2">
            <Label htmlFor="otherAllergies">{t('anesthesia.op.otherAllergies')}</Label>
            <Textarea
              id="otherAllergies"
              rows={2}
              placeholder={t('anesthesia.op.enterOtherAllergies')}
              value={tempOtherAllergies}
              onChange={(e) => setTempOtherAllergies(e.target.value)}
              data-testid="textarea-edit-other-allergies"
            />
          </div>

          {/* CAVE - Free Text */}
          <div className="space-y-2">
            <Label htmlFor="cave">{t('anesthesia.op.cave')}</Label>
            <Textarea
              id="cave"
              rows={2}
              placeholder={t('anesthesia.op.enterContraindications')}
              value={tempCave}
              onChange={(e) => setTempCave(e.target.value)}
              data-testid="textarea-edit-cave"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-allergies"
            >
              {t('anesthesia.op.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              data-testid="button-save-allergies"
            >
              {t('anesthesia.op.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
