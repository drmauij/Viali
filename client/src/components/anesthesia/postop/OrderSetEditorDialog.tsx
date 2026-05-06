import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Save, Pill, Activity, ClipboardList, StickyNote } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<ItemCategory>('medication');
  const itemTypeLabels = useItemTypeLabels();
  const categoryLabels = useCategoryLabels();

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
    setActiveTab(ITEM_CATEGORY[type]);
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

  // Strip transient editor-only flags (e.g. `_unmapped` from the AI parser)
  // before sending items to the server or saving as a template.
  const cleanItemsForPersist = (): PostopOrderItem[] =>
    items.map((it: any) => {
      const { _unmapped, ...rest } = it;
      return rest as PostopOrderItem;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen rounded-none border-0 flex flex-col gap-0 p-0">
        {/* Sticky header: title + template + add + AI paste */}
        <div className="p-6 pb-4 border-b shrink-0 space-y-3">
          <DialogHeader>
            <DialogTitle>{t('postopOrders.editor.dialogTitle', 'Postoperative Orders')}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 flex-wrap">
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
        </div>

        {/* Scrollable middle: tabs (one per category) */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ItemCategory)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-6 mt-4 self-start">
            {CATEGORY_ORDER.map(cat => {
              const Icon = CATEGORY_ICON[cat];
              const count = grouped[cat].length;
              return (
                <TabsTrigger key={cat} value={cat} data-testid={`tab-postop-${cat}`}>
                  <Icon className="w-4 h-4 mr-1.5" />
                  {categoryLabels[cat]}
                  {count > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {CATEGORY_ORDER.map(cat => (
            <TabsContent
              key={cat}
              value={cat}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-3 mt-0 data-[state=inactive]:hidden"
            >
              {grouped[cat].length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  {t('postopOrders.editor.noItemsInCategory', 'No items in this category yet — use "Add Item" above.')}
                </div>
              ) : (
                grouped[cat].map(item => (
                  <ItemEditor
                    key={item.id}
                    item={item}
                    onChange={(next) => updateItem(item.id, next)}
                    onRemove={() => removeItem(item.id)}
                    hospitalId={hospitalId}
                  />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Sticky footer */}
        <DialogFooter className="p-6 pt-4 border-t shrink-0">
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
                  if (name?.trim()) onSaveAsTemplate({ name: name.trim(), items: cleanItemsForPersist() });
                }}>
                  {t('postopOrders.editor.saveAsNew', 'Save as new template')}
                </DropdownMenuItem>
                {templates.length > 0 && <DropdownMenuSeparator />}
                {templates.map(tpl => (
                  <DropdownMenuItem key={tpl.id} onClick={() => onSaveAsTemplate({ name: tpl.name, items: cleanItemsForPersist(), overwriteId: tpl.id })}>
                    {t('postopOrders.editor.overwrite', 'Overwrite')}: {tpl.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={() => {
            onSave({ items: cleanItemsForPersist(), templateId });
            onOpenChange(false);
          }}>{t('postopOrders.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
