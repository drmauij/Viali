import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { useDebouncedAutoSave, AutoSaveStatus } from '@/hooks/useDebouncedAutoSave';
import { Loader2, Check, AlertCircle } from 'lucide-react';

interface DayNotesPanelProps {
  hospitalId: string;
  selectedDate: Date;
}

function formatDateKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useOpDayNotes(hospitalId: string, selectedDate: Date) {
  const dateString = useMemo(() => formatDateKey(selectedDate), [selectedDate]);

  return useQuery<{ notes: string }>({
    queryKey: ['/api/op-day-notes', hospitalId, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/op-day-notes/${hospitalId}/${dateString}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch day notes');
      return res.json();
    },
    enabled: !!hospitalId,
  });
}

function SaveStatusIndicator({ status }: { status: AutoSaveStatus }) {
  const { t } = useTranslation();

  if (status === 'idle') return null;

  return (
    <div className="flex items-center gap-1 text-xs">
      {status === 'pending' && (
        <span className="text-muted-foreground">{t('dayNotes.pending', 'Unsaved...')}</span>
      )}
      {status === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">{t('dayNotes.saving', 'Saving...')}</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="h-3 w-3 text-green-600" />
          <span className="text-green-600">{t('dayNotes.saved', 'Saved')}</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="h-3 w-3 text-destructive" />
          <span className="text-destructive">{t('dayNotes.error', 'Error saving')}</span>
        </>
      )}
    </div>
  );
}

export default function DayNotesPanel({ hospitalId, selectedDate }: DayNotesPanelProps) {
  const { t } = useTranslation();
  const dateString = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const { data, isLoading } = useOpDayNotes(hospitalId, selectedDate);
  const [notes, setNotes] = useState('');

  // Sync local state when remote data loads or date changes
  useEffect(() => {
    if (data) {
      setNotes(data.notes || '');
    }
  }, [data]);

  const { mutate: saveNotes, flush, status } = useDebouncedAutoSave<unknown, { notes: string }>({
    mutationFn: async ({ notes: notesValue }) => {
      const res = await apiRequest('PUT', `/api/op-day-notes/${hospitalId}/${dateString}`, { notes: notesValue });
      return res.json();
    },
    queryKey: ['/api/op-day-notes', hospitalId, dateString],
  });

  const handleChange = (value: string) => {
    setNotes(value);
    saveNotes({ notes: value });
  };

  // Flush unsaved changes when navigating away
  useEffect(() => {
    return () => { flush(); };
  }, [flush, dateString]);

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
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t('dayNotes.placeholder', 'Add notes for this OP day...')}
        className="min-h-[80px] resize-y border-0 shadow-none focus-visible:ring-0 p-0 text-sm"
      />
      <div className="flex justify-end">
        <SaveStatusIndicator status={status} />
      </div>
    </div>
  );
}
