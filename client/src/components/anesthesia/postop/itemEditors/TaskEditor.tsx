import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { TaskItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function TaskEditor({ item, onChange, onRemove }: ItemEditorProps<TaskItem>) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.task', 'Task')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.title', 'Title')}</Label>
        <Input value={item.title} onChange={e => onChange({ ...item, title: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.timing', 'Timing')}</Label>
        <Select value={item.when} onValueChange={v => onChange({ ...item, when: v as TaskItem['when'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one_shot">{t('postopOrders.editor.oneShot', 'Once')}</SelectItem>
            <SelectItem value="daily">{t('postopOrders.editor.daily', 'Daily')}</SelectItem>
            <SelectItem value="every_n_hours">{t('postopOrders.editor.everyNHours', 'Every N hours')}</SelectItem>
            <SelectItem value="ad_hoc">{t('postopOrders.editor.adHoc', 'Ad hoc')}</SelectItem>
            <SelectItem value="conditional">{t('postopOrders.editor.conditional', 'Conditional')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.when === 'every_n_hours' && (
        <div>
          <Label className="text-xs">{t('postopOrders.editor.intervalHours', 'Interval (hours)')}</Label>
          <Input type="number" value={item.everyNHours ?? ''} onChange={e => onChange({ ...item, everyNHours: Number(e.target.value) })} />
        </div>
      )}
      {item.when === 'conditional' && (
        <div>
          <Label className="text-xs">{t('postopOrders.editor.condition', 'Condition')}</Label>
          <Input value={item.condition ?? ''} onChange={e => onChange({ ...item, condition: e.target.value })} placeholder={t('postopOrders.editor.conditionPlaceholder', 'e.g. when soaked through')} />
        </div>
      )}
      <div>
        <Label className="text-xs">{t('postopOrders.editor.actionHint', 'Action hint')}</Label>
        <Input value={item.actionHint ?? ''} onChange={e => onChange({ ...item, actionHint: e.target.value })} />
      </div>
    </div>
  );
}
