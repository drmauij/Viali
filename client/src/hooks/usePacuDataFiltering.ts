import { useMemo } from "react";

interface UsePacuDataFilteringProps {
  isPacuMode: boolean;
  anesthesiaRecord: any;
  vitalsData: any[];
  medicationsData: any[];
}

export function usePacuDataFiltering({
  isPacuMode,
  anesthesiaRecord,
  vitalsData,
  medicationsData,
}: UsePacuDataFilteringProps) {
  // Extract A2 timestamp (Anesthesia Presence End) for PACU mode filtering
  const a2Timestamp = useMemo(() => {
    if (!isPacuMode || !anesthesiaRecord?.timeMarkers) return null;
    const markers = anesthesiaRecord.timeMarkers as any[];
    const a2Marker = markers.find((m: any) => m.code === 'A2');
    return a2Marker?.time ? Number(a2Marker.time) : null;
  }, [isPacuMode, anesthesiaRecord?.timeMarkers]);

  // Filter vitals snapshots for PACU mode (only show vitals after A2 timestamp)
  const filteredVitalsData = useMemo(() => {
    if (!isPacuMode || !a2Timestamp || !vitalsData) return vitalsData;
    
    return vitalsData.filter((snapshot: any) => {
      const snapshotTime = new Date(snapshot.timestamp).getTime();
      return snapshotTime > a2Timestamp;
    });
  }, [isPacuMode, a2Timestamp, vitalsData]);

  // Filter medications data for PACU mode (only show medications after A2 timestamp)
  const filteredMedicationsData = useMemo(() => {
    if (!isPacuMode || !a2Timestamp || !medicationsData) return medicationsData;
    
    return medicationsData.filter((med: any) => {
      const medTime = new Date(med.timestamp).getTime();
      return medTime > a2Timestamp;
    });
  }, [isPacuMode, a2Timestamp, medicationsData]);

  return {
    a2Timestamp,
    filteredVitalsData,
    filteredMedicationsData,
  };
}
