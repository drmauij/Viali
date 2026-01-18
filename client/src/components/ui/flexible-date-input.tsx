import { useState, useEffect, useRef } from "react";
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
  const [isFocused, setIsFocused] = useState(false);
  const lastExternalValue = useRef(value);

  useEffect(() => {
    if (!isFocused && value !== lastExternalValue.current) {
      lastExternalValue.current = value;
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
    }
  }, [value, isFocused]);

  useEffect(() => {
    if (!displayValue && value) {
      const parsed = parseFlexibleDate(value);
      if (parsed) {
        setDisplayValue(parsed.displayDate);
      } else {
        setDisplayValue(isoToDisplayDate(value) || value);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);
    
    const parsed = parseFlexibleDate(inputValue);
    if (parsed) {
      lastExternalValue.current = parsed.isoDate;
      onChange(parsed.isoDate);
    } else {
      lastExternalValue.current = inputValue;
      onChange(inputValue);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFlexibleDate(displayValue);
    if (parsed) {
      setDisplayValue(parsed.displayDate);
      lastExternalValue.current = parsed.isoDate;
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
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      className={className}
      data-testid={dataTestId}
    />
  );
}
