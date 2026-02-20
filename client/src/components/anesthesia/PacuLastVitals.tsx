import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ManualVitalsDialog } from "@/components/anesthesia/dialogs/ManualVitalsDialog";
import { useAddVitalPoint, useAddBPPoint } from "@/hooks/useVitalsQuery";
import { queryClient } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import type { VitalPointWithId, BPPointWithId } from "@/hooks/useVitalsQuery";

interface PacuLastVitalsProps {
  anesthesiaRecordId: string;
  hr: VitalPointWithId[];
  bp: BPPointWithId[];
  spo2: VitalPointWithId[];
}

function getLastPoint<T extends { timestamp: string }>(points: T[]): T | undefined {
  if (points.length === 0) return undefined;
  return points.reduce((latest, p) =>
    p.timestamp > latest.timestamp ? p : latest
  );
}

export function PacuLastVitals({ anesthesiaRecordId, hr, bp, spo2 }: PacuLastVitalsProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const activeHospital = useActiveHospital();

  const addVitalPoint = useAddVitalPoint(anesthesiaRecordId);
  const addBPPoint = useAddBPPoint(anesthesiaRecordId);

  const lastHr = getLastPoint(hr);
  const lastBp = getLastPoint(bp);
  const lastSpo2 = getLastPoint(spo2);

  // Find the most recent timestamp across all vitals
  const allTimestamps = [lastHr?.timestamp, lastBp?.timestamp, lastSpo2?.timestamp].filter(Boolean) as string[];
  const mostRecent = allTimestamps.length > 0
    ? new Date(allTimestamps.reduce((a, b) => a > b ? a : b)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  const handleSave = async (data: { hr?: number; sys?: number; dia?: number; spo2?: number; time: number }) => {
    const timestamp = new Date(data.time).toISOString();

    // Run mutations sequentially to avoid race condition:
    // Each mutation does read-modify-write on the same snapshot row,
    // so concurrent writes would cause last-writer-wins data loss.
    if (data.hr !== undefined) {
      await addVitalPoint.mutateAsync({ vitalType: 'hr', timestamp, value: data.hr });
    }
    if (data.spo2 !== undefined) {
      await addVitalPoint.mutateAsync({ vitalType: 'spo2', timestamp, value: data.spo2 });
    }
    if (data.sys !== undefined && data.dia !== undefined) {
      await addBPPoint.mutateAsync({ timestamp, sys: data.sys, dia: data.dia });
    }

    // Invalidate PACU vitals batch cache after all mutations complete
    queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/pacu/${activeHospital?.id}/vitals`] });
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
        <span className="whitespace-nowrap">
          <span className="text-muted-foreground">HR:</span>{' '}
          <span className="font-medium">{lastHr ? lastHr.value : '—'}</span>
        </span>
        <span className="whitespace-nowrap">
          <span className="text-muted-foreground">BP:</span>{' '}
          <span className="font-medium">
            {lastBp ? `${lastBp.sys}/${lastBp.dia}` : '—'}
          </span>
        </span>
        <span className="whitespace-nowrap">
          <span className="text-muted-foreground">SpO2:</span>{' '}
          <span className="font-medium">{lastSpo2 ? `${lastSpo2.value}%` : '—'}</span>
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {mostRecent && (
          <span className="text-xs text-muted-foreground">{mostRecent}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            setDialogOpen(true);
          }}
          title={t('anesthesia.pacu.addVitals')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ManualVitalsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialTime={Date.now()}
        onSave={handleSave}
      />
    </div>
  );
}
