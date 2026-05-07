// shared/postopOrderItems.ts
export type ItemId = string;

export type Frequency =
  | 'continuous' | 'q15min' | 'q30min' | 'q1h' | 'q2h' | 'q4h'
  | 'q6h' | 'q8h' | 'q12h' | 'q24h' | 'q48h' | 'weekly'
  | '2x_daily' | '3x_daily' | '4x_daily'
  | 'oral_1_0_0' | 'oral_1_0_1' | 'oral_1_1_1' | 'oral_1_1_1_1';

export type TimingMode = 'scheduled' | 'one_shot' | 'ad_hoc' | 'conditional';

export type EndCondition =
  | { kind: 'indefinite' }
  | { kind: 'until'; at: string }      // ISO 8601
  | { kind: 'count'; n: number };

export interface Timing {
  mode: TimingMode;
  frequency?: Frequency;     // required when mode === 'scheduled'
  startAt?: string;          // ISO 8601 — first occurrence; falls back to anchor
  end?: EndCondition;        // only meaningful when mode === 'scheduled'; default 'indefinite'
  condition?: string;        // only meaningful when mode === 'conditional'
}

export interface VitalsMonitoringItem {
  id: ItemId; type: 'vitals_monitoring';
  parameter: 'BP' | 'pulse' | 'temp' | 'spo2' | 'bz';
  timing: Timing;
  min?: number; max?: number;
  actionLow?: string; actionHigh?: string;
}

export interface MedicationItem {
  id: ItemId; type: 'medication';
  medicationRef: string;
  dose: string;
  route: 'po' | 'iv' | 'sc' | 'im';
  timing: Timing;
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
  durationH: number;          // bag run duration; not a scheduling concept
  timing: Timing;
}

export interface LabItem {
  id: ItemId; type: 'lab';
  panel: string[];
  timing: Timing;
  thresholds?: Array<{ param: string; op: '<' | '>'; value: number; action: string }>;
}

export type TaskSubtype =
  | 'generic'
  | 'positioning'
  | 'drainage'
  | 'nutrition'
  | 'wound_care'
  | 'mobilization'
  | 'note';

export interface TaskItem {
  id: ItemId;
  type: 'task';
  subtype: TaskSubtype;
  title: string;
  timing: Timing;
  actionHint?: string;
  note?: string;
}

export interface BzSlidingScaleItem {
  id: ItemId; type: 'bz_sliding_scale';
  drug: string;
  timing: Timing;
  rules: Array<{ above: number; units: number }>;
  increment?: { per: number; units: number };
}

export type PostopOrderItem =
  | VitalsMonitoringItem
  | MedicationItem
  | IvFluidItem
  | LabItem
  | TaskItem
  | BzSlidingScaleItem;

export type PostopOrderItemType = PostopOrderItem['type'];

export const SCHEDULABLE_ITEM_TYPES: ReadonlySet<PostopOrderItemType> = new Set([
  'medication', 'iv_fluid', 'lab', 'task',
  'vitals_monitoring', 'bz_sliding_scale',
]);

export function isItemType<T extends PostopOrderItemType>(
  item: PostopOrderItem, type: T,
): item is Extract<PostopOrderItem, { type: T }> {
  return item.type === type;
}

export const ALLOWED_MODES_BY_TYPE: Record<PostopOrderItemType, TimingMode[]> = {
  medication:        ['scheduled', 'one_shot', 'ad_hoc', 'conditional'],
  iv_fluid:          ['scheduled', 'one_shot'],
  lab:               ['scheduled', 'one_shot'],
  task:              ['scheduled', 'one_shot', 'ad_hoc', 'conditional'],
  vitals_monitoring: ['scheduled'],
  bz_sliding_scale:  ['scheduled'],
};

export function createEmptyItem(type: PostopOrderItemType, id: ItemId): PostopOrderItem {
  switch (type) {
    case 'vitals_monitoring':
      return { id, type, parameter: 'BP', timing: { mode: 'scheduled', frequency: 'q1h' } };
    case 'medication':
      return { id, type, medicationRef: '', dose: '', route: 'po', timing: { mode: 'scheduled' } };
    case 'iv_fluid':
      return { id, type, solution: 'ringer_lactate', volumeMl: 1000, durationH: 12, timing: { mode: 'one_shot' } };
    case 'lab':
      return { id, type, panel: [], timing: { mode: 'one_shot' } };
    case 'task':
      return { id, type, subtype: 'generic', title: '', timing: { mode: 'one_shot' } };
    case 'bz_sliding_scale':
      return { id, type, drug: 'Actrapid', rules: [{ above: 120, units: 2 }], timing: { mode: 'scheduled', frequency: 'q4h' } };
  }
}
