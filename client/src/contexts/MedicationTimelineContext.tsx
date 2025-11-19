import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect } from 'react';
import type { AnesthesiaMedication } from '@shared/schema';
import {
  buildItemToSwimlaneMap,
  transformMedicationDoses,
  transformRateInfusions,
  transformFreeFlowInfusions,
} from '@/services/timelineTransform';
import type {
  MedicationDoseData,
  InfusionData,
  RateInfusionSessions,
  FreeFlowSessions,
  MedicationDosePoint,
  RateInfusionSession,
  FreeFlowSession,
} from '@/hooks/useMedicationState';

// State shape
interface MedicationTimelineState {
  doses: MedicationDoseData;
  infusions: InfusionData;
  rateSessions: RateInfusionSessions;
  freeFlowSessions: FreeFlowSessions;
  isInitialized: boolean;
}

// Action types
type MedicationTimelineAction =
  | { type: 'SYNC_FROM_QUERY'; payload: { doses: MedicationDoseData; rateSessions: RateInfusionSessions; freeFlowSessions: FreeFlowSessions } }
  | { type: 'ADD_BOLUS'; payload: { swimlaneId: string; dose: MedicationDosePoint } }
  | { type: 'UPDATE_BOLUS'; payload: { swimlaneId: string; index: number; dose: MedicationDosePoint } }
  | { type: 'DELETE_BOLUS'; payload: { swimlaneId: string; index: number } }
  | { type: 'START_RATE_INFUSION'; payload: { swimlaneId: string; session: RateInfusionSession } }
  | { type: 'UPDATE_RATE_INFUSION'; payload: { swimlaneId: string; sessionIndex: number; session: Partial<RateInfusionSession> } }
  | { type: 'STOP_RATE_INFUSION'; payload: { swimlaneId: string; sessionIndex: number; endTime: number } }
  | { type: 'START_FREE_FLOW'; payload: { swimlaneId: string; session: FreeFlowSession } }
  | { type: 'UPDATE_FREE_FLOW'; payload: { swimlaneId: string; sessionIndex: number; session: Partial<FreeFlowSession> } }
  | { type: 'RESET'; payload?: { doses?: MedicationDoseData; rateSessions?: RateInfusionSessions; freeFlowSessions?: FreeFlowSessions } };

// Initial state
const initialState: MedicationTimelineState = {
  doses: {},
  infusions: {},
  rateSessions: {},
  freeFlowSessions: {},
  isInitialized: false,
};

// Reducer
function medicationTimelineReducer(
  state: MedicationTimelineState,
  action: MedicationTimelineAction
): MedicationTimelineState {
  switch (action.type) {
    case 'SYNC_FROM_QUERY':
      return {
        ...state,
        doses: action.payload.doses,
        rateSessions: action.payload.rateSessions,
        freeFlowSessions: action.payload.freeFlowSessions,
        isInitialized: true,
      };

    case 'ADD_BOLUS':
      return {
        ...state,
        doses: {
          ...state.doses,
          [action.payload.swimlaneId]: [
            ...(state.doses[action.payload.swimlaneId] || []),
            action.payload.dose,
          ],
        },
      };

    case 'UPDATE_BOLUS':
      return {
        ...state,
        doses: {
          ...state.doses,
          [action.payload.swimlaneId]: state.doses[action.payload.swimlaneId]?.map((dose, idx) =>
            idx === action.payload.index ? action.payload.dose : dose
          ) || [],
        },
      };

    case 'DELETE_BOLUS':
      return {
        ...state,
        doses: {
          ...state.doses,
          [action.payload.swimlaneId]: state.doses[action.payload.swimlaneId]?.filter(
            (_, idx) => idx !== action.payload.index
          ) || [],
        },
      };

    case 'START_RATE_INFUSION':
      return {
        ...state,
        rateSessions: {
          ...state.rateSessions,
          [action.payload.swimlaneId]: [
            ...(state.rateSessions[action.payload.swimlaneId] || []),
            action.payload.session,
          ],
        },
      };

    case 'UPDATE_RATE_INFUSION':
      return {
        ...state,
        rateSessions: {
          ...state.rateSessions,
          [action.payload.swimlaneId]: state.rateSessions[action.payload.swimlaneId]?.map((session, idx) =>
            idx === action.payload.sessionIndex
              ? { ...session, ...action.payload.session }
              : session
          ) || [],
        },
      };

    case 'STOP_RATE_INFUSION':
      return {
        ...state,
        rateSessions: {
          ...state.rateSessions,
          [action.payload.swimlaneId]: state.rateSessions[action.payload.swimlaneId]?.map((session, idx) =>
            idx === action.payload.sessionIndex
              ? { ...session, state: 'stopped' as const, endTime: action.payload.endTime }
              : session
          ) || [],
        },
      };

    case 'START_FREE_FLOW':
      return {
        ...state,
        freeFlowSessions: {
          ...state.freeFlowSessions,
          [action.payload.swimlaneId]: [
            ...(state.freeFlowSessions[action.payload.swimlaneId] || []),
            action.payload.session,
          ],
        },
      };

    case 'UPDATE_FREE_FLOW':
      return {
        ...state,
        freeFlowSessions: {
          ...state.freeFlowSessions,
          [action.payload.swimlaneId]: state.freeFlowSessions[action.payload.swimlaneId]?.map((session, idx) =>
            idx === action.payload.sessionIndex
              ? { ...session, ...action.payload.session }
              : session
          ) || [],
        },
      };

    case 'RESET':
      return {
        ...state,
        doses: action.payload?.doses ?? {},
        rateSessions: action.payload?.rateSessions ?? {},
        freeFlowSessions: action.payload?.freeFlowSessions ?? {},
        isInitialized: false,
      };

    default:
      return state;
  }
}

