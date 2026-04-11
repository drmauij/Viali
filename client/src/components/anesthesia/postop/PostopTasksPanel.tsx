import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import type { OrderSetResponse } from '@/types/postopOrders';
import type { PostopOrderItem } from '@shared/postopOrderItems';
import { buildDisplayRows } from './postopTasksLogic';

export { buildDisplayRows } from './postopTasksLogic';

interface Props {
  items: PostopOrderItem[];
  plannedEvents: OrderSetResponse['plannedEvents'];
  now: number;
  onMarkDone: (eventId: string) => void;
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
