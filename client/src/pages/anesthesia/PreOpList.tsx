import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserCircle, UserRound, Calendar, User, ClipboardList, FileCheck, FileEdit, CalendarPlus, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { useActiveHospital } from "@/hooks/useActiveHospital";

export default function PreOpList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "planned" | "draft" | "completed">("all");

  // Get active hospital
  const activeHospital = useActiveHospital();

  // Fetch all pre-op assessments
  const { data: assessments, isLoading } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id || ''}`],
    enabled: !!activeHospital?.id,
  });

  // Filter and group assessments by status
  const filteredAssessments = (assessments || []).filter((item) => {
    if (!item.surgery) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.surgery.procedureName?.toLowerCase().includes(searchLower) ||
      item.surgery.surgeon?.toLowerCase().includes(searchLower) ||
      item.surgery.patientName?.toLowerCase().includes(searchLower)
    );
  });

  const groupedByStatus = {
    planned: filteredAssessments.filter((item) => item.status === 'planned'),
    draft: filteredAssessments.filter((item) => item.status === 'draft'),
    completed: filteredAssessments.filter((item) => item.status === 'completed'),
  };

  const displayedAssessments = activeTab === 'all' 
    ? filteredAssessments 
    : groupedByStatus[activeTab];

  const calculateAge = (birthday: string) => {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">
          <CalendarPlus className="h-3 w-3 mr-1" />
          Planned
        </Badge>;
      case 'draft':
        return <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
          <FileEdit className="h-3 w-3 mr-1" />
          In Progress
        </Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
          <FileCheck className="h-3 w-3 mr-1" />
          Completed
        </Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Pre-Operative Assessments</h1>
        <p className="text-sm text-muted-foreground">
          View and manage all pre-operative patient assessments
        </p>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mb-6">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="all" data-testid="tab-all">
            All ({filteredAssessments.length})
          </TabsTrigger>
          <TabsTrigger value="planned" data-testid="tab-planned">
            <CalendarPlus className="h-4 w-4 mr-1" />
            Planned ({groupedByStatus.planned.length})
          </TabsTrigger>
          <TabsTrigger value="draft" data-testid="tab-draft">
            <FileEdit className="h-4 w-4 mr-1" />
            In Progress ({groupedByStatus.draft.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            <FileCheck className="h-4 w-4 mr-1" />
            Completed ({groupedByStatus.completed.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

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

      {/* Cases List */}
      <div className="space-y-4">
        {displayedAssessments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                {searchTerm ? "No cases match your search" : "No pre-operative assessments"}
              </p>
            </CardContent>
          </Card>
        ) : (
          displayedAssessments.map((item) => {
            const surgery = item.surgery;
            const age = calculateAge(surgery.patientBirthday);
            
            return (
              <Card 
                key={surgery.id} 
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors" 
                data-testid={`card-preop-${surgery.id}`}
                onClick={() => setLocation(`/anesthesia/op/${surgery.id}`)}
              >
                <div className="flex items-start justify-between">
                  {/* Patient Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {surgery.patientSex === "M" ? (
                        <UserCircle className="h-6 w-6 text-blue-500" />
                      ) : (
                        <UserRound className="h-6 w-6 text-pink-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg" data-testid={`text-patient-name-${surgery.id}`}>
                          {surgery.patientName || "Unknown Patient"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {surgery.patientBirthday ? (
                            <>
                              {formatDate(surgery.patientBirthday)}
                              {age !== null && ` (${age} years)`}
                            </>
                          ) : (
                            "Birthday not recorded"
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Surgery Details */}
                    <div className="ml-9 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{surgery.procedureName || "Procedure not specified"}</span>
                      </div>
                      {surgery.surgeon && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span>{surgery.surgeon}</span>
                        </div>
                      )}
                      {surgery.plannedDate && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(surgery.plannedDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div data-testid={`badge-status-${surgery.id}`}>
                    {getStatusBadge(item.status)}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
