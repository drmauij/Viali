import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { parseFlexibleDate, isoToDisplayDate } from "@/lib/dateUtils";

interface FlexibleDateInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "data-testid"?: string;
}

export function FlexibleDateInput({
  value,
  onChange,
  placeholder = "dd.MM.yyyy",
  disabled = false,
  id,
  className,
  "data-testid": dataTestId,
}: FlexibleDateInputProps) {
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    if (value) {
      const parsed = parseFlexibleDate(value);
      if (parsed) {
        setDisplayValue(parsed.displayDate);
      } else {
        setDisplayValue(isoToDisplayDate(value) || value);
      }
    } else {
      setDisplayValue("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);
    
    const parsed = parseFlexibleDate(inputValue);
    if (parsed) {
      onChange(parsed.isoDate);
    } else {
      onChange(inputValue);
    }
  };

  const handleBlur = () => {
    const parsed = parseFlexibleDate(displayValue);
    if (parsed) {
      setDisplayValue(parsed.displayDate);
      onChange(parsed.isoDate);
    }
  };

  return (
    <Input
      id={id}
      type="text"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className={className}
      data-testid={dataTestId}
    />
  );
}
