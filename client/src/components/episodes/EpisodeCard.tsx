import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { PatientEpisode } from "./useEpisodeQueries";

interface EpisodeCardProps {
  episode: PatientEpisode;
  onClick: () => void;
}

export function EpisodeCard({ episode, onClick }: EpisodeCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-muted-foreground font-mono">
                #{episode.episodeNumber}
              </span>
              <h3 className="font-medium truncate">{episode.title}</h3>
            </div>
            {episode.referenceDate && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(episode.referenceDate), "MMM d, yyyy")}
              </p>
            )}
          </div>
          <Badge
            variant={episode.status === "open" ? "default" : "secondary"}
            className={
              episode.status === "open"
                ? "bg-green-100 text-green-800 hover:bg-green-100"
                : "bg-gray-100 text-gray-600 hover:bg-gray-100"
            }
          >
            {episode.status}
          </Badge>
        </div>
        {episode.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {episode.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
