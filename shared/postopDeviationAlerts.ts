export type RecordedVitalType = 'hr' | 'bp-sys' | 'bp-dia' | 'spo2';
export type DeviationParameter = 'pulse' | 'BP' | 'spo2';
export type BoundKind = 'low' | 'high';

export interface RecordedVitalLike {
  id: string;
  type: RecordedVitalType;
  timestamp: number;
  value: number;
}

export interface PlannedBoundsLike {
  parameter: 'BP' | 'pulse' | 'temp' | 'spo2' | 'bz';
  min?: number;
  max?: number;
  actionLow?: string;
  actionHigh?: string;
}

export interface AcknowledgmentLike {
  parameter: string;
  recordedAt: number;
  recordedValue: number;
  boundKind: BoundKind;
  resolvedBy: string;
}

export interface DeviationAlert {
  recordedId: string;
  parameter: DeviationParameter;
  timestamp: number;
  value: number;
  kind: BoundKind;
  action?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
}

const RECORDED_TO_PARAM: Record<RecordedVitalType, DeviationParameter | null> = {
  'hr': 'pulse',
  'bp-sys': 'BP',
  'bp-dia': null,
  'spo2': 'spo2',
};

export function detectDeviations(
  recorded: RecordedVitalLike[],
  plannedBounds: PlannedBoundsLike[],
  acks: AcknowledgmentLike[],
): DeviationAlert[] {
  const boundsMap = new Map<DeviationParameter, PlannedBoundsLike>();
  for (const b of plannedBounds) {
    if (b.parameter === 'temp' || b.parameter === 'bz') continue;
    if (!boundsMap.has(b.parameter as DeviationParameter)) {
      boundsMap.set(b.parameter as DeviationParameter, b);
    }
  }

  const alerts: DeviationAlert[] = [];
  for (const r of recorded) {
    const param = RECORDED_TO_PARAM[r.type];
    if (!param) continue;
    const b = boundsMap.get(param);
    if (!b) continue;
    let kind: BoundKind | null = null;
    let action: string | undefined;
    if (b.min !== undefined && r.value < b.min) { kind = 'low'; action = b.actionLow; }
    else if (b.max !== undefined && r.value > b.max) { kind = 'high'; action = b.actionHigh; }
    if (!kind) continue;

    const matchingAck = acks.find(a =>
      a.parameter === param &&
      a.recordedAt === r.timestamp &&
      a.recordedValue === r.value &&
      a.boundKind === kind
    );

    alerts.push({
      recordedId: r.id,
      parameter: param,
      timestamp: r.timestamp,
      value: r.value,
      kind,
      action,
      acknowledged: !!matchingAck,
      acknowledgedBy: matchingAck?.resolvedBy,
    });
  }
  return alerts;
}
