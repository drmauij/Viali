import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useEpisodeMutations } from "./useEpisodeMutations";
import { formatDate } from "@/lib/dateUtils";

interface Note {
  id: string;
  content: string;
  createdAt: string;
  episodeId?: string | null;
}

interface LinkNoteDialogProps {
  episodeId: string;
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: Note[];
}

export function LinkNoteDialog({
  episodeId,
  patientId,
  open,
  onOpenChange,
  notes,
}: LinkNoteDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { linkNote } = useEpisodeMutations(patientId);
  const [linking, setLinking] = useState(false);

  const available = notes.filter(
    (n) => !n.episodeId || n.episodeId !== episodeId
  );

  const toggleSelection = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleLink = async () => {
    setLinking(true);
    try {
      for (const noteId of selected) {
        await linkNote.mutateAsync({ episodeId, noteId });
      }
      setSelected(new Set());
      onOpenChange(false);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('episodes.linkNotes')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('episodes.noAvailableNotes')}
            </p>
          ) : (
            available.map((note) => (
              <label
                key={note.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(note.id)}
                  onCheckedChange={() => toggleSelection(note.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{note.content}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(note.createdAt)}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleLink}
            disabled={selected.size === 0 || linking}
          >
            {linking
              ? t('episodes.linking')
              : `${t('episodes.link')} ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
