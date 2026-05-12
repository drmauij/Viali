import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { AmbulantEligibilityBadge } from './AmbulantEligibilityBadge';
import type {
  EligibilityResult,
  ScoreResult,
  CapriniResult,
  StopBangResult,
  RcriResult,
  ApfelResult,
} from '@shared/scoring/types';
import type { Recommendations } from '@shared/scoring/recommendations';

interface Props {
  eligibility: EligibilityResult;
  scores: { caprini: CapriniResult; stopBang: StopBangResult; rcri: RcriResult; apfel: ApfelResult };
  recommendations: Recommendations;
  hasOverride: boolean;
  onSwitchToOvernight?: () => void;
  onRequestOverride?: () => void;
}

function ScoreRow({ label, result, suffix, pointsLabel }: { label: string; result: ScoreResult; suffix?: string; pointsLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t py-1.5 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
        data-testid={`score-row-${label.toLowerCase()}`}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="w-24 font-medium">{label}</span>
        <span className="w-12 text-right">{result.score}</span>
        <span className="ml-2 text-muted-foreground">
          {result.category}
          {suffix ? ` · ${suffix}` : ''}
        </span>
      </button>
      {open && (
        <table className="ml-6 mt-1 text-xs">
          <tbody>
            {result.breakdown.map((row) => (
              <tr key={row.criterion} className={row.met ? 'font-medium' : 'text-muted-foreground'}>
                <td className="pr-3">{row.met ? '✓' : '○'}</td>
                <td className="pr-3">{row.criterion}</td>
                <td className="pr-3 text-right">{row.points} {pointsLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AmbulantFullAssessmentPanel({
  eligibility,
  scores,
  recommendations,
  hasOverride,
  onSwitchToOvernight,
  onRequestOverride,
}: Props) {
  const { t } = useTranslation();
  const pointsLabel = t('common.pointsAbbr', 'pts');
  return (
    <div className="space-y-3 rounded-md border p-4" data-testid="full-assessment-panel">
      <AmbulantEligibilityBadge
        eligibility={eligibility}
        hasOverride={hasOverride}
        onSwitchToOvernight={onSwitchToOvernight}
        onRequestOverride={onRequestOverride}
      />

      <div className="border rounded-md p-2">
        <div className="font-semibold text-sm pb-1">
          {t('ambulantEligibility.panel.clinicalScores', 'Clinical scores')}
        </div>
        <ScoreRow label="Caprini" result={scores.caprini} pointsLabel={pointsLabel} />
        <ScoreRow label="STOP-BANG" result={scores.stopBang} pointsLabel={pointsLabel} />
        <ScoreRow label="RCRI" result={scores.rcri} suffix={`${scores.rcri.macePercent.toFixed(1)}% MACE`} pointsLabel={pointsLabel} />
        <ScoreRow label="Apfel" result={scores.apfel} suffix={`${scores.apfel.ponvPercent}% PONV`} pointsLabel={pointsLabel} />
      </div>

      <div className="rounded-md bg-slate-50 dark:bg-slate-900/60 p-3 text-sm space-y-1">
        <div className="font-semibold">
          {t('ambulantEligibility.panel.recommendations', 'Recommendations')}
        </div>
        <div>
          • {t('ambulantEligibility.panel.vteProphylaxis', 'VTE prophylaxis')}:{' '}
          {t(`ambulantEligibility.recommendationsValues.${recommendations.vteProphylaxisCode}`, recommendations.vteProphylaxis)}
        </div>
        <div>
          • {t('ambulantEligibility.panel.ponvProphylaxis', 'PONV prophylaxis')}:{' '}
          {t(`ambulantEligibility.recommendationsValues.${recommendations.ponvProphylaxisCode}`, recommendations.ponvProphylaxis)}
        </div>
        <div>
          • {t('ambulantEligibility.panel.monitoring', 'Monitoring')}:{' '}
          {t(`ambulantEligibility.recommendationsValues.${recommendations.monitoringCode}`, recommendations.monitoring)}
        </div>
      </div>
    </div>
  );
}