// Context value type
interface MedicationTimelineContextValue {
  state: MedicationTimelineState;
  dispatch: React.Dispatch<MedicationTimelineAction>;
  // Convenient action creators
  syncFromQuery: (data: { doses: MedicationDoseData; rateSessions: RateInfusionSessions; freeFlowSessions: FreeFlowSessions }) => void;
  addBolus: (swimlaneId: string, dose: MedicationDosePoint) => void;
  updateBolus: (swimlaneId: string, index: number, dose: MedicationDosePoint) => void;
  deleteBolus: (swimlaneId: string, index: number) => void;
  startRateInfusion: (swimlaneId: string, session: RateInfusionSession) => void;
  updateRateInfusion: (swimlaneId: string, sessionIndex: number, session: Partial<RateInfusionSession>) => void;
  stopRateInfusion: (swimlaneId: string, sessionIndex: number, endTime: number) => void;
  startFreeFlow: (swimlaneId: string, session: FreeFlowSession) => void;
  updateFreeFlow: (swimlaneId: string, sessionIndex: number, session: Partial<FreeFlowSession>) => void;
  reset: (data?: { doses?: MedicationDoseData; rateSessions?: RateInfusionSessions; freeFlowSessions?: FreeFlowSessions }) => void;
  // Derived helpers
  getActiveRateSession: (swimlaneId: string) => RateInfusionSession | null;
  getActiveFreeFlowSession: (swimlaneId: string) => FreeFlowSession | null;
}

const MedicationTimelineContext = createContext<MedicationTimelineContextValue | undefined>(undefined);

// Provider props
interface MedicationTimelineProviderProps {
  children: ReactNode;
  rawMedications?: AnesthesiaMedication[];
  anesthesiaItems?: any[];
  administrationGroups?: any[];
}

