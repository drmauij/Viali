import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { MedicationItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function MedicationEditor({ item, onChange, onRemove }: ItemEditorProps<MedicationItem>) {
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Medikation</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Medikament</Label>
          <Input value={item.medicationRef} onChange={e => onChange({ ...item, medicationRef: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Dosis</Label>
          <Input value={item.dose} onChange={e => onChange({ ...item, dose: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Applikation</Label>
          <Select value={item.route} onValueChange={v => onChange({ ...item, route: v as MedicationItem['route'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="po">p.o.</SelectItem>
              <SelectItem value="iv">i.v.</SelectItem>
              <SelectItem value="sc">s.c.</SelectItem>
              <SelectItem value="im">i.m.</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Modus</Label>
          <Select value={item.scheduleMode} onValueChange={v => onChange({ ...item, scheduleMode: v as MedicationItem['scheduleMode'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Planmässig</SelectItem>
              <SelectItem value="prn">Bei Bedarf</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {item.scheduleMode === 'scheduled' && (
        <div>
          <Label className="text-xs">Frequenz</Label>
          <Input value={item.frequency ?? ''} onChange={e => onChange({ ...item, frequency: e.target.value })} placeholder="z.B. q8h, 3x täglich" />
        </div>
      )}
      {item.scheduleMode === 'prn' && (
        <div>
          <Label className="text-xs">Max. pro Tag</Label>
          <Input type="number" value={item.prnMaxPerDay ?? ''} onChange={e => onChange({ ...item, prnMaxPerDay: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      )}
      <div>
        <Label className="text-xs">Bemerkung</Label>
        <Input value={item.note ?? ''} onChange={e => onChange({ ...item, note: e.target.value })} />
      </div>
    </div>
  );
}
