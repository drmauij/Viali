import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { TimingField } from './TimingField';
import { ALLOWED_MODES_BY_TYPE } from '@shared/postopOrderItems';
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
      <TimingField
        value={item.timing}
        onChange={(timing) => onChange({ ...item, timing })}
        allowedModes={ALLOWED_MODES_BY_TYPE.task}
      />
      <div>
        <Label className="text-xs">{t('postopOrders.editor.actionHint', 'Action hint')}</Label>
        <Input value={item.actionHint ?? ''} onChange={e => onChange({ ...item, actionHint: e.target.value })} />
      </div>
    </div>
  );
}
