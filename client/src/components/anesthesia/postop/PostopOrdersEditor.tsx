import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, ChevronDown, ChevronRight, Pill, Activity, FlaskConical, ClipboardList, Save, Check, X } from 'lucide-react';
import { createEmptyItem, normalizeItem, type PostopOrderItem, type PostopOrderItemType } from '@shared/postopOrderItems';
import { ItemEditor } from './itemEditors';
import type { TemplateRow } from '@/hooks/usePostopOrderTemplates';
import { AiPasteOrders } from './AiPasteOrders';

type CardKey = 'medications' | 'monitoring' | 'labs' | 'tasks';

const stripUnmapped = (its: PostopOrderItem[]): PostopOrderItem[] =>
  its.map((it: any) => {
    const { _unmapped, ...rest } = it;
    return rest as PostopOrderItem;
  });

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

export function PostopOrdersEditor({ items: rawItems, templateId, templates, canEdit, hospitalId, onChange, onSaveAsTemplate }: Props) {
  const { t } = useTranslation();
  // Defensively normalize stale DB rows (missing `timing`, etc.) before
  // any rendering or editing. Without this, schedulable items that
  // pre-date the unified-Timing migration crash the editors.
  const items = useMemo(() => rawItems.map(normalizeItem), [rawItems]);
  // Edits accumulate in `draft` until the user clicks Confirm. Cancel
  // discards. For a brand-new item (`draftIsNew`), the draft is prepended
  // to its target card's list and only persists if confirmed; for an
  // existing item, `draftIsNew` is false and the row's expanded body
  // shows the draft instead of the committed value.
  const [draft, setDraft] = useState<PostopOrderItem | null>(null);
  const [draftIsNew, setDraftIsNew] = useState(false);
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

  const cardItemsForRender = (key: CardKey): PostopOrderItem[] => {
    const base = itemsByCard[key];
    if (draft && draftIsNew && CARD_TYPES[key].includes(draft.type)) {
      return [draft, ...base];
    }
    return base;
  };

  const emitChange = (next: { items: PostopOrderItem[]; templateId: string | null }) => {
    onChange({ items: stripUnmapped(next.items), templateId: next.templateId });
  };

  const startAdd = (type: PostopOrderItemType) => {
    setDraft(createEmptyItem(type, crypto.randomUUID()));
    setDraftIsNew(true);
  };

  const startEdit = (item: PostopOrderItem) => {
    setDraft({ ...item });
    setDraftIsNew(false);
  };

  const confirmDraft = () => {
    if (!draft) return;
    const next = draftIsNew
      ? [draft, ...items]
      : items.map(i => i.id === draft.id ? draft : i);
    emitChange({ items: next, templateId });
    setDraft(null);
    setDraftIsNew(false);
  };

  const cancelDraft = () => {
    setDraft(null);
    setDraftIsNew(false);
  };

  const removeItem = (id: string) => {
    emitChange({ items: items.filter(i => i.id !== id), templateId });
    if (draft?.id === id) {
      setDraft(null);
      setDraftIsNew(false);
    }
  };

  const applyTemplate = (tid: string) => {
    cancelDraft();
    const tpl = templates.find(t => t.id === tid);
    if (!tpl) return;
    const cloned = tpl.items.map(i => ({ ...i, id: crypto.randomUUID() }));
    emitChange({ items: cloned, templateId: tid });
  };

  const appendItems = (newItems: PostopOrderItem[]) => {
    cancelDraft();
    emitChange({ items: [...newItems.slice().reverse(), ...items], templateId });
  };

  const hasDraft = draft !== null;

  return (
    <Card data-testid="postop-orders-editor">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm uppercase tracking-wide text-muted-foreground font-medium">
            {t('postopOrders.ordersAtAGlance', 'Postoperative Orders')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('postopOrders.template', 'Template')}:</span>
            <Select value={templateId ?? ''} onValueChange={applyTemplate} disabled={!canEdit || hasDraft}>
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder={t('postopOrders.editor.selectTemplate', 'Choose template...')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map(tpl => <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 2x2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(CARD_TYPES) as CardKey[]).map(key => (
            <SubCard
              key={key}
              title={cardLabels[key]}
              Icon={CARD_ICON[key]}
              items={cardItemsForRender(key)}
              draftId={draft?.id ?? null}
              draft={draft}
              canEdit={canEdit}
              hospitalId={hospitalId}
              hasDraft={hasDraft}
              onStartEdit={startEdit}
              onUpdateDraft={setDraft}
              onConfirm={confirmDraft}
              onCancel={cancelDraft}
              onRemove={removeItem}
              onAdd={() => startAdd(CARD_TYPES[key][0])}
            />
          ))}
        </div>

        {/* AI paste */}
        {canEdit && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setAiPasteOpen(!aiPasteOpen)}
              data-testid="toggle-ai-paste"
              disabled={hasDraft}
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
                <Button variant="outline" size="sm" disabled={hasDraft}>
                  <Save className="w-3.5 h-3.5 mr-1" />
                  {t('postopOrders.editor.saveAsTemplate', 'Save as template')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => {
                  const name = window.prompt(t('postopOrders.editor.templateNamePrompt', 'Template name:'));
                  if (name?.trim()) onSaveAsTemplate({ name: name.trim(), items: stripUnmapped(items) });
                }}>
                  {t('postopOrders.editor.saveAsNew', 'Save as new template')}
                </DropdownMenuItem>
                {templates.length > 0 && <DropdownMenuSeparator />}
                {templates.map(tpl => (
                  <DropdownMenuItem key={tpl.id} onClick={() => onSaveAsTemplate({ name: tpl.name, items: stripUnmapped(items), overwriteId: tpl.id })}>
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
  draftId: string | null;
  draft: PostopOrderItem | null;
  canEdit: boolean;
  hospitalId?: string;
  hasDraft: boolean;
  onStartEdit: (item: PostopOrderItem) => void;
  onUpdateDraft: (item: PostopOrderItem) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

function SubCard({ title, Icon, items, draftId, draft, canEdit, hospitalId, hasDraft, onStartEdit, onUpdateDraft, onConfirm, onCancel, onRemove, onAdd }: SubCardProps) {
  return (
    <div className="border rounded-md bg-card/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {title}
          {items.length > 0 && <Badge variant="secondary" className="text-xs">{items.length}</Badge>}
        </div>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={onAdd} data-testid={`add-${title.toLowerCase()}`} disabled={hasDraft}>
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground italic py-2">—</div>
        )}
        {items.map(item => {
          const isExpanded = draftId === item.id;
          return (
            <ItemRow
              key={item.id}
              item={isExpanded && draft ? draft : item}
              expanded={isExpanded}
              canEdit={canEdit}
              hospitalId={hospitalId}
              hasOtherDraft={hasDraft && !isExpanded}
              onClick={() => canEdit && !hasDraft && onStartEdit(item)}
              onUpdate={onUpdateDraft}
              onConfirm={onConfirm}
              onCancel={onCancel}
              onRemove={() => onRemove(item.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: PostopOrderItem;
  expanded: boolean;
  canEdit: boolean;
  hospitalId?: string;
  hasOtherDraft: boolean;
  onClick: () => void;
  onUpdate: (item: PostopOrderItem) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: () => void;
}

function ItemRow({ item, expanded, canEdit, hospitalId, hasOtherDraft, onClick, onUpdate, onConfirm, onCancel, onRemove }: ItemRowProps) {
  const { t } = useTranslation();
  if (expanded) {
    return (
      <div className="rounded border border-primary/40 bg-background p-2 space-y-2">
        <ItemEditor
          item={item}
          onChange={onUpdate}
          onRemove={onRemove}
          hospitalId={hospitalId}
        />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-item">
            <X className="w-3.5 h-3.5 mr-1" />
            {t('postopOrders.editor.cancel', 'Cancel')}
          </Button>
          <Button variant="default" size="sm" onClick={onConfirm} data-testid="button-confirm-item">
            <Check className="w-3.5 h-3.5 mr-1" />
            {t('postopOrders.editor.confirm', 'Confirm')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`rounded border bg-background/40 px-2 py-1.5 text-xs flex items-center justify-between ${canEdit && !hasOtherDraft ? 'cursor-pointer hover:bg-background/80' : 'opacity-60'}`}
      onClick={onClick}
      data-testid={`item-row-${item.id}`}
    >
      <span className="truncate">{summarize(item)}</span>
      <span className="text-muted-foreground ml-2 shrink-0">{summarizeMeta(item)}</span>
    </div>
  );
}

const ROUTE_LABEL: Record<string, string> = {
  po: 'p.o.',
  iv: 'i.v.',
  sc: 's.c.',
  im: 'i.m.',
};

const FREQUENCY_SHORT: Record<string, string> = {
  continuous: 'cont.',
  q15min: 'q15m',
  q30min: 'q30m',
  q1h: 'q1h',
  q2h: 'q2h',
  q4h: 'q4h',
  q6h: 'q6h',
  q8h: 'q8h',
  q12h: 'q12h',
  q24h: 'q24h',
  q48h: 'q48h',
  weekly: 'weekly',
  '2x_daily': '2×/d',
  '3x_daily': '3×/d',
  '4x_daily': '4×/d',
  oral_1_0_0: '1-0-0',
  oral_1_0_1: '1-0-1',
  oral_1_1_1: '1-1-1',
  oral_1_1_1_1: '1-1-1-1',
};

function summarize(item: PostopOrderItem): string {
  switch (item.type) {
    case 'medication':        return `${item.medicationRef || '—'} ${item.dose} ${ROUTE_LABEL[item.route] ?? item.route}`;
    case 'iv_fluid':          return `${item.solution} ${item.volumeMl}ml`;
    case 'bz_sliding_scale':  return `BG sliding scale (${item.drug})`;
    case 'vitals_monitoring': return item.parameter;
    case 'lab':               return item.panel.join(', ') || '—';
    case 'task': {
      const sub = item.subtype;
      const prefix = sub && sub !== 'generic' ? `[${sub}] ` : '';
      return `${prefix}${item.title || '—'}`;
    }
  }
}

function summarizeMeta(item: PostopOrderItem): string {
  const t = (item as any).timing;
  if (!t) return '';
  if (t.mode === 'ad_hoc') return 'PRN';
  if (t.mode === 'conditional') return 'cond.';
  if (t.mode === 'one_shot') return '1×';
  if (t.mode === 'scheduled') return t.frequency ? (FREQUENCY_SHORT[t.frequency] ?? t.frequency) : 'sched';
  return '';
}
