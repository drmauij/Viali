import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, FileText, Upload, Camera, Grid, List, Check, X, Pencil, ExternalLink, Trash2, Eye, ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CameraCapture } from "@/components/CameraCapture";
import { format } from "date-fns";

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
  source?: "questionnaire" | "staff_upload" | "import" | null;
  reviewed?: boolean | null;
  questionnaireUploadId?: string | null;
  createdAt: string;
};

interface PatientDocumentsSectionProps {
  patientId: string;
  hospitalId: string;
  canWrite?: boolean;
  variant?: "accordion" | "card";
  defaultExpanded?: boolean;
  onPreview?: (url: string, fileName: string, mimeType?: string) => void;
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
}: PatientDocumentsSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCompactView, setIsCompactView] = useState(true);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<PatientDocument['category']>('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<PatientDocument | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery<PatientDocument[]>({
    queryKey: [`/api/patients/${patientId}/documents`, patientId],
    enabled: !!patientId && !!hospitalId,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, category, description }: { file: File; category: string; description: string }) => {
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
        throw new Error(`File upload failed: ${uploadResponse.statusText || uploadResponse.status}`);
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
      setIsUploadDialogOpen(false);
      setPendingFile(null);
      setUploadCategory('other');
      setUploadDescription('');
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
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
    setPendingFile(file);
    setIsCameraOpen(false);
    setIsUploadDialogOpen(true);
  };

  const handleUpload = () => {
    if (pendingFile) {
      uploadMutation.mutate({ file: pendingFile, category: uploadCategory, description: uploadDescription });
    }
  };

  const handlePreviewDocument = async (doc: PatientDocument) => {
    if (onPreview) {
      const fileUrl = `/api/patients/${patientId}/documents/${doc.id}/file`;
      onPreview(fileUrl, doc.fileName, doc.mimeType);
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

  const renderDocumentCard = (doc: PatientDocument) => {
    const isImage = doc.mimeType?.startsWith('image/');
    const fileUrl = `/api/patients/${patientId}/documents/${doc.id}/file`;
    const needsReview = doc.source === 'questionnaire' && !doc.reviewed;
    const isRecentDoc = isRecent(doc.createdAt);

    return (
      <div
        key={doc.id}
        className={`relative border rounded-lg overflow-hidden ${needsReview && isRecentDoc ? 'ring-2 ring-amber-400' : ''}`}
        data-testid={`document-card-${doc.id}`}
      >
        {isCompactView ? (
          <div className="p-3 flex items-center gap-3">
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
                {needsReview && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    {t('anesthesia.patientDetail.needsReview', 'Needs Review')}
                  </Badge>
                )}
              </div>
              {editingDocId === doc.id ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('anesthesia.patientDetail.addDescription', 'Add description...')}
                    className="h-7 text-sm"
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{doc.description || getCategoryLabel(doc.category)}</span>
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => startEditDescription(doc)} data-testid={`button-edit-description-${doc.id}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {doc.source === 'questionnaire' && canWrite && (
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
              <Button size="sm" variant="ghost" onClick={() => handlePreviewDocument(doc)} data-testid={`button-preview-${doc.id}`}>
                <Eye className="h-4 w-4" />
              </Button>
              {canWrite && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirmDoc(doc)} data-testid={`button-delete-${doc.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
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
              {doc.source === 'questionnaire' && canWrite && (
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

  const hasDocuments = documents.length > 0;

  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <CardTitle className={`text-lg flex items-center gap-2 ${hasDocuments ? 'text-blue-600 dark:text-blue-400' : ''}`}>
        <FileText className="h-5 w-5" />
        {t('anesthesia.patientDetail.patientDocuments', 'Patient Documents')} ({documents.length})
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
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>{t('anesthesia.patientDetail.noDocuments', 'No documents uploaded yet')}</p>
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
        <div className={isCompactView ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
          {documents.map(renderDocumentCard)}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,application/pdf"
        className="hidden"
        data-testid="input-file-upload"
      />

      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.uploadDocument', 'Upload Document')}</DialogTitle>
            <DialogDescription>{t('anesthesia.patientDetail.uploadDocumentDesc', 'Add a document to this patient\'s file')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {pendingFile && (
              <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">{pendingFile.name}</p>
                  <p className="text-sm text-muted-foreground">{formatFileSize(pendingFile.size)}</p>
                </div>
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
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || !pendingFile} data-testid="button-confirm-upload">
              {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.upload', 'Upload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.takePhoto', 'Take Photo')}</DialogTitle>
            <DialogDescription>{t('anesthesia.patientDetail.takePhotoDesc', 'Capture a photo of the document')}</DialogDescription>
          </DialogHeader>
          <CameraCapture isOpen={isCameraOpen} onCapture={handleCameraCapture} onClose={() => setIsCameraOpen(false)} fullFrame={true} hint={t('anesthesia.patientDetail.captureDocumentHint', 'Position document in frame')} />
        </DialogContent>
      </Dialog>

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
