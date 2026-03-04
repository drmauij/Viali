import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FolderPlus, Folder, FileQuestion } from "lucide-react";
import { CreateFolderDialog } from "./CreateFolderDialog";

interface EpisodeFolder {
  id: string;
  episodeId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

interface EpisodeFolderListProps {
  folders: EpisodeFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  isClosed: boolean;
  episodeId: string;
  patientId: string;
}

export function EpisodeFolderList({
  folders,
  selectedFolderId,
  onSelectFolder,
  isClosed,
  episodeId,
  patientId,
}: EpisodeFolderListProps) {
  const { t } = useTranslation();
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  const sortedFolders = [...folders].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1">
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
            selectedFolderId === null
              ? "bg-primary/10 text-primary font-medium"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          <FileQuestion className="h-4 w-4 flex-shrink-0" />
          {t('episodes.unassigned')}
        </button>
        {sortedFolders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => onSelectFolder(folder.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
              selectedFolderId === folder.id
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-muted text-muted-foreground"
            }`}
          >
            <Folder className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
        ))}
      </div>

      {!isClosed && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-start gap-2"
          onClick={() => setCreateFolderOpen(true)}
        >
          <FolderPlus className="h-4 w-4" />
          {t('episodes.newFolder')}
        </Button>
      )}

      <CreateFolderDialog
        episodeId={episodeId}
        patientId={patientId}
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
      />
    </div>
  );
}
