import { useEffect } from "react";
import type { VitalPointRecord, BPPointRecord } from "@/hooks/useVitalsState";
import type { MedicationDoseData, InfusionData, RateInfusionSessions, FreeFlowSessions } from "@/hooks/useMedicationState";
import type { VentilationData, VentilationModePoint } from "@/hooks/useVentilationState";
import type { OutputData } from "@/hooks/useOutputState";
import type {
  HeartRhythmPoint,
  PositionPoint,
  BISPoint,
  TOFPoint,
  VASPoint,
  ScorePoint,
  EventComment,
  AnesthesiaTimeMarker,
} from "@/hooks/useEventState";
import type { AnesthesiaItem, AdministrationGroup } from "./types";
import {
  buildItemToSwimlaneMap,
  transformMedicationDoses,
  transformRateInfusions,
  transformFreeFlowInfusions,
} from "@/services/timelineTransform";

/**
 * Source data fed into the sync effects.
 * All fields come from React Query or props on UnifiedTimeline.
 */
interface TimelineDataSyncSources {
  /** Vitals records derived from clinical snapshot (via convertToRecordsFormat) */
  vitalsRecords: {
    hr: VitalPointRecord[];
    bp: BPPointRecord[];
    spo2: VitalPointRecord[];
  } | undefined;
  /** Anesthesia record ID — used as dependency for reset-on-switch */
  anesthesiaRecordId: string | undefined;
  /** Raw medication records from data.medications */
  medications: any[] | undefined;
  /** Filtered anesthesia items with administration groups */
  anesthesiaItems: AnesthesiaItem[];
  /** Administration groups from API */
  administrationGroups: AdministrationGroup[];
  /** Full anesthesia record (for time markers) */
  anesthesiaRecord: any;
  /** Clinical snapshot from React Query */
  clinicalSnapshot: any;
  /** Positions from separate API query */
  apiPositions: any[];
  /** Events from separate API query */
  apiEvents: any[];
}

/**
 * State setters that the sync effects write to.
 * These come from useMedicationState, useVitalsState, useVentilationState,
 * useEventState, and useOutputState hooks.
 */
interface TimelineDataSyncSetters {
  resetVitalsData: (vitals: {
    hr?: VitalPointRecord[];
    bp?: BPPointRecord[];
    spo2?: VitalPointRecord[];
  }) => void;
  resetMedicationData: ((data: {
    doses?: MedicationDoseData;
    infusions?: InfusionData;
    rateSessions?: RateInfusionSessions;
    freeFlowSessions?: FreeFlowSessions;
  }) => void) | undefined;
  setTimeMarkers: React.Dispatch<React.SetStateAction<AnesthesiaTimeMarker[]>>;
  setHeartRhythmData: React.Dispatch<React.SetStateAction<HeartRhythmPoint[]>>;
  setBisData: React.Dispatch<React.SetStateAction<BISPoint[]>>;
  setTofData: React.Dispatch<React.SetStateAction<TOFPoint[]>>;
  setVasData: React.Dispatch<React.SetStateAction<VASPoint[]>>;
  setScoresData: React.Dispatch<React.SetStateAction<ScorePoint[]>>;
  setVentilationModeData: React.Dispatch<React.SetStateAction<VentilationModePoint[]>>;
  setVentilationData: React.Dispatch<React.SetStateAction<VentilationData>>;
  setOutputData: React.Dispatch<React.SetStateAction<OutputData>>;
  setUrineMode: React.Dispatch<React.SetStateAction<import('@/hooks/useOutputState').UrineMode>>;
  setPositionData: React.Dispatch<React.SetStateAction<PositionPoint[]>>;
  setEventComments: React.Dispatch<React.SetStateAction<EventComment[]>>;
}

/**
 * Custom hook that contains all data syncing useEffect blocks from UnifiedTimeline.
 *
 * These effects sync data from React Query (clinical snapshot, medications API data)
 * into local state hooks (vitals, medications, ventilation, events, output, positions,
 * heart rhythm, BIS, TOF, VAS, scores). They are pure data transformation effects.
 */
