import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Save, Pill, Activity, ClipboardList, StickyNote, ChevronDown, ChevronRight } from 'lucide-react';
import { createEmptyItem, type PostopOrderItem, type PostopOrderItemType } from '@shared/postopOrderItems';
import { ItemEditor, useItemTypeLabels, ITEM_CATEGORY, CATEGORY_ORDER, useCategoryLabels, type ItemCategory } from './itemEditors';
import type { TemplateRow } from '@/hooks/usePostopOrderTemplates';
import { AiPasteOrders } from './AiPasteOrders';

const CATEGORY_ICON: Record<ItemCategory, React.ComponentType<{ className?: string }>> = {
  medication: Pill,
  monitoring: Activity,
  care: ClipboardList,
  notes: StickyNote,
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: { items: PostopOrderItem[]; templateId: string | null };
  templates: TemplateRow[];
  onSave: (payload: { items: PostopOrderItem[]; templateId: string | null }) => void;
  onSaveAsTemplate?: (payload: { name: string; items: PostopOrderItem[]; overwriteId?: string }) => void;
  hospitalId?: string;
}

export function OrderSetEditorDialog({ open, onOpenChange, initial, templates, onSave, onSaveAsTemplate, hospitalId }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PostopOrderItem[]>(initial.items);
  const [templateId, setTemplateId] = useState<string | null>(initial.templateId);
  const itemTypeLabels = useItemTypeLabels();
  const categoryLabels = useCategoryLabels();
  const [collapsed, setCollapsed] = useState<Record<ItemCategory, boolean>>({
    medication: false, monitoring: false, care: false, notes: false,
  });

  // Group items by category, newest first within each.
  const grouped = useMemo(() => {
    const map: Record<ItemCategory, PostopOrderItem[]> = {
      medication: [], monitoring: [], care: [], notes: [],
    };
    for (const it of items) map[ITEM_CATEGORY[it.type]].push(it);
    for (const k of CATEGORY_ORDER) map[k].reverse();
    return map;
  }, [items]);

  // Only sync from initial when the dialog opens (closed → open transition).
  // Do NOT re-sync while already open — that would wipe user edits.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setItems(initial.items);
      setTemplateId(initial.templateId);
    }
    wasOpen.current = open;
  }, [open]);

  const applyTemplate = (tid: string) => {
    const tpl = templates.find(t => t.id === tid);
    if (!tpl) return;
    const cloned = tpl.items.map(i => ({ ...i, id: crypto.randomUUID() }));
    setItems(cloned);
    setTemplateId(tid);
  };

  const addItem = (type: PostopOrderItemType) => {
    setItems([createEmptyItem(type, crypto.randomUUID()), ...items]);
    setCollapsed(c => ({ ...c, [ITEM_CATEGORY[type]]: false }));
  };

  const appendItems = (newItems: PostopOrderItem[]) => {
    // Prepend so newest is on top; accept items as-is from AI parse.
    setItems([...newItems.slice().reverse(), ...items]);
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
          <DialogTitle>{t('postopOrders.editor.dialogTitle', 'Postoperative Orders')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-2 border-b">
          <span className="text-sm text-muted-foreground">{t('postopOrders.template', 'Template')}:</span>
          <Select value={templateId ?? ''} onValueChange={applyTemplate}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder={t('postopOrders.editor.selectTemplate', 'Choose template...')} /></SelectTrigger>
            <SelectContent>
              {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> {t('postopOrders.addItem', 'Add Item')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.entries(itemTypeLabels) as [PostopOrderItemType, string][]).map(([t, label]) => (
                <DropdownMenuItem key={t} onClick={() => addItem(t)}>{label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AiPasteOrders
          hospitalId={hospitalId}
          existingItems={items}
          onApply={appendItems}
        />

        <div className="space-y-4 py-2">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              {t('postopOrders.editor.noItems', 'No items — choose a template or add items above.')}
            </div>
          )}
          {CATEGORY_ORDER.map(cat => {
            const group = grouped[cat];
            if (group.length === 0) return null;
            const Icon = CATEGORY_ICON[cat];
            const isCollapsed = collapsed[cat];
            return (
              <div key={cat} className="border rounded-md">
                <button
                  type="button"
                  onClick={() => setCollapsed(c => ({ ...c, [cat]: !c[cat] }))}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent/50 rounded-t-md"
                >
                  {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span>{categoryLabels[cat]}</span>
                  <span className="text-xs text-muted-foreground ml-1">({group.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-3 p-3 pt-0">
                    {group.map(item => (
                      <ItemEditor
                        key={item.id}
                        item={item}
                        onChange={(next) => updateItem(item.id, next)}
                        onRemove={() => removeItem(item.id)}
                        hospitalId={hospitalId}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('postopOrders.cancel', 'Cancel')}</Button>
          {onSaveAsTemplate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={items.length === 0}>
                  <Save className="w-4 h-4 mr-1" />
                  {t('postopOrders.editor.saveAsTemplate', 'Save as template')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => {
                  const name = window.prompt(t('postopOrders.editor.templateNamePrompt', 'Template name:'));
                  if (name?.trim()) onSaveAsTemplate({ name: name.trim(), items });
                }}>
                  {t('postopOrders.editor.saveAsNew', 'Save as new template')}
                </DropdownMenuItem>
                {templates.length > 0 && <DropdownMenuSeparator />}
                {templates.map(tpl => (
                  <DropdownMenuItem key={tpl.id} onClick={() => onSaveAsTemplate({ name: tpl.name, items, overwriteId: tpl.id })}>
                    {t('postopOrders.editor.overwrite', 'Overwrite')}: {tpl.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={() => { onSave({ items, templateId }); onOpenChange(false); }}>{t('postopOrders.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
