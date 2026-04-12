import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { WoundCareItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function WoundCareEditor({ item, onChange, onRemove }: ItemEditorProps<WoundCareItem>) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.woundCare', 'Wound Care')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.woundCheck', 'Wound check')}</Label>
        <Select value={item.check} onValueChange={v => onChange({ ...item, check: v as WoundCareItem['check'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('postopOrders.editor.none', 'None')}</SelectItem>
            <SelectItem value="daily">{t('postopOrders.editor.daily', 'Daily')}</SelectItem>
            <SelectItem value="twice_daily">{t('postopOrders.editor.twiceDaily', 'Twice daily')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.dressingChange', 'Dressing change')}</Label>
        <Select value={item.dressingChange} onValueChange={v => onChange({ ...item, dressingChange: v as WoundCareItem['dressingChange'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('postopOrders.editor.noneNeuter', 'None')}</SelectItem>
            <SelectItem value="every_n_days">{t('postopOrders.editor.everyNDays', 'Every N days')}</SelectItem>
            <SelectItem value="on_soaking">{t('postopOrders.editor.onSoaking', 'When soaked through')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.dressingChange === 'every_n_days' && (
        <div>
          <Label className="text-xs">{t('postopOrders.editor.dayInterval', 'Day interval')}</Label>
          <Input type="number" value={item.everyNDays ?? ''} onChange={e => onChange({ ...item, everyNDays: Number(e.target.value) })} />
        </div>
      )}
    </div>
  );
}
