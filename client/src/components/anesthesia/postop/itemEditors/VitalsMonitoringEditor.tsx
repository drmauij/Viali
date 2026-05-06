import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { TimingField } from './TimingField';
import { ALLOWED_MODES_BY_TYPE } from '@shared/postopOrderItems';
import type { VitalsMonitoringItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function VitalsMonitoringEditor({ item, onChange, onRemove }: ItemEditorProps<VitalsMonitoringItem>) {
  const { t } = useTranslation();
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.vitalsMonitoring', 'Vitals Monitoring')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">{t('postopOrders.editor.parameter', 'Parameter')}</Label>
        <Select value={item.parameter} onValueChange={v => onChange({ ...item, parameter: v as VitalsMonitoringItem['parameter'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="BP">{t('postopOrders.editor.bloodPressure', 'Blood pressure')}</SelectItem>
            <SelectItem value="pulse">{t('postopOrders.editor.pulse', 'Pulse')}</SelectItem>
            <SelectItem value="temp">{t('postopOrders.editor.temperature', 'Temperature')}</SelectItem>
            <SelectItem value="spo2">SpO2</SelectItem>
            <SelectItem value="bz">{t('postopOrders.editor.bloodGlucose', 'Blood glucose')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TimingField
        value={item.timing}
        onChange={(timing) => onChange({ ...item, timing })}
        allowedModes={ALLOWED_MODES_BY_TYPE.vitals_monitoring}
        allowedFrequencies={['continuous','q15min','q30min','q1h','q2h','q4h','q6h','q8h','q12h']}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Min</Label>
          <Input type="number" value={item.min ?? ''} onChange={e => onChange({ ...item, min: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
        <div>
          <Label className="text-xs">Max</Label>
          <Input type="number" value={item.max ?? ''} onChange={e => onChange({ ...item, max: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('postopOrders.editor.actionLow', 'Action if below')}</Label>
          <Input value={item.actionLow ?? ''} onChange={e => onChange({ ...item, actionLow: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">{t('postopOrders.editor.actionHigh', 'Action if above')}</Label>
          <Input value={item.actionHigh ?? ''} onChange={e => onChange({ ...item, actionHigh: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
