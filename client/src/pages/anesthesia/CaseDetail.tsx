import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Calendar, MapPin, User, ClipboardList, Activity, BedDouble } from "lucide-react";

const mockCase = {
  id: "case-1",
  patientId: "1",
  patientPseudoId: "HMAC_9f3a1c2b",
  title: "Laparoscopic Cholecystectomy",
  plannedSurgery: "Laparoscopic Cholecystectomy",
  surgeon: "Dr. Smith",
  plannedDate: "2025-10-09T14:30:00Z",
  status: "completed",
  location: "OR 3",
  createdAt: "2025-10-08T10:00:00Z",
};

export default function CaseDetail() {
  const [, params] = useRoute("/anesthesia/cases/:id");
  const [, setLocation] = useLocation();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "ongoing":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "archived":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <Button 
        variant="ghost" 
        className="gap-2 mb-4" 
        onClick={() => setLocation(`/anesthesia/patients/${mockCase.patientId}`)}
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Patient
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-primary" />
              <div>
                <div>{mockCase.title}</div>
                <div className="text-sm font-normal text-muted-foreground mt-1">
                  Patient: {mockCase.patientPseudoId}
                </div>
              </div>
            </CardTitle>
            <Badge className={getStatusColor(mockCase.status)}>
              {mockCase.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Surgery</p>
              <p className="font-medium">{mockCase.plannedSurgery}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Surgeon</p>
              <p className="font-medium flex items-center gap-1">
                <User className="h-3 w-3" />
                {mockCase.surgeon}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Location</p>
              <p className="font-medium flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {mockCase.location}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Planned Date</p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(mockCase.plannedDate).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto py-6 flex-col gap-2"
              onClick={() => setLocation(`/anesthesia/cases/${mockCase.id}/preop`)}
              data-testid="button-preop"
            >
              <ClipboardList className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">Pre-op</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto py-6 flex-col gap-2"
              onClick={() => setLocation(`/anesthesia/cases/${mockCase.id}/op`)}
              data-testid="button-op"
            >
              <Activity className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">OP</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto py-6 flex-col gap-2"
              onClick={() => setLocation(`/anesthesia/cases/${mockCase.id}/pacu`)}
              data-testid="button-pacu"
            >
              <BedDouble className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">PACU</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
