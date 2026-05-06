// shared/postopOrderItems.ts
export type ItemId = string;

export type Frequency =
  | 'continuous' | 'q15min' | 'q30min' | 'q1h' | 'q2h' | 'q4h'
  | 'q6h' | 'q8h' | 'q12h' | 'q24h' | 'q48h' | 'weekly'
  | '2x_daily' | '3x_daily' | '4x_daily'
  // Clinical notation for oral/scheduled meds. Today these compute the same
  // intervals as their q-equivalents; a future change can make them honor
  // wall-clock slots (e.g. 1-1-1 = 8:00, 12:00, 18:00 regardless of startAt).
  | 'oral_1_0_0' | 'oral_1_0_1' | 'oral_1_1_1' | 'oral_1_1_1_1';

export interface MobilizationItem  { id: ItemId; type: 'mobilization'; value: 'bedrest' | 'assisted' | 'free'; assistedFrom?: string; note?: string; }
export interface PositioningItem   { id: ItemId; type: 'positioning'; value: 'supine' | 'lateral' | 'head_up_30' | 'head_up_45' | 'custom'; customText?: string; }
export interface DrainItem         { id: ItemId; type: 'drain'; drainType: 'redon' | 'easyflow' | 'dk' | 'spul' | 'other'; site?: string; note?: string; }
export interface NutritionItem     { id: ItemId; type: 'nutrition'; value: 'nil' | 'liquids' | 'turmix' | 'vollkost'; startAfter?: string; note?: string; }
export interface WoundCareItem {
  id: ItemId; type: 'wound_care';
  check: 'none' | 'daily' | 'twice_daily';
  dressingChange: 'none' | 'every_n_days' | 'on_soaking';
  startAt?: string;                // ISO 8601 — first dressing change (every_n_days mode)
  everyNDays?: number;
}

export interface VitalsMonitoringItem {
  id: ItemId; type: 'vitals_monitoring';
  parameter: 'BP' | 'pulse' | 'temp' | 'spo2' | 'bz';
  frequency: Frequency;
  startAt?: string;                // ISO 8601 — first event time; ignored when frequency='continuous'
  min?: number; max?: number;
  actionLow?: string; actionHigh?: string;
}

export interface MedicationItem {
  id: ItemId; type: 'medication';
  medicationRef: string;
  dose: string;
  route: 'po' | 'iv' | 'sc' | 'im';
  scheduleMode: 'scheduled' | 'prn';
  frequency?: Frequency | string;
  startAt?: string;
  prnMaxPerDay?: number;
  prnMaxPerInterval?: { count: number; intervalH: number };
  note?: string;
}

export interface IvFluidItem {
  id: ItemId; type: 'iv_fluid';
  solution: 'nacl_09' | 'ringer_lactate' | 'glucose_5' | 'custom';
  customName?: string;
  volumeMl: number;
  additives?: string;
  durationH: number;
  startAt?: string;
  condition?: string;
}

export interface LabItem {
  id: ItemId; type: 'lab';
  panel: string[];
  when: 'one_shot' | 'daily' | 'every_n_hours';
  startAt?: string;                // ISO 8601 — first event time; falls back to oneShotOffsetH or now()
  oneShotOffsetH?: number;
  everyNHours?: number;
  thresholds?: Array<{ param: string; op: '<' | '>'; value: number; action: string }>;
}

export interface TaskItem {
  id: ItemId; type: 'task';
  title: string;
  when: 'one_shot' | 'daily' | 'every_n_hours' | 'ad_hoc' | 'conditional';
  startAt?: string;                // ISO 8601 — first event time; falls back to oneShotAt or now()
  oneShotAt?: string;
  everyNHours?: number;
  condition?: string;
  actionHint?: string;
}

export interface BzSlidingScaleItem {
  id: ItemId; type: 'bz_sliding_scale';
  drug: string;
  startAt?: string;                // ISO 8601 — first measurement time
  rules: Array<{ above: number; units: number }>;
  increment?: { per: number; units: number };
}

export interface FreeTextItem {
  id: ItemId; type: 'free_text';
  section: 'general' | 'meds' | 'labs' | 'other';
  text: string;
}

export type PostopOrderItem =
  | MobilizationItem | PositioningItem | DrainItem | NutritionItem | WoundCareItem
  | VitalsMonitoringItem | MedicationItem | IvFluidItem | LabItem | TaskItem
  | BzSlidingScaleItem | FreeTextItem;

export type PostopOrderItemType = PostopOrderItem['type'];

export function isItemType<T extends PostopOrderItemType>(
  item: PostopOrderItem, type: T,
): item is Extract<PostopOrderItem, { type: T }> {
  return item.type === type;
}

export function createEmptyItem(type: PostopOrderItemType, id: ItemId): PostopOrderItem {
  switch (type) {
    case 'mobilization': return { id, type, value: 'free' };
    case 'positioning':  return { id, type, value: 'supine' };
    case 'drain':        return { id, type, drainType: 'redon' };
    case 'nutrition':    return { id, type, value: 'vollkost' };
    case 'wound_care':   return { id, type, check: 'daily', dressingChange: 'on_soaking' };
    case 'vitals_monitoring': return { id, type, parameter: 'BP', frequency: 'q1h' };
    case 'medication':   return { id, type, medicationRef: '', dose: '', route: 'po', scheduleMode: 'scheduled' };
    case 'iv_fluid':     return { id, type, solution: 'ringer_lactate', volumeMl: 1000, durationH: 12 };
    case 'lab':          return { id, type, panel: [], when: 'one_shot' };
    case 'task':         return { id, type, title: '', when: 'one_shot' };
    case 'bz_sliding_scale': return { id, type, drug: 'Actrapid', rules: [{ above: 120, units: 2 }] };
    case 'free_text':    return { id, type, section: 'general', text: '' };
  }
}
