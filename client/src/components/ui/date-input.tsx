import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { formatDate, formatDateForInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

export interface DateInputProps {
  /** ISO date string "YYYY-MM-DD" */
  value: string;
  /** Receives ISO date string "YYYY-MM-DD" */
  onChange: (isoDate: string) => void;
  /** ISO date string for minimum selectable date */
  min?: string;
  /** ISO date string for maximum selectable date */
  max?: string;
  /** Custom function to disable specific dates */
  disabledDate?: (date: Date) => boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Calendar-based date picker that respects hospital regional formatting.
 * Drop-in replacement for <Input type="date" />.
 * Value and onChange use ISO "YYYY-MM-DD" strings, same as native inputs.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  disabledDate,
  placeholder = "Pick date",
  disabled,
  className,
  "data-testid": testId,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);

  const selectedDate = value ? new Date(value + "T00:00:00") : undefined;
  const minDate = min ? new Date(min + "T00:00:00") : undefined;
  const maxDate = max ? new Date(max + "T00:00:00") : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !value && "text-muted-foreground",
            className,
          )}
          data-testid={testId}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {value ? formatDate(selectedDate!) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) {
              onChange(formatDateForInput(date));
              setOpen(false);
            }
          }}
          disabled={(date) => {
            if (minDate) {
              const minStart = new Date(minDate);
              minStart.setHours(0, 0, 0, 0);
              if (date < minStart) return true;
            }
            if (maxDate) {
              const maxEnd = new Date(maxDate);
              maxEnd.setHours(23, 59, 59, 999);
              if (date > maxEnd) return true;
            }
            if (disabledDate?.(date)) return true;
            return false;
          }}
          defaultMonth={selectedDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
