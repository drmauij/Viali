import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Trash2, ExternalLink, Activity, Pill, Calendar } from "lucide-react";

interface AnesthesiaRecordWithCounts {
  id: string;
  surgeryId: string;
  createdAt: string;
  updatedAt: string;
  dataCounts: {
    vitals: number;
    medications: number;
    events: number;
  };
  totalDataPoints: number;
}

interface DuplicateRecordsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: AnesthesiaRecordWithCounts[];
  surgeryId: string;
  onSelectRecord: (recordId: string) => void;
  onRefresh: () => void;
}

export function DuplicateRecordsDialog({
  open,
  onOpenChange,
  records,
  surgeryId,
  onSelectRecord,
  onRefresh,
}: DuplicateRecordsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [recordToDelete, setRecordToDelete] = useState<AnesthesiaRecordWithCounts | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const deleteRecordMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const response = await apiRequest("DELETE", `/api/anesthesia/records/${recordId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete record");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('anesthesia.duplicates.deleteSuccess', 'Duplicate record deleted successfully'),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}/all`] });
      setDeleteConfirmOpen(false);
      setRecordToDelete(null);
      onRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (record: AnesthesiaRecordWithCounts) => {
    setRecordToDelete(record);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (recordToDelete) {
      deleteRecordMutation.mutate(recordToDelete.id);
    }
  };

  const sortedRecords = [...records].sort((a, b) => b.totalDataPoints - a.totalDataPoints);
  const primaryRecord = sortedRecords[0];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('anesthesia.duplicates.title', 'Multiple Anesthesia Records Found')}
            </DialogTitle>
            <DialogDescription>
              {t('anesthesia.duplicates.description', 'This surgery has multiple anesthesia records. This can happen when the record is opened on multiple devices simultaneously. Please select the correct record to open and remove any duplicates.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-4">
            {sortedRecords.map((record, index) => (
              <div
                key={record.id}
                className={`border rounded-lg p-4 ${index === 0 ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {index === 0 && (
                        <Badge variant="default" className="text-xs">
                          {t('anesthesia.duplicates.recommended', 'Recommended')}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        ID: {record.id.slice(0, 8)}...
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <Calendar className="h-3.5 w-3.5" />
                      {t('anesthesia.duplicates.created', 'Created')}: {format(new Date(record.createdAt), "dd.MM.yyyy HH:mm")}
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm">
                      <div className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5 text-red-500" />
                        <span>{record.dataCounts.vitals} {t('anesthesia.duplicates.vitals', 'vitals')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Pill className="h-3.5 w-3.5 text-blue-500" />
                        <span>{record.dataCounts.medications} {t('anesthesia.duplicates.medications', 'medications')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-green-500" />
                        <span>{record.dataCounts.events} {t('anesthesia.duplicates.events', 'events')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => onSelectRecord(record.id)}
                      data-testid={`button-open-record-${record.id}`}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      {t('anesthesia.duplicates.open', 'Open')}
                    </Button>
                    {records.length > 1 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(record)}
                        disabled={deleteRecordMutation.isPending}
                        data-testid={`button-delete-record-${record.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('anesthesia.duplicates.delete', 'Delete')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={() => onSelectRecord(primaryRecord.id)}>
              {t('anesthesia.duplicates.openRecommended', 'Open Recommended Record')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('anesthesia.duplicates.confirmDeleteTitle', 'Delete Anesthesia Record?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {recordToDelete && (
                <>
                  {t('anesthesia.duplicates.confirmDeleteDescription', 'This will permanently delete this anesthesia record and all its data:')}
                  <ul className="mt-2 list-disc list-inside">
                    <li>{recordToDelete.dataCounts.vitals} {t('anesthesia.duplicates.vitals', 'vitals')}</li>
                    <li>{recordToDelete.dataCounts.medications} {t('anesthesia.duplicates.medications', 'medications')}</li>
                    <li>{recordToDelete.dataCounts.events} {t('anesthesia.duplicates.events', 'events')}</li>
                  </ul>
                  <p className="mt-2 font-semibold text-destructive">
                    {t('anesthesia.duplicates.cannotUndo', 'This action cannot be undone.')}
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRecordMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteRecordMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRecordMutation.isPending 
                ? t('common.deleting', 'Deleting...') 
                : t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
