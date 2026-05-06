import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Timing, TimingMode, EndCondition, Frequency } from '@shared/postopOrderItems';
import { dateTimeLocalToISO, formatDateTimeForInput } from '@/lib/dateUtils';

interface Props {
  value: Timing;
  onChange: (next: Timing) => void;
  allowedModes: TimingMode[];
  allowedFrequencies?: Frequency[];   // optional override
}

const DEFAULT_FREQUENCIES: Frequency[] = [
  'oral_1_0_0', 'oral_1_0_1', 'oral_1_1_1', 'oral_1_1_1_1',
  'q1h', 'q2h', 'q4h', 'q6h', 'q8h', 'q12h', 'q24h', 'q48h', 'weekly',
];

const CLINICAL_FREQUENCIES = new Set<Frequency>([
  'oral_1_0_0', 'oral_1_0_1', 'oral_1_1_1', 'oral_1_1_1_1',
]);

export function TimingField({ value, onChange, allowedModes, allowedFrequencies }: Props) {
  const { t } = useTranslation();
  const freqs = allowedFrequencies ?? DEFAULT_FREQUENCIES;
  const clinical = freqs.filter(f => CLINICAL_FREQUENCIES.has(f));
  const interval = freqs.filter(f => !CLINICAL_FREQUENCIES.has(f));

  const setMode = (mode: TimingMode) => {
    if (mode === 'scheduled')   onChange({ mode, frequency: value.frequency, startAt: value.startAt, end: value.end ?? { kind: 'indefinite' } });
    else if (mode === 'one_shot') onChange({ mode, startAt: value.startAt });
    else if (mode === 'ad_hoc')   onChange({ mode });
    else onChange({ mode, condition: value.condition ?? '' });
  };

  return (
    <div className="space-y-3">
      {allowedModes.length > 1 && (
        <Tabs value={value.mode} onValueChange={v => setMode(v as TimingMode)}>
          <TabsList className="grid grid-flow-col auto-cols-fr">
            {allowedModes.includes('scheduled')   && <TabsTrigger value="scheduled">{t('postopOrders.timing.scheduled', 'Scheduled')}</TabsTrigger>}
            {allowedModes.includes('one_shot')    && <TabsTrigger value="one_shot">{t('postopOrders.timing.oneShot', 'One-shot')}</TabsTrigger>}
            {allowedModes.includes('ad_hoc')      && <TabsTrigger value="ad_hoc">{t('postopOrders.timing.adHoc', 'PRN')}</TabsTrigger>}
            {allowedModes.includes('conditional') && <TabsTrigger value="conditional">{t('postopOrders.timing.conditional', 'Conditional')}</TabsTrigger>}
          </TabsList>
        </Tabs>
      )}

      {value.mode === 'scheduled' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">{t('postopOrders.editor.frequency', 'Frequency')}</Label>
            <Select
              value={value.frequency ?? ''}
              onValueChange={v => onChange({ ...value, frequency: v as Frequency })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('postopOrders.editor.selectFrequency', 'Choose frequency...')} />
              </SelectTrigger>
              <SelectContent>
                {clinical.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t('postopOrders.timing.clinical', 'Clinical notation')}</SelectLabel>
                    {clinical.map(f => <SelectItem key={f} value={f}>{labelFor(f, t)}</SelectItem>)}
                  </SelectGroup>
                )}
                {interval.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>{t('postopOrders.timing.interval', 'Interval')}</SelectLabel>
                    {interval.map(f => <SelectItem key={f} value={f}>{labelFor(f, t)}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('postopOrders.timing.startAt', 'Start at')}</Label>
            <Input
              type="datetime-local"
              value={value.startAt ? formatDateTimeForInput(value.startAt) : ''}
              onChange={e => {
                const iso = e.target.value ? dateTimeLocalToISO(e.target.value) : undefined;
                onChange({ ...value, startAt: iso });
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <EndConditionEditor end={value.end ?? { kind: 'indefinite' }} onChange={end => onChange({ ...value, end })} />
          </div>
        </div>
      )}

      {value.mode === 'one_shot' && (
        <div>
          <Label className="text-xs">{t('postopOrders.timing.at', 'At')}</Label>
          <Input
            type="datetime-local"
            value={value.startAt ? formatDateTimeForInput(value.startAt) : ''}
            onChange={e => {
              const iso = e.target.value ? dateTimeLocalToISO(e.target.value) : undefined;
              onChange({ ...value, startAt: iso });
            }}
          />
        </div>
      )}

      {value.mode === 'conditional' && (
        <div>
          <Label className="text-xs">{t('postopOrders.timing.condition', 'Condition')}</Label>
          <Textarea
            rows={2}
            value={value.condition ?? ''}
            onChange={e => onChange({ ...value, condition: e.target.value })}
            placeholder={t('postopOrders.timing.conditionPlaceholder', 'e.g. pain > 7')}
          />
        </div>
      )}

      {value.mode === 'ad_hoc' && (
        <p className="text-xs text-muted-foreground">
          {t('postopOrders.timing.adHocHint', 'Administered on demand. No automatic events are planned.')}
        </p>
      )}
    </div>
  );
}

function EndConditionEditor({ end, onChange }: { end: EndCondition; onChange: (e: EndCondition) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">{t('postopOrders.timing.endLabel', 'Ends')}</Label>
        <Select
          value={end.kind}
          onValueChange={v => {
            if (v === 'indefinite') onChange({ kind: 'indefinite' });
            else if (v === 'until') onChange({ kind: 'until', at: (end as any).at ?? '' });
            else onChange({ kind: 'count', n: (end as any).n ?? 1 });
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="indefinite">{t('postopOrders.timing.endIndefinite', 'Indefinite')}</SelectItem>
            <SelectItem value="until">{t('postopOrders.timing.endUntil', 'Until date/time')}</SelectItem>
            <SelectItem value="count">{t('postopOrders.timing.endCount', 'After N occurrences')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {end.kind === 'until' && (
        <div>
          <Label className="text-xs">{t('postopOrders.timing.endUntilAt', 'Until')}</Label>
          <Input
            type="datetime-local"
            value={end.at ? formatDateTimeForInput(end.at) : ''}
            onChange={e => {
              const iso = e.target.value ? dateTimeLocalToISO(e.target.value) : '';
              onChange({ kind: 'until', at: iso });
            }}
          />
        </div>
      )}
      {end.kind === 'count' && (
        <div>
          <Label className="text-xs">{t('postopOrders.timing.endCountN', 'Number of occurrences')}</Label>
          <Input
            type="number"
            min={1}
            value={end.n}
            onChange={e => onChange({ kind: 'count', n: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
      )}
    </div>
  );
}

function labelFor(f: Frequency, t: (k: string, fb: string) => string): string {
  const map: Record<Frequency, [string, string]> = {
    continuous:    ['postopOrders.frequency.continuous',  'Continuous'],
    q15min:        ['postopOrders.frequency.q15min',      'Every 15 min'],
    q30min:        ['postopOrders.frequency.q30min',      'Every 30 min'],
    q1h:           ['postopOrders.frequency.q1h',         'Every 1 hour'],
    q2h:           ['postopOrders.frequency.q2h',         'Every 2 hours'],
    q4h:           ['postopOrders.frequency.q4h',         'Every 4 hours'],
    q6h:           ['postopOrders.frequency.q6h',         'Every 6 hours'],
    q8h:           ['postopOrders.frequency.q8h',         'Every 8 hours'],
    q12h:          ['postopOrders.frequency.q12h',        'Every 12 hours'],
    q24h:          ['postopOrders.frequency.q24h',        'Every 24 hours'],
    q48h:          ['postopOrders.frequency.q48h',        'Every 48 hours'],
    weekly:        ['postopOrders.frequency.weekly',      'Weekly'],
    '2x_daily':    ['postopOrders.frequency.2x_daily',    '2× daily'],
    '3x_daily':    ['postopOrders.frequency.3x_daily',    '3× daily'],
    '4x_daily':    ['postopOrders.frequency.4x_daily',    '4× daily'],
    oral_1_0_0:    ['postopOrders.frequency.oral_1_0_0',  '1-0-0 (morning)'],
    oral_1_0_1:    ['postopOrders.frequency.oral_1_0_1',  '1-0-1 (morning + evening)'],
    oral_1_1_1:    ['postopOrders.frequency.oral_1_1_1',  '1-1-1 (3× daily)'],
    oral_1_1_1_1:  ['postopOrders.frequency.oral_1_1_1_1','1-1-1-1 (4× daily)'],
  };
  const [k, fb] = map[f];
  return t(k, fb);
}
