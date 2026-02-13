import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, BedDouble, Clock, ArrowRight, Activity, LogOut, Bed, HeartPulse, Plus, Check, Loader2, X, UserCircle, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  status: 'transferring' | 'in_recovery' | 'discharged';
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

function PacuPatientCard({ 
  patient, 
  onNavigate,
  formatTime,
  getTimeInPacu
}: { 
  patient: PacuPatient; 
  onNavigate: () => void;
  formatTime: (timestamp: number) => string;
  getTimeInPacu: (timestamp: number) => string;
}) {
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
        description: t("anesthesia.pacu.bedAssigned", "PACU bed assigned successfully"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("anesthesia.pacu.failedToAssignBed", "Failed to assign PACU bed"),
        variant: "destructive",
      });
    },
  });

  const handleSelectBed = (bedId: string | null) => {
    assignBedMutation.mutate(bedId);
  };

  return (
    <Card
      className="p-4 hover:bg-accent/50 transition-colors"
      data-testid={`card-pacu-${patient.surgeryId}`}
    >
      <div className="flex gap-3">
        {/* Main content - clickable to navigate */}
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
            <h3 className="font-semibold text-lg truncate" data-testid={`text-patient-name-${patient.surgeryId}`}>
              {patient.patientName}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground" data-testid={`text-dob-${patient.surgeryId}`}>
            {patient.dateOfBirth || ''} • {patient.age} {t('anesthesia.pacu.yearsOld', 'y/o')}
          </p>
          
          <div className="mt-2 space-y-1">
            <div className="flex items-center text-sm">
              <HeartPulse className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
              <span className="truncate" data-testid={`text-procedure-${patient.surgeryId}`}>{patient.procedure}</span>
            </div>
            
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate">
                {formatTime(patient.anesthesiaPresenceEndTime)} • {getTimeInPacu(patient.anesthesiaPresenceEndTime)}
              </span>
            </div>
          </div>
        </div>

        {/* Bed square with integrated popover - right side */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div 
              className="flex-shrink-0 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {patient.pacuBedId && patient.pacuBedName ? (
                <div 
                  className="p-2 sm:p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-center hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors min-w-[60px] sm:min-w-[80px]"
                  data-testid={`button-bed-${patient.surgeryId}`}
                >
                  <Bed className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
                  <p className="text-sm sm:text-lg font-bold text-blue-700 dark:text-blue-300 truncate" data-testid={`text-bed-name-${patient.surgeryId}`}>
                    {patient.pacuBedName}
                  </p>
                </div>
              ) : (
                <div 
                  className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-w-[60px] sm:min-w-[80px]"
                  data-testid={`button-assign-bed-${patient.surgeryId}`}
                >
                  <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400 dark:text-gray-500 mx-auto mb-1" />
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{t('anesthesia.pacu.bed', 'Bed')}</p>
                </div>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <div className="space-y-1">
              <p className="text-sm font-medium px-2 py-1">{t("anesthesia.pacu.selectBed", "Select PACU Bed")}</p>
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
                    data-testid={`bed-option-${bed.id}`}
                  >
                    <span className="flex items-center gap-2">
                      <Bed className="h-4 w-4" />
                      {bed.name}
                    </span>
                    {isCurrentBed && <Check className="h-4 w-4 text-blue-600" />}
                    {isOccupied && !isCurrentBed && (
                      <span className="text-xs text-muted-foreground">{t("anesthesia.pacu.occupied", "Occupied")}</span>
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
                    data-testid="button-remove-bed"
                  >
                    <X className="h-4 w-4" />
                    {t("anesthesia.pacu.removeBed", "Remove bed assignment")}
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
    </Card>
  );
}

export default function Pacu() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'transferring' | 'in_recovery' | 'discharged'>('in_recovery');
  const activeHospital = useActiveHospital();
  const [, setLocation] = useLocation();

  const { data: pacuPatients = [], isLoading } = useQuery<PacuPatient[]>({
    queryKey: [`/api/anesthesia/pacu/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const filteredPatients = pacuPatients.filter(
    (patient) =>
      patient.status === activeTab &&
      (patient.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (patient.dateOfBirth && patient.dateOfBirth.includes(searchQuery)) ||
      patient.procedure.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const counts = {
    transferring: pacuPatients.filter(p => p.status === 'transferring').length,
    in_recovery: pacuPatients.filter(p => p.status === 'in_recovery').length,
    discharged: pacuPatients.filter(p => p.status === 'discharged').length,
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const getTimeInPacu = (timestamp: number) => {
    const admitted = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - admitted.getTime()) / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  return (
    <div className="pb-20 px-4 pt-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{t('anesthesia.pacu.title')}</h1>
        <p className="text-muted-foreground">{t('anesthesia.pacu.subtitle')}</p>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:grid-cols-3 md:w-full">
            <TabsTrigger value="transferring" data-testid="tab-transferring" className="whitespace-nowrap">
              <ArrowRight className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('anesthesia.pacu.tabTransferring')} ({counts.transferring})
            </TabsTrigger>
            <TabsTrigger value="in_recovery" data-testid="tab-in-recovery" className="whitespace-nowrap">
              <Activity className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('anesthesia.pacu.tabInRecovery')} ({counts.in_recovery})
            </TabsTrigger>
            <TabsTrigger value="discharged" data-testid="tab-discharged" className="whitespace-nowrap">
              <LogOut className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('anesthesia.pacu.tabDischarged')} ({counts.discharged})
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('anesthesia.pacu.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-pacu"
        />
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-12">
            <BedDouble className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{t('anesthesia.pacu.noPatientsInPacu')}</p>
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <PacuPatientCard 
              key={patient.surgeryId} 
              patient={patient} 
              onNavigate={() => setLocation(`/anesthesia/cases/${patient.surgeryId}/pacu`)}
              formatTime={formatTime}
              getTimeInPacu={getTimeInPacu}
            />
          ))
        )}
      </div>
    </div>
  );
}
