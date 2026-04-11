import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { TaskItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function TaskEditor({ item, onChange, onRemove }: ItemEditorProps<TaskItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Aufgabe</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">Titel</Label>
        <Input value={item.title} onChange={e => onChange({ ...item, title: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Zeitpunkt</Label>
        <Select value={item.when} onValueChange={v => onChange({ ...item, when: v as TaskItem['when'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one_shot">Einmalig</SelectItem>
            <SelectItem value="daily">Täglich</SelectItem>
            <SelectItem value="every_n_hours">Alle N Stunden</SelectItem>
            <SelectItem value="ad_hoc">Ad-hoc</SelectItem>
            <SelectItem value="conditional">Bedingt</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.when === 'every_n_hours' && (
        <div>
          <Label className="text-xs">Intervall (Stunden)</Label>
          <Input type="number" value={item.everyNHours ?? ''} onChange={e => onChange({ ...item, everyNHours: Number(e.target.value) })} />
        </div>
      )}
      {item.when === 'conditional' && (
        <div>
          <Label className="text-xs">Bedingung</Label>
          <Input value={item.condition ?? ''} onChange={e => onChange({ ...item, condition: e.target.value })} placeholder="z.B. bei Durchnässung" />
        </div>
      )}
      <div>
        <Label className="text-xs">Handlungshinweis</Label>
        <Input value={item.actionHint ?? ''} onChange={e => onChange({ ...item, actionHint: e.target.value })} />
      </div>
    </div>
  );
}
