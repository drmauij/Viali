import { useMemo } from "react";
import type { UnifiedTimelineData, TimelineVitals, TimelineEvent } from "@/components/anesthesia/UnifiedTimeline";

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
}: UseTimelineDataProps): UnifiedTimelineData {
  return useMemo((): UnifiedTimelineData => {
    const dataToUse = isPacuMode ? filteredVitalsData : vitalsData;
    const medsToUse = isPacuMode ? filteredMedicationsData : medicationsData;
    
    if (!dataToUse || dataToUse.length === 0) {
      const now = new Date().getTime();
      const sixHoursAgo = now - 6 * 60 * 60 * 1000;
      const sixHoursFuture = now + 6 * 60 * 60 * 1000;

      return {
        startTime: sixHoursAgo,
        endTime: sixHoursFuture,
        vitals: {
          sysBP: [],
          diaBP: [],
          hr: [],
          spo2: [],
        },
        events: [],
        medications: medsToUse || [],
        apiEvents: eventsData || [],
      };
    }

    const vitals: TimelineVitals = {
      sysBP: [],
      diaBP: [],
      hr: [],
      spo2: [],
    };

    dataToUse.forEach((snapshot: any) => {
      const timestamp = new Date(snapshot.timestamp).getTime();
      const data = snapshot.data || {};

      if (data.sysBP !== undefined) {
        vitals.sysBP.push({ time: timestamp, value: data.sysBP });
      }
      if (data.diaBP !== undefined) {
        vitals.diaBP.push({ time: timestamp, value: data.diaBP });
      }
      if (data.hr !== undefined) {
        vitals.hr.push({ time: timestamp, value: data.hr });
      }
      if (data.spo2 !== undefined) {
        vitals.spo2.push({ time: timestamp, value: data.spo2 });
      }
    });

    const events: TimelineEvent[] = (eventsData || []).map((event: any) => ({
      time: new Date(event.timestamp).getTime(),
      type: event.eventType || 'event',
      description: event.description || '',
    }));

    const timestamps = dataToUse.map((s: any) => new Date(s.timestamp).getTime());
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : new Date().getTime() - 6 * 60 * 60 * 1000;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : new Date().getTime() + 6 * 60 * 60 * 1000;

    const now = new Date().getTime();
    const futureExtension = now + 6 * 60 * 60 * 1000;
    const calculatedEndTime = maxTime + 60 * 60 * 1000;
    
    return {
      startTime: minTime - 60 * 60 * 1000,
      endTime: Math.max(calculatedEndTime, futureExtension),
      vitals,
      events,
      medications: medsToUse || [],
      apiEvents: eventsData || [],
    };
  }, [vitalsData, eventsData, medicationsData, isPacuMode, filteredVitalsData, filteredMedicationsData]);
}
