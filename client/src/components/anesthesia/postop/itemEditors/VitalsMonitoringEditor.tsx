import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { VitalsMonitoringItem, Frequency } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'continuous', label: 'Kontinuierlich' },
  { value: 'q15min', label: 'Alle 15 min' },
  { value: 'q30min', label: 'Alle 30 min' },
  { value: 'q1h', label: 'Stündlich' },
  { value: 'q2h', label: 'Alle 2 h' },
  { value: 'q4h', label: 'Alle 4 h' },
  { value: 'q6h', label: 'Alle 6 h' },
  { value: 'q8h', label: 'Alle 8 h' },
  { value: 'q12h', label: 'Alle 12 h' },
  { value: 'q24h', label: 'Alle 24 h' },
  { value: '2x_daily', label: '2x täglich' },
  { value: '4x_daily', label: '4x täglich' },
];

export function VitalsMonitoringEditor({ item, onChange, onRemove }: ItemEditorProps<VitalsMonitoringItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Vitalzeichen</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Parameter</Label>
          <Select value={item.parameter} onValueChange={v => onChange({ ...item, parameter: v as VitalsMonitoringItem['parameter'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BP">Blutdruck</SelectItem>
              <SelectItem value="pulse">Puls</SelectItem>
              <SelectItem value="temp">Temperatur</SelectItem>
              <SelectItem value="spo2">SpO2</SelectItem>
              <SelectItem value="bz">Blutzucker</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Frequenz</Label>
          <Select value={item.frequency} onValueChange={v => onChange({ ...item, frequency: v as Frequency })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQ_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
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
          <Label className="text-xs">Aktion bei Unterschreitung</Label>
          <Input value={item.actionLow ?? ''} onChange={e => onChange({ ...item, actionLow: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Aktion bei Überschreitung</Label>
          <Input value={item.actionHigh ?? ''} onChange={e => onChange({ ...item, actionHigh: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
