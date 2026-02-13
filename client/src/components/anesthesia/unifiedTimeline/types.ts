import type { EventComment, AnesthesiaTimeMarker } from "@/hooks/useEventState";

export type { EventComment, AnesthesiaTimeMarker };

export type VitalPoint = [number, number]; // [timestamp(ms), value]

export type TimelineVitals = {
  hr?: VitalPoint[];
  sysBP?: VitalPoint[];
  diaBP?: VitalPoint[];
  spo2?: VitalPoint[];
};

export type TimelineEvent = {
  time: number; // ms
  swimlane: string; // Now flexible - any swimlane id
  label: string;
  icon?: string;
  color?: string;
  duration?: number; // ms - for range items like infusions
  row?: number; // for multiple medication rows
};

export type InfusionSegment = {
  id: string;
  startTime: number; // ms
  rateValue: string; // e.g., "100ml/h", "5µg/kg/min", or "" for free-flow
  rateUnit?: string;
  note?: string;
  setBy?: string; // user who set this rate
  endTime: number | null; // null if ongoing
};

export type InfusionSession = {
  id: string;
  swimlaneId: string;
  drugName: string; // e.g., "Propofol 1%"
  startedBy?: string;
  startTime: number; // ms
  isFreeFlow: boolean; // true = dashed line, false = solid line
  segments: InfusionSegment[]; // rate changes over time
  stopTime: number | null; // null if still running
  stoppedBy?: string;
};

export type UnifiedTimelineData = {
  startTime: number;
  endTime: number;
  vitals: TimelineVitals;
  events: TimelineEvent[];
  medications?: any[]; // Raw medication records from API
  apiEvents?: any[]; // Raw event records from API (renamed to avoid conflict with timeline events)
  isHistoricalData?: boolean; // True if vitals data is older than 1 hour - used for viewport centering
};

export type SwimlaneConfig = {
  id: string;
  label: string;
  height: number;
  colorLight: string;
  colorDark: string;
  rateUnit?: string | null;
  defaultDose?: string | null;
  administrationUnit?: string | null;
  ampuleTotalContent?: string | null;
  itemId?: string;
  hierarchyLevel?: 'parent' | 'group' | 'item' | 'entry';
};

export type AnesthesiaItem = {
  id: string;
  medicationConfigId?: string;
  name: string;
  administrationUnit?: string;
  administrationRoute?: string;
  ampuleConcentration?: string;
  ampuleTotalContent?: string;
  medicationGroup?: string;
  rateUnit?: string | null;
  administrationGroup?: string;
  defaultDose?: string | null;
  medicationSortOrder?: number | null;
  onDemandOnly?: boolean | null;
};

export type AdministrationGroup = {
  id: string;
  name: string;
  hospitalId: string;
  sortOrder: number;
  createdAt: string;
};

export interface ChartExportResult {
  image: string;
  width: number;
  height: number;
}

export interface SwimlaneExportResult {
  vitals: ChartExportResult | null;
  medications: ChartExportResult | null;
  ventilation: ChartExportResult | null;
  others: ChartExportResult | null;
  timeRange: { start: number; end: number };
}

export interface UnifiedTimelineRef {
  getChartImage: () => Promise<string | null>;
  exportForPdf: () => Promise<ChartExportResult | null>;
  exportSwimlanesForPdf: () => Promise<SwimlaneExportResult | null>;
}
