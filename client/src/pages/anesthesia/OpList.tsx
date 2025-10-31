import { useLocation } from "wouter";
import OPCalendar from "@/components/anesthesia/OPCalendar";

export default function OpList() {
  const [, setLocation] = useLocation();

  const handleEventClick = (caseId: string) => {
    setLocation(`/anesthesia/cases/${caseId}/op`);
  };

  return (
    <div className="container mx-auto px-0 py-6 pb-24 h-[calc(100vh-200px)]">
      {/* Header */}
      <div className="mb-6 px-4">
        <h1 className="text-2xl font-bold mb-2">OP Schedule</h1>
        <p className="text-sm text-muted-foreground">
          View and manage operating room schedules
        </p>
      </div>

      {/* Calendar View */}
      <div className="h-full">
        <OPCalendar onEventClick={handleEventClick} />
      </div>
    </div>
  );
}
