import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, UserPlus, User, FileText } from "lucide-react";

const mockPatients = [
  {
    id: "1",
    pseudoId: "HMAC_9f3a1c2b",
    name: null,
    ageYears: 56,
    sex: "F",
    tags: ["latex_allergy"],
    casesCount: 3,
    lastCase: "2025-10-09T14:30:00Z",
  },
  {
    id: "2",
    pseudoId: "HMAC_7d2e5a8c",
    name: null,
    ageYears: 67,
    sex: "M",
    tags: [],
    casesCount: 1,
    lastCase: "2025-10-08T09:15:00Z",
  },
  {
    id: "3",
    pseudoId: "HMAC_3b9c1f4d",
    name: null,
    ageYears: 42,
    sex: "F",
    tags: ["ASA_III"],
    casesCount: 2,
    lastCase: "2025-10-07T16:45:00Z",
  },
];

export default function Patients() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({
    pseudoId: "",
    ageYears: "",
    sex: "",
    tags: [] as string[],
  });

  const filteredPatients = mockPatients.filter(patient =>
    patient.pseudoId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    patient.ageYears.toString().includes(searchQuery)
  );

  const handleCreatePatient = () => {
    console.log("Creating patient:", newPatient);
    setIsCreateDialogOpen(false);
    setNewPatient({ pseudoId: "", ageYears: "", sex: "", tags: [] });
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Patients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage de-identified patient records
          </p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-patient">
              <UserPlus className="h-4 w-4" />
              New Patient
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create De-identified Patient</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="pseudoId">Pseudo ID (HMAC)</Label>
                <Input
                  id="pseudoId"
                  placeholder="HMAC_xxxxxxxx"
                  value={newPatient.pseudoId}
                  onChange={(e) => setNewPatient({ ...newPatient, pseudoId: e.target.value })}
                  data-testid="input-pseudo-id"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ageYears">Age (years)</Label>
                <Input
                  id="ageYears"
                  type="number"
                  placeholder="56"
                  value={newPatient.ageYears}
                  onChange={(e) => setNewPatient({ ...newPatient, ageYears: e.target.value })}
                  data-testid="input-age"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sex">Sex</Label>
                <Select value={newPatient.sex} onValueChange={(value) => setNewPatient({ ...newPatient, sex: value })}>
                  <SelectTrigger data-testid="select-sex">
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                    <SelectItem value="Unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreatePatient} className="w-full" data-testid="button-submit-patient">
                Create Patient
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Pseudo ID or age..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-patients"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredPatients.map((patient) => (
          <Link key={patient.id} href={`/anesthesia/patients/${patient.id}`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer" data-testid={`card-patient-${patient.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    <span className="font-mono text-sm">{patient.pseudoId}</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Age:</span>
                    <span className="font-medium">{patient.ageYears} years</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Sex:</span>
                    <span className="font-medium">{patient.sex}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cases:</span>
                    <span className="font-medium flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {patient.casesCount}
                    </span>
                  </div>
                  {patient.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {patient.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {filteredPatients.length === 0 && (
        <div className="text-center py-12">
          <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No patients found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? "Try adjusting your search" : "Create your first patient to get started"}
          </p>
        </div>
      )}
    </div>
  );
}
