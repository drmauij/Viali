import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { FreeTextItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function FreeTextEditor({ item, onChange, onRemove }: ItemEditorProps<FreeTextItem>) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.freeText', 'Free Text')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.section', 'Section')}</Label>
        <Select value={item.section} onValueChange={v => onChange({ ...item, section: v as FreeTextItem['section'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general">{t('postopOrders.editor.sectionGeneral', 'General')}</SelectItem>
            <SelectItem value="meds">{t('postopOrders.editor.sectionMeds', 'Medications')}</SelectItem>
            <SelectItem value="labs">{t('postopOrders.editor.sectionLabs', 'Lab')}</SelectItem>
            <SelectItem value="other">{t('postopOrders.editor.sectionOther', 'Other')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.text', 'Text')}</Label>
        <Textarea value={item.text} onChange={e => onChange({ ...item, text: e.target.value })} rows={3} />
      </div>
    </div>
  );
}
