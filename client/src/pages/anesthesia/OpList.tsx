import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserCircle, UserRound, Calendar, User, Activity, Clock } from "lucide-react";
import OPCalendar from "@/components/anesthesia/OPCalendar";

// Mock data for active surgeries
const mockActiveSurgeries = [
  {
    id: "case-1",
    patientId: "1",
    patientName: "Rossi, Maria",
    patientSex: "F",
    birthday: "1968-05-12",
    plannedSurgery: "Laparoscopic Cholecystectomy",
    surgeon: "Dr. Romano",
    plannedDate: "2024-01-15",
    status: "in-progress",
    startTime: "08:00",
    location: "OR 3",
  },
  {
    id: "case-2",
    patientId: "2",
    patientName: "Bianchi, Giovanni",
    patientSex: "M",
    birthday: "1957-11-03",
    plannedSurgery: "Total Hip Replacement",
    surgeon: "Dr. Smith",
    plannedDate: "2024-01-15",
    status: "in-progress",
    startTime: "09:30",
    location: "OR 1",
  },
];

export default function OpList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  // Filter cases based on search
  const filteredCases = mockActiveSurgeries.filter((case_) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      case_.patientName.toLowerCase().includes(searchLower) ||
      case_.plannedSurgery.toLowerCase().includes(searchLower) ||
      case_.surgeon.toLowerCase().includes(searchLower) ||
      case_.location.toLowerCase().includes(searchLower)
    );
  });

  const calculateAge = (birthday: string) => {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const calculateDuration = (startTime: string) => {
    const [hours, minutes] = startTime.split(":").map(Number);
    const start = new Date();
    start.setHours(hours, minutes, 0, 0);
    
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 1000 / 60);
    
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    
    return `${hrs}h ${mins}m`;
  };

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

      {/* Hidden: Original List View - kept for future use */}
      <div className="hidden">
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient, surgery, surgeon, or room..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-op"
            />
          </div>
        </div>

        {/* Case Count */}
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            {filteredCases.length} active {filteredCases.length === 1 ? "surgery" : "surgeries"}
          </p>
        </div>

        {/* Cases List */}
        <div className="space-y-4">
          {filteredCases.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">
                  {searchTerm ? "No surgeries match your search" : "No active surgeries at this time"}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredCases.map((case_) => (
              <Card 
                key={case_.id} 
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors border-l-4 border-l-green-500" 
                data-testid={`card-op-case-${case_.id}`}
                onClick={() => setLocation(`/anesthesia/cases/${case_.id}/op`)}
              >
                <div className="flex items-start justify-between">
                  {/* Patient Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {case_.patientSex === "M" ? (
                        <UserCircle className="h-6 w-6 text-blue-500" />
                      ) : (
                        <UserRound className="h-6 w-6 text-pink-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">{case_.patientName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(case_.birthday).toLocaleDateString()} ({calculateAge(case_.birthday)} years)
                        </p>
                      </div>
                    </div>

                    {/* Surgery Details */}
                    <div className="ml-9 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="h-4 w-4 text-green-600" />
                        <span className="font-medium">{case_.plannedSurgery}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>{case_.surgeon}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Started at {case_.startTime} • {calculateDuration(case_.startTime)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Location & Status */}
                  <div className="flex flex-col items-end gap-2">
                    <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                      {case_.location}
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                      In Progress
                    </Badge>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
