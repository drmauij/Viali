import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskItem, TaskSubtype } from '@shared/postopOrderItems';
import { ALLOWED_MODES_BY_TYPE } from '@shared/postopOrderItems';
import { TimingField } from './TimingField';
import { useTaskSubtypeLabels, type ItemEditorProps } from './index';

export function TaskEditor({ item, onChange, onRemove }: ItemEditorProps<TaskItem>) {
  const { t } = useTranslation();
  const subtypeLabels = useTaskSubtypeLabels();

  return (
    <div className="border rounded-md p-3 space-y-3 bg-card">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t('postopOrders.editor.subtype', 'Type')}</Label>
              <Select
                value={item.subtype}
                onValueChange={(v) => onChange({ ...item, subtype: v as TaskSubtype })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(subtypeLabels) as [TaskSubtype, string][]).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">{t('postopOrders.editor.title', 'Description')}</Label>
              <Input
                value={item.title}
                onChange={(e) => onChange({ ...item, title: e.target.value })}
                placeholder={t('postopOrders.editor.taskTitlePlaceholder', 'e.g. Head up 30°, Redon left axilla, NPO 2h')}
              />
            </div>
          </div>

          <TimingField
            value={item.timing}
            onChange={(timing) => onChange({ ...item, timing })}
            allowedModes={ALLOWED_MODES_BY_TYPE.task}
          />

          <div>
            <Label className="text-xs">{t('postopOrders.editor.note', 'Note (optional)')}</Label>
            <Textarea
              rows={2}
              value={item.note ?? ''}
              onChange={(e) => onChange({ ...item, note: e.target.value || undefined })}
              placeholder={t('postopOrders.editor.notePlaceholder', 'Additional clinical context')}
            />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} className="shrink-0" data-testid="button-remove-task-item">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
