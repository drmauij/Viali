import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserCircle, UserRound, Calendar, User, ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";

// Mock data for pre-op assessments
const mockPreOpCases = [
  {
    id: "case-1",
    patientId: "1",
    patientName: "Rossi, Maria",
    patientSex: "F",
    birthday: "1968-05-12",
    plannedSurgery: "Laparoscopic Cholecystectomy",
    surgeon: "Dr. Romano",
    plannedDate: "2024-01-15",
    status: "awaiting-assessment",
    assessmentCompleted: false,
  },
  {
    id: "case-3",
    patientId: "3",
    patientName: "Verdi, Giuseppe",
    patientSex: "M",
    birthday: "1975-03-20",
    plannedSurgery: "Knee Arthroscopy",
    surgeon: "Dr. Lombardi",
    plannedDate: "2024-01-16",
    status: "awaiting-assessment",
    assessmentCompleted: false,
  },
];

export default function PreOpList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  // Filter cases based on search
  const filteredCases = mockPreOpCases.filter((case_) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      case_.patientName.toLowerCase().includes(searchLower) ||
      case_.plannedSurgery.toLowerCase().includes(searchLower) ||
      case_.surgeon.toLowerCase().includes(searchLower)
    );
  });

  const calculateAge = (birthday: string) => {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="container mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Pre-Operative Assessments</h1>
        <p className="text-sm text-muted-foreground">
          Patients awaiting pre-operative assessment
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by patient, surgery, or surgeon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-preop"
          />
        </div>
      </div>

      {/* Case Count */}
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          {filteredCases.length} {filteredCases.length === 1 ? "case" : "cases"} awaiting assessment
        </p>
      </div>

      {/* Cases List */}
      <div className="space-y-4">
        {filteredCases.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                {searchTerm ? "No cases match your search" : "No pre-operative assessments pending"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredCases.map((case_) => (
            <Card 
              key={case_.id} 
              className="p-4 cursor-pointer hover:bg-accent/50 transition-colors" 
              data-testid={`card-preop-case-${case_.id}`}
              onClick={() => setLocation(`/anesthesia/patients/${case_.patientId}?openPreOp=${case_.id}`)}
            >
              <div className="flex items-start justify-between">
                {/* Patient Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {case_.patientSex === "M" ? (
                      <UserCircle className="h-6 w-6 text-blue-500" />
                    ) : (
                      <UserRound className="h-6 w-6 text-pink-500" />
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">{case_.patientName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(case_.birthday)} ({calculateAge(case_.birthday)} years)
                      </p>
                    </div>
                  </div>

                  {/* Surgery Details */}
                  <div className="ml-9 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{case_.plannedSurgery}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{case_.surgeon}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(case_.plannedDate)}</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                  Awaiting Assessment
                </Badge>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
