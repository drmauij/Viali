import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { format } from "date-fns";
import type { EpisodeDocument } from "./useEpisodeQueries";

interface EpisodeFolderDocumentsProps {
  documents: EpisodeDocument[];
  folderId: string | null;
  onPreview?: (url: string, fileName: string, mimeType?: string) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EpisodeFolderDocuments({
  documents,
  folderId,
  onPreview,
}: EpisodeFolderDocumentsProps) {
  const filtered = documents.filter((doc) => {
    if (folderId === null) {
      return !doc.episodeFolderId;
    }
    return doc.episodeFolderId === folderId;
  });

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mb-2" />
        <p className="text-sm">No documents in this folder</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {filtered.map((doc) => (
        <Card
          key={doc.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onPreview?.(doc.fileUrl, doc.fileName, doc.mimeType ?? undefined)}
        >
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.fileName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {doc.category}
                  </Badge>
                  {doc.fileSize && (
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(doc.fileSize)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(doc.createdAt), "MMM d, yyyy")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
