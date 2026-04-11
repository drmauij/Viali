import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2, Plus } from 'lucide-react';
import type { BzSlidingScaleItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function BzSlidingScaleEditor({ item, onChange, onRemove }: ItemEditorProps<BzSlidingScaleItem>) {
  const addRule = () => {
    onChange({ ...item, rules: [...item.rules, { above: 0, units: 0 }] });
  };
  const removeRule = (idx: number) => {
    onChange({ ...item, rules: item.rules.filter((_, i) => i !== idx) });
  };
  const updateRule = (idx: number, patch: Partial<{ above: number; units: number }>) => {
    onChange({ ...item, rules: item.rules.map((r, i) => i === idx ? { ...r, ...patch } : r) });
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">BZ-Schema</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div>
        <Label className="text-xs">Medikament</Label>
        <Input value={item.drug} onChange={e => onChange({ ...item, drug: e.target.value })} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Regeln</Label>
          <Button size="sm" variant="ghost" onClick={addRule} className="h-6 px-2 text-xs"><Plus className="w-3 h-3 mr-1" />Zeile</Button>
        </div>
        {item.rules.map((r, idx) => (
          <div key={idx} className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-1 items-center mt-1">
            <span className="text-xs text-muted-foreground">ab</span>
            <Input className="text-xs" type="number" value={r.above} onChange={e => updateRule(idx, { above: Number(e.target.value) })} />
            <span className="text-xs text-muted-foreground">IE</span>
            <Input className="text-xs" type="number" value={r.units} onChange={e => updateRule(idx, { units: Number(e.target.value) })} />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeRule(idx)}><Trash2 className="w-3 h-3" /></Button>
          </div>
        ))}
      </div>
      <div>
        <Label className="text-xs">Inkrement (optional)</Label>
        <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-1 items-center">
          <span className="text-xs text-muted-foreground">pro</span>
          <Input className="text-xs" type="number" value={item.increment?.per ?? ''} onChange={e => onChange({ ...item, increment: { per: Number(e.target.value), units: item.increment?.units ?? 0 } })} />
          <span className="text-xs text-muted-foreground">IE</span>
          <Input className="text-xs" type="number" value={item.increment?.units ?? ''} onChange={e => onChange({ ...item, increment: { per: item.increment?.per ?? 0, units: Number(e.target.value) } })} />
        </div>
      </div>
    </div>
  );
}
