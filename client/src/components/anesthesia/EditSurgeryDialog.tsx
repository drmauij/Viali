import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useState, useEffect } from "react";
import { Loader2, Archive, Save, X, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EditSurgeryDialogProps {
  surgeryId: string | null;
  onClose: () => void;
}

export function EditSurgeryDialog({ surgeryId, onClose }: EditSurgeryDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Form state
  const [surgeryDate, setSurgeryDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(90);
  const [admissionTime, setAdmissionTime] = useState("");
  const [plannedSurgery, setPlannedSurgery] = useState("");
  const [surgeryRoomId, setSurgeryRoomId] = useState("");
  const [surgeonId, setSurgeonId] = useState("");
  const [notes, setNotes] = useState("");
  const [implantDetails, setImplantDetails] = useState("");
  const [planningStatus, setPlanningStatus] = useState<"pre-registered" | "confirmed">("pre-registered");

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
      setSurgeryDate(`${year}-${month}-${day}`);
      setStartTime(`${hours}:${minutes}`);

      if (surgery.actualEndTime) {
        const endDateObj = new Date(surgery.actualEndTime);
        const durationMinutes = Math.round((endDateObj.getTime() - plannedDateObj.getTime()) / (1000 * 60));
        setDuration(durationMinutes);
      }

      setPlannedSurgery(surgery.plannedSurgery || "");
      setSurgeryRoomId(surgery.surgeryRoomId || "");
      setSurgeonId(surgery.surgeonId || "");
      setNotes(surgery.notes || "");
      setImplantDetails(surgery.implantDetails || "");
      setPlanningStatus(surgery.planningStatus || "pre-registered");
      
      if (surgery.admissionTime) {
        const admissionDateObj = new Date(surgery.admissionTime);
        const aHours = String(admissionDateObj.getHours()).padStart(2, '0');
        const aMinutes = String(admissionDateObj.getMinutes()).padStart(2, '0');
        setAdmissionTime(`${aHours}:${aMinutes}`);
      } else {
        setAdmissionTime("");
      }
    }
  }, [surgery]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      // Parse date and time separately
      const [year, month, day] = surgeryDate.split('-').map(Number);
      const [hour, minute] = startTime.split(':').map(Number);
      const startDate = new Date(year, month - 1, day, hour, minute);

      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + duration);

      const matchedSurgeon = surgeons.find((s: any) => s.id === surgeonId);
      
      let admissionTimeISO = null;
      if (admissionTime) {
        const [admHour, admMinute] = admissionTime.split(':').map(Number);
        const admissionDate = new Date(year, month - 1, day, admHour, admMinute);
        admissionTimeISO = admissionDate.toISOString();
      }

      const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        plannedDate: startDate.toISOString(),
        actualEndTime: endDate.toISOString(),
        plannedSurgery,
        surgeryRoomId,
        surgeon: matchedSurgeon?.name || null,
        surgeonId: surgeonId || null,
        notes: notes || null,
        admissionTime: admissionTimeISO,
        implantDetails: implantDetails || null,
        planningStatus,
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
        title: t('anesthesia.editSurgery.surgeryUpdated'),
        description: t('anesthesia.editSurgery.surgeryUpdatedDescription'),
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

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/anesthesia/surgeries/${surgeryId}/archive`);
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
        title: t('anesthesia.editSurgery.surgeryArchived', 'Surgery archived'),
        description: t('anesthesia.editSurgery.surgeryArchivedDescription', 'Surgery has been moved to archive'),
      });
      onClose();
    },
    onError: () => {
      toast({
        title: t('anesthesia.editSurgery.archiveFailed', 'Archive Failed'),
        description: t('anesthesia.editSurgery.archiveFailedDescription', 'Failed to archive surgery. Please try again.'),
        variant: "destructive",
      });
    },
  });

  const handleUpdate = () => {
    if (!surgeryDate || !startTime || !plannedSurgery || !surgeryRoomId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate();
  };

  const handleArchive = () => {
    setShowArchiveConfirm(true);
  };

  const confirmArchive = () => {
    archiveMutation.mutate();
  };

  if (!surgeryId) return null;

  return (
    <>
      <Dialog open={!!surgeryId} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden" data-testid="dialog-edit-surgery">
          <div className="p-6 border-b shrink-0">
            <DialogHeader>
              <DialogTitle>{t('anesthesia.editSurgery.title')}</DialogTitle>
            </DialogHeader>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 px-6 py-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
              {/* Read-only banner for guests */}
              {!canWrite && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
                  <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">View Only Mode</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">You have read-only access.</p>
                  </div>
                </div>
              )}
              {/* Patient Information (Read-only) */}
              {patient && (
                <div className="space-y-2">
                  <Label>{t('anesthesia.editSurgery.patient')}</Label>
                  <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm">
                    <div className="font-medium">
                      {patient.surname}, {patient.firstName}
                    </div>
                    {patient.birthday && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('anesthesia.editSurgery.born')}: {new Date(patient.birthday).toLocaleDateString('de-DE', { 
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
                <Label htmlFor="edit-surgery-room">{t('anesthesia.editSurgery.surgeryRoom')} *</Label>
                <Select value={surgeryRoomId} onValueChange={setSurgeryRoomId} disabled={!canWrite}>
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

              {/* Surgery Date */}
              <div className="space-y-2">
                <Label htmlFor="edit-surgery-date">{t('anesthesia.editSurgery.date', 'Date')} *</Label>
                <Input
                  id="edit-surgery-date"
                  type="date"
                  value={surgeryDate}
                  onChange={(e) => setSurgeryDate(e.target.value)}
                  disabled={!canWrite}
                  data-testid="input-edit-surgery-date"
                />
              </div>

              {/* Start Time, Admission Time & Duration */}
              <div className="flex gap-3 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="edit-start-time">{t('anesthesia.editSurgery.startTime')} *</Label>
                  <Input
                    id="edit-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={!canWrite}
                    data-testid="input-edit-start-time"
                  />
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="edit-admission-time">{t('anesthesia.editSurgery.admissionTime', 'Admission')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.optional', 'opt.')})</span></Label>
                  <Input
                    id="edit-admission-time"
                    type="time"
                    value={admissionTime}
                    onChange={(e) => setAdmissionTime(e.target.value)}
                    disabled={!canWrite}
                    data-testid="input-edit-admission-time"
                  />
                </div>
                <div className="space-y-2 w-20 shrink-0">
                  <Label htmlFor="edit-duration">{t('anesthesia.editSurgery.duration')} *</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    min="1"
                    value={duration.toString()}
                    onChange={(e) => setDuration(Number(e.target.value) || 0)}
                    disabled={!canWrite}
                    data-testid="input-edit-duration"
                  />
                </div>
              </div>

              {/* Planned Surgery */}
              <div className="space-y-2">
                <Label htmlFor="edit-planned-surgery">{t('anesthesia.editSurgery.plannedSurgery')} *</Label>
                <Input
                  id="edit-planned-surgery"
                  placeholder="e.g., Laparoscopic cholecystectomy"
                  value={plannedSurgery}
                  onChange={(e) => setPlannedSurgery(e.target.value)}
                  disabled={!canWrite}
                  data-testid="input-edit-planned-surgery"
                />
              </div>

              {/* Surgeon */}
              <div className="space-y-2">
                <Label htmlFor="edit-surgeon">{t('anesthesia.editSurgery.surgeon')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.surgeonOptional')})</span></Label>
                <Select 
                  value={surgeonId || "none"} 
                  onValueChange={(value) => setSurgeonId(value === "none" ? "" : value)}
                  disabled={!canWrite}
                >
                  <SelectTrigger id="edit-surgeon" data-testid="select-edit-surgeon">
                    <SelectValue placeholder="Select surgeon (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('anesthesia.editSurgery.noSurgeonSelected')}</SelectItem>
                    {surgeons.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Planning Status */}
              <div className="space-y-2">
                <Label htmlFor="edit-planning-status">{t('anesthesia.editSurgery.planningStatus', 'Planning Status')}</Label>
                <Select 
                  value={planningStatus} 
                  onValueChange={(value) => setPlanningStatus(value as "pre-registered" | "confirmed")}
                  disabled={!canWrite}
                >
                  <SelectTrigger id="edit-planning-status" data-testid="select-edit-planning-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre-registered">{t('surgeryPlanning.planningStatus.pre-registered', 'Pre-Registered')}</SelectItem>
                    <SelectItem value="confirmed">{t('surgeryPlanning.planningStatus.confirmed', 'Confirmed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="edit-notes">{t('anesthesia.editSurgery.notes')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.notesOptional')})</span></Label>
                <Textarea
                  id="edit-notes"
                  placeholder={t('anesthesia.editSurgery.notesPlaceholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canWrite}
                  data-testid="textarea-edit-notes"
                  rows={3}
                />
              </div>

              {/* Implant Details */}
              <div className="space-y-2">
                <Label htmlFor="edit-implant-details">{t('anesthesia.editSurgery.implantDetails', 'Implant Details')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.optional', 'opt.')})</span></Label>
                <Textarea
                  id="edit-implant-details"
                  placeholder={t('anesthesia.editSurgery.implantDetailsPlaceholder', 'e.g., Hip prosthesis model XYZ, Serial #12345')}
                  value={implantDetails}
                  onChange={(e) => setImplantDetails(e.target.value)}
                  disabled={!canWrite}
                  data-testid="textarea-edit-implant-details"
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                {canWrite ? (
                  <>
                    <Button
                      onClick={handleUpdate}
                      disabled={updateMutation.isPending || archiveMutation.isPending}
                      data-testid="button-update-surgery"
                      className="w-full sm:flex-1"
                    >
                      {updateMutation.isPending ? (
                        <>{t('anesthesia.editSurgery.updating')}</>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          {t('anesthesia.editSurgery.update')}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onClose}
                      disabled={archiveMutation.isPending || updateMutation.isPending}
                      data-testid="button-cancel-surgery"
                      className="w-full sm:flex-1"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleArchive}
                      disabled={archiveMutation.isPending || updateMutation.isPending}
                      data-testid="button-archive-surgery"
                      className="w-full sm:flex-1"
                    >
                      {archiveMutation.isPending ? (
                        <>{t('anesthesia.editSurgery.archiving', 'Archiving...')}</>
                      ) : (
                        <>
                          <Archive className="mr-2 h-4 w-4" />
                          {t('anesthesia.editSurgery.archiveSurgery', 'Archive')}
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={onClose}
                    data-testid="button-close-surgery"
                    className="w-full"
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t('common.close')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.editSurgery.confirmArchive', 'Archive Surgery?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.editSurgery.confirmArchiveMessage', 'This surgery will be moved to the archive. All associated records will be preserved.')}
              <br /><br />
              <strong>{t('anesthesia.editSurgery.confirmArchiveInfo', 'Archived surgeries can be restored if needed.')}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmArchive}
              data-testid="button-confirm-archive"
            >
              {t('anesthesia.editSurgery.archiveSurgery', 'Archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
