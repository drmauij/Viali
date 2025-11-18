import { useState, useCallback } from 'react';

export type EventPoint = [number, string]; // [timestamp, value]

export interface HeartRhythmPoint {
  id: string;
  timestamp: number;
  value: string;
}

export interface StaffData {
  doctor: EventPoint[];
  nurse: EventPoint[];
  assistant: EventPoint[];
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
  positionData: EventPoint[];
  eventComments: EventComment[];
  timeMarkers: AnesthesiaTimeMarker[];
  setHeartRhythmData: React.Dispatch<React.SetStateAction<HeartRhythmPoint[]>>;
  setStaffData: React.Dispatch<React.SetStateAction<StaffData>>;
  setPositionData: React.Dispatch<React.SetStateAction<EventPoint[]>>;
  setEventComments: React.Dispatch<React.SetStateAction<EventComment[]>>;
  setTimeMarkers: React.Dispatch<React.SetStateAction<AnesthesiaTimeMarker[]>>;
  addHeartRhythm: (point: HeartRhythmPoint) => void;
  addStaffEntry: (role: keyof StaffData, point: EventPoint) => void;
  addPosition: (point: EventPoint) => void;
  addEvent: (comment: EventComment) => void;
  resetEventData: (data: {
    heartRhythm?: HeartRhythmPoint[];
    staff?: StaffData;
    position?: EventPoint[];
    events?: EventComment[];
    timeMarkers?: AnesthesiaTimeMarker[];
  }) => void;
}

export function useEventState(initialData?: {
  heartRhythm?: HeartRhythmPoint[];
  staff?: StaffData;
  position?: EventPoint[];
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

  const [positionData, setPositionData] = useState<EventPoint[]>(
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

  const addStaffEntry = useCallback((role: keyof StaffData, point: EventPoint) => {
    setStaffData(prev => ({
      ...prev,
      [role]: [...prev[role], point]
    }));
  }, []);

  const addPosition = useCallback((point: EventPoint) => {
    setPositionData(prev => [...prev, point]);
  }, []);

  const addEvent = useCallback((comment: EventComment) => {
    setEventComments(prev => [...prev, comment]);
  }, []);

  const resetEventData = useCallback((data: {
    heartRhythm?: EventPoint[];
    staff?: StaffData;
    position?: EventPoint[];
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
