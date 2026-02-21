import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TimeInputProps {
  /** Time string "HH:mm" (24h) */
  value: string;
  /** Receives normalized "HH:mm" (24h) string */
  onChange: (time: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Normalize loose time input (e.g. "8", "800", "8:0", "17:3") to "HH:mm" 24h format.
 */
function normalizeTimeInput(raw: string): string | null {
  const s = raw.trim().replace(/[^\d:]/g, "");
  if (!s) return null;

  let h: number, m: number;

  if (s.includes(":")) {
    const [hh, mm] = s.split(":");
    h = parseInt(hh, 10);
    m = parseInt(mm || "0", 10);
  } else if (s.length <= 2) {
    h = parseInt(s, 10);
    m = 0;
  } else {
    // "800" → 8:00, "1730" → 17:30
    h = parseInt(s.slice(0, -2), 10);
    m = parseInt(s.slice(-2), 10);
  }

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Text-based time input that always displays and stores 24h "HH:mm" format.
 * Drop-in replacement for <Input type="time" />.
 * Normalizes input on blur (e.g. "8" → "08:00", "1730" → "17:30").
 */
export function TimeInput({
  value,
  onChange,
  placeholder = "HH:mm",
  required,
  disabled,
  className,
  "data-testid": testId,
}: TimeInputProps) {
  const [localValue, setLocalValue] = React.useState(value);

  // Sync with external value
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={localValue}
      disabled={disabled}
      required={required}
      className={cn("tabular-nums", className)}
      data-testid={testId}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d:]/g, "");
        setLocalValue(v);
      }}
      onBlur={() => {
        const normalized = normalizeTimeInput(localValue);
        if (normalized) {
          setLocalValue(normalized);
          onChange(normalized);
        } else if (localValue === "") {
          onChange("");
        } else {
          // Revert to last valid value
          setLocalValue(value);
        }
      }}
    />
  );
}
