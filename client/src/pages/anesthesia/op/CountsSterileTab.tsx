import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SignaturePad from "@/components/SignaturePad";
import { useDebouncedAutoSave } from "@/hooks/useDebouncedAutoSave";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  X,
  Package,
  Camera,
  Upload,
  Image,
  FileText,
} from "lucide-react";

interface CountsSterileData {
  surgicalCounts?: Array<{ id: string; name: string; count1?: number | null; count2?: number | null; countFinal?: number | null }>;
  sterileItems?: Array<{ id: string; name: string; lotNumber?: string; quantity: number }>;
  sutures?: Record<string, string>;
  stickerDocs?: Array<{ id: string; type: 'photo' | 'pdf'; data?: string | null; storageKey?: string | null; filename?: string; mimeType?: string; size?: number | null; createdAt?: number; createdBy?: string }>;
  signatures?: { instrumenteur?: string; circulating?: string };
}

interface CountsSterileTabProps {
  surgeryId: string;
  anesthesiaRecordId: string | undefined;
  anesthesiaRecord: any;
}

function getUserDisplayName(user: any): string {
  if (!user) return "";
  if (user.displayName) return user.displayName;
  if (user.name) return user.name;
  const firstName = user.firstName || user.firstname || "";
  const lastName = user.lastName || user.surname || user.lastname || "";
  if (firstName || lastName) return `${firstName} ${lastName}`.trim();
  if (user.email) return user.email;
  return "";
}

