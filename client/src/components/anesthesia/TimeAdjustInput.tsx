import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const date = new Date(value);
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });

  const adjustTime = (minutes: number) => {
    const newDate = new Date(value);
    newDate.setMinutes(newDate.getMinutes() + minutes);
    onChange(newDate.getTime());
  };

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid={testId}>
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
