import { useState } from 'react';
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
          <DialogTitle>Ambulante Durchführung mit Begründung</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md bg-red-50 p-3 text-sm">
            <strong>Risikofaktoren:</strong>
            <ul className="mt-1 list-disc pl-5">
              {eligibility.hardExclusions.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Klinische Begründung für ambulante Durchführung trotz Risikofaktoren..."
            rows={5}
            data-testid="ambulant-override-reason"
          />
          <p className="text-xs text-muted-foreground">
            Min. {minChars} Zeichen ({reason.trim().length}/{minChars}). Begründung wird permanent im Audit-Log gespeichert.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={handle}
            disabled={tooShort || submitting}
            data-testid="ambulant-override-confirm"
          >
            Override bestätigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
