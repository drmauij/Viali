import { useState, useCallback } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type FileUploadStatus = "pending" | "uploading" | "complete" | "error";

export type FileUploadItem = {
  id: string;
  file: File;
  status: FileUploadStatus;
  progress: number;
  error?: string;
};

type UploadOptions = {
  episodeId: string;
  folderId?: string | null;
  category?: string;
  patientId: string;
};

export function useMultiFileUpload() {
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    const items: FileUploadItem[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending" as FileUploadStatus,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const updateFileStatus = (
    id: string,
    updates: Partial<FileUploadItem>
  ) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const uploadSingleFile = async (
    item: FileUploadItem,
    options: UploadOptions
  ): Promise<void> => {
    const { episodeId, folderId, category, patientId } = options;

    try {
      updateFileStatus(item.id, { status: "uploading", progress: 10 });

      // Step 1: Get presigned upload URL
      const urlRes = await apiRequest(
        "POST",
        `/api/episodes/${episodeId}/documents/upload-url`,
        {
          filename: item.file.name,
          contentType: item.file.type,
        }
      );
      const { uploadUrl, storageKey } = await urlRes.json();

      updateFileStatus(item.id, { progress: 20 });

      // Step 2: Upload to S3 using XMLHttpRequest for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", item.file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = 20 + Math.round((event.loaded / event.total) * 60);
            updateFileStatus(item.id, { progress: pct });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Upload network error"));
        xhr.send(item.file);
      });

      updateFileStatus(item.id, { progress: 85 });

      // Step 3: Create document record
      await apiRequest("POST", `/api/episodes/${episodeId}/documents`, {
        category: category || "other",
        fileName: item.file.name,
        fileUrl: storageKey,
        mimeType: item.file.type,
        fileSize: item.file.size,
        folderId: folderId || null,
      });

      updateFileStatus(item.id, { status: "complete", progress: 100 });
    } catch (error: any) {
      updateFileStatus(item.id, {
        status: "error",
        error: error?.message || "Upload failed",
      });
    }
  };

  const uploadAll = useCallback(
    async (options: UploadOptions) => {
      setIsUploading(true);
      const pending = files.filter((f) => f.status === "pending");

      // Upload up to 3 files in parallel using a simple pool
      const pool: Promise<void>[] = [];
      let idx = 0;

      const next = async (): Promise<void> => {
        while (idx < pending.length) {
          const current = pending[idx++];
          await uploadSingleFile(current, options);
          // Continue to next
        }
      };

      const concurrency = Math.min(3, pending.length);
      for (let i = 0; i < concurrency; i++) {
        pool.push(next());
      }

      await Promise.all(pool);

      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: [`/api/episodes/${options.episodeId}/documents`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/patients/${options.patientId}/episodes/${options.episodeId}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/patients/${options.patientId}/documents`],
      });

      setIsUploading(false);
    },
    [files]
  );

  const allComplete = files.length > 0 && files.every((f) => f.status === "complete");
  const hasErrors = files.some((f) => f.status === "error");
  const hasPending = files.some((f) => f.status === "pending");

  return {
    files,
    addFiles,
    removeFile,
    clearFiles,
    uploadAll,
    isUploading,
    allComplete,
    hasErrors,
    hasPending,
  };
}
