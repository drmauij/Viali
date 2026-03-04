import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, FileText, Upload, Camera, Grid, List, Check, X, Pencil, Trash2, Eye, ClipboardList, FolderPlus, Folder, FolderOpen, ChevronRight, MoreHorizontal, FolderInput, Sparkles, Lock, Download } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CameraCapture } from "@/components/CameraCapture";
import { formatDateTime } from "@/lib/dateUtils";

export type PatientDocument = {
  id: string;
  hospitalId: string;
  patientId: string;
  category: "medication_list" | "diagnosis" | "exam_result" | "consent" | "lab_result" | "imaging" | "referral" | "other";
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  description?: string | null;
  uploadedBy?: string | null;
  source?: "questionnaire" | "staff_upload" | "import" | "patient_upload" | null;
  reviewed?: boolean | null;
  questionnaireUploadId?: string | null;
  documentFolderId?: string | null;
  createdAt: string;
};

type DocumentFolder = {
  id: string;
  hospitalId: string;
  patientId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

export interface DischargeBrief {
  id: string;
  briefType: string;
  language: string;
  content: string | null;
  isLocked: boolean;
  signature: string | null;
  signedBy: string | null;
  signedAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  creator: { firstName: string | null; lastName: string | null };
  signer: { firstName: string | null; lastName: string | null } | null;
}

interface PatientDocumentsSectionProps {
  patientId: string;
  hospitalId: string;
  canWrite?: boolean;
  variant?: "accordion" | "card";
  defaultExpanded?: boolean;
  onPreview?: (url: string, fileName: string, mimeType?: string, siblingImages?: Array<{id: string, fileName: string, mimeType: string, url: string, documentFolderId?: string | null}>) => void;
  isAdmin?: boolean;
  onEditBrief?: (briefId: string) => void;
  onAuditBrief?: (briefId: string) => void;
  onGenerateBrief?: () => void;
}

const categoryLabels: Record<string, string> = {
  medication_list: "Medication List",
  diagnosis: "Diagnosis",
  exam_result: "Exam Result",
  consent: "Consent",
  lab_result: "Lab Result",
  imaging: "Imaging",
  referral: "Referral",
  external_report: "External Report",
  other: "Other",
};

export function PatientDocumentsSection({
  patientId,
  hospitalId,
  canWrite = true,
  variant = "card",
  defaultExpanded = false,
  onPreview,
  isAdmin = false,
  onEditBrief,
  onAuditBrief,
  onGenerateBrief,
}: PatientDocumentsSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCompactView, setIsCompactView] = useState(true);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<PatientDocument['category']>('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<PatientDocument | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Folder state
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>('create');
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<DocumentFolder | null>(null);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);

  // Brief state
  const [deleteBriefConfirm, setDeleteBriefConfirm] = useState<DischargeBrief | null>(null);
  const [exportingBriefId, setExportingBriefId] = useState<string | null>(null);

  // Drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragCounterRef = useRef(0);
  const folderDragCounterRef = useRef<Map<string, number>>(new Map());

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    setDragOverFolderId(null);
    folderDragCounterRef.current.clear();

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && canWrite) {
      setPendingFiles(files);
      setIsUploadDialogOpen(true);
    }
  }, [canWrite]);

  const handleFolderDragEnter = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const count = (folderDragCounterRef.current.get(folderId) || 0) + 1;
    folderDragCounterRef.current.set(folderId, count);
    if (e.dataTransfer.types.includes('Files')) {
      setDragOverFolderId(folderId);
    }
  }, []);

  const handleFolderDragLeave = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const count = (folderDragCounterRef.current.get(folderId) || 0) - 1;
    folderDragCounterRef.current.set(folderId, count);
    if (count <= 0) {
      folderDragCounterRef.current.delete(folderId);
      if (dragOverFolderId === folderId) {
        setDragOverFolderId(null);
      }
    }
  }, [dragOverFolderId]);

  const handleFolderDrop = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    setDragOverFolderId(null);
    folderDragCounterRef.current.clear();

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && canWrite) {
      setPendingFiles(files);
      setUploadFolderId(folderId);
      setIsUploadDialogOpen(true);
    }
  }, [canWrite]);

  const { data: documents = [], isLoading } = useQuery<PatientDocument[]>({
    queryKey: [`/api/patients/${patientId}/documents`, patientId],
    enabled: !!patientId && !!hospitalId,
  });

  const { data: folders = [] } = useQuery<DocumentFolder[]>({
    queryKey: [`/api/patients/${patientId}/document-folders`, patientId],
    enabled: !!patientId && !!hospitalId,
  });

  const { data: briefs = [] } = useQuery<DischargeBrief[]>({
    queryKey: [`/api/patients/${patientId}/discharge-briefs`],
    enabled: !!patientId,
  });

  // ========== UPLOAD MUTATION (supports multiple files) ==========

  const uploadMutation = useMutation({
    mutationFn: async ({ files, category, description, folderId }: { files: File[]; category: string; description: string; folderId?: string | null }) => {
      await Promise.all(files.map(async (file) => {
        const urlRes = await apiRequest('POST', `/api/patients/${patientId}/documents/upload-url`, {
          filename: file.name,
          contentType: file.type,
        });
        const { uploadUrl, storageKey } = await urlRes.json();

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          console.error('S3 upload failed:', uploadResponse.status, uploadResponse.statusText);
          throw new Error(`File upload failed for ${file.name}: ${uploadResponse.statusText || uploadResponse.status}`);
        }

        await apiRequest('POST', `/api/patients/${patientId}/documents`, {
          hospitalId,
          category,
          fileName: file.name,
          fileUrl: storageKey,
          mimeType: file.type,
          fileSize: file.size,
          description: description || null,
          source: 'staff_upload',
          documentFolderId: folderId || null,
        });
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
      setIsUploadDialogOpen(false);
      setPendingFiles([]);
      setUploadCategory('other');
      setUploadDescription('');
      setUploadFolderId(null);
      toast({
        title: t('common.success'),
        description: t('anesthesia.patientDetail.documentUploaded', 'Document uploaded successfully'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message || t('anesthesia.patientDetail.uploadFailed', 'Failed to upload document'),
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ docId, description, reviewed }: { docId: string; description?: string; reviewed?: boolean }) => {
      await apiRequest('PATCH', `/api/patients/${patientId}/documents/${docId}`, { description, reviewed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
      setEditingDocId(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      await apiRequest('DELETE', `/api/patients/${patientId}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
      setDeleteConfirmDoc(null);
      toast({
        title: t('common.success'),
        description: t('anesthesia.patientDetail.documentDeleted', 'Document deleted'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ========== FOLDER MUTATIONS ==========

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest('POST', `/api/patients/${patientId}/document-folders`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/document-folders`] });
      setFolderDialogOpen(false);
      setFolderName('');
      toast({ title: t('common.success'), description: t('anesthesia.patientDetail.folderCreated', 'Folder created') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      await apiRequest('PATCH', `/api/patients/${patientId}/document-folders/${folderId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/document-folders`] });
      setFolderDialogOpen(false);
      setFolderName('');
      setEditingFolder(null);
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      await apiRequest('DELETE', `/api/patients/${patientId}/document-folders/${folderId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/document-folders`] });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
      setDeleteFolderConfirm(null);
      toast({ title: t('common.success'), description: t('anesthesia.patientDetail.folderDeleted', 'Folder deleted') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const moveToFolderMutation = useMutation({
    mutationFn: async ({ docId, folderId }: { docId: string; folderId: string | null }) => {
      await apiRequest('PATCH', `/api/patients/${patientId}/documents/${docId}/folder`, { folderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // ========== BRIEF MUTATIONS ==========

  const deleteBriefMutation = useMutation({
    mutationFn: async (briefId: string) => {
      await apiRequest('DELETE', `/api/discharge-briefs/${briefId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/discharge-briefs`] });
      setDeleteBriefConfirm(null);
      toast({ description: t('dischargeBriefs.deleted', 'Brief deleted') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const handleExportBriefPdf = async (briefId: string) => {
    setExportingBriefId(briefId);
    try {
      const res = await apiRequest('POST', `/api/discharge-briefs/${briefId}/export-pdf`);
      const data = await res.json();
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank');
    } catch (error: any) {
      toast({ variant: 'destructive', description: error.message || 'Failed to export PDF' });
    } finally {
      setExportingBriefId(null);
    }
  };

  // ========== HANDLERS ==========

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setPendingFiles(Array.from(files));
      setIsUploadDialogOpen(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCameraCapture = async (photoDataUrl: string) => {
    const response = await fetch(photoDataUrl);
    const blob = await response.blob();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File([blob], `photo-${timestamp}.jpg`, { type: 'image/jpeg' });
    setPendingFiles([file]);
    setIsCameraOpen(false);
    setIsUploadDialogOpen(true);
  };

  const handleUpload = () => {
    if (pendingFiles.length > 0) {
      uploadMutation.mutate({ files: pendingFiles, category: uploadCategory, description: uploadDescription, folderId: uploadFolderId });
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handlePreviewDocument = async (doc: PatientDocument) => {
    if (onPreview) {
      const fileUrl = `/api/patients/${patientId}/documents/${doc.id}/file`;
      // Compute sibling images in the same folder context
      const siblingImages = documents
        .filter(d => d.mimeType?.startsWith('image/') && d.documentFolderId === doc.documentFolderId)
        .map(d => ({
          id: d.id,
          fileName: d.fileName,
          mimeType: d.mimeType || 'image/jpeg',
          url: `/api/patients/${patientId}/documents/${d.id}/file`,
          documentFolderId: d.documentFolderId,
        }));
      onPreview(fileUrl, doc.fileName, doc.mimeType, siblingImages);
    } else {
      const fileUrl = `/api/patients/${patientId}/documents/${doc.id}/file`;
      window.open(fileUrl, '_blank');
    }
  };

  const startEditDescription = (doc: PatientDocument) => {
    setEditingDocId(doc.id);
    setEditDescription(doc.description || '');
  };

  const saveDescription = (docId: string) => {
    updateMutation.mutate({ docId, description: editDescription });
  };

  const toggleReviewed = (doc: PatientDocument) => {
    updateMutation.mutate({ docId: doc.id, reviewed: !doc.reviewed });
  };

  const openCreateFolder = () => {
    setFolderDialogMode('create');
    setFolderName('');
    setEditingFolder(null);
    setFolderDialogOpen(true);
  };

  const openRenameFolder = (folder: DocumentFolder) => {
    setFolderDialogMode('rename');
    setFolderName(folder.name);
    setEditingFolder(folder);
    setFolderDialogOpen(true);
  };

  const handleFolderDialogSubmit = () => {
    if (!folderName.trim()) return;
    if (folderDialogMode === 'create') {
      createFolderMutation.mutate(folderName.trim());
    } else if (editingFolder) {
      renameFolderMutation.mutate({ folderId: editingFolder.id, name: folderName.trim() });
    }
  };

  const toggleFolder = (folderId: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const isRecent = (createdAt: string) => {
    const docDate = new Date(createdAt);
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    return docDate > dayAgo;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryLabel = (category: string) => {
    const key = `anesthesia.patientDetail.uploadCategory${category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
    return t(key, categoryLabels[category] || category);
  };

  // ========== DOCUMENT CARD RENDERING ==========

  const renderDocumentCard = (doc: PatientDocument) => {
    const isImage = doc.mimeType?.startsWith('image/');
    const fileUrl = `/api/patients/${patientId}/documents/${doc.id}/file`;
    const needsReview = (doc.source === 'questionnaire' || doc.source === 'patient_upload') && !doc.reviewed;
    const isRecentDoc = isRecent(doc.createdAt);
    const hasFolders = folders.length > 0;

    return (
      <div
        key={doc.id}
        className={`relative border rounded-lg overflow-hidden ${needsReview && isRecentDoc ? 'ring-2 ring-amber-400' : ''}`}
        data-testid={`document-card-${doc.id}`}
      >
        {isCompactView ? (
          <div className="p-3 flex items-center gap-3">
            <div
              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => handlePreviewDocument(doc)}
            >
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{doc.fileName}</span>
                  {doc.source === 'questionnaire' && (
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      <ClipboardList className="h-3 w-3 mr-1" />
                      {t('anesthesia.patientDetail.fromQuestionnaire', 'Questionnaire')}
                    </Badge>
                  )}
                  {doc.source === 'patient_upload' && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      <Upload className="h-3 w-3 mr-1" />
                      {t('anesthesia.patientDetail.patientUpload', 'Patient Upload')}
                    </Badge>
                  )}
                  {needsReview && (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                      {t('anesthesia.patientDetail.needsReview', 'Needs Review')}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span>{doc.description || getCategoryLabel(doc.category)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {editingDocId === doc.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('anesthesia.patientDetail.addDescription', 'Add description...')}
                    className="h-7 text-sm w-40"
                    data-testid={`input-edit-description-${doc.id}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => saveDescription(doc.id)} data-testid={`button-save-description-${doc.id}`}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDocId(null)} data-testid={`button-cancel-description-${doc.id}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEditDescription(doc)} data-testid={`button-edit-description-${doc.id}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  {(doc.source === 'questionnaire' || doc.source === 'patient_upload') && canWrite && (
                    <Button
                      size="sm"
                      variant={doc.reviewed ? "default" : "outline"}
                      className="h-7"
                      onClick={() => toggleReviewed(doc)}
                      data-testid={`button-toggle-reviewed-${doc.id}`}
                    >
                      {doc.reviewed ? <Check className="h-3 w-3 mr-1" /> : null}
                      {doc.reviewed ? t('anesthesia.patientDetail.reviewed', 'Reviewed') : t('anesthesia.patientDetail.markReviewed', 'Mark Reviewed')}
                    </Button>
                  )}
                  {canWrite && hasFolders && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" data-testid={`button-move-folder-${doc.id}`}>
                          <FolderInput className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {folders.map(f => (
                          <DropdownMenuItem
                            key={f.id}
                            onClick={() => moveToFolderMutation.mutate({ docId: doc.id, folderId: f.id })}
                            disabled={doc.documentFolderId === f.id}
                          >
                            <Folder className="h-3 w-3 mr-2" />
                            {f.name}
                          </DropdownMenuItem>
                        ))}
                        {doc.documentFolderId && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => moveToFolderMutation.mutate({ docId: doc.id, folderId: null })}>
                              <X className="h-3 w-3 mr-2" />
                              {t('anesthesia.patientDetail.removeFromFolder', 'Remove from folder')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handlePreviewDocument(doc)} data-testid={`button-preview-${doc.id}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirmDoc(doc)} data-testid={`button-delete-${doc.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div
              className="aspect-[4/3] bg-muted flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => handlePreviewDocument(doc)}
            >
              {isImage ? (
                <img src={fileUrl} alt={doc.fileName} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <FileText className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            <div className="p-2 space-y-1">
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm font-medium truncate flex-1" title={doc.fileName}>{doc.fileName}</p>
                <div className="flex gap-1">
                  {canWrite && hasFolders && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" data-testid={`button-move-folder-grid-${doc.id}`}>
                          <FolderInput className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {folders.map(f => (
                          <DropdownMenuItem
                            key={f.id}
                            onClick={() => moveToFolderMutation.mutate({ docId: doc.id, folderId: f.id })}
                            disabled={doc.documentFolderId === f.id}
                          >
                            <Folder className="h-3 w-3 mr-2" />
                            {f.name}
                          </DropdownMenuItem>
                        ))}
                        {doc.documentFolderId && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => moveToFolderMutation.mutate({ docId: doc.id, folderId: null })}>
                              <X className="h-3 w-3 mr-2" />
                              {t('anesthesia.patientDetail.removeFromFolder', 'Remove from folder')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteConfirmDoc(doc)} data-testid={`button-delete-${doc.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-xs">{getCategoryLabel(doc.category)}</Badge>
                {doc.source === 'questionnaire' && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    <ClipboardList className="h-3 w-3 mr-1" />
                    {t('anesthesia.patientDetail.fromQuestionnaire', 'Patient')}
                  </Badge>
                )}
                {doc.source === 'patient_upload' && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    <Upload className="h-3 w-3 mr-1" />
                    {t('anesthesia.patientDetail.patientUpload', 'Patient Upload')}
                  </Badge>
                )}
                {needsReview && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    {t('anesthesia.patientDetail.needsReview', 'Review')}
                  </Badge>
                )}
              </div>
              {editingDocId === doc.id ? (
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('anesthesia.patientDetail.addDescription', 'Add description...')}
                    className="h-6 text-xs"
                    data-testid={`input-edit-description-${doc.id}`}
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => saveDescription(doc.id)} data-testid={`button-save-description-${doc.id}`}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingDocId(null)} data-testid={`button-cancel-description-${doc.id}`}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-xs text-muted-foreground truncate flex-1">{doc.description || formatFileSize(doc.fileSize)}</p>
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => startEditDescription(doc)} data-testid={`button-edit-description-${doc.id}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
              {(doc.source === 'questionnaire' || doc.source === 'patient_upload') && canWrite && (
                <Button
                  size="sm"
                  variant={doc.reviewed ? "default" : "outline"}
                  className="w-full h-7 mt-1"
                  onClick={() => toggleReviewed(doc)}
                  data-testid={`button-toggle-reviewed-${doc.id}`}
                >
                  {doc.reviewed ? <Check className="h-3 w-3 mr-1" /> : null}
                  {doc.reviewed ? t('anesthesia.patientDetail.reviewed', 'Reviewed') : t('anesthesia.patientDetail.markReviewed', 'Mark Reviewed')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ========== BRIEF CARD RENDERING ==========

  const BRIEF_TYPE_LABELS: Record<string, string> = {
    surgery_discharge: t('dischargeBriefs.types.surgeryDischarge', 'Surgery'),
    anesthesia_discharge: t('dischargeBriefs.types.anesthesiaDischarge', 'Anesthesia'),
    anesthesia_overnight_discharge: t('dischargeBriefs.types.anesthesiaOvernightDischarge', 'Anesthesia + Overnight'),
    prescription: t('dischargeBriefs.types.prescription', 'Prescription'),
  };

  const LANG_LABELS: Record<string, string> = { de: 'DE', en: 'EN', fr: 'FR', it: 'IT' };

  const renderBriefCard = (brief: DischargeBrief) => {
    const creatorName = brief.creator
      ? `${brief.creator.firstName || ''} ${brief.creator.lastName || ''}`.trim()
      : '';
    const isExporting = exportingBriefId === brief.id;

    return (
      <div
        key={`brief-${brief.id}`}
        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
        data-testid={`brief-card-${brief.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Brief
              </Badge>
              <Badge variant="outline" className="text-xs">
                {BRIEF_TYPE_LABELS[brief.briefType] || brief.briefType}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {LANG_LABELS[brief.language] || brief.language}
              </Badge>
              {brief.isLocked ? (
                <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <Lock className="h-3 w-3 mr-1" />
                  {t('dischargeBriefs.signed', 'Signed')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  {t('dischargeBriefs.draft', 'Draft')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {creatorName && `${creatorName} · `}
              {brief.createdAt && formatDateTime(brief.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onEditBrief && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEditBrief(brief.id)}
              title={brief.isLocked ? t('common.view', 'View') : t('common.edit', 'Edit')}
            >
              {brief.isLocked ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleExportBriefPdf(brief.id)}
            disabled={isExporting}
            title={t('dischargeBriefs.exportPdf', 'Export PDF')}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>

          {isAdmin && onAuditBrief && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAuditBrief(brief.id)}
              title={t('dischargeBriefs.viewAudit', 'View Audit')}
            >
              <ClipboardList className="h-4 w-4" />
            </Button>
          )}

          {canWrite && !brief.isLocked && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteBriefConfirm(brief)}
              className="text-destructive hover:text-destructive"
              title={t('common.delete', 'Delete')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  // ========== FOLDER-GROUPED RENDERING ==========

  const renderDocumentList = () => {
    const hasFolders = folders.length > 0;
    const hasBriefs = briefs.length > 0;

    // Briefs section (always compact list style, shown at the top)
    const briefsSection = hasBriefs ? (
      <div className="space-y-2">
        {briefs.map(renderBriefCard)}
      </div>
    ) : null;

    if (!hasFolders) {
      return (
        <div className="space-y-3">
          {briefsSection}
          {documents.length > 0 && (
            <div className={isCompactView ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
              {documents.map(renderDocumentCard)}
            </div>
          )}
        </div>
      );
    }

    const folderDocs = new Map<string, PatientDocument[]>();
    const unfiledDocs: PatientDocument[] = [];

    for (const doc of documents) {
      if (doc.documentFolderId && folders.some(f => f.id === doc.documentFolderId)) {
        const existing = folderDocs.get(doc.documentFolderId) || [];
        existing.push(doc);
        folderDocs.set(doc.documentFolderId, existing);
      } else {
        unfiledDocs.push(doc);
      }
    }

    return (
      <div className="space-y-3">
        {briefsSection}

        {folders.map(folder => {
          const docs = folderDocs.get(folder.id) || [];
          const isOpen = openFolders.has(folder.id);
          const isFolderDragTarget = dragOverFolderId === folder.id;

          return (
            <Collapsible key={folder.id} open={isOpen} onOpenChange={() => toggleFolder(folder.id)}>
              <div
                className={`flex items-center gap-2 group rounded-md transition-colors ${isFolderDragTarget ? 'bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-400 ring-inset' : ''}`}
                onDragEnter={(e) => handleFolderDragEnter(e, folder.id)}
                onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleFolderDrop(e, folder.id)}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 flex items-center gap-2 flex-1 justify-start">
                    <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    {isOpen ? <FolderOpen className={`h-4 w-4 ${isFolderDragTarget ? 'text-blue-600' : 'text-blue-500'}`} /> : <Folder className={`h-4 w-4 ${isFolderDragTarget ? 'text-blue-600' : 'text-blue-500'}`} />}
                    <span className="font-medium text-sm">{folder.name}</span>
                    <Badge variant="secondary" className="text-xs ml-1">{docs.length}</Badge>
                    {isFolderDragTarget && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                        <Upload className="h-3 w-3 inline mr-1" />
                        {t('anesthesia.patientDetail.dropHere', 'Drop here')}
                      </span>
                    )}
                  </Button>
                </CollapsibleTrigger>
                {canWrite && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-folder-menu-${folder.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openRenameFolder(folder)}>
                        <Pencil className="h-3 w-3 mr-2" />
                        {t('common.rename', 'Rename')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteFolderConfirm(folder)} className="text-destructive">
                        <Trash2 className="h-3 w-3 mr-2" />
                        {t('common.delete', 'Delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <CollapsibleContent>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-10 py-2">
                    {t('anesthesia.patientDetail.emptyFolder', 'No documents in this folder')}
                  </p>
                ) : (
                  <div className={`pl-6 mt-1 ${isCompactView ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
                    {docs.map(renderDocumentCard)}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {unfiledDocs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {t('anesthesia.patientDetail.unfiled', 'Unfiled')}
              </span>
              <Badge variant="secondary" className="text-xs">{unfiledDocs.length}</Badge>
            </div>
            <div className={isCompactView ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
              {unfiledDocs.map(renderDocumentCard)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const hasDocuments = documents.length > 0 || briefs.length > 0;
  const totalItems = documents.length + briefs.length;

  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <CardTitle className={`text-lg flex items-center gap-2 ${hasDocuments ? 'text-blue-600 dark:text-blue-400' : ''}`}>
        <FileText className="h-5 w-5" />
        {t('anesthesia.patientDetail.patientDocuments', 'Patient Documents')} ({totalItems})
      </CardTitle>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); setIsCompactView(!isCompactView); }}
          data-testid="button-toggle-view"
        >
          {isCompactView ? <Grid className="h-4 w-4" /> : <List className="h-4 w-4" />}
        </Button>
        {canWrite && (
          <>
            {onGenerateBrief && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onGenerateBrief(); }}
                data-testid="button-generate-brief"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {t('dischargeBriefs.compact.generateBrief', 'Generate Brief')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); openCreateFolder(); }}
              data-testid="button-create-folder"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); setIsCameraOpen(true); }}
              data-testid="button-camera-capture"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              data-testid="button-upload-document"
            >
              <Upload className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const content = (
    <>
      <div
        className={`relative rounded-lg transition-all ${isDraggingOver && canWrite ? 'ring-2 ring-dashed ring-blue-400 bg-blue-50/50 dark:bg-blue-950/30' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDraggingOver && canWrite && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/80 dark:bg-blue-950/80 rounded-lg pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400">
              <Upload className="h-8 w-8" />
              <span className="text-sm font-medium">{t('anesthesia.patientDetail.dropFilesHere', 'Drop files to upload')}</span>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : documents.length === 0 && folders.length === 0 && briefs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>{t('anesthesia.patientDetail.noDocuments', 'No documents uploaded yet')}</p>
            {canWrite && (
              <p className="text-sm mt-1">{t('anesthesia.patientDetail.dragOrClick', 'Drag files here or click upload')}</p>
            )}
            {canWrite && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-first"
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('anesthesia.patientDetail.uploadDocument', 'Upload Document')}
              </Button>
            )}
          </div>
        ) : (
          renderDocumentList()
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,application/pdf"
        className="hidden"
        multiple
        data-testid="input-file-upload"
      />

      {/* Upload dialog (multi-file) */}
      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => { if (!open) { setUploadFolderId(null); } setIsUploadDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('anesthesia.patientDetail.uploadDocument', 'Upload Document')}
              {pendingFiles.length > 1 && ` (${pendingFiles.length})`}
            </DialogTitle>
            <DialogDescription>{t('anesthesia.patientDetail.uploadDocumentDesc', 'Add a document to this patient\'s file')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {pendingFiles.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-2">
                {pendingFiles.map((file, i) => (
                  <div key={i} className="p-2 bg-muted rounded-lg flex items-center gap-3">
                    <FileText className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    {pendingFiles.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={() => removePendingFile(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.category', 'Category')}</Label>
              <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as PatientDocument['category'])}>
                <SelectTrigger data-testid="select-upload-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medication_list">{getCategoryLabel('medication_list')}</SelectItem>
                  <SelectItem value="diagnosis">{getCategoryLabel('diagnosis')}</SelectItem>
                  <SelectItem value="exam_result">{getCategoryLabel('exam_result')}</SelectItem>
                  <SelectItem value="consent">{getCategoryLabel('consent')}</SelectItem>
                  <SelectItem value="lab_result">{getCategoryLabel('lab_result')}</SelectItem>
                  <SelectItem value="imaging">{getCategoryLabel('imaging')}</SelectItem>
                  <SelectItem value="referral">{getCategoryLabel('referral')}</SelectItem>
                  <SelectItem value="other">{getCategoryLabel('other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {folders.length > 0 && (
              <div className="space-y-2">
                <Label>{t('anesthesia.patientDetail.folder', 'Folder')} ({t('common.optional', 'optional')})</Label>
                <Select value={uploadFolderId || '_none'} onValueChange={(v) => setUploadFolderId(v === '_none' ? null : v)}>
                  <SelectTrigger data-testid="select-upload-folder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('anesthesia.patientDetail.noFolder', 'No folder')}</SelectItem>
                    {folders.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.description', 'Description')} ({t('common.optional', 'optional')})</Label>
              <Input
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder={t('anesthesia.patientDetail.descriptionPlaceholder', 'Brief description of the document')}
                data-testid="input-upload-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || pendingFiles.length === 0} data-testid="button-confirm-upload">
              {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.upload', 'Upload')}{pendingFiles.length > 1 ? ` (${pendingFiles.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera dialog */}
      <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.takePhoto', 'Take Photo')}</DialogTitle>
            <DialogDescription>{t('anesthesia.patientDetail.takePhotoDesc', 'Capture a photo of the document')}</DialogDescription>
          </DialogHeader>
          <CameraCapture isOpen={isCameraOpen} onCapture={handleCameraCapture} onClose={() => setIsCameraOpen(false)} fullFrame={true} hint={t('anesthesia.patientDetail.captureDocumentHint', 'Position document in frame')} />
        </DialogContent>
      </Dialog>

      {/* Delete document dialog */}
      <Dialog open={!!deleteConfirmDoc} onOpenChange={() => setDeleteConfirmDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.deleteDocument', 'Delete Document')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.patientDetail.deleteDocumentConfirm', 'Are you sure you want to delete this document? This action cannot be undone.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmDoc(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmDoc && deleteMutation.mutate(deleteConfirmDoc.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Rename folder dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {folderDialogMode === 'create'
                ? t('anesthesia.patientDetail.createFolder', 'Create Folder')
                : t('anesthesia.patientDetail.renameFolder', 'Rename Folder')}
            </DialogTitle>
            <DialogDescription>
              {folderDialogMode === 'create'
                ? t('anesthesia.patientDetail.createFolderDesc', 'Create a folder to group related documents')
                : t('anesthesia.patientDetail.renameFolderDesc', 'Enter a new name for this folder')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.folderName', 'Folder name')}</Label>
              <Input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={t('anesthesia.patientDetail.folderNamePlaceholder', 'e.g., Pre-op photos')}
                onKeyDown={(e) => e.key === 'Enter' && handleFolderDialogSubmit()}
                autoFocus
                data-testid="input-folder-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={handleFolderDialogSubmit}
              disabled={!folderName.trim() || createFolderMutation.isPending || renameFolderMutation.isPending}
              data-testid="button-confirm-folder"
            >
              {(createFolderMutation.isPending || renameFolderMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {folderDialogMode === 'create' ? t('common.create', 'Create') : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder dialog */}
      <Dialog open={!!deleteFolderConfirm} onOpenChange={() => setDeleteFolderConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.deleteFolder', 'Delete Folder')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.patientDetail.deleteFolderConfirm', 'Are you sure you want to delete this folder? Documents inside will be moved to "Unfiled" — they will not be deleted.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFolderConfirm(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteFolderConfirm && deleteFolderMutation.mutate(deleteFolderConfirm.id)}
              disabled={deleteFolderMutation.isPending}
              data-testid="button-confirm-delete-folder"
            >
              {deleteFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Brief delete confirmation */}
      <AlertDialog open={!!deleteBriefConfirm} onOpenChange={(open) => { if (!open) setDeleteBriefConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete', 'Confirm Delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dischargeBriefs.deleteConfirm', 'Are you sure you want to delete this discharge brief? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBriefConfirm && deleteBriefMutation.mutate(deleteBriefConfirm.id)}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteBriefMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (variant === "accordion") {
    return (
      <AccordionItem value="patient-documents">
        <Card className={hasDocuments ? "border-blue-400 dark:border-blue-600" : ""}>
          <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-patient-documents">
            {headerContent}
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-4">
                {t('anesthesia.patientDetail.patientDocumentsDesc', 'Documents associated with this patient, including files from questionnaires and staff uploads.')}
              </p>
              {content}
            </CardContent>
          </AccordionContent>
        </Card>
      </AccordionItem>
    );
  }

  return (
    <Card className={hasDocuments ? "border-blue-400 dark:border-blue-600" : ""}>
      <CardHeader className="pb-3">
        {headerContent}
        <p className="text-sm text-muted-foreground">
          {t('anesthesia.patientDetail.patientDocumentsDesc', 'Documents associated with this patient, including files from questionnaires and staff uploads.')}
        </p>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}
