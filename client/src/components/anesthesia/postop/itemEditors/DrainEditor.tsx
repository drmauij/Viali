import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { DrainItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function DrainEditor({ item, onChange, onRemove }: ItemEditorProps<DrainItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Drainage</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">Typ</Label>
        <Select value={item.drainType} onValueChange={v => onChange({ ...item, drainType: v as DrainItem['drainType'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="redon">Redon</SelectItem>
            <SelectItem value="easyflow">Easy-Flow</SelectItem>
            <SelectItem value="dk">DK</SelectItem>
            <SelectItem value="spul">Spülung</SelectItem>
            <SelectItem value="other">Sonstige</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Lage</Label>
        <Input value={item.site ?? ''} onChange={e => onChange({ ...item, site: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Bemerkung</Label>
        <Input value={item.note ?? ''} onChange={e => onChange({ ...item, note: e.target.value })} />
      </div>
    </div>
  );
}
