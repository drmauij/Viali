import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Search, UserPlus, ScanBarcode, UserCircle, UserRound } from "lucide-react";

const mockPatients = [
  {
    id: "1",
    patientId: "P-2024-001",
    surname: "Rossi",
    firstName: "Maria",
    birthday: "1968-05-12",
    sex: "F",
  },
  {
    id: "2",
    patientId: "P-2024-002",
    surname: "Bianchi",
    firstName: "Giovanni",
    birthday: "1957-11-03",
    sex: "M",
  },
  {
    id: "3",
    patientId: "P-2024-003",
    surname: "Ferrari",
    firstName: "Laura",
    birthday: "1982-08-22",
    sex: "F",
  },
  {
    id: "4",
    patientId: "P-2024-004",
    surname: "Colombo",
    firstName: "Marco",
    birthday: "1975-03-15",
    sex: "M",
  },
];

export default function Patients() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({
    surname: "",
    firstName: "",
    birthday: "",
    sex: "",
    email: "",
    phone: "",
    allergies: [] as string[],
    allergyNotes: "",
    notes: "",
  });

  const commonAllergies = [
    "Latex",
    "Penicillin",
    "NSAIDs",
    "Local anesthetics",
    "Opioids",
    "Muscle relaxants",
  ];

  const toggleAllergy = (allergy: string) => {
    if (newPatient.allergies.includes(allergy)) {
      setNewPatient({ ...newPatient, allergies: newPatient.allergies.filter(a => a !== allergy) });
    } else {
      setNewPatient({ ...newPatient, allergies: [...newPatient.allergies, allergy] });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Filter and sort patients alphabetically by surname, then firstName
  const filteredPatients = mockPatients
    .filter(patient => {
      const query = searchQuery.toLowerCase();
      const formattedBirthday = formatDate(patient.birthday).toLowerCase();
      
      return patient.surname.toLowerCase().includes(query) ||
        patient.firstName.toLowerCase().includes(query) ||
        patient.patientId.toLowerCase().includes(query) ||
        patient.birthday.includes(searchQuery) || // ISO format search
        formattedBirthday.includes(query); // Display format search (DD/MM/YYYY)
    })
    .sort((a, b) => {
      const surnameCompare = a.surname.localeCompare(b.surname);
      if (surnameCompare !== 0) return surnameCompare;
      return a.firstName.localeCompare(b.firstName);
    });

  const handleBarcodeClick = () => {
    // TODO: Implement barcode scanning via camera
    console.log("Opening camera for barcode scan...");
  };

  const handleCreatePatient = () => {
    // Auto-generate patient ID
    const year = new Date().getFullYear();
    const patientId = `P-${year}-${String(mockPatients.length + 1).padStart(3, '0')}`;
    
    console.log("Creating patient:", { ...newPatient, patientId });
    setIsCreateDialogOpen(false);
    setNewPatient({ 
      surname: "", 
      firstName: "", 
      birthday: "", 
      sex: "",
      email: "",
      phone: "",
      allergies: [],
      allergyNotes: "",
      notes: ""
    });
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Patients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Patient master list
          </p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-patient">
              <UserPlus className="h-4 w-4" />
              New Patient
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Patient</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="surname">Surname *</Label>
                  <Input
                    id="surname"
                    placeholder="Rossi"
                    value={newPatient.surname}
                    onChange={(e) => setNewPatient({ ...newPatient, surname: e.target.value })}
                    data-testid="input-surname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="Maria"
                    value={newPatient.firstName}
                    onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
                    data-testid="input-first-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="birthday">Birthday *</Label>
                  <Input
                    id="birthday"
                    type="date"
                    value={newPatient.birthday}
                    onChange={(e) => setNewPatient({ ...newPatient, birthday: e.target.value })}
                    data-testid="input-birthday"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex *</Label>
                  <Select value={newPatient.sex} onValueChange={(value) => setNewPatient({ ...newPatient, sex: value })}>
                    <SelectTrigger data-testid="select-sex">
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="patient@example.com"
                  value={newPatient.email}
                  onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telephone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+39 123 456 7890"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-3">
                <Label>Allergies</Label>
                <div className="grid grid-cols-2 gap-2">
                  {commonAllergies.map((allergy) => (
                    <div key={allergy} className="flex items-center space-x-2">
                      <Checkbox
                        id={`allergy-${allergy}`}
                        checked={newPatient.allergies.includes(allergy)}
                        onCheckedChange={() => toggleAllergy(allergy)}
                        data-testid={`checkbox-allergy-${allergy.toLowerCase().replace(/\s+/g, '-')}`}
                      />
                      <Label htmlFor={`allergy-${allergy}`} className="text-sm font-normal cursor-pointer">
                        {allergy}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allergyNotes">Other Allergies (free text)</Label>
                  <Textarea
                    id="allergyNotes"
                    placeholder="Other allergies..."
                    value={newPatient.allergyNotes}
                    onChange={(e) => setNewPatient({ ...newPatient, allergyNotes: e.target.value })}
                    rows={2}
                    data-testid="textarea-allergy-notes"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes..."
                  value={newPatient.notes}
                  onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                  rows={3}
                  data-testid="textarea-notes"
                />
              </div>

              <div className="pt-2 text-xs text-muted-foreground">
                * Required fields. Patient ID will be auto-generated.
              </div>

              <Button onClick={handleCreatePatient} className="w-full" data-testid="button-submit-patient">
                Create Patient
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, patient ID or birthday..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-patients"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleBarcodeClick}
            title="Scan patient barcode"
            data-testid="button-scan-barcode"
          >
            <ScanBarcode className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {filteredPatients.map((patient) => (
          <Card 
            key={patient.id}
            className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
            data-testid={`patient-item-${patient.id}`}
            onClick={() => setLocation(`/anesthesia/patients/${patient.id}`)}
          >
            <div className="flex items-center gap-2">
              {patient.sex === "M" ? (
                <UserCircle className="h-5 w-5 text-blue-500" />
              ) : patient.sex === "F" ? (
                <UserRound className="h-5 w-5 text-pink-500" />
              ) : (
                <UserCircle className="h-5 w-5 text-gray-500" />
              )}
              <div className="font-semibold text-foreground">
                {patient.surname}, {patient.firstName}
              </div>
            </div>
            <div className="text-sm text-muted-foreground mt-1 ml-7">
              {formatDate(patient.birthday)} • {patient.patientId}
            </div>
          </Card>
        ))}
      </div>

      {filteredPatients.length === 0 && (
        <div className="text-center py-12">
          <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No patients found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? "Try adjusting your search" : "Create your first patient to get started"}
          </p>
        </div>
      )}
    </div>
  );
}
