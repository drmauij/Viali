import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parse } from "date-fns";
import { AlertTriangle, Clock, Calendar, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TimeOffData {
  id: string;
  providerId: string;
  unitId: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  notes: string | null;
}

interface EditTimeOffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeOff: TimeOffData | null;
  hospitalId: string;
  unitId: string;
  providerName?: string;
}

export default function EditTimeOffDialog({
  open,
  onOpenChange,
  timeOff,
  hospitalId,
  unitId,
  providerName,
}: EditTimeOffDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (timeOff && open) {
      setDate(timeOff.startDate || "");
      setStartTime(timeOff.startTime || "08:00");
      setEndTime(timeOff.endTime || "17:00");
      setReason(timeOff.reason || "blocked");
      setNotes(timeOff.notes || "");
    }
  }, [timeOff, open]);

  const updateMutation = useMutation({
    mutationFn: async (data: { date: string; startTime: string; endTime: string; reason: string; notes: string }) => {
      return apiRequest("PUT", `/api/clinic/${hospitalId}/time-off/${timeOff?.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: t('appointments.timeOffUpdated', 'Off-time updated'),
        description: t('appointments.timeOffUpdatedDesc', 'The off-time block has been updated successfully.'),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/time-off`] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Failed to update time off:", error);
      toast({
        title: t('common.error', 'Error'),
        description: t('appointments.timeOffUpdateFailed', 'Failed to update off-time block.'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/clinic/${hospitalId}/time-off/${timeOff?.id}`);
    },
    onSuccess: () => {
      toast({
        title: t('appointments.timeOffDeleted', 'Off-time deleted'),
        description: t('appointments.timeOffDeletedDesc', 'The off-time block has been removed.'),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/time-off`] });
      onOpenChange(false);
      setShowDeleteConfirm(false);
    },
    onError: (error) => {
      console.error("Failed to delete time off:", error);
      toast({
        title: t('common.error', 'Error'),
        description: t('appointments.timeOffDeleteFailed', 'Failed to delete off-time block.'),
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!date || !startTime || !endTime) {
      toast({
        title: t('common.error', 'Error'),
        description: t('appointments.fillAllFields', 'Please fill in all required fields.'),
        variant: "destructive",
      });
      return;
    }

    if (startTime >= endTime) {
      toast({
        title: t('common.error', 'Error'),
        description: t('appointments.invalidTimeRange', 'End time must be after start time.'),
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({ date, startTime, endTime, reason, notes });
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
  };

  if (!timeOff) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid="edit-timeoff-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              {t('appointments.editTimeOff', 'Edit Off-Time')}
            </DialogTitle>
            <DialogDescription>
              {providerName && (
                <span className="text-sm text-muted-foreground">
                  {t('appointments.forProvider', 'For')}: <strong>{providerName}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {t('common.date', 'Date')}
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-timeoff-date"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">{t('common.startTime', 'Start Time')}</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  data-testid="input-timeoff-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">{t('common.endTime', 'End Time')}</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  data-testid="input-timeoff-end"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('common.notes', 'Notes')} ({t('common.optional', 'optional')})</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('appointments.timeOffNotesPlaceholder', 'Add any notes about this off-time...')}
                rows={2}
                data-testid="input-timeoff-notes"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-delete-timeoff"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete', 'Delete')}
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 sm:flex-none"
                data-testid="button-cancel-timeoff"
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex-1 sm:flex-none"
                data-testid="button-save-timeoff"
              >
                {updateMutation.isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t('appointments.confirmDeleteTimeOff', 'Delete Off-Time?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('appointments.confirmDeleteTimeOffDesc', 'This will permanently remove this off-time block. This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
