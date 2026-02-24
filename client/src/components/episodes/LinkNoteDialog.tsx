import { useState } from "react";
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
import { format } from "date-fns";

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
          <DialogTitle>Link Notes</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No available notes to link
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
                    {format(new Date(note.createdAt), "MMM d, yyyy")}
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
            Cancel
          </Button>
          <Button
            onClick={handleLink}
            disabled={selected.size === 0 || linking}
          >
            {linking
              ? "Linking..."
              : `Link ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
