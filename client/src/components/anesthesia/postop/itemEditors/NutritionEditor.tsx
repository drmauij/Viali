import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { NutritionItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function NutritionEditor({ item, onChange, onRemove }: ItemEditorProps<NutritionItem>) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.nutrition', 'Nutrition')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.dietType', 'Diet')}</Label>
        <Select value={item.value} onValueChange={v => onChange({ ...item, value: v as NutritionItem['value'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nil">{t('postopOrders.editor.nil', 'NPO (nil by mouth)')}</SelectItem>
            <SelectItem value="liquids">{t('postopOrders.editor.liquids', 'Clear liquids')}</SelectItem>
            <SelectItem value="turmix">{t('postopOrders.editor.turmix', 'Blended diet')}</SelectItem>
            <SelectItem value="vollkost">{t('postopOrders.editor.fullDiet', 'Full diet')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.startAfter', 'Start after')}</Label>
        <Input value={item.startAfter ?? ''} onChange={e => onChange({ ...item, startAfter: e.target.value })} placeholder={t('postopOrders.editor.startAfterPlaceholder', 'e.g. after extubation')} />
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.note', 'Note')}</Label>
        <Input value={item.note ?? ''} onChange={e => onChange({ ...item, note: e.target.value })} />
      </div>
    </div>
  );
}
