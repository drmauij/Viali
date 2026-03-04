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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEpisodeMutations } from "./useEpisodeMutations";
import { format } from "date-fns";

interface CreateEpisodeDialogProps {
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEpisodeDialog({
  patientId,
  open,
  onOpenChange,
}: CreateEpisodeDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [referenceDate, setReferenceDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState("");

  const { createEpisode } = useEpisodeMutations(patientId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createEpisode.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        referenceDate: referenceDate || undefined,
        endDate: endDate || undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setReferenceDate(format(new Date(), "yyyy-MM-dd"));
          setEndDate("");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('episodes.createEpisode')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="episode-title">{t('episodes.episodeTitleRequired')}</Label>
            <Input
              id="episode-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('episodes.episodeTitlePlaceholder')}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="episode-description">{t('episodes.description')}</Label>
            <Textarea
              id="episode-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('episodes.descriptionPlaceholder')}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="episode-start-date">{t('episodes.startDate')}</Label>
              <Input
                id="episode-start-date"
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="episode-end-date">{t('episodes.endDate')}</Label>
              <Input
                id="episode-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
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
              type="submit"
              disabled={!title.trim() || createEpisode.isPending}
            >
              {createEpisode.isPending ? t('episodes.creating') : t('episodes.createEpisode')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
