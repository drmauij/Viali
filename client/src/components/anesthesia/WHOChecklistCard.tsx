import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface WHOChecklistCardProps {
  title: string;
  icon: LucideIcon;
  checklistType: 'signIn' | 'timeOut' | 'signOut';
  items: ChecklistItem[];
  checklist: Record<string, boolean>;
  notes: string;
  signature: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onChecklistChange: (checklist: Record<string, boolean>) => void;
  onNotesChange: (notes: string) => void;
  onSignatureChange: (signature: string) => void;
  onShowSignaturePad: () => void;
}

export function WHOChecklistCard({
  title,
  icon: Icon,
  checklistType,
  items,
  checklist,
  notes,
  signature,
  saveStatus,
  onChecklistChange,
  onNotesChange,
  onSignatureChange,
  onShowSignaturePad,
}: WHOChecklistCardProps) {
  const { t } = useTranslation();

  const handleCheckboxChange = (itemKey: string, checked: boolean) => {
    const nextChecklist = {
      ...checklist,
      [itemKey]: checked,
    };
    onChecklistChange(nextChecklist);
  };

  const handleNotesChange = (value: string) => {
    onNotesChange(value);
  };

  const handleClearSignature = () => {
    onSignatureChange('');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
          {saveStatus !== 'idle' && (
          <Badge variant={
            saveStatus === 'saving' ? 'secondary' :
            saveStatus === 'saved' ? 'default' : 'destructive'
          } data-testid={`badge-${checklistType}-status`}>
            {saveStatus === 'saving' && t('anesthesia.op.saving')}
            {saveStatus === 'saved' && t('anesthesia.op.saved')}
            {saveStatus === 'error' && t('anesthesia.op.errorSaving')}
          </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('anesthesia.op.checklistSaveHint')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items && items.length > 0 ? (
          <>
            {items.map((item: ChecklistItem, index: number) => {
              const isChecked = checklist[item.id] || false;
              return (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${checklistType}-${item.id}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleCheckboxChange(item.id, checked === true)}
                    data-testid={`checkbox-${checklistType}-${item.id}`}
                  />
                  <label
                    htmlFor={`${checklistType}-${item.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {item.label}
                  </label>
                </div>
              );
            })}
            <div className="pt-2 space-y-2">
              <Label htmlFor={`${checklistType}-notes`}>{t('anesthesia.op.additionalNotes')}</Label>
              <Textarea
                id={`${checklistType}-notes`}
                placeholder={t('anesthesia.op.notesPlaceholder', 'Add any additional notes or observations...')}
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={3}
                data-testid={`textarea-${checklistType}-notes`}
              />
            </div>
            <div className="pt-2 space-y-2">
              <Label htmlFor={`${checklistType}-signature`}>{t('anesthesia.op.signature')}</Label>
              <div className="space-y-2">
                {signature ? (
                  <div className="relative border rounded-md p-2">
                    <img src={signature} alt="Signature" className="max-h-24" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1"
                      onClick={handleClearSignature}
                      data-testid={`button-clear-${checklistType}-signature`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={onShowSignaturePad}
                    data-testid={`button-add-${checklistType}-signature`}
                  >
                    {t('anesthesia.op.addSignature')}
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('anesthesia.op.noChecklistItemsConfigured')}</p>
        )}
      </CardContent>
    </Card>
  );
}
