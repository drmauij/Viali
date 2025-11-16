import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { VitalsTrack, VitalsData } from "./VitalsTrack";
import { MedicationTrack, AnesthesiaItem } from "./MedicationTrack";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import type { AnesthesiaMedication, ClinicalSnapshot } from "@shared/schema";

/**
 * TimelineContainer - Container component for vitals and medication timelines
 * 
 * Features:
 * - Fetches vitals, medications, and anesthesia items data
 * - Transforms API data to component format
 * - Renders VitalsTrack and MedicationTrack vertically stacked
 * - Shows loading skeleton while fetching
 * - Shows error state if queries fail
 */

export interface TimelineContainerProps {
  anesthesiaRecordId: string;
  startTime: Date | string;
  endTime: Date | string;
  height?: number;
}

export function TimelineContainer({
  anesthesiaRecordId,
  startTime,
  endTime,
  height = 400,
}: TimelineContainerProps) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;

  // Calculate shared time range
  const timeRange = {
    start: new Date(startTime).getTime(),
    end: new Date(endTime).getTime(),
  };

  // Fetch vitals data
  const vitalsQuery = useQuery<ClinicalSnapshot[]>({
    queryKey: [`/api/anesthesia/vitals/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch medications data
  const medicationsQuery = useQuery<AnesthesiaMedication[]>({
    queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch anesthesia items for medication configuration
  const itemsQuery = useQuery<AnesthesiaItem[]>({
    queryKey: [`/api/anesthesia/items/${hospitalId}`],
    enabled: !!hospitalId,
  });

  // Transform vitals API data to component format
  const vitalsData: VitalsData = {
    hr: [],
    sysBP: [],
    diaBP: [],
    spo2: [],
  };

  if (vitalsQuery.data) {
    vitalsQuery.data.forEach((snapshot) => {
      const timestamp = new Date(snapshot.timestamp).getTime();
      const data = snapshot.data;

      if (data.hr !== undefined) {
        vitalsData.hr.push([timestamp, data.hr]);
      }
      if (data.sysBP !== undefined) {
        vitalsData.sysBP.push([timestamp, data.sysBP]);
      }
      if (data.diaBP !== undefined) {
        vitalsData.diaBP.push([timestamp, data.diaBP]);
      }
      if (data.spo2 !== undefined) {
        vitalsData.spo2.push([timestamp, data.spo2]);
      }
    });
  }

  // Loading state
  const isLoading = vitalsQuery.isLoading || medicationsQuery.isLoading || itemsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="timeline-loading">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" data-testid="skeleton-vitals-header" />
          <Skeleton className="h-[400px] w-full" data-testid="skeleton-vitals-track" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" data-testid="skeleton-medications-header" />
          <Skeleton className="h-[400px] w-full" data-testid="skeleton-medications-track" />
        </div>
      </div>
    );
  }

  // Error state
  const hasError = vitalsQuery.isError || medicationsQuery.isError || itemsQuery.isError;

  if (hasError) {
    return (
      <div
        className="flex flex-col items-center justify-center p-8 border border-destructive rounded-lg bg-destructive/10"
        data-testid="timeline-error"
      >
        <AlertCircle className="h-12 w-12 text-destructive mb-4" data-testid="icon-error" />
        <h3 className="text-lg font-semibold text-destructive mb-2" data-testid="text-error-title">
          Failed to load timeline data
        </h3>
        <p className="text-sm text-muted-foreground text-center" data-testid="text-error-message">
          {vitalsQuery.error?.message ||
            medicationsQuery.error?.message ||
            itemsQuery.error?.message ||
            "An error occurred while loading the timeline. Please try again."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="timeline-container">
      {/* Vitals Track */}
      <div data-testid="vitals-track-wrapper">
        <VitalsTrack
          anesthesiaRecordId={anesthesiaRecordId}
          timeRange={timeRange}
          vitalsData={vitalsData}
          height={height}
        />
      </div>

      {/* Medication Track */}
      <div data-testid="medication-track-wrapper">
        <MedicationTrack
          anesthesiaRecordId={anesthesiaRecordId}
          timeRange={timeRange}
          medications={medicationsQuery.data || []}
          anesthesiaItems={itemsQuery.data || []}
          height={height}
        />
      </div>
    </div>
  );
}
