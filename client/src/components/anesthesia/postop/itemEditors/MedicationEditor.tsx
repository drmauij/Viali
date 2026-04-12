import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Trash2, Plus, ChevronsUpDown, X } from 'lucide-react';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import type { MedicationItem } from '@shared/postopOrderItems';
import type { ItemEditorProps } from './index';

export function MedicationEditor({ item, onChange, onRemove }: ItemEditorProps<MedicationItem>) {
  const hospital = useActiveHospital();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${hospital?.id}?unitId=${hospital?.unitId}`],
    enabled: !!hospital?.id && !!hospital?.unitId,
  });

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return inventoryItems.slice(0, 50);
    const q = searchQuery.toLowerCase();
    return inventoryItems
      .filter((inv: any) =>
        inv.name?.toLowerCase().includes(q) ||
        inv.description?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [inventoryItems, searchQuery]);

  const selectItem = (inv: any) => {
    onChange({ ...item, medicationRef: inv.name });
    setOpen(false);
    setSearchQuery('');
  };

  const addFreeText = (text: string) => {
    onChange({ ...item, medicationRef: text.trim() });
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase text-muted-foreground font-medium">Medikation</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Medikament</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal h-9 text-sm"
              >
                <span className="truncate">
                  {item.medicationRef || 'Medikament wählen...'}
                </span>
                {item.medicationRef ? (
                  <X
                    className="ml-1 h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange({ ...item, medicationRef: '' });
                    }}
                  />
                ) : (
                  <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Medikament suchen..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    {searchQuery.trim() ? (
                      <button
                        className="w-full px-2 py-3 text-sm text-left hover:bg-accent cursor-pointer"
                        onClick={() => addFreeText(searchQuery)}
                      >
                        <Plus className="h-4 w-4 mr-1 inline" />
                        "{searchQuery.trim()}" als Freitext hinzufügen
                      </button>
                    ) : (
                      'Kein Medikament gefunden'
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredItems.map((inv: any) => (
                      <CommandItem
                        key={inv.id}
                        value={inv.name}
                        onSelect={() => selectItem(inv)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="truncate block">{inv.name}</span>
                          {inv.description && (
                            <span className="text-xs text-muted-foreground truncate block">{inv.description}</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {searchQuery.trim() && filteredItems.length > 0 && (
                    <CommandGroup>
                      <CommandItem
                        value={`__custom__${searchQuery}`}
                        onSelect={() => addFreeText(searchQuery)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        "{searchQuery.trim()}" als Freitext hinzufügen
                      </CommandItem>
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
