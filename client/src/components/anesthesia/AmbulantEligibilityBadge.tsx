import { CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { EligibilityResult } from '@shared/scoring/types';

interface Props {
  eligibility: EligibilityResult;
  hasOverride?: boolean;
  variant?: 'full' | 'pill';
  onSwitchToOvernight?: () => void;
  onRequestOverride?: () => void;
  className?: string;
}

const COLORS: Record<EligibilityResult['decision'], { bg: string; border: string; text: string }> = {
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800'  },
  yellow: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-900'  },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-900'    },
};

const ICONS = {
  green: CheckCircle2,
  yellow: AlertTriangle,
  red: ShieldAlert,
};

export function AmbulantEligibilityBadge({
  eligibility,
  hasOverride = false,
  variant = 'full',
  onSwitchToOvernight,
  onRequestOverride,
  className,
}: Props) {
  const { t } = useTranslation();
  const { decision, hardExclusions, yellowFactors } = eligibility;
  const c = COLORS[decision];
  const Icon = ICONS[decision];

  const label =
    decision === 'green' ? t('ambulantEligibility.decision.green', 'Outpatient eligible')
    : decision === 'yellow' ? t('ambulantEligibility.decision.yellow', 'Anesthesia review recommended')
    : t('ambulantEligibility.decision.red', 'Outpatient not recommended');

  if (variant === 'pill') {
    return (
      <span
        title={[...hardExclusions, ...yellowFactors].join(' · ') || label}
        className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs', c.bg, c.border, c.text, className)}
        data-testid={`ambulant-pill-${decision}`}
      >
        <Icon className="h-3 w-3" />
        {label}
        {hasOverride && <span className="ml-1">⚠</span>}
      </span>
    );
  }

  return (
    <div
      className={cn('rounded-md border p-3 text-sm space-y-2', c.bg, c.border, c.text, className)}
      data-testid={`ambulant-badge-${decision}`}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4" />
        {label}
        {hasOverride && (
          <span className="ml-auto text-xs">⚠ {t('ambulantEligibility.overrideActive', 'Override active')}</span>
        )}
      </div>

      {hardExclusions.length > 0 && (
        <div>
          <div className="font-medium">{t('ambulantEligibility.hardExclusions', 'Hard exclusions:')}</div>
          <ul className="list-disc pl-5">
            {hardExclusions.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {yellowFactors.length > 0 && decision !== 'red' && (
        <div>
          <div className="font-medium">{t('ambulantEligibility.riskFactors', 'Risk factors:')}</div>
          <ul className="list-disc pl-5">
            {yellowFactors.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {decision === 'red' && !hasOverride && (
        <div className="flex gap-2 pt-1">
          {onSwitchToOvernight && (
            <button
              type="button"
              onClick={onSwitchToOvernight}
              className="rounded border border-red-300 bg-white px-3 py-1 text-sm hover:bg-red-100"
              data-testid="ambulant-switch-overnight"
            >
              {t('ambulantEligibility.switchToOvernight', 'Plan as overnight')}
            </button>
          )}
          {onRequestOverride && (
            <button
              type="button"
              onClick={onRequestOverride}
              className="rounded border border-red-300 bg-white px-3 py-1 text-sm hover:bg-red-100"
              data-testid="ambulant-request-override"
            >
              {t('ambulantEligibility.requestOverride', 'Override with reason')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
