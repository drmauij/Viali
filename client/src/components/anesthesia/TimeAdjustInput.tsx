import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const adjustTime = (minutes: number) => {
    const newDate = new Date(value);
    newDate.setMinutes(newDate.getMinutes() + minutes);
    onChange(newDate.getTime());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      adjustTime(-step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      adjustTime(step);
    }
  };

  return (
    <div 
      className={`flex items-center gap-2 ${className}`} 
      data-testid={testId}
      onKeyDown={handleKeyDown}
      tabIndex={0}
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
      
      <div className="flex-1 text-center font-mono text-lg font-medium border rounded-md py-1.5 px-3 bg-background min-w-[80px]">
        {timeStr}
      </div>
      
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
