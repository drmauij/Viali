import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Paperclip, Image as ImageLucide, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "@/components/CameraCapture";
import { useToast } from "@/hooks/use-toast";

interface PatientCardImageUploaderProps {
  patientId: string;
  cardType: 'id_card' | 'insurance_card';
  side: 'front' | 'back';
  currentUrl?: string | null;
  label: string;
  onUpdate: () => void;
}

export function PatientCardImageUploader({
  patientId,
  cardType,
  side,
  currentUrl,
  label,
  onUpdate
}: PatientCardImageUploaderProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing image preview URL
  useEffect(() => {
    if (currentUrl) {
      setIsLoadingImage(true);
      fetch(`/api/patients/${patientId}/card-image/${cardType}/${side}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.downloadUrl) {
            setImagePreviewUrl(data.downloadUrl);
          }
        })
        .catch(err => console.error('Error loading card image:', err))
        .finally(() => setIsLoadingImage(false));
    } else {
      setImagePreviewUrl(null);
    }
  }, [patientId, cardType, side, currentUrl]);

  const uploadImage = async (imageData: string) => {
    setIsUploading(true);
    try {
      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();

      // Get upload URL
      const uploadUrlResponse = await fetch(`/api/patients/${patientId}/card-image/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cardType,
          side,
          filename: `${cardType}_${side}.jpg`,
          contentType: 'image/jpeg'
        }),
      });

      if (!uploadUrlResponse.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, storageKey } = await uploadUrlResponse.json();

      // Upload to S3
      const s3Response = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'image/jpeg' },
      });

      if (!s3Response.ok) throw new Error('Failed to upload image');

      // Update patient record with storage key
      const updateResponse = await fetch(`/api/patients/${patientId}/card-image`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cardType, side, imageUrl: storageKey }),
      });

      if (!updateResponse.ok) throw new Error('Failed to update patient record');

      toast({ title: t('common.success'), description: t('anesthesia.patients.imageUploaded', 'Image uploaded successfully') });
      onUpdate();
    } catch (error) {
      console.error('Error uploading card image:', error);
      toast({
        title: t('common.error'),
        description: t('anesthesia.patients.imageUploadFailed', 'Failed to upload image'),
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        uploadImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (photoData: string) => {
    setIsCameraOpen(false);
    uploadImage(photoData);
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}/card-image`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cardType, side }),
      });

      if (!response.ok) throw new Error('Failed to delete image');

      setImagePreviewUrl(null);
      toast({ title: t('common.success'), description: t('anesthesia.patients.imageDeleted', 'Image deleted') });
      onUpdate();
    } catch (error) {
      console.error('Error deleting card image:', error);
      toast({
        title: t('common.error'),
        description: t('anesthesia.patients.imageDeleteFailed', 'Failed to delete image'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>

      <div className="relative aspect-[3/2] border rounded-lg overflow-hidden bg-muted flex items-center justify-center min-h-[80px]">
        {isLoadingImage ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : imagePreviewUrl ? (
          <>
            <img src={imagePreviewUrl} alt={label} className="w-full h-full object-cover" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={handleDelete}
              disabled={isUploading}
              data-testid={`btn-delete-${cardType}-${side}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-2">
            <ImageLucide className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground text-center">{t('anesthesia.patients.noImage', 'No image')}</span>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>

      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => setIsCameraOpen(true)}
          disabled={isUploading}
          data-testid={`btn-camera-${cardType}-${side}`}
        >
          <Camera className="h-3 w-3 mr-1" />
          {t('common.camera', 'Camera')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          data-testid={`btn-upload-${cardType}-${side}`}
        >
          <Paperclip className="h-3 w-3 mr-1" />
          {t('common.upload', 'Upload')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          data-testid={`input-file-${cardType}-${side}`}
        />
      </div>

      <CameraCapture
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        fullFrame
        hint={`${cardType === 'id_card' ? t('anesthesia.patients.idCard', 'ID Card') : t('anesthesia.patients.insuranceCard', 'Insurance Card')} - ${label}`}
      />
    </div>
  );
}
