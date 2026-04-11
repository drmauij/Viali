import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { NutritionItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function NutritionEditor({ item, onChange, onRemove }: ItemEditorProps<NutritionItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Nahrung</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">Kostform</Label>
        <Select value={item.value} onValueChange={v => onChange({ ...item, value: v as NutritionItem['value'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nil">Nüchtern</SelectItem>
            <SelectItem value="liquids">Flüssigkost</SelectItem>
            <SelectItem value="turmix">Turmix</SelectItem>
            <SelectItem value="vollkost">Vollkost</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Beginn ab</Label>
        <Input value={item.startAfter ?? ''} onChange={e => onChange({ ...item, startAfter: e.target.value })} placeholder="z.B. nach Extubation" />
      </div>
      <div>
        <Label className="text-xs">Bemerkung</Label>
        <Input value={item.note ?? ''} onChange={e => onChange({ ...item, note: e.target.value })} />
      </div>
    </div>
  );
}
