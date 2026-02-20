export const VITALS_THRESHOLDS = {
  hr: { low: 50, high: 120 },
  spo2: { low: 92 },
  sbp: { low: 90, high: 180 },
} as const;

export type AlertLevel = 'warning' | 'critical';

export interface VitalAlert {
  type: 'hr' | 'spo2' | 'sbp';
  value: number;
  level: AlertLevel;
  messageKey: string;
}

export function checkVitalsAlerts(
  lastHr?: number,
  lastSbp?: number,
  lastSpo2?: number
): VitalAlert[] {
  const alerts: VitalAlert[] = [];

  if (lastHr !== undefined) {
    if (lastHr < VITALS_THRESHOLDS.hr.low) {
      alerts.push({ type: 'hr', value: lastHr, level: 'warning', messageKey: 'anesthesia.pacu.alerts.hrLow' });
    } else if (lastHr > VITALS_THRESHOLDS.hr.high) {
      alerts.push({ type: 'hr', value: lastHr, level: 'warning', messageKey: 'anesthesia.pacu.alerts.hrHigh' });
    }
  }

  if (lastSpo2 !== undefined) {
    if (lastSpo2 < VITALS_THRESHOLDS.spo2.low) {
      alerts.push({ type: 'spo2', value: lastSpo2, level: 'critical', messageKey: 'anesthesia.pacu.alerts.spo2Low' });
    }
  }

  if (lastSbp !== undefined) {
    if (lastSbp < VITALS_THRESHOLDS.sbp.low) {
      alerts.push({ type: 'sbp', value: lastSbp, level: 'warning', messageKey: 'anesthesia.pacu.alerts.sbpLow' });
    } else if (lastSbp > VITALS_THRESHOLDS.sbp.high) {
      alerts.push({ type: 'sbp', value: lastSbp, level: 'warning', messageKey: 'anesthesia.pacu.alerts.sbpHigh' });
    }
  }

  return alerts;
}
