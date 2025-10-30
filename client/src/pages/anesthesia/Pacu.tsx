import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, BedDouble, Clock, TrendingUp, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/dateUtils";

// Mock data for patients in PACU (Post-Anesthesia Care Unit)
const mockPacuPatients = [
  {
    id: "1",
    patientName: "Sarah Johnson",
    mrn: "MRN-11111",
    age: 56,
    procedure: "Mastectomy",
    bed: "PACU-1",
    admittedAt: "2024-01-15T10:45:00",
    aldretteScore: 9,
    painLevel: 3,
    status: "stable",
    nurse: "RN Davis",
  },
  {
    id: "2",
    patientName: "Michael Brown",
    mrn: "MRN-22222",
    age: 71,
    procedure: "Knee Arthroscopy",
    bed: "PACU-3",
    admittedAt: "2024-01-15T11:15:00",
    aldretteScore: 10,
    painLevel: 2,
    status: "ready-for-discharge",
    nurse: "RN Martinez",
  },
  {
    id: "3",
    patientName: "Emily Davis",
    mrn: "MRN-33333",
    age: 42,
    procedure: "Appendectomy",
    bed: "PACU-5",
    admittedAt: "2024-01-15T11:30:00",
    aldretteScore: 7,
    painLevel: 5,
    status: "monitoring",
    nurse: "RN Thompson",
  },
];

export default function Pacu() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPatients = mockPacuPatients.filter(
    (patient) =>
      patient.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.procedure.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.bed.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready-for-discharge":
        return "bg-green-500";
      case "stable":
        return "bg-blue-500";
      case "monitoring":
        return "bg-yellow-500";
      case "critical":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ready-for-discharge":
        return "Ready for Discharge";
      case "stable":
        return "Stable";
      case "monitoring":
        return "Monitoring";
      case "critical":
        return "Critical";
      default:
        return status;
    }
  };

  const getTimeInPacu = (admittedAt: string) => {
    const admitted = new Date(admittedAt);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - admitted.getTime()) / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  return (
    <div className="pb-20 px-4 pt-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Post-Anesthesia Care Unit</h1>
        <p className="text-muted-foreground">Patients in recovery</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search patients, bed, or procedure..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-pacu"
        />
      </div>

      <div className="space-y-4">
        {filteredPatients.length === 0 ? (
          <div className="text-center py-12">
            <BedDouble className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No patients in PACU</p>
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <Card
              key={patient.id}
              className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              data-testid={`card-pacu-${patient.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg" data-testid={`text-patient-name-${patient.id}`}>
                    {patient.patientName}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid={`text-mrn-${patient.id}`}>
                    {patient.mrn} • Age {patient.age}
                  </p>
                </div>
                <Badge className={getStatusColor(patient.status)} data-testid={`badge-status-${patient.id}`}>
                  {getStatusLabel(patient.status)}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm">
                    <BedDouble className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span data-testid={`text-procedure-${patient.id}`}>{patient.procedure}</span>
                  </div>
                  <Badge variant="outline" data-testid={`badge-bed-${patient.id}`}>{patient.bed}</Badge>
                </div>
                
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    Admitted: {formatTime(patient.admittedAt)} • Time in PACU: {getTimeInPacu(patient.admittedAt)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center">
                    <TrendingUp className="h-4 w-4 mr-1 text-muted-foreground" />
                    <span>Aldrette: {patient.aldretteScore}/10</span>
                  </div>
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1 text-muted-foreground" />
                    <span>Pain: {patient.painLevel}/10</span>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  Nurse: {patient.nurse}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
