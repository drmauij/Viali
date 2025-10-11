import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, FileText, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const mockPatient = {
  id: "1",
  pseudoId: "HMAC_9f3a1c2b",
  name: null,
  ageYears: 56,
  sex: "F",
  tags: ["latex_allergy"],
  createdAt: "2025-10-01T10:00:00Z",
};

const mockCases = [
  {
    id: "case-1",
    title: "Laparoscopic Cholecystectomy",
    plannedSurgery: "Laparoscopic Cholecystectomy",
    surgeon: "Dr. Smith",
    plannedDate: "2025-10-09T14:30:00Z",
    status: "completed",
    location: "OR 3",
  },
  {
    id: "case-2",
    title: "Hernia Repair",
    plannedSurgery: "Inguinal Hernia Repair",
    surgeon: "Dr. Johnson",
    plannedDate: "2025-10-12T09:00:00Z",
    status: "planned",
    location: "OR 1",
  },
];

export default function PatientDetail() {
  const [, params] = useRoute("/anesthesia/patients/:id");
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [newCase, setNewCase] = useState({
    title: "",
    plannedSurgery: "",
    surgeon: "",
    plannedDate: "",
    location: "",
  });

  const handleCreateCase = () => {
    console.log("Creating case:", newCase);
    setIsCreateCaseOpen(false);
    setNewCase({ title: "", plannedSurgery: "", surgeon: "", plannedDate: "", location: "" });
  };

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
        <Link href="/anesthesia/patients">
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <User className="h-6 w-6 text-primary" />
              <span className="font-mono">{mockPatient.pseudoId}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Age</p>
                <p className="text-lg font-medium">{mockPatient.ageYears} years</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sex</p>
                <p className="text-lg font-medium">{mockPatient.sex}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cases</p>
                <p className="text-lg font-medium">{mockCases.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tags</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {mockPatient.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cases</h2>
        <Dialog open={isCreateCaseOpen} onOpenChange={setIsCreateCaseOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-case">
              <Plus className="h-4 w-4" />
              New Case
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Case</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Case Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Laparoscopic Cholecystectomy"
                  value={newCase.title}
                  onChange={(e) => setNewCase({ ...newCase, title: e.target.value })}
                  data-testid="input-case-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surgery">Planned Surgery</Label>
                <Input
                  id="surgery"
                  placeholder="e.g., Laparoscopic Cholecystectomy"
                  value={newCase.plannedSurgery}
                  onChange={(e) => setNewCase({ ...newCase, plannedSurgery: e.target.value })}
                  data-testid="input-planned-surgery"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surgeon">Surgeon</Label>
                <Input
                  id="surgeon"
                  placeholder="e.g., Dr. Smith"
                  value={newCase.surgeon}
                  onChange={(e) => setNewCase({ ...newCase, surgeon: e.target.value })}
                  data-testid="input-surgeon"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., OR 3"
                  value={newCase.location}
                  onChange={(e) => setNewCase({ ...newCase, location: e.target.value })}
                  data-testid="input-location"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Planned Date</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={newCase.plannedDate}
                  onChange={(e) => setNewCase({ ...newCase, plannedDate: e.target.value })}
                  data-testid="input-planned-date"
                />
              </div>
              <Button onClick={handleCreateCase} className="w-full" data-testid="button-submit-case">
                Create Case
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {mockCases.map((caseItem) => (
          <Link key={caseItem.id} href={`/anesthesia/cases/${caseItem.id}`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer" data-testid={`card-case-${caseItem.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <span>{caseItem.title}</span>
                  </div>
                  <Badge className={getStatusColor(caseItem.status)}>
                    {caseItem.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Surgery</p>
                    <p className="font-medium">{caseItem.plannedSurgery}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Surgeon</p>
                    <p className="font-medium">{caseItem.surgeon}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Location</p>
                    <p className="font-medium">{caseItem.location}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Planned Date</p>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(caseItem.plannedDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
