import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

export const PATIENT_POSITIONS = [
  "supine", "trendelenburg", "reverse_trendelenburg", "lithotomy",
  "lateral_decubitus", "prone", "jackknife", "sitting", "kidney", "lloyd_davies"
] as const;

export type PatientPositionType = typeof PATIENT_POSITIONS[number] | "";
export type ArmPositionType = "ausgelagert" | "angelagert" | "";

const POSITION_LABELS: Record<string, { en: string; de: string }> = {
  supine: { en: "Supine", de: "Rückenlage" },
  trendelenburg: { en: "Trendelenburg", de: "Trendelenburg" },
  reverse_trendelenburg: { en: "Reverse Trendelenburg", de: "Anti-Trendelenburg" },
  lithotomy: { en: "Lithotomy", de: "Steinschnittlage" },
  lateral_decubitus: { en: "Lateral Decubitus", de: "Seitenlage" },
  prone: { en: "Prone", de: "Bauchlage" },
  jackknife: { en: "Jackknife", de: "Klappmesser" },
  sitting: { en: "Sitting", de: "Sitzend" },
  kidney: { en: "Kidney", de: "Nierenlage" },
  lloyd_davies: { en: "Lloyd Davies", de: "Lloyd Davies" },
};

const ARM_LABELS: Record<string, { en: string; de: string }> = {
  ausgelagert: { en: "Extended", de: "Ausgelagert" },
  angelagert: { en: "Tucked", de: "Angelagert" },
};

interface PatientPositionFieldsProps {
  patientPosition: PatientPositionType;
  leftArmPosition: ArmPositionType;
  rightArmPosition: ArmPositionType;
  onPatientPositionChange: (value: PatientPositionType) => void;
  onLeftArmPositionChange: (value: ArmPositionType) => void;
  onRightArmPositionChange: (value: ArmPositionType) => void;
  disabled?: boolean;
  testIdPrefix?: string;
}

export function PatientPositionFields({
  patientPosition,
  leftArmPosition,
  rightArmPosition,
  onPatientPositionChange,
  onLeftArmPositionChange,
  onRightArmPositionChange,
  disabled = false,
  testIdPrefix = "",
}: PatientPositionFieldsProps) {
  const { i18n } = useTranslation();
  const isGerman = i18n.language === "de";

  const getPositionLabel = (key: string) => {
    const labels = POSITION_LABELS[key];
    return labels ? (isGerman ? labels.de : labels.en) : key;
  };

  const getArmLabel = (key: string) => {
    const labels = ARM_LABELS[key];
    return labels ? (isGerman ? labels.de : labels.en) : key;
  };

  return (
    <>
      <div className="space-y-2">
        <Label>{isGerman ? "Patientenlagerung" : "Patient Position"}</Label>
        <div className="flex gap-2 items-center">
          <Select
            value={patientPosition || "__none__"}
            onValueChange={(v) => onPatientPositionChange(v === "__none__" ? "" : v as PatientPositionType)}
            disabled={disabled}
          >
            <SelectTrigger className="min-h-[44px]" data-testid={`${testIdPrefix}select-patient-position`}>
              <SelectValue placeholder={isGerman ? "Position wählen..." : "Select position..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{isGerman ? "Keine Auswahl" : "No selection"}</SelectItem>
              {PATIENT_POSITIONS.map((pos) => (
                <SelectItem key={pos} value={pos} data-testid={`${testIdPrefix}option-position-${pos}`}>
                  {getPositionLabel(pos)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{isGerman ? "Linker Arm" : "Left Arm"}</Label>
          <div className="flex gap-1">
            <button
              type="button"
              className={`flex items-center justify-center cursor-pointer px-3 py-2 rounded-lg border transition-colors min-h-[44px] flex-1 text-center ${
                leftArmPosition === "ausgelagert"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background hover:bg-accent"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => !disabled && onLeftArmPositionChange(leftArmPosition === "ausgelagert" ? "" : "ausgelagert")}
              disabled={disabled}
              data-testid={`${testIdPrefix}radio-left-arm-ausgelagert`}
            >
              <span className="text-xs font-medium">{getArmLabel("ausgelagert")}</span>
            </button>
            <button
              type="button"
              className={`flex items-center justify-center cursor-pointer px-3 py-2 rounded-lg border transition-colors min-h-[44px] flex-1 text-center ${
                leftArmPosition === "angelagert"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background hover:bg-accent"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => !disabled && onLeftArmPositionChange(leftArmPosition === "angelagert" ? "" : "angelagert")}
              disabled={disabled}
              data-testid={`${testIdPrefix}radio-left-arm-angelagert`}
            >
              <span className="text-xs font-medium">{getArmLabel("angelagert")}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{isGerman ? "Rechter Arm" : "Right Arm"}</Label>
          <div className="flex gap-1">
            <button
              type="button"
              className={`flex items-center justify-center cursor-pointer px-3 py-2 rounded-lg border transition-colors min-h-[44px] flex-1 text-center ${
                rightArmPosition === "ausgelagert"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background hover:bg-accent"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => !disabled && onRightArmPositionChange(rightArmPosition === "ausgelagert" ? "" : "ausgelagert")}
              disabled={disabled}
              data-testid={`${testIdPrefix}radio-right-arm-ausgelagert`}
            >
              <span className="text-xs font-medium">{getArmLabel("ausgelagert")}</span>
            </button>
            <button
              type="button"
              className={`flex items-center justify-center cursor-pointer px-3 py-2 rounded-lg border transition-colors min-h-[44px] flex-1 text-center ${
                rightArmPosition === "angelagert"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background hover:bg-accent"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => !disabled && onRightArmPositionChange(rightArmPosition === "angelagert" ? "" : "angelagert")}
              disabled={disabled}
              data-testid={`${testIdPrefix}radio-right-arm-angelagert`}
            >
              <span className="text-xs font-medium">{getArmLabel("angelagert")}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function getPositionDisplayLabel(position: string | null | undefined, isGerman: boolean): string {
  if (!position) return "";
  const labels = POSITION_LABELS[position];
  return labels ? (isGerman ? labels.de : labels.en) : position;
}

export function getArmDisplayLabel(position: string | null | undefined, isGerman: boolean): string {
  if (!position) return "";
  const labels = ARM_LABELS[position];
  return labels ? (isGerman ? labels.de : labels.en) : position;
}
