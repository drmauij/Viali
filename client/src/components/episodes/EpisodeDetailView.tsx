import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Upload,
  Link2,
  X,
  Loader2,
  FileText,
  Scissors,
  StickyNote,
} from "lucide-react";
import { format } from "date-fns";
import {
  useEpisodeDetail,
  useEpisodeDocuments,
  useEpisodeSurgeries,
  useEpisodeNotes,
} from "./useEpisodeQueries";
import { useEpisodeMutations } from "./useEpisodeMutations";
import { EpisodeFolderList } from "./EpisodeFolderList";
import { EpisodeFolderDocuments } from "./EpisodeFolderDocuments";
import { LinkSurgeryDialog } from "./LinkSurgeryDialog";
import { LinkNoteDialog } from "./LinkNoteDialog";
import { MultiFileUploadDialog } from "./MultiFileUploadDialog";

interface EpisodeDetailViewProps {
  patientId: string;
  episodeId: string;
  onBack: () => void;
  surgeries: any[];
  notes: any[];
  canWrite: boolean;
}

export function EpisodeDetailView({
  patientId,
  episodeId,
  onBack,
  surgeries,
  notes,
  canWrite,
}: EpisodeDetailViewProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [linkSurgeryOpen, setLinkSurgeryOpen] = useState(false);
  const [linkNoteOpen, setLinkNoteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: detail, isLoading: detailLoading } = useEpisodeDetail(
    patientId,
    episodeId
  );
  const { data: documents = [] } = useEpisodeDocuments(episodeId);
  const { data: linkedSurgeries = [] } = useEpisodeSurgeries(episodeId);
  const { data: linkedNotes = [] } = useEpisodeNotes(episodeId);

  const {
    closeEpisode,
    reopenEpisode,
    unlinkSurgery,
    unlinkNote,
  } = useEpisodeMutations(patientId);

  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Episode not found
      </div>
    );
  }

  const { episode, folders } = detail;
  const isClosed = episode.status === "closed";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground font-mono">
              #{episode.episodeNumber}
            </span>
            <h2 className="text-xl font-semibold">{episode.title}</h2>
            <Badge
              variant={isClosed ? "secondary" : "default"}
              className={
                isClosed
                  ? "bg-gray-100 text-gray-600"
                  : "bg-green-100 text-green-800"
              }
            >
              {episode.status}
            </Badge>
          </div>
          {episode.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {episode.description}
            </p>
          )}
          {(episode.referenceDate || episode.endDate) && (
            <p className="text-xs text-muted-foreground mt-1">
              {episode.referenceDate && format(new Date(episode.referenceDate), "MMM d, yyyy")}
              {episode.referenceDate && episode.endDate && " — "}
              {episode.endDate && format(new Date(episode.endDate), "MMM d, yyyy")}
            </p>
          )}
        </div>
        {canWrite && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isClosed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reopenEpisode.mutate(episode.id)}
                disabled={reopenEpisode.isPending}
              >
                Reopen
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => closeEpisode.mutate(episode.id)}
                disabled={closeEpisode.isPending}
              >
                Close
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Documents Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
            </CardTitle>
            {canWrite && !isClosed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            {/* Folder sidebar */}
            <div className="w-full md:w-1/3 md:border-r md:pr-4">
              <EpisodeFolderList
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                isClosed={isClosed}
                episodeId={episodeId}
                patientId={patientId}
              />
            </div>
            {/* Document grid */}
            <div className="w-full md:w-2/3">
              <EpisodeFolderDocuments
                documents={documents}
                folderId={selectedFolderId}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Surgeries */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Linked Surgeries
            </CardTitle>
            {canWrite && !isClosed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinkSurgeryOpen(true)}
              >
                <Link2 className="h-4 w-4 mr-1" />
                Link Surgery
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {linkedSurgeries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No linked surgeries
            </p>
          ) : (
            <div className="space-y-2">
              {linkedSurgeries.map((surgery: any) => (
                <div
                  key={surgery.id}
                  className="flex items-center justify-between p-2 rounded-md border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {surgery.plannedSurgery || "Unnamed surgery"}
                    </p>
                    {surgery.plannedDate && (
                      <p className="text-xs text-muted-foreground">
                        {format(
                          new Date(surgery.plannedDate),
                          "MMM d, yyyy"
                        )}
                      </p>
                    )}
                  </div>
                  {canWrite && !isClosed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() =>
                        unlinkSurgery.mutate({
                          episodeId,
                          surgeryId: surgery.id,
                        })
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked Notes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Linked Notes
            </CardTitle>
            {canWrite && !isClosed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinkNoteOpen(true)}
              >
                <Link2 className="h-4 w-4 mr-1" />
                Link Note
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {linkedNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No linked notes
            </p>
          ) : (
            <div className="space-y-2">
              {linkedNotes.map((note: any) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between p-2 rounded-md border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{note.content}</p>
                    {note.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(note.createdAt), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  {canWrite && !isClosed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() =>
                        unlinkNote.mutate({
                          episodeId,
                          noteId: note.id,
                        })
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <LinkSurgeryDialog
        episodeId={episodeId}
        patientId={patientId}
        open={linkSurgeryOpen}
        onOpenChange={setLinkSurgeryOpen}
        surgeries={surgeries}
      />
      <LinkNoteDialog
        episodeId={episodeId}
        patientId={patientId}
        open={linkNoteOpen}
        onOpenChange={setLinkNoteOpen}
        notes={notes}
      />
      <MultiFileUploadDialog
        patientId={patientId}
        episodeId={episodeId}
        folderId={selectedFolderId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </div>
  );
}
