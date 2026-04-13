import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';
import type { PostopOrderItem } from '@shared/postopOrderItems';
import { useTranslation } from 'react-i18next';

interface Props {
  items: PostopOrderItem[];
  templateName?: string | null;
  onEdit: () => void;
  canEdit: boolean;
}

function findFirst<T extends PostopOrderItem['type']>(items: PostopOrderItem[], type: T) {
  return items.find(i => i.type === type) as Extract<PostopOrderItem, { type: T }> | undefined;
}

function filterType<T extends PostopOrderItem['type']>(items: PostopOrderItem[], type: T) {
  return items.filter(i => i.type === type) as Extract<PostopOrderItem, { type: T }>[];
}

const MOB_LABEL: Record<string, string> = {
  bedrest: 'Bettruhe', assisted: 'Assistierte Mobilisation', free: 'Freie Mobilisation',
};
const POS_LABEL: Record<string, string> = {
  supine: 'Rückenlage', lateral: 'Seitenlagerung', head_up_30: '30° Oberkörperhoch',
  head_up_45: '45° Oberkörperhoch', custom: 'Spezielle Lagerung',
};
const NUT_LABEL: Record<string, string> = {
  nil: 'Nüchtern', liquids: 'Flüssigkeiten', turmix: 'Turmix', vollkost: 'Vollkost',
};
const DRAIN_LABEL: Record<string, string> = {
  redon: 'Redon', easyflow: 'Easyflow', dk: 'DK', spul: 'Spülkatheter', other: 'Andere',
};
const SOL_LABEL: Record<string, string> = {
  nacl_09: 'NaCl 0.9%', ringer_lactate: 'Ringer-Laktat', glucose_5: 'Glucose 5%',
};

export function OrdersGlanceCard({ items, templateName, onEdit, canEdit }: Props) {
  const { t } = useTranslation();

  // Group 1 — static orders
  const mob = findFirst(items, 'mobilization');
  const pos = findFirst(items, 'positioning');
  const nut = findFirst(items, 'nutrition');
  const drains = filterType(items, 'drain');
  const wound = findFirst(items, 'wound_care');

  // Other item types — summarize counts
  const meds = filterType(items, 'medication');
  const vitals = filterType(items, 'vitals_monitoring');
  const labs = filterType(items, 'lab');
  const tasks = filterType(items, 'task');
  const ivFluids = filterType(items, 'iv_fluid');
  const bzScale = findFirst(items, 'bz_sliding_scale');

  const hasGroup1 = mob || pos || nut || drains.length || wound;
  const hasOtherItems = meds.length || vitals.length || labs.length || tasks.length || ivFluids.length || bzScale;

  return (
    <Card data-testid="orders-glance-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          {t('postopOrders.ordersAtAGlance', 'Verordnungen')}
        </CardTitle>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={onEdit} data-testid="button-edit-orders">
            <Pencil className="w-3.5 h-3.5 mr-1" /> {t('postopOrders.edit', 'Edit')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Group 1 — static orders (only show rows that have data) */}
        {hasGroup1 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {mob && <Row k={t('postopOrders.mobilisation', 'Mobilisation')} v={MOB_LABEL[mob.value] ?? mob.value} />}
            {pos && <Row k={t('postopOrders.positioning', 'Lagerung')} v={pos.customText || (POS_LABEL[pos.value] ?? pos.value)} />}
            {drains.length > 0 && <Row k={t('postopOrders.drainage', 'Drainagen')} v={drains.map(d => `${DRAIN_LABEL[d.drainType] ?? d.drainType}${d.site ? ' ' + d.site : ''}`).join(', ')} />}
            {nut && <Row k={t('postopOrders.nutrition', 'Nahrung')} v={`${NUT_LABEL[nut.value] ?? nut.value}${nut.startAfter ? ' ab ' + nut.startAfter : ''}`} />}
            {wound && wound.check !== 'none' && <Row k={t('postopOrders.woundCheck', 'Wundkontrolle')} v={wound.check === 'daily' ? 'täglich' : '2×/Tag'} />}
            {wound && wound.dressingChange !== 'none' && <Row k={t('postopOrders.dressing', 'Verband')} v={wound.dressingChange === 'on_soaking' ? 'bei Durchnässung' : `alle ${wound.everyNDays} Tage`} />}
          </div>
        )}

        {/* Other items — compact summary */}
        {hasOtherItems && (
          <div className="flex flex-wrap gap-2 pt-1">
            {meds.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                💊 {meds.length} {t('postopOrders.medications', 'Medikamente')}
                <span className="ml-1 text-muted-foreground">
                  ({meds.map(m => m.medicationRef.split('/')[0]).join(', ')})
                </span>
              </Badge>
            )}
            {vitals.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                📊 {vitals.map(v => v.parameter).join(', ')}
              </Badge>
            )}
            {labs.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                🔬 {labs.map(l => l.panel.join(', ')).join(' · ')}
              </Badge>
            )}
            {ivFluids.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                💧 {ivFluids.map(iv => `${SOL_LABEL[iv.solution] ?? iv.customName ?? iv.solution} ${iv.volumeMl}ml`).join(', ')}
              </Badge>
            )}
            {tasks.length > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                ✓ {tasks.length} {t('postopOrders.tasks', 'Aufgaben')}
              </Badge>
            )}
            {bzScale && (
              <Badge variant="outline" className="text-xs font-normal">
                BZ-Schema ({bzScale.drug})
              </Badge>
            )}
          </div>
        )}

        {/* Empty state */}
        {!hasGroup1 && !hasOtherItems && (
          <div className="text-muted-foreground text-center py-2">
            {t('postopOrders.noOrders', 'Keine Verordnungen — klicken Sie auf "Edit" um Verordnungen hinzuzufügen.')}
          </div>
        )}

        {/* Template badge */}
        {templateName && (
          <div className="pt-1">
            <span className="text-xs text-muted-foreground mr-2">Template:</span>
            <Badge variant="secondary">{templateName}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-[100px]">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
