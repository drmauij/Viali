import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import SignaturePad from "@/components/SignaturePad";
import { AlertTriangle, Package } from "lucide-react";

interface CommitItem {
  itemId: string;
  itemName: string;
  quantity: number;
  isControlled: boolean;
}

interface ControlledItemsCommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (signature: string | null) => void;
  items: CommitItem[];
  isCommitting: boolean;
}

export function ControlledItemsCommitDialog({
  isOpen,
  onClose,
  onCommit,
  items,
  isCommitting,
}: ControlledItemsCommitDialogProps) {
  const { t } = useTranslation();
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  const controlledItems = items.filter(i => i.isControlled);
  const regularItems = items.filter(i => !i.isControlled);
  const hasControlledItems = controlledItems.length > 0;

  const handleCommit = () => {
    if (hasControlledItems && !signature) {
      setShowSignaturePad(true);
      return;
    }
    onCommit(signature);
  };

  const handleSignatureSave = (sig: string) => {
    setSignature(sig);
    setShowSignaturePad(false);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {t('anesthesia.op.commitDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('anesthesia.op.commitDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {/* Controlled Items */}
              {hasControlledItems && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h4 className="font-semibold text-sm">{t('anesthesia.op.controlledItems')}</h4>
                    <Badge variant="destructive" className="text-xs">
                      {controlledItems.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('anesthesia.op.controlledItemsSignatureRequired')}
                  </p>
                  <div className="space-y-1 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                    {controlledItems.map(item => (
                      <div
                        key={item.itemId}
                        className="flex justify-between items-center text-sm"
                        data-testid={`controlled-item-${item.itemId}`}
                      >
                        <span className="font-medium">{item.itemName}</span>
                        <Badge variant="outline" className="bg-white dark:bg-gray-900">
                          {item.quantity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Items */}
              {regularItems.length > 0 && (
                <>
                  {hasControlledItems && <Separator />}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-500" />
                      <h4 className="font-semibold text-sm">{t('anesthesia.op.commitItems')}</h4>
                      <Badge variant="secondary" className="text-xs">
                        {regularItems.length}
                      </Badge>
                    </div>
                    <div className="space-y-1 bg-muted/50 p-3 rounded-lg">
                      {regularItems.map(item => (
                        <div
                          key={item.itemId}
                          className="flex justify-between items-center text-sm"
                          data-testid={`regular-item-${item.itemId}`}
                        >
                          <span>{item.itemName}</span>
                          <Badge variant="outline">{item.quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Signature Status */}
              {hasControlledItems && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">
                    {t('anesthesia.op.signatureRequired')}
                  </span>
                  {signature ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSignaturePad(true)}
                      data-testid="button-change-signature"
                    >
                      {t('common.edit')}
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setShowSignaturePad(true)}
                      data-testid="button-sign"
                    >
                      {t('anesthesia.op.signHere')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isCommitting}
              data-testid="button-cancel"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCommit}
              disabled={isCommitting || (hasControlledItems && !signature)}
              data-testid="button-commit"
            >
              {isCommitting ? t('common.loading') : t('common.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onSave={handleSignatureSave}
        title={t('anesthesia.op.signatureRequired')}
      />
    </>
  );
}
