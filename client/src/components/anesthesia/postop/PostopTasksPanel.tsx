import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import type { OrderSetResponse } from '@/types/postopOrders';
import type { PostopOrderItem } from '@shared/postopOrderItems';

interface Props {
  items: PostopOrderItem[];
  plannedEvents: OrderSetResponse['plannedEvents'];
  now: number;
  onMarkDone: (eventId: string) => void;
}

interface DisplayRow {
  key: string;
  title: string;
  when: 'overdue' | 'due_now' | 'upcoming' | 'ad_hoc';
  subtitle?: string;
  actionHint?: string;
  eventId?: string;
  done: boolean;
}

const DUE_NOW_WINDOW_MS = 15 * 60 * 1000;

function describeTaskItem(item: PostopOrderItem): string {
  if (item.type === 'task') return item.title;
  if (item.type === 'lab') return `Labor — ${item.panel.join(', ')}`;
  if (item.type === 'iv_fluid') {
    const solLabel: Record<string, string> = { nacl_09: 'NaCl 0.9%', ringer_lactate: 'Ringer-Laktat', glucose_5: 'Glucose 5%' };
    return `${solLabel[item.solution] ?? item.customName ?? item.solution} ${item.volumeMl}ml / ${item.durationH}h`;
  }
  if (item.type === 'bz_sliding_scale') return `BZ-Schema (${item.drug})`;
  return item.type;
}

export function buildDisplayRows(
  items: PostopOrderItem[],
  events: OrderSetResponse['plannedEvents'],
  now: number,
): DisplayRow[] {
  const rows: DisplayRow[] = [];

  for (const e of events) {
    if (e.kind !== 'task' && e.kind !== 'iv_fluid') continue;
    const plannedAt = new Date(e.plannedAt).getTime();
    const item = items.find(i => i.id === e.itemId);
    if (!item) continue;

    if (e.status === 'done') {
      rows.push({
        key: e.id, title: describeTaskItem(item), when: 'upcoming',
        subtitle: new Date(e.doneAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        eventId: e.id, done: true,
      });
      continue;
    }

    let when: DisplayRow['when'];
    if (plannedAt < now - DUE_NOW_WINDOW_MS) when = 'overdue';
    else if (plannedAt <= now + DUE_NOW_WINDOW_MS) when = 'due_now';
    else when = 'upcoming';

    rows.push({
      key: e.id, title: describeTaskItem(item), when,
      subtitle: new Date(plannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionHint: item.type === 'task' ? item.actionHint : undefined,
      eventId: e.id, done: false,
    });
  }

  // Ad-hoc / conditional tasks
  for (const item of items) {
    if (item.type !== 'task') continue;
    if (item.when !== 'ad_hoc' && item.when !== 'conditional') continue;
    rows.push({
      key: item.id, title: item.title, when: 'ad_hoc',
      subtitle: item.condition ?? 'ad-hoc',
      actionHint: item.actionHint, done: false,
    });
  }

  // BZ sliding scale — show as info row
  for (const item of items) {
    if (item.type !== 'bz_sliding_scale') continue;
    const hint = item.rules.map(r => `>${r.above}: ${r.units} IE`).join(' · ');
    rows.push({
      key: item.id, title: `BZ-Schema (${item.drug})`, when: 'ad_hoc',
      subtitle: 'bei BZ-Messung',
      actionHint: hint + (item.increment ? ` · +${item.increment.units} IE per ${item.increment.per} mg/dl` : ''),
      done: false,
    });
  }

  const order: Record<DisplayRow['when'], number> = { overdue: 0, due_now: 1, upcoming: 2, ad_hoc: 3 };
  rows.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return order[a.when] - order[b.when];
  });
  return rows;
}

export function PostopTasksPanel({ items, plannedEvents, now, onMarkDone }: Props) {
  const { t } = useTranslation();
  const rows = buildDisplayRows(items, plannedEvents, now);
  const overdueCount = rows.filter(r => r.when === 'overdue' && !r.done).length;

  return (
    <Card data-testid="postop-tasks-panel">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          {t('postopOrders.postopTasks', 'Postoperative Aufgaben')}
        </CardTitle>
        {overdueCount > 0 && (
          <Badge variant="destructive" data-testid="badge-overdue-count">
            {overdueCount} {t('postopOrders.overdue', 'überfällig')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="divide-y">
        {rows.length === 0 && (
          <div className="text-sm text-muted-foreground py-2">
            {t('postopOrders.noTasks', 'Keine Aufgaben.')}
          </div>
        )}
        {rows.map(row => (
          <div key={row.key} className="flex items-start gap-3 py-2" data-testid={`task-row-${row.key}`}>
            <Checkbox
              checked={row.done}
              disabled={row.done || !row.eventId}
              onCheckedChange={() => row.eventId && onMarkDone(row.eventId)}
              data-testid={`task-check-${row.key}`}
            />
            <div className="flex-1">
              <div className={row.done ? 'line-through text-muted-foreground text-sm' : 'text-sm font-medium'}>
                {row.title}
              </div>
              <div className={`text-xs ${row.when === 'overdue' ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {row.when === 'overdue' ? `Überfällig · ${row.subtitle}` :
                 row.when === 'due_now' ? `Jetzt fällig · ${row.subtitle}` :
                 row.when === 'upcoming' && row.done ? `Erledigt ${row.subtitle}` :
                 row.when === 'upcoming' ? `Fällig ${row.subtitle}` :
                 row.subtitle}
              </div>
              {row.actionHint && (
                <div className="text-xs mt-1 bg-muted px-2 py-1 rounded inline-block">{row.actionHint}</div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
