import { useState } from "react";
import { VitalsTrack, VitalsData } from "./VitalsTrack";

/**
 * VitalsTrackExample - Demo component showing VitalsTrack usage
 * 
 * This is a simple example to demonstrate:
 * - How to set up the VitalsTrack component
 * - How to handle vitals data changes
 * - How to define time ranges
 */

export function VitalsTrackExample() {
  // Sample vitals data (timestamps in ms, values as numbers)
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  const [vitalsData, setVitalsData] = useState<VitalsData>({
    hr: [
      [oneHourAgo, 72],
      [oneHourAgo + 600000, 75],  // +10 min
      [oneHourAgo + 1200000, 78], // +20 min
      [oneHourAgo + 1800000, 74], // +30 min
    ],
    sysBP: [
      [oneHourAgo, 120],
      [oneHourAgo + 600000, 118],
      [oneHourAgo + 1200000, 122],
      [oneHourAgo + 1800000, 119],
    ],
    diaBP: [
      [oneHourAgo, 80],
      [oneHourAgo + 600000, 78],
      [oneHourAgo + 1200000, 82],
      [oneHourAgo + 1800000, 79],
    ],
    spo2: [
      [oneHourAgo, 98],
      [oneHourAgo + 600000, 99],
      [oneHourAgo + 1200000, 98],
      [oneHourAgo + 1800000, 99],
    ],
  });

  const handleVitalsChange = (updatedData: VitalsData) => {
    console.log('Vitals updated:', updatedData);
    setVitalsData(updatedData);
  };

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">VitalsTrack Component Example</h1>
        <p className="text-muted-foreground">
          Click on the timeline to add new vitals, or click on a data point to edit/delete.
        </p>
      </div>

      <div className="bg-background border rounded-lg p-4">
        <VitalsTrack
          anesthesiaRecordId="example-record-123"
          timeRange={{
            start: oneHourAgo - 600000,  // Start 10 min before first data point
            end: now + 1800000,           // End 30 min from now
          }}
          vitalsData={vitalsData}
          onVitalsChange={handleVitalsChange}
          height={500}
        />
      </div>

      <div className="mt-4 p-4 bg-muted rounded-lg">
        <h2 className="font-semibold mb-2">Current Data Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">HR Points</div>
            <div className="font-mono">{vitalsData.hr.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Sys BP Points</div>
            <div className="font-mono">{vitalsData.sysBP.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Dia BP Points</div>
            <div className="font-mono">{vitalsData.diaBP.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">SpO2 Points</div>
            <div className="font-mono">{vitalsData.spo2.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
