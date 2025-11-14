import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ClipboardList, Activity, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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
  const { data: surgery } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId && open,
  });

  const { data: patient } = useQuery<any>({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId && open,
  });

  const { data: room } = useQuery<any>({
    queryKey: [`/api/surgery-rooms/${surgery?.surgeryRoomId}`],
    enabled: !!surgery?.surgeryRoomId && open,
  });

  if (!surgery || !patient) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('de-DE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const patientName = `${patient.surname}, ${patient.firstName}`;
  const patientBirthday = formatDate(patient.birthday);
  const surgeryDate = formatDate(surgery.plannedDate);
  const surgeryTime = formatTime(surgery.plannedDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Surgery Summary</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient & Surgery Info */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div>
              <span className="text-sm font-medium">Patient:</span>
              <span className="ml-2">{patientName}</span>
              <span className="ml-2 text-muted-foreground text-sm">({patientBirthday})</span>
            </div>
            <div>
              <span className="text-sm font-medium">Surgery:</span>
              <span className="ml-2">{surgery.plannedSurgery || 'Not specified'}</span>
            </div>
            <div>
              <span className="text-sm font-medium">Date & Time:</span>
              <span className="ml-2">{surgeryDate} at {surgeryTime}</span>
            </div>
            {room && (
              <div>
                <span className="text-sm font-medium">Room:</span>
                <span className="ml-2">{room.name}</span>
              </div>
            )}
            {surgery.status === 'cancelled' && (
              <div className="text-destructive font-semibold">
                Status: CANCELLED
              </div>
            )}
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="font-semibold">Surgery Data</div>
                      <div className="text-sm text-muted-foreground">
                        Edit patient, room, date, time, and duration
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                      <ClipboardList className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <div className="font-semibold">Pre-OP Assessment</div>
                      <div className="text-sm text-muted-foreground">
                        View type of anesthesia, installations, and assessment
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
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
