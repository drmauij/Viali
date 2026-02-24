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

interface Surgery {
  id: string;
  plannedDate: string;
  plannedSurgery?: string;
  status: string;
  episodeId?: string | null;
}

interface LinkSurgeryDialogProps {
  episodeId: string;
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surgeries: Surgery[];
}

export function LinkSurgeryDialog({
  episodeId,
  patientId,
  open,
  onOpenChange,
  surgeries,
}: LinkSurgeryDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { linkSurgery } = useEpisodeMutations(patientId);
  const [linking, setLinking] = useState(false);

  const available = surgeries.filter(
    (s) => !s.episodeId || s.episodeId !== episodeId
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
      for (const surgeryId of selected) {
        await linkSurgery.mutateAsync({ episodeId, surgeryId });
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
          <DialogTitle>Link Surgeries</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No available surgeries to link
            </p>
          ) : (
            available.map((surgery) => (
              <label
                key={surgery.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(surgery.id)}
                  onCheckedChange={() => toggleSelection(surgery.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {surgery.plannedSurgery || "Unnamed surgery"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(surgery.plannedDate), "MMM d, yyyy")} -{" "}
                    {surgery.status}
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