export function useTimelineDataSync(
  sources: TimelineDataSyncSources,
  setters: TimelineDataSyncSetters,
) {
  const {
    vitalsRecords,
    anesthesiaRecordId,
    medications,
    anesthesiaItems,
    administrationGroups,
    anesthesiaRecord,
    clinicalSnapshot,
    apiPositions,
    apiEvents,
  } = sources;

  const {
    resetVitalsData,
    resetMedicationData,
    setTimeMarkers,
    setHeartRhythmData,
    setBisData,
    setTofData,
    setVasData,
    setScoresData,
    setVentilationModeData,
    setVentilationData,
    setOutputData,
    setUrineMode,
    setPositionData,
    setEventComments,
  } = setters;

  // Sync React Query snapshot into local vitals state
  // React Query is the single source of truth - local state is just a view layer for ECharts
  useEffect(() => {
    if (!vitalsRecords) return;

    console.log('[VITALS-SYNC] Syncing vitals from React Query to local state', {
      recordId: anesthesiaRecordId,
      hrCount: vitalsRecords.hr.length,
      bpCount: vitalsRecords.bp.length,
      spo2Count: vitalsRecords.spo2.length
    });

    // Always sync from React Query - it's the source of truth
    // This ensures optimistic updates from mutations propagate to the UI
    resetVitalsData({
      hr: vitalsRecords.hr,
      bp: vitalsRecords.bp,
      spo2: vitalsRecords.spo2
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitalsRecords, anesthesiaRecordId]);

  // Auto-load medications from API data - React Query is the single source of truth
  // Always sync when data.medications changes (after mutations, cache invalidation, or record switch)
  useEffect(() => {
    // Guard against React StrictMode timing issue
    // resetMedicationData can be undefined during first render due to StrictMode double-render
    if (!resetMedicationData) {
      return;
    }

    // Skip if items not loaded yet
    if (!anesthesiaItems || anesthesiaItems.length === 0) {
      return;
    }
    if (!medications) {
      return;
    }

    // Build item-to-swimlane mapping
    const itemToSwimlane = buildItemToSwimlaneMap(anesthesiaItems, administrationGroups);

    // Transform and load medication doses (boluses) - will be empty array if no data
    const doses = transformMedicationDoses(medications || [], itemToSwimlane);

    // Transform and load rate infusion sessions
    const rateSessions = transformRateInfusions(medications || [], itemToSwimlane, anesthesiaItems);

    // Transform and load free-flow infusion sessions
    const freeFlowSessionsData = transformFreeFlowInfusions(medications || [], itemToSwimlane, anesthesiaItems);

    // Reset medication data using hook
    resetMedicationData({
      doses,
      rateSessions,
      freeFlowSessions: freeFlowSessionsData,
    });

    // Note: Events are already handled via data.events prop for timeline rendering
    // No need to process data.apiEvents separately for now
  }, [medications, anesthesiaItems, administrationGroups, anesthesiaRecordId, resetMedicationData]);

  // Load time markers from database when anesthesia record is fetched
  useEffect(() => {
    if (anesthesiaRecord?.timeMarkers && Array.isArray(anesthesiaRecord.timeMarkers)) {
      console.log('[TIME_MARKERS] Loading from database:', anesthesiaRecord.timeMarkers);
      setTimeMarkers(anesthesiaRecord.timeMarkers);
    }
  }, [anesthesiaRecord, setTimeMarkers]);

  // Sync heart rhythm data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;
    const heartRhythm = snapshotData?.heartRhythm || [];

    if (heartRhythm.length > 0) {
      console.log('[RHYTHM-SYNC] Loading heart rhythm from snapshot:', heartRhythm.length, 'points');
      // Store as objects with ID to enable proper CRUD operations
      const rhythmEntries = heartRhythm.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setHeartRhythmData(rhythmEntries);
    } else {
      // Clear stale state when switching to record with no data
      setHeartRhythmData([]);
    }
  }, [clinicalSnapshot, setHeartRhythmData]);

  // Sync BIS data from clinical snapshot
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;
    const bis = snapshotData?.bis || [];

    if (bis.length > 0) {
      console.log('[BIS-SYNC] Loading BIS from snapshot:', bis.length, 'points');
      const bisEntries = bis.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setBisData(bisEntries);
    } else {
      setBisData([]);
    }
  }, [clinicalSnapshot, setBisData]);

  // Sync TOF data from clinical snapshot
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;
    const tof = snapshotData?.tof || [];

    if (tof.length > 0) {
      console.log('[TOF-SYNC] Loading TOF from snapshot:', tof.length, 'points');
      const tofEntries = tof.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
        percentage: point.percentage,
      }));
      setTofData(tofEntries);
    } else {
      setTofData([]);
    }
  }, [clinicalSnapshot, setTofData]);

  // Sync VAS data from clinical snapshot (PACU mode)
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;
    const vas = snapshotData?.vas || [];

    if (vas.length > 0) {
      console.log('[VAS-SYNC] Loading VAS from snapshot:', vas.length, 'points');
      const vasEntries = vas.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setVasData(vasEntries);
    } else {
      setVasData([]);
    }
  }, [clinicalSnapshot, setVasData]);

  // Sync Scores data from clinical snapshot (PACU mode)
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;
    const scores = snapshotData?.scores || [];

    if (scores.length > 0) {
      console.log('[SCORES-SYNC] Loading Scores from snapshot:', scores.length, 'points');
      const scoresEntries = scores.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        scoreType: point.scoreType,
        totalScore: point.totalScore,
        aldreteScore: point.aldreteScore,
        parsapScore: point.parsapScore,
      }));
      setScoresData(scoresEntries);
    } else {
      setScoresData([]);
    }
  }, [clinicalSnapshot, setScoresData]);

  // Sync ventilation mode data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;
    const ventilationModes = snapshotData?.ventilationModes || [];

    if (ventilationModes.length > 0) {
      console.log('[VENT-MODE-SYNC] Loading ventilation modes from snapshot:', ventilationModes.length, 'points');
      // Store as objects with ID to enable proper CRUD operations
      const modeEntries = ventilationModes.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setVentilationModeData(modeEntries);
    } else {
      // Clear stale state when switching to record with no data
      setVentilationModeData([]);
    }
  }, [clinicalSnapshot, setVentilationModeData]);

  // Sync ventilation parameter data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;
    console.log('[VENT-PARAMS-SYNC] Snapshot data keys:', snapshotData ? Object.keys(snapshotData) : 'null');
    console.log('[VENT-PARAMS-SYNC] Raw pip:', snapshotData?.pip);
    console.log('[VENT-PARAMS-SYNC] Raw peep:', snapshotData?.peep);
    console.log('[VENT-PARAMS-SYNC] Raw etco2:', snapshotData?.etco2);

    // Extract all ventilation parameters
    const ventParams = {
      etCO2: snapshotData?.etco2 || [],
      pip: snapshotData?.pip || [],
      peep: snapshotData?.peep || [],
      tidalVolume: snapshotData?.tidalVolume || [],
      respiratoryRate: snapshotData?.respiratoryRate || [],
      minuteVolume: snapshotData?.minuteVolume || [],
      fiO2: snapshotData?.fio2 || [],
      sevofluranInsp: (snapshotData as any)?.sevofluranInsp || [],
      sevofluranExp: (snapshotData as any)?.sevofluranExp || [],
      desfluranInsp: (snapshotData as any)?.desfluranInsp || [],
      desfluranExp: (snapshotData as any)?.desfluranExp || [],
      mac: (snapshotData as any)?.mac || [],
    };

    const totalPoints = Object.values(ventParams).reduce((sum, arr) => sum + arr.length, 0);
    console.log('[VENT-PARAMS-SYNC] Total ventilation points:', totalPoints);

    // Build complete ventData object with all keys (including empty arrays)
    // to ensure proper state structure when calling setVentilationData
    const ventData = {
      etCO2: ventParams.etCO2.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      pip: ventParams.pip.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      peep: ventParams.peep.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      tidalVolume: ventParams.tidalVolume.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      respiratoryRate: ventParams.respiratoryRate.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      minuteVolume: ventParams.minuteVolume.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      fiO2: ventParams.fiO2.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      sevofluranInsp: ventParams.sevofluranInsp.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      sevofluranExp: ventParams.sevofluranExp.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      desfluranInsp: ventParams.desfluranInsp.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      desfluranExp: ventParams.desfluranExp.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      mac: ventParams.mac.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
    };

    console.log('[VENT-PARAMS-SYNC] Total points:', totalPoints, 'Setting ventilationData:', ventData);
    setVentilationData(ventData);
  }, [clinicalSnapshot, setVentilationData]);

  // Sync output data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;

    const snapshotData = clinicalSnapshot?.data;

    // Extract all output parameters
    const outputParams = {
      urine: snapshotData?.urine || [],
      blood: snapshotData?.blood || [],
      gastricTube: snapshotData?.gastricTube || [],
      drainage: snapshotData?.drainage || [],
      vomit: snapshotData?.vomit || [],
    };

    const totalPoints = Object.values(outputParams).reduce((sum, arr) => sum + arr.length, 0);

    if (totalPoints > 0) {
      console.log('[OUTPUT-SYNC] Loading output data from snapshot:', totalPoints, 'points');
      const outputDataEntries: any = {};

      for (const [key, points] of Object.entries(outputParams)) {
        if (points.length > 0) {
          // Store as objects with ID to enable proper CRUD operations
          outputDataEntries[key] = points.map((point: any) => ({
            id: point.id,
            timestamp: new Date(point.timestamp).getTime(),
            value: point.value,
          }));
        }
      }

      setOutputData(outputDataEntries);
    } else {
      // Clear stale state when switching to record with no data
      setOutputData({ urine: [], blood: [], gastricTube: [], drainage: [], vomit: [] });
    }

    // Sync urineMode from snapshot metadata
    const storedUrineMode = (snapshotData as any)?.urineMode;
    if (storedUrineMode === 'partial' || storedUrineMode === 'total') {
      setUrineMode(storedUrineMode);
    } else {
      setUrineMode('partial'); // default to urometer (incremental)
    }
  }, [clinicalSnapshot, setOutputData, setUrineMode]);

  // Sync position data from API
  useEffect(() => {
    if (apiPositions.length > 0) {
      console.log('[POSITION-SYNC] Loading positions from API:', apiPositions.length, 'entries');
      // Store as objects with ID to enable proper CRUD operations
      const positionEntries = apiPositions.map((pos: any) => ({
        id: pos.id,
        timestamp: new Date(pos.timestamp).getTime(),
        position: pos.position,
      }));
      setPositionData(positionEntries);
    } else {
      // Clear stale state when switching to record with no data
      setPositionData([]);
    }
  }, [apiPositions, setPositionData]);

  // Sync event comments from API
  useEffect(() => {
    console.log('[EVENTS-SYNC] apiEvents changed:', apiEvents?.length || 0, 'entries', apiEvents);
    if (apiEvents && apiEvents.length > 0) {
      console.log('[EVENTS-SYNC] Loading events from API:', apiEvents.length, 'entries');
      const eventEntries = apiEvents.map((event: any) => ({
        id: event.id,
        time: new Date(event.timestamp).getTime(),
        text: event.description || event.eventType, // Use description as text, fallback to eventType
        eventType: event.eventType, // Include eventType for icon rendering
        anesthesiaRecordId: event.anesthesiaRecordId,
      }));
      console.log('[EVENTS-SYNC] Mapped event entries:', eventEntries);
      setEventComments(eventEntries);
    } else {
      // Clear stale state when switching to record with no data
      console.log('[EVENTS-SYNC] Clearing event comments (no data)');
      setEventComments([]);
    }
  }, [apiEvents, setEventComments]);
}
