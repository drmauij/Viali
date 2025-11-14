import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ClipboardList, Activity, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";

interface SurgerySummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surgeryId: string;
  onEditSurgery: () => void;
  onOpenPreOp: () => void;
  onOpenAnesthesia: () => void;
}

export default function SurgerySummaryDialog({
  open,
  onOpenChange,
  surgeryId,
  onEditSurgery,
  onOpenPreOp,
  onOpenAnesthesia,
}: SurgerySummaryDialogProps) {
  const activeHospital = useActiveHospital();

  const { data: surgery } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId && open,
  });

  const { data: patient } = useQuery<any>({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId && open,
  });

  const { data: rooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && open,
  });

  // Find the specific room for this surgery
  const room = rooms.find(r => r.id === surgery?.surgeryRoomId);

  // Fetch pre-op assessment data
  const { data: preOpAssessment, isLoading: isLoadingPreOp, isError: isPreOpError } = useQuery<any>({
    queryKey: [`/api/anesthesia/preop-assessments/surgery/${surgeryId}`],
    enabled: !!surgeryId && open,
  });
  
  // Check if pre-op assessment has any meaningful data (check for presence, not truthiness)
  const hasPreOpData = preOpAssessment && (
    preOpAssessment.asaClassification != null ||
    (preOpAssessment.allergies && preOpAssessment.allergies.length > 0) ||
    preOpAssessment.bodyWeight != null ||
    preOpAssessment.heartRate != null ||
    preOpAssessment.bloodPressureSystolic != null ||
    preOpAssessment.plannedAnesthesiaTechnique != null ||
    preOpAssessment.informedConsentSignature != null
  );

  if (!surgery || !patient) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const patientName = `${patient.surname}, ${patient.firstName}`;
  const patientBirthday = formatDate(patient.birthday);
  const surgeryDate = formatDate(surgery.plannedDate);
  const surgeryTime = formatTime(surgery.plannedDate);
  
  // Calculate duration
  const duration = surgery.endDate ? 
    Math.round((new Date(surgery.endDate).getTime() - new Date(surgery.plannedDate).getTime()) / 60000) : 
    null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Surgery Summary</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient Info Only */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <div>
              <span className="text-sm font-medium">Patient:</span>
              <span className="ml-2">{patientName}</span>
              <span className="ml-2 text-muted-foreground text-sm">({patientBirthday})</span>
            </div>
          </div>

          {/* Action Cards */}
          <div className="space-y-3">
            {/* Surgery Data */}
            <Card 
              className="cursor-pointer hover:bg-accent transition-colors"
              onClick={onEditSurgery}
              data-testid="card-edit-surgery"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg shrink-0">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold mb-2">Surgery Data</div>
                      <div className="space-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">Surgery:</span>
                          <span className="ml-2">{surgery.plannedSurgery || 'Not specified'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date & Time:</span>
                          <span className="ml-2">{surgeryDate} at {surgeryTime}</span>
                          {surgery.endDate && (
                            <span className="ml-2">- {formatTime(surgery.endDate)}</span>
                          )}
                        </div>
                        {duration != null && (
                          <div>
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="ml-2">{duration} min</span>
                          </div>
                        )}
                        {room && (
                          <div>
                            <span className="text-muted-foreground">Room:</span>
                            <span className="ml-2">{room.name}</span>
                          </div>
                        )}
                        {surgery.surgeon && (
                          <div>
                            <span className="text-muted-foreground">Surgeon:</span>
                            <span className="ml-2">{surgery.surgeon}</span>
                          </div>
                        )}
                        {surgery.status === 'cancelled' && (
                          <div className="text-destructive font-semibold">
                            Status: CANCELLED
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>

            {/* Pre-OP Assessment */}
            <Card 
              className="cursor-pointer hover:bg-accent transition-colors"
              onClick={onOpenPreOp}
              data-testid="card-open-preop"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg shrink-0">
                      <ClipboardList className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold mb-2">Pre-OP Assessment</div>
                      {isLoadingPreOp ? (
                        <div className="text-sm text-muted-foreground">
                          Loading...
                        </div>
                      ) : isPreOpError ? (
                        <div className="text-sm text-destructive">
                          Error loading assessment data
                        </div>
                      ) : hasPreOpData ? (
                        <div className="space-y-2 text-sm">
                          {/* General Data */}
                          {(preOpAssessment.asaClassification != null || 
                            (preOpAssessment.allergies && preOpAssessment.allergies.length > 0) || 
                            preOpAssessment.bodyWeight != null || 
                            preOpAssessment.heartRate != null || 
                            preOpAssessment.bloodPressureSystolic != null) && (
                            <div>
                              <div className="font-medium text-xs text-muted-foreground mb-1">General Data</div>
                              <div className="space-y-0.5">
                                {preOpAssessment.asaClassification != null && (
                                  <div>
                                    <span className="text-muted-foreground">ASA:</span>
                                    <span className="ml-2">{preOpAssessment.asaClassification}</span>
                                  </div>
                                )}
                                {preOpAssessment.allergies && preOpAssessment.allergies.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Allergies:</span>
                                    <span className="ml-2">{preOpAssessment.allergies.join(', ')}</span>
                                  </div>
                                )}
                                {preOpAssessment.bodyWeight != null && (
                                  <div>
                                    <span className="text-muted-foreground">Weight:</span>
                                    <span className="ml-2">{preOpAssessment.bodyWeight} kg</span>
                                  </div>
                                )}
                                {preOpAssessment.heartRate != null && (
                                  <div>
                                    <span className="text-muted-foreground">HR:</span>
                                    <span className="ml-2">{preOpAssessment.heartRate} bpm</span>
                                  </div>
                                )}
                                {preOpAssessment.bloodPressureSystolic != null && preOpAssessment.bloodPressureDiastolic != null && (
                                  <div>
                                    <span className="text-muted-foreground">BP:</span>
                                    <span className="ml-2">{preOpAssessment.bloodPressureSystolic}/{preOpAssessment.bloodPressureDiastolic} mmHg</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Anesthesia Technique */}
                          {preOpAssessment.plannedAnesthesiaTechnique != null && (
                            <div>
                              <div className="font-medium text-xs text-muted-foreground mb-1">Anesthesia Technique</div>
                              <div>{preOpAssessment.plannedAnesthesiaTechnique}</div>
                            </div>
                          )}
                          
                          {/* Surgical Approval Status */}
                          {preOpAssessment.informedConsentSignature != null && (
                            <div>
                              <div className="font-medium text-xs text-muted-foreground mb-1">Surgical Approval</div>
                              {preOpAssessment.informedConsentSignature ? (
                                <div className="text-green-600 dark:text-green-400">✓ Informed consent signed</div>
                              ) : (
                                <div className="text-muted-foreground">Informed consent not signed</div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Not yet completed
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>

            {/* Anesthesia Record */}
            <Card 
              className="cursor-pointer hover:bg-accent transition-colors"
              onClick={onOpenAnesthesia}
              data-testid="card-open-anesthesia"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                      <Activity className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <div className="font-semibold">Anesthesia Record</div>
                      <div className="text-sm text-muted-foreground">
                        View and manage operative anesthesia monitoring
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