export function CountsSterileTab({ surgeryId, anesthesiaRecordId, anesthesiaRecord }: CountsSterileTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Counts & Sterile data state
  const [countsSterileData, setCountsSterileData] = useState<CountsSterileData>({});

  // Sterile items state
  const [sterileItems, setSterileItems] = useState<Array<{ id: string; name: string; lotNumber: string; quantity: number }>>([]);
  const [showAddSterileItemDialog, setShowAddSterileItemDialog] = useState(false);
  const [newSterileItemName, setNewSterileItemName] = useState("");
  const [newSterileItemLot, setNewSterileItemLot] = useState("");
  const [newSterileItemQty, setNewSterileItemQty] = useState(1);

  // Sticker documentation state
  const [sterileDocMode, setSterileDocMode] = useState<'items' | 'photo'>('items');
  const [stickerUploadProgress, setStickerUploadProgress] = useState<string | null>(null);
  const [stickerDocUrls, setStickerDocUrls] = useState<Record<string, string>>({});
  const stickerFileInputRef = useRef<HTMLInputElement>(null);

  // Signature pad state
  const [showCountsSterileSignaturePad, setShowCountsSterileSignaturePad] = useState<'instrumenteur' | 'circulating' | null>(null);

  // Auto-save mutation for Counts & Sterile data
  const countsSterileAutoSave = useDebouncedAutoSave({
    mutationFn: async (data: CountsSterileData) => {
      if (!anesthesiaRecordId) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecordId}/counts-sterile`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
    debounceMs: 800,
  });

  // Initialize Counts & Sterile data from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;

    const countsSterileValue = (anesthesiaRecord as any).countsSterileData || (anesthesiaRecord as any).counts_sterile_data;
    if (countsSterileValue) {
      setCountsSterileData(countsSterileValue);
      if (countsSterileValue.sterileItems) {
        setSterileItems(countsSterileValue.sterileItems);
      }
    }
  }, [anesthesiaRecord]);

  // Handlers
  const handleAddSterileItem = () => {
    if (!newSterileItemName.trim()) return;

    const newItem = {
      id: `sterile-${Date.now()}`,
      name: newSterileItemName.trim(),
      lotNumber: newSterileItemLot.trim(),
      quantity: newSterileItemQty,
    };

    const updatedItems = [...sterileItems, newItem];
    setSterileItems(updatedItems);

    const updated = { ...countsSterileData, sterileItems: updatedItems };
    setCountsSterileData(updated);
    countsSterileAutoSave.mutate(updated);

    setNewSterileItemName("");
    setNewSterileItemLot("");
    setNewSterileItemQty(1);
    setShowAddSterileItemDialog(false);
  };

  const handleRemoveSterileItem = (id: string) => {
    const updatedItems = sterileItems.filter(item => item.id !== id);
    setSterileItems(updatedItems);

    const updated = { ...countsSterileData, sterileItems: updatedItems };
    setCountsSterileData(updated);
    countsSterileAutoSave.mutate(updated);
  };

  const handleStickerFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !anesthesiaRecordId) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: t('surgery.sterile.invalidFileType'),
        description: t('surgery.sterile.allowedFormats'),
        variant: 'destructive',
      });
      return;
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: t('surgery.sterile.fileTooLarge'),
        description: t('surgery.sterile.maxFileSize'),
        variant: 'destructive',
      });
      return;
    }

    if (event.target) {
      event.target.value = '';
    }

    try {
      setStickerUploadProgress('uploading');

      const urlRes = await fetch(`/api/anesthesia/records/${anesthesiaRecordId}/sticker-doc/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json();
        if (urlRes.status === 503) {
          console.log('Object storage not configured, falling back to base64');
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            const newDoc = {
              id: `sticker-${Date.now()}`,
              type: (file.type === 'application/pdf' ? 'pdf' : 'photo') as 'photo' | 'pdf',
              data: base64,
              filename: file.name,
              mimeType: file.type,
              size: file.size,
              createdAt: Date.now(),
              createdBy: user ? getUserDisplayName(user) : undefined,
            };
            const updatedDocs = [...(countsSterileData.stickerDocs || []), newDoc];
            const updated = { ...countsSterileData, stickerDocs: updatedDocs };
            setCountsSterileData(updated);
            countsSterileAutoSave.mutate(updated);
            setStickerUploadProgress(null);
          };
          reader.readAsDataURL(file);
          return;
        }
        throw new Error(err.message || 'Failed to get upload URL');
      }

      const { uploadURL, storageKey } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file to storage');
      }

      const newDoc = {
        id: `sticker-${Date.now()}`,
        type: (file.type === 'application/pdf' ? 'pdf' : 'photo') as 'photo' | 'pdf',
        storageKey,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        createdAt: Date.now(),
        createdBy: user ? getUserDisplayName(user) : undefined,
      };

      const updatedDocs = [...(countsSterileData.stickerDocs || []), newDoc];
      const updated = { ...countsSterileData, stickerDocs: updatedDocs };
      setCountsSterileData(updated);
      countsSterileAutoSave.mutate(updated);
      setStickerUploadProgress(null);

      toast({
        title: t('common.success'),
        description: t('surgery.sterile.docUploaded'),
      });
    } catch (error: any) {
      console.error('Sticker doc upload error:', error);
      setStickerUploadProgress(null);
      toast({
        title: t('common.error'),
        description: error.message || t('surgery.sterile.uploadFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleRemoveStickerDoc = (id: string) => {
    const updatedDocs = (countsSterileData.stickerDocs || []).filter(doc => doc.id !== id);
    const updated = { ...countsSterileData, stickerDocs: updatedDocs };
    setCountsSterileData(updated);
    countsSterileAutoSave.mutate(updated);
  };

  const fetchStickerDocUrl = async (docId: string) => {
    if (!anesthesiaRecordId || stickerDocUrls[docId]) return;

    try {
      const res = await fetch(`/api/anesthesia/records/${anesthesiaRecordId}/sticker-doc/${docId}/download-url`, {
        credentials: 'include',
      });
      if (res.ok) {
        const { downloadURL } = await res.json();
        setStickerDocUrls(prev => ({ ...prev, [docId]: downloadURL }));
      }
    } catch (error) {
      console.error('Error fetching sticker doc URL:', error);
    }
  };

  const getStickerDocSrc = (doc: { id: string; data?: string | null; storageKey?: string | null }) => {
    if (doc.data) return doc.data;
    if (doc.storageKey && stickerDocUrls[doc.id]) return stickerDocUrls[doc.id];
    return null;
  };

  return (
    <>
      {/* Surgical Counts Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('surgery.counts.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">{t('surgery.counts.item')}</th>
                  <th className="text-center py-2 px-3">{t('surgery.counts.count1')}</th>
                  <th className="text-center py-2 px-3">{t('surgery.counts.count2')}</th>
                  <th className="text-center py-2 px-3">{t('surgery.counts.countFinal')}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const defaultItems = ["Bauchtücher", "Kompressen", "Tupfer", "Tupferli", "Gummibändli", "Nadeln"];
                  const existingCounts = countsSterileData.surgicalCounts || [];

                  return defaultItems.map((itemName, idx) => {
                    const itemId = `count-${idx}`;
                    const existing = existingCounts.find(c => c.id === itemId);
                    const count1 = existing?.count1 ?? null;
                    const count2 = existing?.count2 ?? null;
                    const countFinal = existing?.countFinal ?? null;

                    const updateCount = (field: 'count1' | 'count2' | 'countFinal', value: string) => {
                      const numValue = value === '' ? null : parseInt(value, 10);
                      if (value !== '' && isNaN(numValue as number)) return;

                      const newCounts = [...(countsSterileData.surgicalCounts || [])];
                      const existingIdx = newCounts.findIndex(c => c.id === itemId);

                      if (existingIdx >= 0) {
                        newCounts[existingIdx] = { ...newCounts[existingIdx], [field]: numValue };
                      } else {
                        newCounts.push({ id: itemId, name: itemName, [field]: numValue });
                      }

                      const updated = { ...countsSterileData, surgicalCounts: newCounts };
                      setCountsSterileData(updated);
                    };

                    return (
                      <tr key={itemName} className="border-b">
                        <td className="py-2 px-3 font-medium">{itemName}</td>
                        <td className="py-1 px-3 text-center">
                          <Input
                            className="w-16 text-center mx-auto"
                            data-testid={`input-count1-${idx}`}
                            value={count1 ?? ''}
                            onChange={(e) => updateCount('count1', e.target.value)}
                            onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                          />
                        </td>
                        <td className="py-1 px-3 text-center">
                          <Input
                            className="w-16 text-center mx-auto"
                            data-testid={`input-count2-${idx}`}
                            value={count2 ?? ''}
                            onChange={(e) => updateCount('count2', e.target.value)}
                            onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                          />
                        </td>
                        <td className="py-1 px-3 text-center">
                          <Input
                            className="w-16 text-center mx-auto"
                            data-testid={`input-countfinal-${idx}`}
                            value={countFinal ?? ''}
                            onChange={(e) => updateCount('countFinal', e.target.value)}
                            onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                          />
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sterile Items Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
            <Button
              size="sm"
              variant={sterileDocMode === 'items' ? 'default' : 'ghost'}
              className="flex items-center gap-2"
              onClick={() => setSterileDocMode('items')}
              data-testid="button-sterile-items-tab"
            >
              <Package className="h-4 w-4" />
              {t('surgery.sterile.items')}
            </Button>
            <Button
              size="sm"
              variant={sterileDocMode === 'photo' ? 'default' : 'ghost'}
              className="flex items-center gap-2"
              onClick={() => setSterileDocMode('photo')}
              data-testid="button-sticker-photo-tab"
            >
              <Camera className="h-4 w-4" />
              {t('surgery.sterile.stickerDocumentation')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sterileDocMode === 'items' ? (
            <>
              <div className="flex justify-end mb-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddSterileItemDialog(true)}
                  data-testid="button-add-sterile-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('surgery.sterile.addItem')}
                </Button>
              </div>
              {sterileItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>{t('surgery.sterile.noItems')}</p>
                  <p className="text-sm">{t('surgery.sterile.scanOrAdd')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sterileItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{item.name}</div>
                        {item.lotNumber && (
                          <div className="text-sm text-muted-foreground">Lot: {item.lotNumber}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{item.quantity}x</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveSterileItem(item.id)}
                          data-testid={`button-remove-sterile-${item.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {t('surgery.sterile.stickerDocumentationDesc')}
              </p>
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="file"
                  ref={stickerFileInputRef}
                  onChange={handleStickerFileUpload}
                  accept="image/jpeg,image/png,image/gif,application/pdf"
                  className="hidden"
                  data-testid="input-sticker-file"
                />
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={() => {
                    if (stickerFileInputRef.current) {
                      stickerFileInputRef.current.setAttribute('capture', 'environment');
                      stickerFileInputRef.current.click();
                    }
                  }}
                  data-testid="button-take-sticker-photo"
                >
                  <Camera className="h-4 w-4" />
                  {t('surgery.sterile.takePhoto')}
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={() => {
                    if (stickerFileInputRef.current) {
                      stickerFileInputRef.current.removeAttribute('capture');
                      stickerFileInputRef.current.click();
                    }
                  }}
                  data-testid="button-upload-sticker-file"
                >
                  <Upload className="h-4 w-4" />
                  {t('surgery.sterile.uploadFile')}
                </Button>
              </div>
              {stickerUploadProgress && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  {t('common.uploading')}...
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(countsSterileData.stickerDocs || []).map((doc) => {
                  const imgSrc = getStickerDocSrc(doc);
                  if (doc.storageKey && !doc.data && !stickerDocUrls[doc.id]) {
                    fetchStickerDocUrl(doc.id);
                  }

                  return (
                    <div key={doc.id} className="relative aspect-[4/3] border rounded-lg overflow-hidden group">
                      {doc.type === 'photo' ? (
                        imgSrc ? (
                          <img src={imgSrc} alt={doc.filename || 'Sticker'} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <div className="animate-pulse h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full" />
                          </div>
                        )
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted">
                          <FileText className="h-8 w-8 mb-2 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground truncate max-w-full px-2">{doc.filename || 'PDF'}</span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemoveStickerDoc(doc.id)}
                        data-testid={`button-remove-sticker-${doc.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
                {(!countsSterileData.stickerDocs || countsSterileData.stickerDocs.length === 0) && (
                  <div
                    className="relative aspect-[4/3] border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      if (stickerFileInputRef.current) {
                        stickerFileInputRef.current.removeAttribute('capture');
                        stickerFileInputRef.current.click();
                      }
                    }}
                    data-testid="sticker-photo-placeholder"
                  >
                    <Image className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-xs">{t('surgery.sterile.noPhotos')}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sutures */}
      <Card>
        <CardHeader>
          <CardTitle>{t('surgery.sterile.sutures')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">{t('surgery.sterile.sutureType')}</th>
                  <th className="text-left py-2 px-3">{t('surgery.sterile.sizes')}</th>
                </tr>
              </thead>
              <tbody>
                {["Vicryl", "V-Lock", "Prolene", "Ethilon", "Monocryl", "Stratafix"].map((type) => {
                  const key = type.toLowerCase().replace('-', '');
                  return (
                    <tr key={type} className="border-b">
                      <td className="py-2 px-3 font-medium">{type}</td>
                      <td className="py-1 px-3">
                        <Input
                          placeholder={t('surgery.sterile.sizePlaceholder')}
                          data-testid={`input-suture-${type.toLowerCase()}`}
                          value={countsSterileData.sutures?.[key] ?? ''}
                          onChange={(e) => {
                            const updated = {
                              ...countsSterileData,
                              sutures: {
                                ...countsSterileData.sutures,
                                [key]: e.target.value,
                              },
                            };
                            setCountsSterileData(updated);
                          }}
                          onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Signatures */}
      <Card>
        <CardHeader>
          <CardTitle>{t('surgery.sterile.signatures')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('surgery.intraop.signatureZudienung')}</Label>
            <div
              className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
              onClick={() => setShowCountsSterileSignaturePad('circulating')}
              data-testid="signature-pad-sterile-zudienung"
            >
              {countsSterileData.signatures?.circulating ? (
                <img src={countsSterileData.signatures.circulating} alt="Signature" className="h-full w-full object-contain" />
              ) : (
                t('surgery.intraop.tapToSign')
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('surgery.intraop.signatureInstrum')}</Label>
            <div
              className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
              onClick={() => setShowCountsSterileSignaturePad('instrumenteur')}
              data-testid="signature-pad-sterile-instrum"
            >
              {countsSterileData.signatures?.instrumenteur ? (
                <img src={countsSterileData.signatures.instrumenteur} alt="Signature" className="h-full w-full object-contain" />
              ) : (
                t('surgery.intraop.tapToSign')
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Counts & Sterile Signature Pad Dialogs */}
      <SignaturePad
        isOpen={showCountsSterileSignaturePad === 'circulating'}
        onClose={() => setShowCountsSterileSignaturePad(null)}
        onSave={(signature) => {
          const updated = {
            ...countsSterileData,
            signatures: {
              ...countsSterileData.signatures,
              circulating: signature,
            },
          };
          setCountsSterileData(updated);
          countsSterileAutoSave.mutate(updated);
        }}
        title={t('surgery.intraop.signatureZudienung')}
      />
      <SignaturePad
        isOpen={showCountsSterileSignaturePad === 'instrumenteur'}
        onClose={() => setShowCountsSterileSignaturePad(null)}
        onSave={(signature) => {
          const updated = {
            ...countsSterileData,
            signatures: {
              ...countsSterileData.signatures,
              instrumenteur: signature,
            },
          };
          setCountsSterileData(updated);
          countsSterileAutoSave.mutate(updated);
        }}
        title={t('surgery.intraop.signatureInstrum')}
      />

      {/* Add Sterile Item Dialog */}
      <Dialog open={showAddSterileItemDialog} onOpenChange={setShowAddSterileItemDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('surgery.sterile.addItem')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sterile-item-name">{t('surgery.sterile.itemName')}</Label>
              <Input
                id="sterile-item-name"
                placeholder={t('surgery.sterile.itemNamePlaceholder')}
                value={newSterileItemName}
                onChange={(e) => setNewSterileItemName(e.target.value)}
                data-testid="input-sterile-item-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sterile-item-lot">{t('surgery.sterile.lotNumber')}</Label>
              <Input
                id="sterile-item-lot"
                placeholder={t('surgery.sterile.lotNumberPlaceholder')}
                value={newSterileItemLot}
                onChange={(e) => setNewSterileItemLot(e.target.value)}
                data-testid="input-sterile-item-lot"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sterile-item-qty">{t('surgery.sterile.quantity')}</Label>
              <Input
                id="sterile-item-qty"
                type="number"
                min={1}
                value={newSterileItemQty}
                onChange={(e) => setNewSterileItemQty(parseInt(e.target.value) || 1)}
                data-testid="input-sterile-item-qty"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAddSterileItemDialog(false)}
              data-testid="button-cancel-sterile-item"
            >
              {t('anesthesia.op.cancel')}
            </Button>
            <Button
              onClick={handleAddSterileItem}
              disabled={!newSterileItemName.trim()}
              data-testid="button-confirm-sterile-item"
            >
              {t('surgery.sterile.addItem')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
