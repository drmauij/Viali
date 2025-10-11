import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Activity, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Mock data for patients currently in surgery
const mockOperations = [
  {
    id: "1",
    patientName: "John Doe",
    mrn: "MRN-12345",
    age: 45,
    procedure: "Total Hip Replacement",
    room: "OR-3",
    startTime: "2024-01-15T08:15:00",
    anesthesiologist: "Dr. Smith",
    status: "stable",
    duration: 125, // minutes
  },
  {
    id: "2",
    patientName: "Jane Smith",
    mrn: "MRN-67890",
    age: 62,
    procedure: "Coronary Artery Bypass",
    room: "OR-1",
    startTime: "2024-01-15T07:00:00",
    anesthesiologist: "Dr. Johnson",
    status: "critical",
    duration: 210,
  },
  {
    id: "3",
    patientName: "Robert Wilson",
    mrn: "MRN-24680",
    age: 38,
    procedure: "Laparoscopic Cholecystectomy",
    room: "OR-5",
    startTime: "2024-01-15T09:30:00",
    anesthesiologist: "Dr. Brown",
    status: "stable",
    duration: 45,
  },
];

export default function Op() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOperations = mockOperations.filter(
    (op) =>
      op.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      op.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      op.procedure.toLowerCase().includes(searchQuery.toLowerCase()) ||
      op.room.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "critical":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case "stable":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      default:
        return <Activity className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "critical":
        return "bg-red-500";
      case "stable":
        return "bg-green-500";
      default:
        return "bg-blue-500";
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="pb-20 px-4 pt-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Active Operations</h1>
        <p className="text-muted-foreground">Patients currently undergoing surgery</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search patients, room, or procedure..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-op"
        />
      </div>

      <div className="space-y-4">
        {filteredOperations.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No active operations</p>
          </div>
        ) : (
          filteredOperations.map((op) => (
            <Card
              key={op.id}
              className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              data-testid={`card-op-${op.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(op.status)}
                  <div>
                    <h3 className="font-semibold text-lg" data-testid={`text-patient-name-${op.id}`}>
                      {op.patientName}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-mrn-${op.id}`}>
                      {op.mrn} • Age {op.age}
                    </p>
                  </div>
                </div>
                <Badge className={getStatusColor(op.status)} data-testid={`badge-status-${op.id}`}>
                  {op.status}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm">
                    <Activity className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span data-testid={`text-procedure-${op.id}`}>{op.procedure}</span>
                  </div>
                  <Badge variant="outline" data-testid={`badge-room-${op.id}`}>{op.room}</Badge>
                </div>
                
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    Started: {formatTime(op.startTime)} • Duration: {formatDuration(op.duration)}
                  </span>
                </div>

                <div className="text-sm text-muted-foreground">
                  Anesthesiologist: {op.anesthesiologist}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
