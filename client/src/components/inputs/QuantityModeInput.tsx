import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

export type QuantityMode = "set" | "add" | "subtract";

/**
 * Computes the absolute resulting value the parent should submit to the
 * backend, given the user's reference value (current stock), chosen mode,
 * and raw input. `subtract` is clamped at 0 so a user can't accidentally
 * push stock negative through the UI.
 */
export function computeResultingAmount(
  referenceValue: number,
  mode: QuantityMode,
  raw: string,
): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return referenceValue;
  switch (mode) {
    case "set":
      return n;
    case "add":
      return referenceValue + n;
    case "subtract":
      return Math.max(0, referenceValue - n);
  }
}

interface Props {
  /**
   * Current stock value the delta is applied against. When 0, the mode
   * toggle is hidden (Add/Subtract have no meaning) and the input behaves
   * as a plain numeric field.
   */
  referenceValue: number;
  mode: QuantityMode;
  onModeChange: (m: QuantityMode) => void;
  /** Raw input string controlled by the parent. */
  inputValue: string;
  onInputChange: (v: string) => void;

  inputId?: string;
  inputName?: string;
  placeholder?: string;
  unit?: string;
  disabled?: boolean;
  /** Used to build deterministic data-testid attributes for the toggle + input. */
  testIdPrefix?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  min?: string;
  step?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  required?: boolean;
}

export function QuantityModeInput({
  referenceValue,
  mode,
  onModeChange,
  inputValue,
  onInputChange,
  inputId,
  inputName,
  placeholder,
  unit,
  disabled,
  testIdPrefix,
  inputRef,
  min,
  step,
  onFocus,
  required,
}: Props) {
  const { t } = useTranslation();
  const showToggle = referenceValue > 0 && !disabled;
  const resulting = computeResultingAmount(referenceValue, mode, inputValue);
  const parsed = parseFloat(inputValue);
  const showPreview =
    showToggle && mode !== "set" && Number.isFinite(parsed) && inputValue.trim() !== "";

  const tid = (suffix: string) =>
    testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined;

  const handleModeChange = (next: QuantityMode) => {
    if (next === mode) return;
    onModeChange(next);
    // Switching modes changes how the field is interpreted, so the contents
    // need to update too:
    //   → Set:        restore the absolute resulting value (so the user can
    //                 fine-tune the total instead of retyping it from scratch
    //                 — the original "100" isn't lost when bouncing through
    //                 Add and back).
    //   → Add/Sub:    clear the field (otherwise switching from Set=100 to
    //                 Add would silently mean "+100").
    if (next === "set") {
      const resulting = computeResultingAmount(referenceValue, mode, inputValue);
      onInputChange(String(resulting));
    } else {
      onInputChange("");
    }
  };

  return (
    <div className="space-y-1.5">
      {showToggle && (
        <div
          className="inline-flex rounded-md border border-border overflow-hidden text-sm"
          role="tablist"
          data-testid={tid("mode-toggle")}
        >
          {(["set", "add", "subtract"] as const).map(m => {
            const label =
              m === "set"
                ? t("quantityMode.set", "Set")
                : m === "add"
                ? t("quantityMode.add", "Add")
                : t("quantityMode.subtract", "Subtract");
            const prefix = m === "add" ? "+ " : m === "subtract" ? "− " : "";
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                data-testid={tid(`mode-${m}`)}
                onClick={() => handleModeChange(m)}
                className={`px-3 py-1 transition-colors ${
                  mode === m
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {prefix}
                {label}
              </button>
            );
          })}
        </div>
      )}
      <Input
        ref={inputRef}
        id={inputId}
        name={inputName}
        type="number"
        value={inputValue}
        onChange={e => onInputChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        step={step}
        onFocus={onFocus}
        required={required}
        data-testid={tid("input")}
      />
      {showToggle && mode !== "set" && (
        <div className="text-xs text-muted-foreground" data-testid={tid("preview")}>
          {showPreview ? (
            <>
              {referenceValue} {mode === "add" ? "+" : "−"} {parsed}{" "}
              <span className="text-foreground/60">=</span>{" "}
              <span className="font-semibold text-foreground">{resulting}</span>
              {unit ? ` ${unit}` : ""}
            </>
          ) : (
            <>
              {t("quantityMode.current", "Current")}:{" "}
              <span className="font-semibold text-foreground">{referenceValue}</span>
              {unit ? ` ${unit}` : ""}
            </>
          )}
        </div>
      )}
    </div>
  );
}
