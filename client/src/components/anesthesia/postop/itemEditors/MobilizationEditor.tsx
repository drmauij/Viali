import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trash2 } from 'lucide-react';
import type { MobilizationItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function MobilizationEditor({ item, onChange, onRemove }: ItemEditorProps<MobilizationItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Mobilisation</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <RadioGroup value={item.value} onValueChange={v => onChange({ ...item, value: v as MobilizationItem['value'] })} className="flex gap-4">
        {([['bedrest', 'Bettruhe'], ['assisted', 'Assistiert'], ['free', 'Frei']] as const).map(([val, label]) => (
          <div key={val} className="flex items-center gap-1.5">
            <RadioGroupItem value={val} id={`mob-${item.id}-${val}`} />
            <Label htmlFor={`mob-${item.id}-${val}`} className="text-xs">{label}</Label>
          </div>
        ))}
      </RadioGroup>
      {item.value === 'assisted' && (
        <div>
          <Label className="text-xs">Assistiert ab</Label>
          <Input value={item.assistedFrom ?? ''} onChange={e => onChange({ ...item, assistedFrom: e.target.value })} placeholder="z.B. 1. postop Tag" />
        </div>
      )}
      <div>
        <Label className="text-xs">Bemerkung</Label>
        <Textarea value={item.note ?? ''} onChange={e => onChange({ ...item, note: e.target.value })} rows={2} />
      </div>
    </div>
  );
}
