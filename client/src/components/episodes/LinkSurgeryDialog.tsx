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
  const { t } = useTranslation();
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
          <DialogTitle>{t('episodes.linkSurgeries')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('episodes.noAvailableSurgeries')}
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
                    {surgery.plannedSurgery || t('episodes.unnamed')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(surgery.plannedDate)} -{" "}
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