// Provider component
export function MedicationTimelineProvider({ 
  children,
  rawMedications,
  anesthesiaItems,
  administrationGroups,
}: MedicationTimelineProviderProps) {
  const [state, dispatch] = useReducer(medicationTimelineReducer, initialState);

  // Transform raw medications when data changes
  useEffect(() => {
    if (!rawMedications || !anesthesiaItems || !administrationGroups) {
      return;
    }

    // Build item-to-swimlane mapping
    const itemToSwimlane = buildItemToSwimlaneMap(anesthesiaItems, administrationGroups);

    // Transform medications into consumable formats
    const doses = transformMedicationDoses(rawMedications, itemToSwimlane);
    const rateSessions = transformRateInfusions(rawMedications, itemToSwimlane, anesthesiaItems);
    const freeFlowSessions = transformFreeFlowInfusions(rawMedications, itemToSwimlane, anesthesiaItems);

    // Sync to state
    dispatch({
      type: 'SYNC_FROM_QUERY',
      payload: { doses, rateSessions, freeFlowSessions },
    });
  }, [rawMedications, anesthesiaItems, administrationGroups]);

  // Action creators
  const syncFromQuery = useCallback((data: { doses: MedicationDoseData; rateSessions: RateInfusionSessions; freeFlowSessions: FreeFlowSessions }) => {
    dispatch({ type: 'SYNC_FROM_QUERY', payload: data });
  }, []);

  const addBolus = useCallback((swimlaneId: string, dose: MedicationDosePoint) => {
    dispatch({ type: 'ADD_BOLUS', payload: { swimlaneId, dose } });
  }, []);

  const updateBolus = useCallback((swimlaneId: string, index: number, dose: MedicationDosePoint) => {
    dispatch({ type: 'UPDATE_BOLUS', payload: { swimlaneId, index, dose } });
  }, []);

  const deleteBolus = useCallback((swimlaneId: string, index: number) => {
    dispatch({ type: 'DELETE_BOLUS', payload: { swimlaneId, index } });
  }, []);

  const startRateInfusion = useCallback((swimlaneId: string, session: RateInfusionSession) => {
    dispatch({ type: 'START_RATE_INFUSION', payload: { swimlaneId, session } });
  }, []);

  const updateRateInfusion = useCallback((swimlaneId: string, sessionIndex: number, session: Partial<RateInfusionSession>) => {
    dispatch({ type: 'UPDATE_RATE_INFUSION', payload: { swimlaneId, sessionIndex, session } });
  }, []);

  const stopRateInfusion = useCallback((swimlaneId: string, sessionIndex: number, endTime: number) => {
    dispatch({ type: 'STOP_RATE_INFUSION', payload: { swimlaneId, sessionIndex, endTime } });
  }, []);

  const startFreeFlow = useCallback((swimlaneId: string, session: FreeFlowSession) => {
    dispatch({ type: 'START_FREE_FLOW', payload: { swimlaneId, session } });
  }, []);

  const updateFreeFlow = useCallback((swimlaneId: string, sessionIndex: number, session: Partial<FreeFlowSession>) => {
    dispatch({ type: 'UPDATE_FREE_FLOW', payload: { swimlaneId, sessionIndex, session } });
  }, []);

  const reset = useCallback((data?: { doses?: MedicationDoseData; rateSessions?: RateInfusionSessions; freeFlowSessions?: FreeFlowSessions }) => {
    dispatch({ type: 'RESET', payload: data });
  }, []);

  // Derived helpers
  const getActiveRateSession = useCallback((swimlaneId: string): RateInfusionSession | null => {
    const sessions = state.rateSessions[swimlaneId];
    if (!sessions || sessions.length === 0) return null;
    
    // Prefer running session, otherwise most recent
    const runningSession = sessions.find(s => s.state === 'running');
    return runningSession || sessions[sessions.length - 1];
  }, [state.rateSessions]);

  const getActiveFreeFlowSession = useCallback((swimlaneId: string): FreeFlowSession | null => {
    const sessions = state.freeFlowSessions[swimlaneId];
    if (!sessions || sessions.length === 0) return null;
    
    // Return most recent session
    return sessions[sessions.length - 1];
  }, [state.freeFlowSessions]);

  const value: MedicationTimelineContextValue = {
    state,
    dispatch,
    syncFromQuery,
    addBolus,
    updateBolus,
    deleteBolus,
    startRateInfusion,
    updateRateInfusion,
    stopRateInfusion,
    startFreeFlow,
    updateFreeFlow,
    reset,
    getActiveRateSession,
    getActiveFreeFlowSession,
  };

  return (
    <MedicationTimelineContext.Provider value={value}>
      {children}
    </MedicationTimelineContext.Provider>
  );
}

// Custom hook to use the context
export function useMedicationTimeline() {
  const context = useContext(MedicationTimelineContext);
  if (context === undefined) {
    throw new Error('useMedicationTimeline must be used within a MedicationTimelineProvider');
  }
  return context;
}
