import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <span className="text-xs uppercase text-muted-foreground font-medium">{t('postopOrders.editor.medication', 'Medication')}</span>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('postopOrders.editor.drug', 'Medication')}</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal h-9 text-sm"
              >
                <span className="truncate">
                  {item.medicationRef || t('postopOrders.editor.selectMedication', 'Choose medication...')}
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
                  placeholder={t('postopOrders.editor.searchMedication', 'Search medication...')}
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
                        {t('postopOrders.editor.addAsFreeText', 'Add "{{text}}" as free text', { text: searchQuery.trim() })}
                      </button>
                    ) : (
                      t('postopOrders.editor.noMedicationFound', 'No medication found')
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
                        {t('postopOrders.editor.addAsFreeText', 'Add "{{text}}" as free text', { text: searchQuery.trim() })}
                      </CommandItem>
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs">{t('postopOrders.editor.dose', 'Dose')}</Label>
          <Input value={item.dose} onChange={e => onChange({ ...item, dose: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t('postopOrders.editor.route', 'Route')}</Label>
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
          <Label className="text-xs">{t('postopOrders.editor.mode', 'Mode')}</Label>
          <Select value={item.scheduleMode} onValueChange={v => onChange({ ...item, scheduleMode: v as MedicationItem['scheduleMode'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">{t('postopOrders.editor.scheduled', 'Scheduled')}</SelectItem>
              <SelectItem value="prn">{t('postopOrders.editor.prn', 'PRN (as needed)')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {item.scheduleMode === 'scheduled' && (
        <div>
          <Label className="text-xs">{t('postopOrders.editor.frequency', 'Frequency')}</Label>
          <Input value={item.frequency ?? ''} onChange={e => onChange({ ...item, frequency: e.target.value })} placeholder={t('postopOrders.editor.frequencyPlaceholder', 'e.g. q8h, 3x daily')} />
        </div>
      )}
      {item.scheduleMode === 'prn' && (
        <div>
          <Label className="text-xs">{t('postopOrders.editor.maxPerDay', 'Max per day')}</Label>
          <Input type="number" value={item.prnMaxPerDay ?? ''} onChange={e => onChange({ ...item, prnMaxPerDay: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      )}
      <div>
        <Label className="text-xs">{t('postopOrders.editor.note', 'Note')}</Label>
        <Input value={item.note ?? ''} onChange={e => onChange({ ...item, note: e.target.value })} />
      </div>
    </div>
  );
}
