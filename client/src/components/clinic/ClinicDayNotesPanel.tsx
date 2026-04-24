import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, Check, AlertCircle } from 'lucide-react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ClinicDayNotesPanelProps {
  hospitalId: string;
  selectedDate: Date;
}

function formatDateKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useClinicDayNotes(hospitalId: string, selectedDate: Date) {
  const dateString = useMemo(() => formatDateKey(selectedDate), [selectedDate]);

  return useQuery<{ notes: string }>({
    queryKey: ['/api/clinic/day-notes', hospitalId, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/day-notes/${dateString}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch day notes');
      return res.json();
    },
    enabled: !!hospitalId,
  });
}

function SaveStatusIndicator({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  const { t } = useTranslation();

  if (status === 'saving') {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{t('dayNotes.saving', 'Saving...')}</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        <span>{t('dayNotes.error', 'Error saving')}</span>
      </div>
    );
  }
  if (dirty) {
    return (
      <span className="text-xs text-muted-foreground">
        {t('dayNotes.unsaved', 'Unsaved changes')}
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" />
        <span>{t('dayNotes.saved', 'Saved')}</span>
      </div>
    );
  }
  return null;
}

export default function ClinicDayNotesPanel({ hospitalId, selectedDate }: ClinicDayNotesPanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const dateString = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const { data, isLoading } = useClinicDayNotes(hospitalId, selectedDate);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const remoteRef = useRef('');

  useEffect(() => {
    if (data) {
      const remote = data.notes || '';
      setNotes(remote);
      remoteRef.current = remote;
      setStatus('idle');
    }
  }, [data, dateString]);

  const dirty = notes !== remoteRef.current;

  const saveMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest(
        'PUT',
        `/api/clinic/${hospitalId}/day-notes/${dateString}`,
        { notes: value },
      );
      return res.json();
    },
    onMutate: () => setStatus('saving'),
    onSuccess: (_, value) => {
      remoteRef.current = value;
      setStatus('saved');
      qc.invalidateQueries({
        queryKey: ['/api/clinic/day-notes', hospitalId, dateString],
      });
    },
    onError: () => setStatus('error'),
  });

  const save = () => {
    if (!dirty || saveMutation.isPending) return;
    saveMutation.mutate(notes);
  };

  // Safety net: if the user navigates away (unmount) or switches to a
  // different date while dirty, flush the save so nothing is lost.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  useEffect(() => {
    return () => {
      if (notesRef.current !== remoteRef.current) {
        apiRequest('PUT', `/api/clinic/${hospitalId}/day-notes/${dateString}`, {
          notes: notesRef.current,
        }).catch(() => {/* best-effort; nothing to do on unmount */});
      }
    };
  }, [hospitalId, dateString]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('dayNotes.clinicPlaceholder', 'Add notes for this day...')}
        className="min-h-[80px] resize-y border-0 shadow-none focus-visible:ring-0 p-0 text-sm"
      />
      <div className="flex items-center justify-end gap-3">
        <SaveStatusIndicator status={status} dirty={dirty} />
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={save}
          data-testid="button-save-day-notes"
        >
          {saveMutation.isPending
            ? t('dayNotes.saving', 'Saving...')
            : t('common.save', 'Save')}
        </Button>
      </div>
    </div>
  );
}
