import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2, Plus } from 'lucide-react';
import type { LabItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function LabEditor({ item, onChange, onRemove }: ItemEditorProps<LabItem>) {
  const thresholds = item.thresholds ?? [];

  const addThreshold = () => {
    onChange({ ...item, thresholds: [...thresholds, { param: '', op: '>' as const, value: 0, action: '' }] });
  };
  const removeThreshold = (idx: number) => {
    onChange({ ...item, thresholds: thresholds.filter((_, i) => i !== idx) });
  };
  const updateThreshold = (idx: number, patch: Partial<(typeof thresholds)[number]>) => {
    onChange({ ...item, thresholds: thresholds.map((t, i) => i === idx ? { ...t, ...patch } : t) });
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Labor</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">Parameter (kommagetrennt)</Label>
        <Input
          value={item.panel.join(', ')}
          onChange={e => onChange({ ...item, panel: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="z.B. BB, CRP, Krea"
        />
      </div>
      <div>
        <Label className="text-xs">Zeitpunkt</Label>
        <Select value={item.when} onValueChange={v => onChange({ ...item, when: v as LabItem['when'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one_shot">Einmalig</SelectItem>
            <SelectItem value="daily">Täglich</SelectItem>
            <SelectItem value="every_n_hours">Alle N Stunden</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.when === 'one_shot' && (
        <div>
          <Label className="text-xs">Versatz (Stunden postop)</Label>
          <Input type="number" value={item.oneShotOffsetH ?? ''} onChange={e => onChange({ ...item, oneShotOffsetH: Number(e.target.value) })} />
        </div>
      )}
      {item.when === 'every_n_hours' && (
        <div>
          <Label className="text-xs">Intervall (Stunden)</Label>
          <Input type="number" value={item.everyNHours ?? ''} onChange={e => onChange({ ...item, everyNHours: Number(e.target.value) })} />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Grenzwerte</Label>
          <Button size="sm" variant="ghost" onClick={addThreshold} className="h-6 px-2 text-xs"><Plus className="w-3 h-3 mr-1" />Hinzufügen</Button>
        </div>
        {thresholds.map((t, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_auto_auto_1fr_auto] gap-1 items-end mt-1">
            <Input className="text-xs" value={t.param} onChange={e => updateThreshold(idx, { param: e.target.value })} placeholder="Param" />
            <Select value={t.op} onValueChange={v => updateThreshold(idx, { op: v as '<' | '>' })}>
              <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="<">&lt;</SelectItem>
                <SelectItem value=">">&gt;</SelectItem>
              </SelectContent>
            </Select>
            <Input className="w-20 text-xs" type="number" value={t.value} onChange={e => updateThreshold(idx, { value: Number(e.target.value) })} />
            <Input className="text-xs" value={t.action} onChange={e => updateThreshold(idx, { action: e.target.value })} placeholder="Aktion" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeThreshold(idx)}><Trash2 className="w-3 h-3" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
