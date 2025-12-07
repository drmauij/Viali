import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Activity, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AnesthesiaRecordButtonProps {
  surgeryId: string;
  className?: string;
}

interface TimeMarker {
  id: string;
  code: string;
  label: string;
  time: number | null;
}

interface AnesthesiaRecord {
  id: string;
  timeMarkers?: TimeMarker[];
}

export default function AnesthesiaRecordButton({ surgeryId, className }: AnesthesiaRecordButtonProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: anesthesiaRecord, isLoading } = useQuery<AnesthesiaRecord>({
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
    enabled: !!surgeryId,
    staleTime: 30000,
  });

  const getTargetUrl = () => {
    const mode = (() => {
      if (!anesthesiaRecord?.timeMarkers) {
        return 'op';
      }

      const markers = anesthesiaRecord.timeMarkers;
      const x2Marker = markers.find(m => m.code === 'X2');
      const pMarker = markers.find(m => m.code === 'P');

      const hasX2 = x2Marker?.time != null;
      const hasP = pMarker?.time != null;

      if (hasX2 && !hasP) {
        return 'pacu';
      }

      return 'op';
    })();

    const basePath = `/anesthesia/cases/${surgeryId}/${mode}`;
    
    if (anesthesiaRecord?.id) {
      return `${basePath}?recordId=${anesthesiaRecord.id}`;
    }
    
    return basePath;
  };

  return (
    <Button
      variant="outline"
      className={className || "h-auto py-4 flex-col gap-2"}
      onClick={() => setLocation(getTargetUrl())}
      data-testid={`button-anesthesia-record-${surgeryId}`}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      ) : (
        <Activity className="h-10 w-10 text-primary" />
      )}
      <span className="text-sm font-medium">{t('anesthesia.patientDetail.anesthesiaRecord')}</span>
    </Button>
  );
}
