import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, X, CheckCircle, AlertCircle, Loader2, Camera, FileText } from "lucide-react";
import { useMultiFileUpload, type FileUploadItem } from "./useMultiFileUpload";
import { useEpisodeFolders } from "./useEpisodeQueries";
import { useState } from "react";

interface MultiFileUploadDialogProps {
  patientId: string;
  episodeId: string;
  folderId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryOptions = [
  { value: "other", label: "Other" },
  { value: "exam_result", label: "Exam Result" },
  { value: "imaging", label: "Imaging" },
  { value: "consent", label: "Consent" },
  { value: "lab_result", label: "Lab Result" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "medication_list", label: "Medication List" },
  { value: "referral", label: "Referral" },
];

export function MultiFileUploadDialog({
  patientId,
  episodeId,
  folderId: initialFolderId,
  open,
  onOpenChange,
}: MultiFileUploadDialogProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("other");
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialFolderId || "");

  const { data: folders = [] } = useEpisodeFolders(episodeId);
  const {
    files,
    addFiles,
    removeFile,
    clearFiles,
    uploadAll,
    isUploading,
    allComplete,
    hasPending,
  } = useMultiFileUpload();

  // Sync initial folder when prop changes
  useEffect(() => {
    setSelectedFolderId(initialFolderId || "");
  }, [initialFolderId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = () => {
    uploadAll({
      episodeId,
      folderId: selectedFolderId || null,
      category,
      patientId,
    });
  };

  const handleClose = () => {
    if (!isUploading) {
      clearFiles();
      setCategory("other");
      onOpenChange(false);
    }
  };

  const statusIcon = (item: FileUploadItem) => {
    switch (item.status) {
      case "complete":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('episodes.uploadFiles')}</DialogTitle>
          <DialogDescription>
            {t('episodes.uploadDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,application/pdf"
            multiple
            className="hidden"
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4 mr-1" />
              {t('episodes.selectFiles')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.setAttribute("capture", "environment");
                  fileInputRef.current.click();
                  fileInputRef.current.removeAttribute("capture");
                }
              }}
              disabled={isUploading}
            >
              <Camera className="h-4 w-4" />
            </Button>
          </div>

          {/* Category selector */}
          <div className="space-y-1">
            <Label>{t('episodes.category')}</Label>
            <Select value={category} onValueChange={setCategory} disabled={isUploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Folder selector */}
          {folders.length > 0 && (
            <div className="space-y-1">
              <Label>{t('episodes.folder')}</Label>
              <Select value={selectedFolderId} onValueChange={setSelectedFolderId} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue placeholder={t('episodes.unassigned')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('episodes.unassigned')}</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
              {files.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                  {statusIcon(item)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.file.name}</p>
                    {item.status === "uploading" && (
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.status === "error" && (
                      <p className="text-xs text-red-600">{item.error}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {(item.file.size / 1024).toFixed(0)} KB
                  </span>
                  {item.status === "pending" && !isUploading && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeFile(item.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          {allComplete ? (
            <Button onClick={handleClose}>{t('episodes.done')}</Button>
          ) : (
            <Button
              onClick={handleUpload}
              disabled={!hasPending || isUploading || files.length === 0}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {t('episodes.uploading')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Upload {files.filter((f) => f.status === "pending").length} file{files.filter((f) => f.status === "pending").length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
