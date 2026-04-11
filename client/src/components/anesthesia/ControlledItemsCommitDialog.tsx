import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import SignaturePad from "@/components/SignaturePad";
import { AlertTriangle, Package, X } from "lucide-react";
import { formatDate, isBirthdayUnknown } from "@/lib/dateUtils";

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
  patientId?: string | null;
  patientName?: string | null;
  patientBirthday?: string | null;
  /**
   * Optional callback to remove a controlled item inline (sets its used qty
   * to 0, same as if the user manually edited the usage list). When omitted,
   * no remove button is rendered.
   */
  onRemoveItem?: (itemId: string) => void;
}

export function ControlledItemsCommitDialog({
  isOpen,
  onClose,
  onCommit,
  items,
  isCommitting,
  patientId,
  patientName,
  patientBirthday,
  onRemoveItem,
}: ControlledItemsCommitDialogProps) {
  const { t } = useTranslation();
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<CommitItem | null>(null);

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
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-white dark:bg-gray-900">
                            {item.quantity}
                          </Badge>
                          {onRemoveItem && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              aria-label={t('anesthesia.op.removeControlledItem')}
                              title={t('anesthesia.op.removeControlledItem')}
                              onClick={() => setPendingRemoval(item)}
                              data-testid={`button-remove-controlled-${item.itemId}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Patient Information Summary */}
                  {(() => {
                    const showBirthday = !!patientBirthday && !isBirthdayUnknown(patientBirthday);
                    if (!patientName && !showBirthday) return null;
                    return (
                      <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
                          {t('anesthesia.op.patientInformation')}
                        </p>
                        <div className="space-y-1">
                          {patientName && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">{t('anesthesia.op.patientName')}:</span>
                              <span className="font-medium" data-testid="patient-name">{patientName}</span>
                            </div>
                          )}
                          {showBirthday && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">{t('anesthesia.op.patientBirthday')}:</span>
                              <span className="font-medium" data-testid="patient-birthday">
                                {formatDate(patientBirthday)}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {t('anesthesia.op.controlledItemsWillBeRegistered')}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Signature Status */}
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

      <AlertDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      >
        <AlertDialogContent data-testid="dialog-confirm-remove-controlled">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('anesthesia.op.removeControlledItemConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.op.removeControlledItemConfirmDescription', {
                itemName: pendingRemoval?.itemName ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-controlled">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoval && onRemoveItem) {
                  onRemoveItem(pendingRemoval.itemId);
                }
                setPendingRemoval(null);
              }}
              data-testid="button-confirm-remove-controlled"
            >
              {t('anesthesia.op.removeControlledItem')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
