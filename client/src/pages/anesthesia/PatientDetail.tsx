import { useRoute, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, FileText, Plus, Mail, Phone, AlertCircle, FileText as NoteIcon, Cake, UserCircle, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const mockPatient = {
  id: "1",
  patientId: "P-2024-001",
  surname: "Rossi",
  firstName: "Maria",
  birthday: "1968-05-12",
  sex: "F",
  email: "maria.rossi@example.com",
  phone: "+39 123 456 7890",
  allergies: ["Latex", "Penicillin"],
  allergyNotes: "Mild reaction to shellfish",
  notes: "Prefers morning appointments. History of hypertension.",
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
  const [, setLocation] = useLocation();
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

  const calculateAge = (birthday: string) => {
    const today = new Date();
    const birthDate = new Date(birthday);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
              {mockPatient.sex === "M" ? (
                <UserCircle className="h-6 w-6 text-blue-500" />
              ) : (
                <UserRound className="h-6 w-6 text-pink-500" />
              )}
              <div>
                <div>{mockPatient.surname}, {mockPatient.firstName}</div>
                <p className="text-sm font-normal mt-1">
                  <span className="text-foreground font-medium">{formatDate(mockPatient.birthday)} ({calculateAge(mockPatient.birthday)} years)</span>
                  <span className="text-muted-foreground"> • Patient ID: {mockPatient.patientId}</span>
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Contact Information */}
            {(mockPatient.email || mockPatient.phone) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mockPatient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium">{mockPatient.email}</p>
                      </div>
                    </div>
                  )}
                  {mockPatient.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium">{mockPatient.phone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Allergies */}
            {(mockPatient.allergies.length > 0 || mockPatient.allergyNotes) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Allergies
                </h3>
                <div className="space-y-2">
                  {mockPatient.allergies.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {mockPatient.allergies.map((allergy) => (
                        <Badge key={allergy} variant="destructive" className="text-xs">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {mockPatient.allergyNotes && (
                    <p className="text-sm text-muted-foreground">{mockPatient.allergyNotes}</p>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {mockPatient.notes && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <NoteIcon className="h-5 w-5 text-muted-foreground" />
                  Notes
                </h3>
                <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md">{mockPatient.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cases ({mockCases.length})</h2>
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
          <Card 
            key={caseItem.id} 
            className="p-4 cursor-pointer hover:bg-accent/50 transition-colors" 
            data-testid={`card-case-${caseItem.id}`}
            onClick={() => setLocation(`/anesthesia/cases/${caseItem.id}`)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">{caseItem.title}</h3>
              </div>
              <Badge className={getStatusColor(caseItem.status)}>
                {caseItem.status}
              </Badge>
            </div>
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
          </Card>
        ))}
      </div>
    </div>
  );
}
