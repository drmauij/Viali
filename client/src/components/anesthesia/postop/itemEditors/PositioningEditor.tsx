import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { PositioningItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function PositioningEditor({ item, onChange, onRemove }: ItemEditorProps<PositioningItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Lagerung</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">Position</Label>
        <Select value={item.value} onValueChange={v => onChange({ ...item, value: v as PositioningItem['value'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="supine">Rückenlage</SelectItem>
            <SelectItem value="lateral">Seitenlage</SelectItem>
            <SelectItem value="head_up_30">Oberkörper 30°</SelectItem>
            <SelectItem value="head_up_45">Oberkörper 45°</SelectItem>
            <SelectItem value="custom">Sonstige</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.value === 'custom' && (
        <div>
          <Label className="text-xs">Beschreibung</Label>
          <Input value={item.customText ?? ''} onChange={e => onChange({ ...item, customText: e.target.value })} />
        </div>
      )}
    </div>
  );
}
