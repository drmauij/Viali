import { useRoute, Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Calendar, MapPin, User } from "lucide-react";

import PreopTab from "@/components/anesthesia/PreopTab";
import AnesthesiaTab from "@/components/anesthesia/AnesthesiaTab";
import PostopTab from "@/components/anesthesia/PostopTab";
import ExportsTab from "@/components/anesthesia/ExportsTab";
import AuditTab from "@/components/anesthesia/AuditTab";

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
  const [activeTab, setActiveTab] = useState("preop");

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
      <div className="mb-6">
        <Link href={`/anesthesia/patients/${mockCase.patientId}`}>
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to Patient
          </Button>
        </Link>

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
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="preop" data-testid="tab-preop">Pre-op</TabsTrigger>
          <TabsTrigger value="anesthesia" data-testid="tab-anesthesia">Anesthesia</TabsTrigger>
          <TabsTrigger value="postop" data-testid="tab-postop">Post-op</TabsTrigger>
          <TabsTrigger value="exports" data-testid="tab-exports">Exports</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="preop" className="mt-6">
          <PreopTab caseId={mockCase.id} />
        </TabsContent>

        <TabsContent value="anesthesia" className="mt-6">
          <AnesthesiaTab caseId={mockCase.id} />
        </TabsContent>

        <TabsContent value="postop" className="mt-6">
          <PostopTab caseId={mockCase.id} />
        </TabsContent>

        <TabsContent value="exports" className="mt-6">
          <ExportsTab caseId={mockCase.id} />
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          <AuditTab caseId={mockCase.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
