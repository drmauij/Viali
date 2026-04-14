import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ChevronDown, ChevronRight, AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { PostopOrderItem } from '@shared/postopOrderItems';

interface Props {
  hospitalId?: string;
  existingItems: PostopOrderItem[];
  onApply: (items: PostopOrderItem[]) => void;
}

interface ParseResult {
  items: PostopOrderItem[];
  unresolved: string[];
  warnings: string[];
}

function summarizeItem(item: PostopOrderItem): string {
  switch (item.type) {
    case 'medication': {
      const parts = [item.medicationRef, item.dose, item.route?.toUpperCase()];
      if (item.scheduleMode === 'prn') {
        parts.push('PRN');
        if (item.prnMaxPerInterval) parts.push(`q${item.prnMaxPerInterval.intervalH}h`);
        if (item.prnMaxPerDay) parts.push(`max ${item.prnMaxPerDay}/d`);
      } else if (item.frequency) parts.push(String(item.frequency));
      if (item.note) parts.push(`— ${item.note}`);
      return parts.filter(Boolean).join(' ');
    }
    case 'lab':
      return `Lab: ${item.panel.join(', ')} (${item.when}${item.everyNHours ? ` every ${item.everyNHours}h` : ''})`;
    case 'task':
      return `Task: ${item.title} (${item.when})`;
    case 'free_text':
      return `Note: ${item.text}`;
    default:
      return item.type;
  }
}

export function AiPasteOrders({ hospitalId, existingItems, onApply }: Props) {
  const { t } = useTranslation();
  const hospital = useActiveHospital();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);

  const effectiveHospitalId = hospitalId ?? hospital?.id;
  const effectiveUnitId = hospital?.unitId;

  const parse = async () => {
    if (!text.trim() || !effectiveHospitalId || !effectiveUnitId) return;
    setLoading(true);
    try {
      const resp = await apiRequest('POST', '/api/anesthesia/postop-orders/ai-parse', {
        hospitalId: effectiveHospitalId,
        unitId: effectiveUnitId,
        text: text.trim(),
      });
      const data: ParseResult = await resp.json();
      setResult(data);
      if (data.items.length === 0) {
        toast({
          title: t('postopOrders.ai.noItemsTitle', 'No items extracted'),
          description: t('postopOrders.ai.noItemsBody', 'Try being more specific (drug, dose, route, frequency).'),
        });
      }
    } catch (e: any) {
      toast({
        title: t('postopOrders.ai.errorTitle', 'AI parse failed'),
        description: e?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!result) return;
    // Assign fresh IDs in case AI reused any, and ensure uniqueness with existing.
    const existingIds = new Set(existingItems.map(i => i.id));
    const withFreshIds = result.items.map(it => {
      if (!it.id || existingIds.has(it.id)) return { ...it, id: crypto.randomUUID() };
      return it;
    });
    onApply(withFreshIds);
    setResult(null);
    setText('');
    setOpen(false);
    toast({
      title: t('postopOrders.ai.appliedTitle', 'Applied'),
      description: t('postopOrders.ai.appliedBody', '{{n}} items added. Review and save to persist.', { n: withFreshIds.length }),
    });
  };

  const discard = () => {
    setResult(null);
  };

  return (
    <div className="border rounded-md bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent/50 rounded-t-md"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Sparkles className="w-4 h-4 text-primary" />
        <span>{t('postopOrders.ai.title', 'Paste orders in natural language')}</span>
        <span className="text-xs text-muted-foreground ml-1">
          {t('postopOrders.ai.beta', '(AI-assisted)')}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            placeholder={t(
              'postopOrders.ai.placeholder',
              'e.g. Paracetamol 1g q6h po, Novalgin 1g q8h PRN max 3/day iv, Kefzol 2g IV einmal 4h nach erster Dosis, Blood count daily',
            )}
            disabled={loading || !!result}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {t(
                'postopOrders.ai.hint',
                'Mixed DE/EN supported. Nothing is saved until you click Apply and then Save the template.',
              )}
            </span>
            {!result && (
              <Button size="sm" onClick={parse} disabled={loading || !text.trim()}>
                <Sparkles className="w-4 h-4 mr-1" />
                {loading ? t('postopOrders.ai.parsing', 'Parsing...') : t('postopOrders.ai.parse', 'Parse')}
              </Button>
            )}
          </div>

          {result && (
            <div className="border rounded-md bg-background p-2 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t('postopOrders.ai.preview', 'Proposed items ({{n}})', { n: result.items.length })}
              </div>
              {result.items.length === 0 && (
                <div className="text-sm text-muted-foreground p-2">
                  {t('postopOrders.ai.noItems', 'Nothing to add.')}
                </div>
              )}
              <ul className="space-y-1">
                {result.items.map((it, idx) => (
                  <li
                    key={idx}
                    className="text-sm px-2 py-1.5 rounded bg-green-500/10 border border-green-500/30"
                  >
                    <span className="text-xs uppercase text-green-700 dark:text-green-400 font-medium mr-2">
                      {it.type}
                    </span>
                    {summarizeItem(it)}
                  </li>
                ))}
              </ul>
              {result.unresolved.length > 0 && (
                <div className="text-xs px-2 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-yellow-700 dark:text-yellow-400" />
                  <span>
                    {t('postopOrders.ai.unresolved', 'Not in inventory (will be saved as free text)')}: {result.unresolved.join(', ')}
                  </span>
                </div>
              )}
              {result.warnings.length > 0 && (
                <div className="text-xs px-2 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/30">
                  <ul className="list-disc list-inside">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="outline" onClick={discard}>
                  <X className="w-4 h-4 mr-1" />
                  {t('postopOrders.ai.discard', 'Discard')}
                </Button>
                <Button size="sm" onClick={apply} disabled={result.items.length === 0}>
                  <Check className="w-4 h-4 mr-1" />
                  {t('postopOrders.ai.apply', 'Apply')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
