import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { PostopOrderItem } from '@shared/postopOrderItems';

// Transient flag tagged on AI-parsed medication items whose drug name doesn't
// resolve to a configured inventory entry. PostopOrdersEditor strips this
// before save, so it never reaches the wire.
type MaybeUnmapped = { _unmapped?: boolean };

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
      if (item.timing?.mode === 'ad_hoc') {
        parts.push('PRN');
        if (item.prnMaxPerInterval) parts.push(`q${item.prnMaxPerInterval.intervalH}h`);
        if (item.prnMaxPerDay) parts.push(`max ${item.prnMaxPerDay}/d`);
      } else if (item.timing?.frequency) parts.push(String(item.timing.frequency));
      if (item.note) parts.push(`— ${item.note}`);
      return parts.filter(Boolean).join(' ');
    }
    case 'lab':
      return `Lab: ${item.panel.join(', ')} (${item.timing.mode}${item.timing.frequency ? ` ${item.timing.frequency}` : ''})`;
    case 'task': {
      const subtypeLabel = item.subtype === 'generic' ? '' : `[${item.subtype}] `;
      return `${subtypeLabel}${item.title}${item.note ? ` — ${item.note}` : ''}`;
    }
    default:
      return item.type;
  }
}

export function AiPasteOrders({ hospitalId, existingItems, onApply }: Props) {
  const { t } = useTranslation();
  const hospital = useActiveHospital();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);

  const effectiveHospitalId = hospitalId ?? hospital?.id;
  const effectiveUnitId = hospital?.unitId;

  // Same source the MedicationEditor uses, so the configured-medication set
  // is consistent across pickers and the AI mapping check.
  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${effectiveHospitalId}?unitId=${effectiveUnitId}`],
    enabled: !!effectiveHospitalId && !!effectiveUnitId,
  });

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
      // Tag medication items whose ref does not resolve to a configured
      // medication. The flag is transient (stripped before save) and is used
      // by MedicationEditor to render an inline "Configure" CTA.
      const inventoryNames = new Set(
        inventoryItems
          .filter((inv: any) => inv.administrationGroup)
          .map((inv: any) => inv.name as string)
      );
      const annotated: PostopOrderItem[] = data.items.map((it) => {
        if (it.type === 'medication' && !inventoryNames.has(it.medicationRef)) {
          return { ...it, _unmapped: true } as PostopOrderItem & MaybeUnmapped;
        }
        return it;
      });
      setResult({ ...data, items: annotated });
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
    // Skip items flagged as having no matching medication config — the server
    // validator would reject the entire save otherwise. The user can re-paste
    // a corrected text or configure the missing meds first.
    const applicable = result.items.filter(it => !(it as PostopOrderItem & MaybeUnmapped)._unmapped);
    const skipped = result.items.length - applicable.length;
    // Assign fresh IDs in case AI reused any, and ensure uniqueness with existing.
    const existingIds = new Set(existingItems.map(i => i.id));
    const withFreshIds = applicable.map(it => {
      if (!it.id || existingIds.has(it.id)) return { ...it, id: crypto.randomUUID() };
      return it;
    });
    onApply(withFreshIds);
    setResult(null);
    setText('');
    toast({
      title: t('postopOrders.ai.appliedTitle', 'Applied'),
      description: skipped > 0
        ? t(
            'postopOrders.ai.appliedPartial',
            '{{n}} added, {{skipped}} skipped (missing medication configuration).',
            { n: withFreshIds.length, skipped },
          )
        : t('postopOrders.ai.appliedBody', '{{n}} items added. Review and save to persist.', { n: withFreshIds.length }),
    });
  };

  const discard = () => {
    setResult(null);
  };

  return (
    <div className="border rounded-md bg-muted/30">
      <div className="p-3 space-y-2">
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
                {result.items.map((it, idx) => {
                  const unmapped = (it as PostopOrderItem & MaybeUnmapped)._unmapped === true;
                  return (
                    <li
                      key={idx}
                      className={
                        unmapped
                          ? 'text-sm px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30'
                          : 'text-sm px-2 py-1.5 rounded bg-green-500/10 border border-green-500/30'
                      }
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={
                            unmapped
                              ? 'text-xs uppercase text-amber-700 dark:text-amber-400 font-medium'
                              : 'text-xs uppercase text-green-700 dark:text-green-400 font-medium'
                          }
                        >
                          {it.type}
                        </span>
                        <span className="flex-1">{summarizeItem(it)}</span>
                      </div>
                      {unmapped && (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {t(
                              'postopOrders.ai.missingConfig',
                              'Missing configuration — will be skipped on Apply. Configure this medication first or correct the name.',
                            )}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
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
                <Button
                  size="sm"
                  onClick={apply}
                  disabled={result.items.every(it => (it as PostopOrderItem & MaybeUnmapped)._unmapped === true)}
                >
                  <Check className="w-4 h-4 mr-1" />
                  {t('postopOrders.ai.apply', 'Apply')}
                </Button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
