import { useState, useCallback } from 'react';

export type EventPoint = [number, string]; // [timestamp, value] - DEPRECATED, use specific types below

export interface HeartRhythmPoint {
  id: string;
  timestamp: number;
  value: string;
}

export interface StaffPoint {
  id: string;
  timestamp: number;
  name: string;
}

export interface PositionPoint {
  id: string;
  timestamp: number;
  position: string;
}

export interface StaffData {
  doctor: StaffPoint[];
  nurse: StaffPoint[];
  assistant: StaffPoint[];
}

export interface EventComment {
  id: string;
  time: number;
  text: string;
  anesthesiaRecordId?: number; // Optional for new comments
}

export interface AnesthesiaTimeMarker {
  id: string;
  code: string; // A1, X1, F, etc.
  label: string;
  color: string;
  bgColor: string;
  time: number | null; // null if not yet placed
}

export interface UseEventStateReturn {
  heartRhythmData: HeartRhythmPoint[];
  staffData: StaffData;
  positionData: PositionPoint[];
  eventComments: EventComment[];
  timeMarkers: AnesthesiaTimeMarker[];
  setHeartRhythmData: React.Dispatch<React.SetStateAction<HeartRhythmPoint[]>>;
  setStaffData: React.Dispatch<React.SetStateAction<StaffData>>;
  setPositionData: React.Dispatch<React.SetStateAction<PositionPoint[]>>;
  setEventComments: React.Dispatch<React.SetStateAction<EventComment[]>>;
  setTimeMarkers: React.Dispatch<React.SetStateAction<AnesthesiaTimeMarker[]>>;
  addHeartRhythm: (point: HeartRhythmPoint) => void;
  addStaffEntry: (role: keyof StaffData, point: StaffPoint) => void;
  addPosition: (point: PositionPoint) => void;
  addEvent: (comment: EventComment) => void;
  resetEventData: (data: {
    heartRhythm?: HeartRhythmPoint[];
    staff?: StaffData;
    position?: PositionPoint[];
    events?: EventComment[];
    timeMarkers?: AnesthesiaTimeMarker[];
  }) => void;
}

export function useEventState(initialData?: {
  heartRhythm?: HeartRhythmPoint[];
  staff?: StaffData;
  position?: PositionPoint[];
  events?: EventComment[];
  timeMarkers?: AnesthesiaTimeMarker[];
}): UseEventStateReturn {
  const [heartRhythmData, setHeartRhythmData] = useState<HeartRhythmPoint[]>(
    initialData?.heartRhythm || []
  );

  const [staffData, setStaffData] = useState<StaffData>(
    initialData?.staff || {
      doctor: [],
      nurse: [],
      assistant: [],
    }
  );

  const [positionData, setPositionData] = useState<PositionPoint[]>(
    initialData?.position || []
  );

  const [eventComments, setEventComments] = useState<EventComment[]>(
    initialData?.events || []
  );

  const [timeMarkers, setTimeMarkers] = useState<AnesthesiaTimeMarker[]>(
    initialData?.timeMarkers || []
  );

  const addHeartRhythm = useCallback((point: HeartRhythmPoint) => {
    setHeartRhythmData(prev => [...prev, point]);
  }, []);

  const addStaffEntry = useCallback((role: keyof StaffData, point: StaffPoint) => {
    setStaffData(prev => ({
      ...prev,
      [role]: [...prev[role], point]
    }));
  }, []);

  const addPosition = useCallback((point: PositionPoint) => {
    setPositionData(prev => [...prev, point]);
  }, []);

  const addEvent = useCallback((comment: EventComment) => {
    setEventComments(prev => [...prev, comment]);
  }, []);

  const resetEventData = useCallback((data: {
    heartRhythm?: HeartRhythmPoint[];
    staff?: StaffData;
    position?: PositionPoint[];
    events?: EventComment[];
    timeMarkers?: AnesthesiaTimeMarker[];
  }) => {
    if (data.heartRhythm !== undefined) setHeartRhythmData(data.heartRhythm);
    if (data.staff !== undefined) setStaffData(data.staff);
    if (data.position !== undefined) setPositionData(data.position);
    if (data.events !== undefined) setEventComments(data.events);
    if (data.timeMarkers !== undefined) setTimeMarkers(data.timeMarkers);
  }, []);

  return {
    heartRhythmData,
    staffData,
    positionData,
    eventComments,
    timeMarkers,
    setHeartRhythmData,
    setStaffData,
    setPositionData,
    setEventComments,
    setTimeMarkers,
    addHeartRhythm,
    addStaffEntry,
    addPosition,
    addEvent,
    resetEventData,
  };
}
