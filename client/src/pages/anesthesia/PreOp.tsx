import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, FileText, Clock, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Mock data for currently opened pre-op assessments
const mockPreOpAssessments = [
  {
    id: "1",
    patientName: "John Doe",
    mrn: "MRN-12345",
    age: 45,
    procedure: "Total Hip Replacement",
    scheduledTime: "2024-01-15T08:00:00",
    status: "in-progress",
    assessor: "Dr. Smith",
    openedAt: "2024-01-15T07:30:00",
  },
  {
    id: "2",
    patientName: "Jane Smith",
    mrn: "MRN-67890",
    age: 62,
    procedure: "Coronary Artery Bypass",
    scheduledTime: "2024-01-15T10:30:00",
    status: "pending",
    assessor: "Dr. Johnson",
    openedAt: "2024-01-15T07:45:00",
  },
  {
    id: "3",
    patientName: "Robert Wilson",
    mrn: "MRN-24680",
    age: 38,
    procedure: "Laparoscopic Cholecystectomy",
    scheduledTime: "2024-01-15T13:00:00",
    status: "in-progress",
    assessor: "Dr. Brown",
    openedAt: "2024-01-15T08:00:00",
  },
];

export default function PreOp() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAssessments = mockPreOpAssessments.filter(
    (assessment) =>
      assessment.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assessment.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assessment.procedure.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "in-progress":
        return "bg-blue-500";
      case "pending":
        return "bg-yellow-500";
      case "completed":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="pb-20 px-4 pt-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Pre-Operative Assessments</h1>
        <p className="text-muted-foreground">Currently opened pre-op assessments</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search patients, MRN, or procedure..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-preop"
        />
      </div>

      <div className="space-y-4">
        {filteredAssessments.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No pre-op assessments found</p>
          </div>
        ) : (
          filteredAssessments.map((assessment) => (
            <Card
              key={assessment.id}
              className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              data-testid={`card-preop-${assessment.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg" data-testid={`text-patient-name-${assessment.id}`}>
                    {assessment.patientName}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid={`text-mrn-${assessment.id}`}>
                    {assessment.mrn} • Age {assessment.age}
                  </p>
                </div>
                <Badge className={getStatusColor(assessment.status)} data-testid={`badge-status-${assessment.id}`}>
                  {assessment.status === "in-progress" ? "In Progress" : "Pending"}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span data-testid={`text-procedure-${assessment.id}`}>{assessment.procedure}</span>
                </div>
                
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    Scheduled: {formatTime(assessment.scheduledTime)} • Opened: {formatTime(assessment.openedAt)}
                  </span>
                </div>

                <div className="text-sm text-muted-foreground">
                  Assessor: {assessment.assessor}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
