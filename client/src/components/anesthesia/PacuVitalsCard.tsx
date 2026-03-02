import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { UserCircle, UserRound, HeartPulse, Clock, Bed, Plus, Check, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { cn } from "@/lib/utils";
import { PacuSparkline } from "./PacuSparkline";
import { PacuLastVitals } from "./PacuLastVitals";
import { PacuVitalsAlerts } from "./PacuVitalsAlerts";
import { checkVitalsAlerts } from "@/lib/vitalsThresholds";
import type { VitalPointWithId, BPPointWithId } from "@/hooks/useVitalsQuery";

type PacuPatient = {
  anesthesiaRecordId: string;
  surgeryId: string;
  patientId: string;
  patientName: string;
  dateOfBirth: string | null;
  sex: string | null;
  age: number;
  procedure: string;
  anesthesiaPresenceEndTime: number;
  postOpDestination: string | null;
  status: 'transferring' | 'in_recovery' | 'discharged' | 'pre_op';
  statusTimestamp: number;
  pacuBedId?: string | null;
  pacuBedName?: string | null;
};

interface SurgeryRoom {
  id: string;
  name: string;
  type: "OP" | "PACU";
  hospitalId: string;
}

interface Surgery {
  id: string;
  pacuBedId?: string | null;
}

interface PacuVitalsCardProps {
  patient: PacuPatient;
  onNavigate: () => void;
  formatTime: (timestamp: number) => string;
  getTimeInPacu: (timestamp: number) => string;
  hr: VitalPointWithId[];
  bp: BPPointWithId[];
  spo2: VitalPointWithId[];
}

export function PacuVitalsCard({
  patient,
  onNavigate,
  formatTime,
  getTimeInPacu,
  hr,
  bp,
  spo2,
}: PacuVitalsCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const [open, setOpen] = useState(false);

  const { data: allRooms = [] } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const pacuBeds = useMemo(() =>
    allRooms.filter((room) => room.type === "PACU").sort((a, b) => a.name.localeCompare(b.name)),
    [allRooms]
  );

  const { data: allSurgeries = [] } = useQuery<Surgery[]>({
    queryKey: [`/api/anesthesia/surgeries/today/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const occupiedBeds = useMemo(() => {
    return allSurgeries
      .filter((s) => s.pacuBedId && s.id !== patient.surgeryId)
      .map((s) => s.pacuBedId as string);
  }, [allSurgeries, patient.surgeryId]);

  const assignBedMutation = useMutation({
    mutationFn: async (bedId: string | null) => {
      await apiRequest("PATCH", `/api/anesthesia/surgeries/${patient.surgeryId}`, { pacuBedId: bedId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/${patient.surgeryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/today/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/pacu/${activeHospital?.id}`] });
      setOpen(false);
      toast({
        title: t("common.success"),
        description: t("anesthesia.pacu.bedAssigned"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("anesthesia.pacu.failedToAssignBed"),
        variant: "destructive",
      });
    },
  });

  const handleSelectBed = (bedId: string | null) => {
    assignBedMutation.mutate(bedId);
  };

  // Determine alert border color
  const lastHrValue = hr.length > 0 ? hr.reduce((l, p) => p.timestamp > l.timestamp ? p : l).value : undefined;
  const lastSpo2Value = spo2.length > 0 ? spo2.reduce((l, p) => p.timestamp > l.timestamp ? p : l).value : undefined;
  const lastSbpValue = bp.length > 0 ? bp.reduce((l, p) => p.timestamp > l.timestamp ? p : l).sys : undefined;
  const alerts = checkVitalsAlerts(lastHrValue, lastSbpValue, lastSpo2Value);
  const hasCritical = alerts.some(a => a.level === 'critical');
  const hasWarning = alerts.length > 0;

  return (
    <Card
      className={cn(
        "p-4 transition-colors",
        hasCritical && "border-red-400 dark:border-red-600",
        !hasCritical && hasWarning && "border-amber-400 dark:border-amber-600",
      )}
      data-testid={`card-pacu-vitals-${patient.surgeryId}`}
    >
      {/* Patient info header */}
      <div className="flex gap-3 mb-3">
        <div
          className="flex-1 cursor-pointer min-w-0"
          onClick={onNavigate}
        >
          <div className="flex items-center gap-2">
            {patient.sex === "M" ? (
              <UserCircle className="h-5 w-5 text-blue-500 flex-shrink-0" />
            ) : patient.sex === "F" ? (
              <UserRound className="h-5 w-5 text-pink-500 flex-shrink-0" />
            ) : (
              <UserCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
            )}
            <h3 className="font-semibold text-lg truncate">
              {patient.patientName}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {patient.dateOfBirth || ''} • {patient.age} {t('anesthesia.pacu.yearsOld')}
            {' | '}
            <span className="truncate">{patient.procedure}</span>
          </p>
          <div className="flex items-center text-sm text-muted-foreground mt-1">
            <Clock className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
            <span>
              {formatTime(patient.anesthesiaPresenceEndTime)} • {getTimeInPacu(patient.anesthesiaPresenceEndTime)}
            </span>
          </div>
        </div>

        {/* Bed square */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div
              className="flex-shrink-0 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {patient.pacuBedId && patient.pacuBedName ? (
                <div className="p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-center hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors min-w-[60px]">
                  <Bed className="h-5 w-5 text-blue-600 dark:text-blue-400 mx-auto mb-0.5" />
                  <p className="text-sm font-bold text-blue-700 dark:text-blue-300 truncate">
                    {patient.pacuBedName}
                  </p>
                </div>
              ) : (
                <div className="p-2 bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-w-[60px]">
                  <Plus className="h-5 w-5 text-gray-400 dark:text-gray-500 mx-auto mb-0.5" />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('anesthesia.pacu.bed')}</p>
                </div>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <div className="space-y-1">
              <p className="text-sm font-medium px-2 py-1">{t("anesthesia.pacu.selectBed")}</p>
              {pacuBeds.map((bed) => {
                const isOccupied = occupiedBeds.includes(bed.id);
                const isCurrentBed = bed.id === patient.pacuBedId;
                return (
                  <button
                    key={bed.id}
                    onClick={() => handleSelectBed(bed.id)}
                    disabled={isOccupied || assignBedMutation.isPending}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors",
                      isCurrentBed && "bg-blue-100 dark:bg-blue-900/30",
                      isOccupied && "opacity-50 cursor-not-allowed",
                      !isOccupied && !isCurrentBed && "hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Bed className="h-4 w-4" />
                      {bed.name}
                    </span>
                    {isCurrentBed && <Check className="h-4 w-4 text-blue-600" />}
                    {isOccupied && !isCurrentBed && (
                      <span className="text-xs text-muted-foreground">{t("anesthesia.pacu.occupied")}</span>
                    )}
                  </button>
                );
              })}
              {patient.pacuBedId && (
                <>
                  <div className="border-t my-1" />
                  <button
                    onClick={() => handleSelectBed(null)}
                    disabled={assignBedMutation.isPending}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    {t("anesthesia.pacu.removeBed")}
                  </button>
                </>
              )}
              {assignBedMutation.isPending && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Sparkline */}
      <div className="border-t pt-2 mb-2">
        <PacuSparkline hr={hr} bp={bp} spo2={spo2} />
      </div>

      {/* Last vitals + quick add */}
      <div className="border-t pt-2">
        <PacuLastVitals
          anesthesiaRecordId={patient.anesthesiaRecordId}
          hr={hr}
          bp={bp}
          spo2={spo2}
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="border-t pt-2 mt-2">
          <PacuVitalsAlerts hr={hr} bp={bp} spo2={spo2} />
        </div>
      )}
    </Card>
  );
}
