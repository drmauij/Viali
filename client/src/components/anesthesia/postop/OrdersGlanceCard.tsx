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

export function OrdersGlanceCard({ items, templateName, onEdit, canEdit }: Props) {
  const { t } = useTranslation();
  const mob = findFirst(items, 'mobilization');
  const pos = findFirst(items, 'positioning');
  const nut = findFirst(items, 'nutrition');
  const drains = filterType(items, 'drain');
  const wound = findFirst(items, 'wound_care');

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
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Row k={t('postopOrders.mobilisation', 'Mobilisation')} v={mob ? MOB_LABEL[mob.value] ?? mob.value : '—'} />
        <Row k={t('postopOrders.positioning', 'Lagerung')} v={pos ? (pos.customText || (POS_LABEL[pos.value] ?? pos.value)) : '—'} />
        <Row k={t('postopOrders.drainage', 'Drainagen')} v={drains.length ? drains.map(d => `${DRAIN_LABEL[d.drainType] ?? d.drainType}${d.site ? ' ' + d.site : ''}`).join(', ') : '—'} />
        <Row k={t('postopOrders.nutrition', 'Nahrung')} v={nut ? `${NUT_LABEL[nut.value] ?? nut.value}${nut.startAfter ? ' ab ' + nut.startAfter : ''}` : '—'} />
        <Row k={t('postopOrders.woundCheck', 'Wundkontrolle')} v={wound ? (wound.check === 'none' ? '—' : wound.check === 'daily' ? 'täglich' : '2×/Tag') : '—'} />
        <Row k={t('postopOrders.dressing', 'Verband')} v={wound ? (wound.dressingChange === 'on_soaking' ? 'bei Durchnässung' : wound.dressingChange === 'every_n_days' ? `alle ${wound.everyNDays} Tage` : '—') : '—'} />
        {templateName && (
          <div className="col-span-2 pt-1">
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
