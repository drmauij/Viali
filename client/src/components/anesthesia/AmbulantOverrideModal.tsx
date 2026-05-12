import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AMBULANT_THRESHOLDS } from '@shared/scoring/thresholds';
import type { EligibilityResult } from '@shared/scoring/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eligibility: EligibilityResult;
  onSubmit: (reason: string) => void | Promise<void>;
}

export function AmbulantOverrideModal({ open, onOpenChange, eligibility, onSubmit }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const minChars = AMBULANT_THRESHOLDS.OVERRIDE_REASON_MIN_CHARS;
  const tooShort = reason.trim().length < minChars;

  const handle = async () => {
    if (tooShort) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      onOpenChange(false);
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ambulant-override-modal">
        <DialogHeader>
          <DialogTitle>{t('ambulantEligibility.modal.title', 'Outpatient procedure with justification')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100 p-3 text-sm">
            <strong>{t('ambulantEligibility.modal.riskFactorsLabel', 'Risk factors:')}</strong>
            <ul className="mt-1 list-disc pl-5">
              {((eligibility.hardExclusionCodes ?? []).length > 0
                ? eligibility.hardExclusionCodes!.map((r, i) =>
                    t(`ambulantEligibility.reasons.${r.code}`, eligibility.hardExclusions[i] ?? r.code, r.params))
                : eligibility.hardExclusions
              ).map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('ambulantEligibility.modal.reasonPlaceholder', 'Clinical justification for outpatient procedure despite risk factors…')}
            rows={5}
            data-testid="ambulant-override-reason"
          />
          <p className="text-xs text-muted-foreground">
            {t('ambulantEligibility.modal.minCharsNotice', 'Min. {{min}} characters ({{count}}/{{min}}). Justification is permanently recorded in the audit log.', {
              min: minChars,
              count: reason.trim().length,
            })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('ambulantEligibility.modal.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handle}
            disabled={tooShort || submitting}
            data-testid="ambulant-override-confirm"
          >
            {t('ambulantEligibility.modal.confirm', 'Confirm override')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
