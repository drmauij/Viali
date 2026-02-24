import { useState } from "react";
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [referenceDate, setReferenceDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );

  const { createEpisode } = useEpisodeMutations(patientId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createEpisode.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        referenceDate: referenceDate || undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setReferenceDate(format(new Date(), "yyyy-MM-dd"));
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Episode</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="episode-title">Title *</Label>
            <Input
              id="episode-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Episode title"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="episode-description">Description</Label>
            <Textarea
              id="episode-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="episode-date">Reference Date</Label>
            <Input
              id="episode-date"
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
            />
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
              type="submit"
              disabled={!title.trim() || createEpisode.isPending}
            >
              {createEpisode.isPending ? "Creating..." : "Create Episode"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
