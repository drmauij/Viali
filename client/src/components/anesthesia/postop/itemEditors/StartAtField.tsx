import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { dateTimeLocalToISO, formatDateTimeForInput } from '@/lib/dateUtils';

interface Props {
  value?: string;                             // ISO 8601 or undefined
  onChange: (next: string | undefined) => void;
}

/**
 * Optional "Start at" input. Empty value = undefined = "immediately" in planning logic.
 * Always uses local-wall-clock semantics; conversion to UTC ISO via dateTimeLocalToISO.
 */
export function StartAtField({ value, onChange }: Props) {
  const { t } = useTranslation();
  const localValue = value ? formatDateTimeForInput(value) : '';

  return (
    <div>
      <Label className="text-xs">{t('postopOrders.editor.startAt', 'Start at')}</Label>
      <Input
        type="datetime-local"
        value={localValue}
        placeholder={t('postopOrders.editor.startAtImmediate', 'Immediately')}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            onChange(undefined);
          } else {
            onChange(dateTimeLocalToISO(v));
          }
        }}
      />
    </div>
  );
}
