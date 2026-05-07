import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, ChevronDown, ChevronRight, Pill, Activity, FlaskConical, ClipboardList, Save } from 'lucide-react';
import { createEmptyItem, type PostopOrderItem, type PostopOrderItemType } from '@shared/postopOrderItems';
import { ItemEditor } from './itemEditors';
import type { TemplateRow } from '@/hooks/usePostopOrderTemplates';
import { AiPasteOrders } from './AiPasteOrders';

type CardKey = 'medications' | 'monitoring' | 'labs' | 'tasks';

const CARD_TYPES: Record<CardKey, PostopOrderItemType[]> = {
  medications: ['medication', 'iv_fluid', 'bz_sliding_scale'],
  monitoring:  ['vitals_monitoring'],
  labs:        ['lab'],
  tasks:       ['task'],
};

const CARD_ICON: Record<CardKey, React.ComponentType<{ className?: string }>> = {
  medications: Pill,
  monitoring: Activity,
  labs: FlaskConical,
  tasks: ClipboardList,
};

interface Props {
  items: PostopOrderItem[];
  templateId: string | null;
  templates: TemplateRow[];
  canEdit: boolean;
  hospitalId?: string;
  onChange: (next: { items: PostopOrderItem[]; templateId: string | null }) => void;
  onSaveAsTemplate?: (payload: { name: string; items: PostopOrderItem[]; overwriteId?: string }) => void;
}

