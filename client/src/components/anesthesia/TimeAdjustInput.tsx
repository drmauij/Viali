import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/dateUtils";

interface TimeAdjustInputProps {
  value: number; // timestamp in milliseconds
  onChange: (newTime: number) => void;
  step?: number; // step in minutes, default 1
  className?: string;
  'data-testid'?: string;
}

export function TimeAdjustInput({ 
  value, 
  onChange, 
  step = 1, 
  className = "",
  'data-testid': testId 
}: TimeAdjustInputProps) {
  const timeStr = formatTime(new Date(value));
  const [inputValue, setInputValue] = useState(timeStr);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(timeStr);
    }
  }, [timeStr, isEditing]);

  const adjustTime = (minutes: number) => {
    const newDate = new Date(value);
    newDate.setMinutes(newDate.getMinutes() + minutes);
    onChange(newDate.getTime());
  };

  const parseAndFormatTime = (input: string): { formatted: string; hours: number; minutes: number } | null => {
    const digitsOnly = input.replace(/\D/g, '');
    
    if (digitsOnly.length === 0) {
      return null;
    }

    let hours: number;
    let minutes: number;

    if (digitsOnly.length <= 2) {
      hours = parseInt(digitsOnly, 10);
      minutes = 0;
    } else if (digitsOnly.length === 3) {
      hours = parseInt(digitsOnly.substring(0, 1), 10);
      minutes = parseInt(digitsOnly.substring(1, 3), 10);
    } else {
      hours = parseInt(digitsOnly.substring(0, 2), 10);
      minutes = parseInt(digitsOnly.substring(2, 4), 10);
    }

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    return { formatted, hours, minutes };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= 5) {
      setInputValue(newValue);
    }
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    const parsed = parseAndFormatTime(inputValue);
    
    if (parsed) {
      const newDate = new Date(value);
      newDate.setHours(parsed.hours, parsed.minutes, 0, 0);
      onChange(newDate.getTime());
      setInputValue(parsed.formatted);
    } else {
      setInputValue(timeStr);
    }
  };

  const handleInputFocus = () => {
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(timeStr);
      setIsEditing(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      adjustTime(step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      adjustTime(-step);
    }
  };

  return (
    <div 
      className={`flex items-center gap-1 ${className}`} 
      data-testid={testId}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => adjustTime(-step)}
        className="h-9 w-9"
        data-testid={`${testId}-decrement`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <Input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className="w-[70px] text-center font-mono text-lg font-medium px-2 h-9"
        data-testid={`${testId}-input`}
      />
      
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => adjustTime(step)}
        className="h-9 w-9"
        data-testid={`${testId}-increment`}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
