import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { VitalsMonitoringItem, Frequency } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

function useFreqOptions() {
  const { t } = useTranslation();
  return [
    { value: 'continuous' as Frequency, label: t('postopOrders.editor.freqContinuous', 'Continuous') },
    { value: 'q15min' as Frequency, label: t('postopOrders.editor.freqQ15min', 'Every 15 min') },
    { value: 'q30min' as Frequency, label: t('postopOrders.editor.freqQ30min', 'Every 30 min') },
    { value: 'q1h' as Frequency, label: t('postopOrders.editor.freqQ1h', 'Hourly') },
    { value: 'q2h' as Frequency, label: t('postopOrders.editor.freqQ2h', 'Every 2 h') },
    { value: 'q4h' as Frequency, label: t('postopOrders.editor.freqQ4h', 'Every 4 h') },
    { value: 'q6h' as Frequency, label: t('postopOrders.editor.freqQ6h', 'Every 6 h') },
    { value: 'q8h' as Frequency, label: t('postopOrders.editor.freqQ8h', 'Every 8 h') },
    { value: 'q12h' as Frequency, label: t('postopOrders.editor.freqQ12h', 'Every 12 h') },
    { value: 'q24h' as Frequency, label: t('postopOrders.editor.freqQ24h', 'Every 24 h') },
    { value: '2x_daily' as Frequency, label: t('postopOrders.editor.freqTwiceDaily', 'Twice daily') },
    { value: '4x_daily' as Frequency, label: t('postopOrders.editor.freqFourTimesDaily', 'Four times daily') },
  ];
}

export function VitalsMonitoringEditor({ item, onChange, onRemove }: ItemEditorProps<VitalsMonitoringItem>) {
  const { t } = useTranslation();
  const freqOptions = useFreqOptions();
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.vitalsMonitoring', 'Vitals Monitoring')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
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
        <div>
          <Label className="text-xs">{t('postopOrders.editor.frequency', 'Frequency')}</Label>
          <Select value={item.frequency} onValueChange={v => onChange({ ...item, frequency: v as Frequency })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {freqOptions.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
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
