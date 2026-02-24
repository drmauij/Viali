import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, FolderOpen } from "lucide-react";
import { usePatientEpisodes } from "./useEpisodeQueries";
import { EpisodeCard } from "./EpisodeCard";
import { EpisodeDetailView } from "./EpisodeDetailView";
import { CreateEpisodeDialog } from "./CreateEpisodeDialog";

interface EpisodesTabProps {
  patientId: string;
  canWrite: boolean;
  surgeries: any[];
  notes: any[];
}

export function EpisodesTab({
  patientId,
  canWrite,
  surgeries,
  notes,
}: EpisodesTabProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(
    null
  );
  const [createOpen, setCreateOpen] = useState(false);

  const { data: episodes = [], isLoading } = usePatientEpisodes(patientId);

  if (selectedEpisodeId) {
    return (
      <EpisodeDetailView
        patientId={patientId}
        episodeId={selectedEpisodeId}
        onBack={() => setSelectedEpisodeId(null)}
        surgeries={surgeries}
        notes={notes}
        canWrite={canWrite}
      />
    );
  }

  const sorted = [...episodes].sort((a, b) => {
    // Open first, then closed
    if (a.status !== b.status) {
      return a.status === "open" ? -1 : 1;
    }
    // By referenceDate desc (most recent first)
    const dateA = a.referenceDate ? new Date(a.referenceDate).getTime() : 0;
    const dateB = b.referenceDate ? new Date(b.referenceDate).getTime() : 0;
    return dateB - dateA;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Episodes</h3>
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-1" />
            New Episode
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mb-2" />
          <p className="text-sm">No episodes yet</p>
          {canWrite && (
            <Button
              variant="link"
              size="sm"
              className="mt-2"
              onClick={() => setCreateOpen(true)}
            >
              Create the first episode
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              onClick={() => setSelectedEpisodeId(episode.id)}
            />
          ))}
        </div>
      )}

      <CreateEpisodeDialog
        patientId={patientId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
