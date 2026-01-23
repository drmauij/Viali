import type { AnesthesiaTimeMarker } from "./types";

export const ANESTHESIA_TIME_MARKERS: Omit<AnesthesiaTimeMarker, 'time'>[] = [
  { id: 'A1', code: 'A1', label: 'Anesthesia Presence Start', color: '#FFFFFF', bgColor: '#EF4444' },
  { id: 'E', code: 'E', label: 'OR Entrance', color: '#FFFFFF', bgColor: '#10B981' },
  { id: 'X1', code: 'X1', label: 'Anesthesia Start', color: '#FFFFFF', bgColor: '#F97316' },
  { id: 'I', code: 'I', label: 'End of Induction', color: '#FFFFFF', bgColor: '#F59E0B' },
  { id: 'L', code: 'L', label: 'Patient Positioning', color: '#FFFFFF', bgColor: '#3B82F6' },
  { id: 'B1', code: 'B1', label: 'Surgical Measures Start', color: '#000000', bgColor: '#06B6D4' },
  { id: 'O1', code: 'O1', label: 'Surgical Incision', color: '#FFFFFF', bgColor: '#8B5CF6' },
  { id: 'O2', code: 'O2', label: 'Surgical Suture', color: '#FFFFFF', bgColor: '#8B5CF6' },
  { id: 'B2', code: 'B2', label: 'Surgical Measures End', color: '#000000', bgColor: '#06B6D4' },
  { id: 'X2', code: 'X2', label: 'Anesthesia End', color: '#FFFFFF', bgColor: '#F97316' },
  { id: 'X', code: 'X', label: 'OR Exit', color: '#FFFFFF', bgColor: '#10B981' },
  { id: 'A2', code: 'A2', label: 'Anesthesia Presence End', color: '#FFFFFF', bgColor: '#EF4444' },
  { id: 'P', code: 'P', label: 'PACU End', color: '#FFFFFF', bgColor: '#EC4899' },
];

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const THIRTY_MINUTES_MS = 30 * 60 * 1000;
