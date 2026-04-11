import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus } from 'lucide-react';
import { createEmptyItem, type PostopOrderItem, type PostopOrderItemType } from '@shared/postopOrderItems';
import { ItemEditor, ITEM_TYPE_LABELS } from './itemEditors';
import type { TemplateRow } from '@/hooks/usePostopOrderTemplates';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: { items: PostopOrderItem[]; templateId: string | null };
  templates: TemplateRow[];
  onSave: (payload: { items: PostopOrderItem[]; templateId: string | null }) => void;
}

export function OrderSetEditorDialog({ open, onOpenChange, initial, templates, onSave }: Props) {
  const [items, setItems] = useState<PostopOrderItem[]>(initial.items);
  const [templateId, setTemplateId] = useState<string | null>(initial.templateId);

  useEffect(() => {
    if (open) {
      setItems(initial.items);
      setTemplateId(initial.templateId);
    }
  }, [initial, open]);

  const applyTemplate = (tid: string) => {
    const tpl = templates.find(t => t.id === tid);
    if (!tpl) return;
    const cloned = tpl.items.map(i => ({ ...i, id: crypto.randomUUID() }));
    setItems(cloned);
    setTemplateId(tid);
  };

  const addItem = (type: PostopOrderItemType) => {
    setItems([...items, createEmptyItem(type, crypto.randomUUID())]);
  };

  const updateItem = (id: string, next: PostopOrderItem) => {
    setItems(items.map(i => i.id === id ? next : i));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Postoperative Verordnungen</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-2 border-b">
          <span className="text-sm text-muted-foreground">Template:</span>
          <Select value={templateId ?? ''} onValueChange={applyTemplate}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Vorlage wählen..." /></SelectTrigger>
            <SelectContent>
              {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> Hinzufügen</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.entries(ITEM_TYPE_LABELS) as [PostopOrderItemType, string][]).map(([t, label]) => (
                <DropdownMenuItem key={t} onClick={() => addItem(t)}>{label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-3 py-2">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Keine Einträge — wählen Sie eine Vorlage oder fügen Sie Einträge hinzu.
            </div>
          )}
          {items.map(item => (
            <ItemEditor
              key={item.id}
              item={item}
              onChange={(next) => updateItem(item.id, next)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => { onSave({ items, templateId }); onOpenChange(false); }}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
