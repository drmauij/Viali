import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { Loader2, Trash2, Save, X } from "lucide-react";

interface EditSurgeryDialogProps {
  surgeryId: string | null;
  onClose: () => void;
}

export function EditSurgeryDialog({ surgeryId, onClose }: EditSurgeryDialogProps) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [plannedDate, setPlannedDate] = useState("");
  const [duration, setDuration] = useState(90);
  const [plannedSurgery, setPlannedSurgery] = useState("");
  const [surgeryRoomId, setSurgeryRoomId] = useState("");
  const [surgeon, setSurgeon] = useState("");

  // Fetch surgery details
  const { data: surgery, isLoading } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId,
  });

  // Fetch surgery rooms
  const { data: surgeryRooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${surgery?.hospitalId}`],
    enabled: !!surgery?.hospitalId,
  });

  // Fetch patient details
  const { data: patient } = useQuery<any>({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId,
  });

  // Fetch surgeons
  const { data: surgeons = [] } = useQuery<any[]>({
    queryKey: [`/api/surgeons`, surgery?.hospitalId],
    queryFn: async () => {
      if (!surgery?.hospitalId) return [];
      const response = await fetch(`/api/surgeons?hospitalId=${surgery.hospitalId}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!surgery?.hospitalId,
  });

  // Initialize form when surgery data loads
  useEffect(() => {
    if (surgery) {
      const plannedDateObj = new Date(surgery.plannedDate);
      // Use local timezone methods for display
      const year = plannedDateObj.getFullYear();
      const month = String(plannedDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(plannedDateObj.getDate()).padStart(2, '0');
      const hours = String(plannedDateObj.getHours()).padStart(2, '0');
      const minutes = String(plannedDateObj.getMinutes()).padStart(2, '0');
      setPlannedDate(`${year}-${month}-${day}T${hours}:${minutes}`);

      if (surgery.actualEndTime) {
        const endDateObj = new Date(surgery.actualEndTime);
        const durationMinutes = Math.round((endDateObj.getTime() - plannedDateObj.getTime()) / (1000 * 60));
        setDuration(durationMinutes);
      }

      setPlannedSurgery(surgery.plannedSurgery || "");
      setSurgeryRoomId(surgery.surgeryRoomId || "");
      setSurgeon(surgery.surgeon || "");
    }
  }, [surgery]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      // Parse datetime-local string as local time
      const [datePart, timePart] = plannedDate.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      const startDate = new Date(year, month - 1, day, hour, minute);

      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + duration);

      const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        plannedDate: startDate.toISOString(),
        actualEndTime: endDate.toISOString(),
        plannedSurgery,
        surgeryRoomId,
        surgeon: surgeon || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/${surgeryId}`] });
      if (surgery?.hospitalId) {
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${surgery.hospitalId}`);
          }
        });
      }
      toast({
        title: "Surgery Updated",
        description: "Surgery details have been successfully updated.",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update surgery. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/anesthesia/surgeries/${surgeryId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      if (surgery?.hospitalId) {
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${surgery.hospitalId}`);
          }
        });
      }
      toast({
        title: "Surgery Deleted",
        description: "Surgery has been successfully deleted.",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete surgery. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleUpdate = () => {
    if (!plannedDate || !plannedSurgery || !surgeryRoomId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate();
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
  };

  if (!surgeryId) return null;

  return (
    <>
      <Dialog open={!!surgeryId} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-md" data-testid="dialog-edit-surgery">
          <DialogHeader>
            <DialogTitle>Edit Surgery</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Patient Information (Read-only) */}
              {patient && (
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm">
                    <div className="font-medium">
                      {patient.surname}, {patient.firstName}
                    </div>
                    {patient.birthday && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Born: {new Date(patient.birthday).toLocaleDateString('de-DE', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Surgery Room */}
              <div className="space-y-2">
                <Label htmlFor="edit-surgery-room">Surgery Room *</Label>
                <Select value={surgeryRoomId} onValueChange={setSurgeryRoomId}>
                  <SelectTrigger id="edit-surgery-room" data-testid="select-edit-surgery-room">
                    <SelectValue placeholder="Select room..." />
                  </SelectTrigger>
                  <SelectContent>
                    {surgeryRooms.map((room: any) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Time & Duration */}
              <div className="grid gap-3" style={{ gridTemplateColumns: '5fr 3fr' }}>
                <div className="space-y-2">
                  <Label htmlFor="edit-planned-date">Start Time *</Label>
                  <Input
                    id="edit-planned-date"
                    type="datetime-local"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    data-testid="input-edit-planned-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-duration">Duration (minutes) *</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    min="1"
                    value={duration.toString()}
                    onChange={(e) => setDuration(Number(e.target.value) || 0)}
                    data-testid="input-edit-duration"
                  />
                </div>
              </div>

              {/* Planned Surgery */}
              <div className="space-y-2">
                <Label htmlFor="edit-planned-surgery">Planned Surgery *</Label>
                <Input
                  id="edit-planned-surgery"
                  placeholder="e.g., Laparoscopic cholecystectomy"
                  value={plannedSurgery}
                  onChange={(e) => setPlannedSurgery(e.target.value)}
                  data-testid="input-edit-planned-surgery"
                />
              </div>

              {/* Surgeon */}
              <div className="space-y-2">
                <Label htmlFor="edit-surgeon">Surgeon <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Select 
                  value={surgeon || "none"} 
                  onValueChange={(value) => setSurgeon(value === "none" ? "" : value)}
                >
                  <SelectTrigger id="edit-surgeon" data-testid="select-edit-surgeon">
                    <SelectValue placeholder="Select surgeon (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No surgeon selected</SelectItem>
                    {surgeons.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending || updateMutation.isPending}
                  data-testid="button-delete-surgery"
                  className="flex-1"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={deleteMutation.isPending || updateMutation.isPending}
                  data-testid="button-cancel-surgery"
                  className="flex-1"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending || deleteMutation.isPending}
                  data-testid="button-update-surgery"
                  className="flex-1"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Surgery?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this surgery? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
