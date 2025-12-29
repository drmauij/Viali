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

export interface BISPoint {
  id: string;
  timestamp: number;
  value: number;
}

export interface TOFPoint {
  id: string;
  timestamp: number;
  value: string; // Fraction value (e.g., "0/4", "1/4", "2/4", "3/4", "4/4")
  percentage?: number; // Optional T4/T1 ratio percentage
}

export interface VASPoint {
  id: string;
  timestamp: number;
  value: number; // Pain level 0-10
}

export interface AldreteScore {
  activity: number; // 0-2
  respiration: number; // 0-2
  circulation: number; // 0-2
  consciousness: number; // 0-2
  oxygenSaturation: number; // 0-2
}

export interface PARSAPScore {
  vitals: number; // 0-2
  ambulation: number; // 0-2
  nauseaVomiting: number; // 0-2
  pain: number; // 0-2
  surgicalBleeding: number; // 0-2
}

export interface ScorePoint {
  id: string;
  timestamp: number;
  scoreType: 'aldrete' | 'parsap';
  totalScore: number;
  aldreteScore?: AldreteScore;
  parsapScore?: PARSAPScore;
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
  eventType?: string | null; // Type for common events (team_timeout, intubation, etc.)
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
  bisData: BISPoint[];
  tofData: TOFPoint[];
  vasData: VASPoint[];
  scoresData: ScorePoint[];
  eventComments: EventComment[];
  timeMarkers: AnesthesiaTimeMarker[];
  setHeartRhythmData: React.Dispatch<React.SetStateAction<HeartRhythmPoint[]>>;
  setStaffData: React.Dispatch<React.SetStateAction<StaffData>>;
  setPositionData: React.Dispatch<React.SetStateAction<PositionPoint[]>>;
  setBisData: React.Dispatch<React.SetStateAction<BISPoint[]>>;
  setTofData: React.Dispatch<React.SetStateAction<TOFPoint[]>>;
  setVasData: React.Dispatch<React.SetStateAction<VASPoint[]>>;
  setScoresData: React.Dispatch<React.SetStateAction<ScorePoint[]>>;
  setEventComments: React.Dispatch<React.SetStateAction<EventComment[]>>;
  setTimeMarkers: React.Dispatch<React.SetStateAction<AnesthesiaTimeMarker[]>>;
  addHeartRhythm: (point: HeartRhythmPoint) => void;
  addStaffEntry: (role: keyof StaffData, point: StaffPoint) => void;
  addPosition: (point: PositionPoint) => void;
  addBIS: (point: BISPoint) => void;
  addTOF: (point: TOFPoint) => void;
  addVAS: (point: VASPoint) => void;
  addScore: (point: ScorePoint) => void;
  addEvent: (comment: EventComment) => void;
  resetEventData: (data: {
    heartRhythm?: HeartRhythmPoint[];
    staff?: StaffData;
    position?: PositionPoint[];
    bis?: BISPoint[];
    tof?: TOFPoint[];
    vas?: VASPoint[];
    scores?: ScorePoint[];
    events?: EventComment[];
    timeMarkers?: AnesthesiaTimeMarker[];
  }) => void;
}

export function useEventState(initialData?: {
  heartRhythm?: HeartRhythmPoint[];
  staff?: StaffData;
  position?: PositionPoint[];
  bis?: BISPoint[];
  tof?: TOFPoint[];
  vas?: VASPoint[];
  scores?: ScorePoint[];
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

  const [bisData, setBisData] = useState<BISPoint[]>(
    initialData?.bis || []
  );

  const [tofData, setTofData] = useState<TOFPoint[]>(
    initialData?.tof || []
  );

  const [vasData, setVasData] = useState<VASPoint[]>(
    initialData?.vas || []
  );

  const [scoresData, setScoresData] = useState<ScorePoint[]>(
    initialData?.scores || []
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

  const addBIS = useCallback((point: BISPoint) => {
    setBisData(prev => [...prev, point]);
  }, []);

  const addTOF = useCallback((point: TOFPoint) => {
    setTofData(prev => [...prev, point]);
  }, []);

  const addVAS = useCallback((point: VASPoint) => {
    setVasData(prev => [...prev, point]);
  }, []);

  const addScore = useCallback((point: ScorePoint) => {
    setScoresData(prev => [...prev, point]);
  }, []);

  const addEvent = useCallback((comment: EventComment) => {
    setEventComments(prev => [...prev, comment]);
  }, []);

  const resetEventData = useCallback((data: {
    heartRhythm?: HeartRhythmPoint[];
    staff?: StaffData;
    position?: PositionPoint[];
    bis?: BISPoint[];
    tof?: TOFPoint[];
    vas?: VASPoint[];
    scores?: ScorePoint[];
    events?: EventComment[];
    timeMarkers?: AnesthesiaTimeMarker[];
  }) => {
    if (data.heartRhythm !== undefined) setHeartRhythmData(data.heartRhythm);
    if (data.staff !== undefined) setStaffData(data.staff);
    if (data.position !== undefined) setPositionData(data.position);
    if (data.bis !== undefined) setBisData(data.bis);
    if (data.tof !== undefined) setTofData(data.tof);
    if (data.vas !== undefined) setVasData(data.vas);
    if (data.scores !== undefined) setScoresData(data.scores);
    if (data.events !== undefined) setEventComments(data.events);
    if (data.timeMarkers !== undefined) setTimeMarkers(data.timeMarkers);
  }, []);

  return {
    heartRhythmData,
    staffData,
    positionData,
    bisData,
    tofData,
    vasData,
    scoresData,
    eventComments,
    timeMarkers,
    setHeartRhythmData,
    setStaffData,
    setPositionData,
    setBisData,
    setTofData,
    setVasData,
    setScoresData,
    setEventComments,
    setTimeMarkers,
    addHeartRhythm,
    addStaffEntry,
    addPosition,
    addBIS,
    addTOF,
    addVAS,
    addScore,
    addEvent,
    resetEventData,
  };
}
