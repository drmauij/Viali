import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { PositioningItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function PositioningEditor({ item, onChange, onRemove }: ItemEditorProps<PositioningItem>) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.positioning', 'Positioning')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.position', 'Position')}</Label>
        <Select value={item.value} onValueChange={v => onChange({ ...item, value: v as PositioningItem['value'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="supine">{t('postopOrders.editor.supine', 'Supine')}</SelectItem>
            <SelectItem value="lateral">{t('postopOrders.editor.lateral', 'Lateral')}</SelectItem>
            <SelectItem value="head_up_30">{t('postopOrders.editor.headUp30', 'Head up 30°')}</SelectItem>
            <SelectItem value="head_up_45">{t('postopOrders.editor.headUp45', 'Head up 45°')}</SelectItem>
            <SelectItem value="custom">{t('postopOrders.editor.custom', 'Other')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.value === 'custom' && (
        <div>
          <Label className="text-xs">{t('postopOrders.editor.description', 'Description')}</Label>
          <Input value={item.customText ?? ''} onChange={e => onChange({ ...item, customText: e.target.value })} />
        </div>
      )}
    </div>
  );
}
