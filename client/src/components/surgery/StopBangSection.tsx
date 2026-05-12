import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  values: {
    osasSnoringLoud: boolean;
    osasObservedApnea: boolean;
    osasDaytimeTiredness: boolean;
    neckCircumferenceCm: number | null;
  };
  onChange: (patch: Partial<Props['values']>) => void;
}

export function StopBangSection({ values, onChange }: Props) {
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="stopbang-section">
      <h4 className="text-sm font-semibold">STOP-BANG (Schlafapnoe-Screening)</h4>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={values.osasSnoringLoud}
          onCheckedChange={(v) => onChange({ osasSnoringLoud: v === true })}
          data-testid="stopbang-snoring"
        />
        Lautes Schnarchen (durch Wand hörbar)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={values.osasObservedApnea}
          onCheckedChange={(v) => onChange({ osasObservedApnea: v === true })}
          data-testid="stopbang-apnea"
        />
        Beobachtete Atemaussetzer
      </label>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={values.osasDaytimeTiredness}
          onCheckedChange={(v) => onChange({ osasDaytimeTiredness: v === true })}
          data-testid="stopbang-tiredness"
        />
        Tagesmüdigkeit / Einschlafen tagsüber
      </label>

      <div className="space-y-1">
        <Label htmlFor="neck-circumference">Halsumfang (cm)</Label>
        <Input
          id="neck-circumference"
          type="number"
          step="0.5"
          value={values.neckCircumferenceCm ?? ''}
          onChange={(e) =>
            onChange({ neckCircumferenceCm: e.target.value === '' ? null : Number(e.target.value) })
          }
          data-testid="stopbang-neck"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        BMI, Alter, Geschlecht und Hypertonie werden automatisch aus dem Patientendatensatz übernommen.
      </p>
    </div>
  );
}
