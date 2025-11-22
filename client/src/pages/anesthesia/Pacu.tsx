import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, BedDouble, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";

type PacuPatient = {
  anesthesiaRecordId: string;
  surgeryId: string;
  patientId: string;
  patientName: string;
  patientNumber: string;
  age: number;
  procedure: string;
  anesthesiaPresenceEndTime: number;
  postOpDestination: string | null;
};

export default function Pacu() {
  const [searchQuery, setSearchQuery] = useState("");
  const activeHospital = useActiveHospital();
  const [, setLocation] = useLocation();

  const { data: pacuPatients = [], isLoading } = useQuery<PacuPatient[]>({
    queryKey: [`/api/anesthesia/pacu/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const filteredPatients = pacuPatients.filter(
    (patient) =>
      patient.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.patientNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.procedure.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const getTimeInPacu = (timestamp: number) => {
    const admitted = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - admitted.getTime()) / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const getDestinationBadge = (destination: string | null) => {
    if (!destination) return null;
    const label = destination.toUpperCase();
    const colors: Record<string, string> = {
      pacu: "bg-blue-500",
      icu: "bg-red-500",
      ward: "bg-green-500",
      home: "bg-gray-500",
    };
    return (
      <Badge className={colors[destination] || "bg-gray-500"}>
        {label}
      </Badge>
    );
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
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-12">
            <BedDouble className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No patients in PACU</p>
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <Card
              key={patient.surgeryId}
              className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setLocation(`/anesthesia/cases/${patient.surgeryId}/pacu`)}
              data-testid={`card-pacu-${patient.surgeryId}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg" data-testid={`text-patient-name-${patient.surgeryId}`}>
                    {patient.patientName}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid={`text-mrn-${patient.surgeryId}`}>
                    {patient.patientNumber} • Age {patient.age}
                  </p>
                </div>
                {getDestinationBadge(patient.postOpDestination)}
              </div>

              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <BedDouble className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span data-testid={`text-procedure-${patient.surgeryId}`}>{patient.procedure}</span>
                </div>
                
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    Anesthesia End: {formatTime(patient.anesthesiaPresenceEndTime)} • Time in PACU: {getTimeInPacu(patient.anesthesiaPresenceEndTime)}
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
