import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Plus, Trash2 } from "lucide-react";

type Medication = {
  name: string;
  dosage?: string;
  frequency?: string;
  reason?: string;
};

interface EditableMedicationsProps {
  medications: Medication[] | undefined;
  noMedications: boolean | undefined;
  canWrite: boolean;
  onMedicationsChange: (medications: Medication[]) => void;
  onNoMedicationsChange: (val: boolean) => void;
}

export function EditableMedications({
  medications,
  noMedications,
  canWrite,
  onMedicationsChange,
  onNoMedicationsChange,
}: EditableMedicationsProps) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMed, setNewMed] = useState<Medication>({ name: "" });

  const currentMeds = medications || [];

  // Read-only mode
  if (!canWrite) {
    if (noMedications) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>{t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}</span>
        </div>
      );
    }
    if (currentMeds.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">
          {t("questionnaireTab.noData", "No data provided")}
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {currentMeds.map((med, i) => (
          <div key={i} className="flex flex-wrap gap-2 text-sm p-2 border rounded">
            <span className="font-medium">{med.name}</span>
            {med.dosage && <span className="text-muted-foreground">| {med.dosage}</span>}
            {med.frequency && <span className="text-muted-foreground">| {med.frequency}</span>}
            {med.reason && <span className="text-muted-foreground">| {med.reason}</span>}
          </div>
        ))}
      </div>
    );
  }

  // None confirmed + add button
  if (noMedications) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>{t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onNoMedicationsChange(false)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("questionnaireTab.addItems", "Add items")}
        </Button>
      </div>
    );
  }

  const removeMed = (index: number) => {
    onMedicationsChange(currentMeds.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (!newMed.name.trim()) return;
    const cleaned: Medication = { name: newMed.name.trim() };
    if (newMed.dosage?.trim()) cleaned.dosage = newMed.dosage.trim();
    if (newMed.frequency?.trim()) cleaned.frequency = newMed.frequency.trim();
    if (newMed.reason?.trim()) cleaned.reason = newMed.reason.trim();
    onMedicationsChange([...currentMeds, cleaned]);
    setNewMed({ name: "" });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-3">
      {/* Existing medications as removable rows */}
      {currentMeds.length > 0 && (
        <div className="space-y-1.5">
          {currentMeds.map((med, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-sm p-2 border rounded group"
            >
              <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                <span className="font-medium">{med.name}</span>
                {med.dosage && <span className="text-muted-foreground">| {med.dosage}</span>}
                {med.frequency && <span className="text-muted-foreground">| {med.frequency}</span>}
                {med.reason && <span className="text-muted-foreground">| {med.reason}</span>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-destructive hover:text-destructive"
                onClick={() => removeMed(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add medication form */}
      {showAddForm ? (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("questionnaireTab.medName", "Name")} *
              </Label>
              <Input
                value={newMed.name}
                onChange={(e) => setNewMed((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder={t("questionnaireTab.medNamePlaceholder", "Medication name")}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("questionnaireTab.medDosage", "Dosage")}
              </Label>
              <Input
                value={newMed.dosage || ""}
                onChange={(e) => setNewMed((p) => ({ ...p, dosage: e.target.value }))}
                placeholder={t("questionnaireTab.medDosagePlaceholder", "e.g. 100mg")}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("questionnaireTab.medFrequency", "Frequency")}
              </Label>
              <Input
                value={newMed.frequency || ""}
                onChange={(e) => setNewMed((p) => ({ ...p, frequency: e.target.value }))}
                placeholder={t("questionnaireTab.medFrequencyPlaceholder", "e.g. 2x daily")}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("questionnaireTab.medReason", "Reason")}
              </Label>
              <Input
                value={newMed.reason || ""}
                onChange={(e) => setNewMed((p) => ({ ...p, reason: e.target.value }))}
                placeholder={t("questionnaireTab.medReasonPlaceholder", "e.g. hypertension")}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowAddForm(false);
                setNewMed({ name: "" });
              }}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleAdd}
              disabled={!newMed.name.trim()}
            >
              {t("questionnaireTab.addMedication", "Add")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("questionnaireTab.addMedicationBtn", "Add medication")}
        </Button>
      )}

      {/* Confirm none checkbox when empty */}
      {currentMeds.length === 0 && !showAddForm && (
        <div className="flex items-center space-x-2 pt-1">
          <input
            type="checkbox"
            id="med-none"
            checked={false}
            onChange={() => onNoMedicationsChange(true)}
            className="rounded border-input"
          />
          <label htmlFor="med-none" className="text-sm text-muted-foreground cursor-pointer">
            {t("questionnaireTab.confirmNone", "Confirm none")}
          </label>
        </div>
      )}
    </div>
  );
}
