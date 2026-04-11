import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { FreeTextItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function FreeTextEditor({ item, onChange, onRemove }: ItemEditorProps<FreeTextItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Freitext</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">Bereich</Label>
        <Select value={item.section} onValueChange={v => onChange({ ...item, section: v as FreeTextItem['section'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general">Allgemein</SelectItem>
            <SelectItem value="meds">Medikamente</SelectItem>
            <SelectItem value="labs">Labor</SelectItem>
            <SelectItem value="other">Sonstiges</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Text</Label>
        <Textarea value={item.text} onChange={e => onChange({ ...item, text: e.target.value })} rows={3} />
      </div>
    </div>
  );
}
