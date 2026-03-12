import { useMemo } from "react";
import type { TimelineVitals, TimelineEvent } from "@/components/anesthesia/UnifiedTimeline";

// Extended interface that includes historical data flag
export interface ExtendedTimelineData {
  startTime: number;
  endTime: number;
  vitals: TimelineVitals;
  events: TimelineEvent[];
  medications: any[];
  apiEvents: any[];
  isHistoricalData: boolean; // True if data is older than 1 hour
}

interface UseTimelineDataProps {
  vitalsData: any[];
  eventsData: any[];
  medicationsData: any[];
  isPacuMode: boolean;
  filteredVitalsData: any[];
  filteredMedicationsData: any[];
}

export function useTimelineData({
  vitalsData,
  eventsData,
  medicationsData,
  isPacuMode,
  filteredVitalsData,
  filteredMedicationsData,
}: UseTimelineDataProps): ExtendedTimelineData {
  return useMemo((): ExtendedTimelineData => {
    const dataToUse = isPacuMode ? filteredVitalsData : vitalsData;
    // Always show all medications - don't filter them in PACU mode
    // Medications from surgery should remain visible in PACU view
    const medsToUse = medicationsData;
    
    // Extended future boundary: 1 year in milliseconds (365 days)
    // This allows for long-stay patients (overnight, ward patients) while keeping a practical boundary
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    
    if (!dataToUse || dataToUse.length === 0) {
      const now = new Date().getTime();
      const oneYearFuture = now + ONE_YEAR_MS;

      // Even without vitals, consider medication/event timestamps so the timeline
      // extends back far enough to scroll to existing infusions/medications
      const auxTimestamps: number[] = [];
      if (medsToUse && medsToUse.length > 0) {
        medsToUse.forEach((med: any) => {
          if (med.timestamp) auxTimestamps.push(new Date(med.timestamp).getTime());
          if (med.endTimestamp) auxTimestamps.push(new Date(med.endTimestamp).getTime());
        });
      }
      if (eventsData && eventsData.length > 0) {
        eventsData.forEach((event: any) => {
          if (event.timestamp) auxTimestamps.push(new Date(event.timestamp).getTime());
        });
      }

      const earliestAux = auxTimestamps.length > 0 ? Math.min(...auxTimestamps) : now;
      const sixHoursAgo = now - 6 * 60 * 60 * 1000;
      // Use whichever is earlier: 6h ago or 1h before earliest medication/event
      const startTime = Math.min(sixHoursAgo, earliestAux - 60 * 60 * 1000);

      return {
        startTime,
        endTime: oneYearFuture,
        vitals: {
          sysBP: [],
          diaBP: [],
          hr: [],
          spo2: [],
        },
        events: [],
        medications: medsToUse || [],
        apiEvents: eventsData || [],
        isHistoricalData: false,
      };
    }

    const vitals: Required<TimelineVitals> = {
      sysBP: [],
      diaBP: [],
      hr: [],
      spo2: [],
    };

    dataToUse.forEach((snapshot: any) => {
      const timestamp = new Date(snapshot.timestamp).getTime();
      const data = snapshot.data || {};

      if (data.sysBP !== undefined) {
        vitals.sysBP.push([timestamp, data.sysBP]);
      }
      if (data.diaBP !== undefined) {
        vitals.diaBP.push([timestamp, data.diaBP]);
      }
      if (data.hr !== undefined) {
        vitals.hr.push([timestamp, data.hr]);
      }
      if (data.spo2 !== undefined) {
        vitals.spo2.push([timestamp, data.spo2]);
      }
    });

    const events: TimelineEvent[] = (eventsData || []).map((event: any) => ({
      time: new Date(event.timestamp).getTime(),
      swimlane: event.eventType || 'event',
      label: event.description || '',
    }));

    // Collect timestamps from vitals
    const timestamps = dataToUse.map((s: any) => new Date(s.timestamp).getTime());
    
    // Also collect timestamps from medications to ensure timeline extends to include all doses
    // This allows users to scroll to see and edit/delete medications entered beyond the vitals range
    if (medsToUse && medsToUse.length > 0) {
      medsToUse.forEach((med: any) => {
        if (med.timestamp) {
          timestamps.push(new Date(med.timestamp).getTime());
        }
        if (med.endTimestamp) {
          timestamps.push(new Date(med.endTimestamp).getTime());
        }
      });
    }
    
    // Also include event timestamps
    if (eventsData && eventsData.length > 0) {
      eventsData.forEach((event: any) => {
        if (event.timestamp) {
          timestamps.push(new Date(event.timestamp).getTime());
        }
      });
    }
    
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : new Date().getTime() - 6 * 60 * 60 * 1000;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : new Date().getTime() + 6 * 60 * 60 * 1000;

    const now = new Date().getTime();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // For historical records (data older than 1 hour), don't extend timeline to future
    // This ensures the viewport can center on the actual data range
    const isHistoricalData = maxTime < oneHourAgo;
    
    if (isHistoricalData) {
      // Historical record: set endTime relative to data, not to now
      // Add 1 hour padding after last data point
      return {
        startTime: minTime - 60 * 60 * 1000,
        endTime: maxTime + 60 * 60 * 1000,
        vitals,
        events,
        medications: medsToUse || [],
        apiEvents: eventsData || [],
        isHistoricalData: true,
      };
    }
    
    // Active record: extend to future for real-time monitoring
    // Extended to 1 year to support long-stay patients (overnight clinics, ward patients)
    const futureExtension = now + ONE_YEAR_MS;
    const calculatedEndTime = maxTime + 60 * 60 * 1000;
    
    return {
      startTime: minTime - 60 * 60 * 1000,
      endTime: Math.max(calculatedEndTime, futureExtension),
      vitals,
      events,
      medications: medsToUse || [],
      apiEvents: eventsData || [],
      isHistoricalData: false,
    };
  }, [vitalsData, eventsData, medicationsData, isPacuMode, filteredVitalsData, filteredMedicationsData]);
}