export function PostopOrdersEditor({ items, templateId, templates, canEdit, hospitalId, onChange, onSaveAsTemplate }: Props) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiPasteOpen, setAiPasteOpen] = useState(false);

  const cardLabels: Record<CardKey, string> = {
    medications: t('postopOrders.cards.medications', 'Medications'),
    monitoring:  t('postopOrders.cards.monitoring', 'Monitoring'),
    labs:        t('postopOrders.cards.labs', 'Labs'),
    tasks:       t('postopOrders.cards.tasks', 'Tasks'),
  };

  const itemsByCard: Record<CardKey, PostopOrderItem[]> = {
    medications: items.filter(i => CARD_TYPES.medications.includes(i.type as PostopOrderItemType)),
    monitoring:  items.filter(i => CARD_TYPES.monitoring.includes(i.type as PostopOrderItemType)),
    labs:        items.filter(i => CARD_TYPES.labs.includes(i.type as PostopOrderItemType)),
    tasks:       items.filter(i => CARD_TYPES.tasks.includes(i.type as PostopOrderItemType)),
  };

  const applyTemplate = (tid: string) => {
    const tpl = templates.find(t => t.id === tid);
    if (!tpl) return;
    const cloned = tpl.items.map(i => ({ ...i, id: crypto.randomUUID() }));
    onChange({ items: cloned, templateId: tid });
  };

  const addItem = (type: PostopOrderItemType) => {
    const newItem = createEmptyItem(type, crypto.randomUUID());
    const next = [newItem, ...items];
    onChange({ items: next, templateId });
    setExpandedId(newItem.id);
  };

  const updateItem = (id: string, next: PostopOrderItem) => {
    onChange({ items: items.map(i => i.id === id ? next : i), templateId });
  };

  const removeItem = (id: string) => {
    onChange({ items: items.filter(i => i.id !== id), templateId });
    if (expandedId === id) setExpandedId(null);
  };

  const appendItems = (newItems: PostopOrderItem[]) => {
    onChange({ items: [...newItems.slice().reverse(), ...items], templateId });
  };

  const cleanItemsForPersist = (): PostopOrderItem[] =>
    items.map((it: any) => {
      const { _unmapped, ...rest } = it;
      return rest as PostopOrderItem;
    });

  return (
    <Card data-testid="postop-orders-editor">
      <CardContent className="p-4 space-y-4">
        {/* Header: title left, template top-right */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm uppercase tracking-wide text-muted-foreground font-medium">
            {t('postopOrders.ordersAtAGlance', 'Postoperative Orders')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('postopOrders.template', 'Template')}:</span>
            <Select value={templateId ?? ''} onValueChange={applyTemplate} disabled={!canEdit}>
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder={t('postopOrders.editor.selectTemplate', 'Choose template...')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map(tpl => <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 2x2 grid of sub-cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(CARD_TYPES) as CardKey[]).map(key => (
            <SubCard
              key={key}
              title={cardLabels[key]}
              Icon={CARD_ICON[key]}
              items={itemsByCard[key]}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              canEdit={canEdit}
              hospitalId={hospitalId}
              onUpdate={updateItem}
              onRemove={removeItem}
              onAdd={() => {
                if (key === 'medications') return; // handled by addMenu
                addItem(CARD_TYPES[key][0]);
              }}
              addMenu={key === 'medications' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={!canEdit} data-testid={`add-${key}`}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => addItem('medication')}>{t('postopOrders.editor.medication', 'Medication')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addItem('iv_fluid')}>{t('postopOrders.editor.ivFluid', 'IV Fluid')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addItem('bz_sliding_scale')}>{t('postopOrders.editor.bzSlidingScale', 'BG Sliding Scale')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            />
          ))}
        </div>

        {/* AI paste — collapsed trigger at bottom */}
        {canEdit && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setAiPasteOpen(!aiPasteOpen)}
              data-testid="toggle-ai-paste"
            >
              {aiPasteOpen ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
              {t('postopOrders.aiPasteToggle', 'AI paste orders…')}
            </Button>
            {aiPasteOpen && (
              <div className="mt-2">
                <AiPasteOrders hospitalId={hospitalId} existingItems={items} onApply={appendItems} />
              </div>
            )}
          </div>
        )}

        {/* Save as template */}
        {canEdit && onSaveAsTemplate && items.length > 0 && (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Save className="w-3.5 h-3.5 mr-1" />
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SubCardProps {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  items: PostopOrderItem[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  canEdit: boolean;
  hospitalId?: string;
  onUpdate: (id: string, next: PostopOrderItem) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  addMenu?: React.ReactNode;
}

function SubCard({ title, Icon, items, expandedId, setExpandedId, canEdit, hospitalId, onUpdate, onRemove, onAdd, addMenu }: SubCardProps) {
  return (
    <div className="border rounded-md bg-card/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {title}
          {items.length > 0 && <Badge variant="secondary" className="text-xs">{items.length}</Badge>}
        </div>
        {canEdit && (addMenu ?? (
          <Button size="sm" variant="ghost" onClick={onAdd} data-testid={`add-${title.toLowerCase()}`}>
            <Plus className="w-4 h-4" />
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground italic py-2">—</div>
        )}
        {items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            canEdit={canEdit}
            hospitalId={hospitalId}
            onClick={() => canEdit && setExpandedId(expandedId === item.id ? null : item.id)}
            onUpdate={(next) => onUpdate(item.id, next)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: PostopOrderItem;
  expanded: boolean;
  canEdit: boolean;
  hospitalId?: string;
  onClick: () => void;
  onUpdate: (item: PostopOrderItem) => void;
  onRemove: () => void;
}

function ItemRow({ item, expanded, canEdit, hospitalId, onClick, onUpdate, onRemove }: ItemRowProps) {
  if (expanded) {
    return (
      <div className="rounded border border-primary/40 bg-background p-2">
        <ItemEditor
          item={item}
          onChange={onUpdate}
          onRemove={onRemove}
          hospitalId={hospitalId}
        />
      </div>
    );
  }
  return (
    <div
      className={`rounded border bg-background/40 px-2 py-1.5 text-xs flex items-center justify-between ${canEdit ? 'cursor-pointer hover:bg-background/80' : ''}`}
      onClick={onClick}
      data-testid={`item-row-${item.id}`}
    >
      <span className="truncate">{summarize(item)}</span>
      <span className="text-muted-foreground ml-2 shrink-0">{summarizeMeta(item)}</span>
    </div>
  );
}

function summarize(item: PostopOrderItem): string {
  switch (item.type) {
    case 'medication':        return `${item.medicationRef || '—'} ${item.dose} ${item.route}`;
    case 'iv_fluid':          return `${item.solution} ${item.volumeMl}ml`;
    case 'bz_sliding_scale':  return `BG sliding scale (${item.drug})`;
    case 'vitals_monitoring': return item.parameter;
    case 'lab':               return item.panel.join(', ') || '—';
    case 'task':              return `${item.subtype !== 'generic' ? `[${item.subtype}] ` : ''}${item.title || '—'}`;
  }
}

function summarizeMeta(item: PostopOrderItem): string {
  const t = (item as any).timing;
  if (!t) return '';
  if (t.mode === 'ad_hoc') return 'PRN';
  if (t.mode === 'conditional') return 'cond.';
  if (t.mode === 'one_shot') return '1×';
  if (t.mode === 'scheduled') return t.frequency ?? 'sched';
  return '';
}
