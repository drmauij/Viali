import { CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { EligibilityResult, EligibilityReason } from '@shared/scoring/types';

/**
 * Reasons are emitted by the scoring engine as code+params. The badge renders
 * via i18n key `ambulantEligibility.reasons.<code>` with interpolated params.
 * Fallback to the German string baked into the result (audit-trail value) when
 * the code is unrecognized (forward-compat: future engine versions can add
 * codes without breaking the existing UI).
 */
function renderReason(
  t: any,
  r: EligibilityReason,
  fallback: string,
): string {
  return t(`ambulantEligibility.reasons.${r.code}`, fallback, r.params);
}

interface Props {
  eligibility: EligibilityResult;
  hasOverride?: boolean;
  variant?: 'full' | 'pill';
  onSwitchToOvernight?: () => void;
  onRequestOverride?: () => void;
  className?: string;
}

const COLORS: Record<EligibilityResult['decision'], { bg: string; border: string; text: string }> = {
  green:  { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800', text: 'text-green-800 dark:text-green-200' },
  yellow: { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-900 dark:text-amber-200' },
  red:    { bg: 'bg-red-50 dark:bg-red-950/40',     border: 'border-red-200 dark:border-red-800',     text: 'text-red-900 dark:text-red-200'     },
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
  const { decision, hardExclusions, yellowFactors, hardExclusionCodes, yellowFactorCodes } = eligibility;
  const c = COLORS[decision];
  const Icon = ICONS[decision];

  // Persisted/legacy snapshots may not include the structured codes — fall
  // back to the string array when codes aren't present.
  const hardItems = (hardExclusionCodes ?? []).length > 0
    ? hardExclusionCodes!.map((r, i) => renderReason(t, r, hardExclusions[i] ?? r.code))
    : hardExclusions;
  const yellowItems = (yellowFactorCodes ?? []).length > 0
    ? yellowFactorCodes!.map((r, i) => renderReason(t, r, yellowFactors[i] ?? r.code))
    : yellowFactors;

  const label =
    decision === 'green' ? t('ambulantEligibility.decision.green', 'Outpatient eligible')
    : decision === 'yellow' ? t('ambulantEligibility.decision.yellow', 'Anesthesia review recommended')
    : t('ambulantEligibility.decision.red', 'Outpatient not recommended');

  if (variant === 'pill') {
    return (
      <span
        title={[...hardItems, ...yellowItems].join(' · ') || label}
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

      {hardItems.length > 0 && (
        <div>
          <div className="font-medium">{t('ambulantEligibility.hardExclusions', 'Hard exclusions:')}</div>
          <ul className="list-disc pl-5">
            {hardItems.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {yellowItems.length > 0 && decision !== 'red' && (
        <div>
          <div className="font-medium">{t('ambulantEligibility.riskFactors', 'Risk factors:')}</div>
          <ul className="list-disc pl-5">
            {yellowItems.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {decision === 'red' && !hasOverride && (
        <div className="flex gap-2 pt-1">
          {onSwitchToOvernight && (
            <button
              type="button"
              onClick={onSwitchToOvernight}
              className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-red-900/40 text-red-900 dark:text-red-100 px-3 py-1 text-sm hover:bg-red-100 dark:hover:bg-red-900/60"
              data-testid="ambulant-switch-overnight"
            >
              {t('ambulantEligibility.switchToOvernight', 'Plan as overnight')}
            </button>
          )}
          {onRequestOverride && (
            <button
              type="button"
              onClick={onRequestOverride}
              className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-red-900/40 text-red-900 dark:text-red-100 px-3 py-1 text-sm hover:bg-red-100 dark:hover:bg-red-900/60"
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
