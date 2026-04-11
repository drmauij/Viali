import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { IvFluidItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function IvFluidEditor({ item, onChange, onRemove }: ItemEditorProps<IvFluidItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Infusion</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Lösung</Label>
          <Select value={item.solution} onValueChange={v => onChange({ ...item, solution: v as IvFluidItem['solution'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nacl_09">NaCl 0,9%</SelectItem>
              <SelectItem value="ringer_lactate">Ringer-Laktat</SelectItem>
              <SelectItem value="glucose_5">Glukose 5%</SelectItem>
              <SelectItem value="custom">Sonstige</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {item.solution === 'custom' && (
          <div>
            <Label className="text-xs">Bezeichnung</Label>
            <Input value={item.customName ?? ''} onChange={e => onChange({ ...item, customName: e.target.value })} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Volumen (ml)</Label>
          <Input type="number" value={item.volumeMl} onChange={e => onChange({ ...item, volumeMl: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-xs">Laufzeit (h)</Label>
          <Input type="number" value={item.durationH} onChange={e => onChange({ ...item, durationH: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Zusätze</Label>
        <Input value={item.additives ?? ''} onChange={e => onChange({ ...item, additives: e.target.value })} placeholder="z.B. 20mEq KCl" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Beginn</Label>
          <Input value={item.startAt ?? ''} onChange={e => onChange({ ...item, startAt: e.target.value })} placeholder="z.B. sofort, postop" />
        </div>
        <div>
          <Label className="text-xs">Bedingung</Label>
          <Input value={item.condition ?? ''} onChange={e => onChange({ ...item, condition: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
