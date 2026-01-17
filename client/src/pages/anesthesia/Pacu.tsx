import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, BedDouble, Clock, ArrowRight, Activity, LogOut, Bed, HeartPulse, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { PacuBedSelector } from "@/components/anesthesia/PacuBedSelector";

type PacuPatient = {
  anesthesiaRecordId: string;
  surgeryId: string;
  patientId: string;
  patientName: string;
  patientNumber: string;
  age: number;
  procedure: string;
  anesthesiaPresenceEndTime: number;
  postOpDestination: string | null;
  status: 'transferring' | 'in_recovery' | 'discharged';
  statusTimestamp: number;
  pacuBedId?: string | null;
  pacuBedName?: string | null;
};

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
  const [bedSelectorOpen, setBedSelectorOpen] = useState(false);

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
          <h3 className="font-semibold text-lg truncate" data-testid={`text-patient-name-${patient.surgeryId}`}>
            {patient.patientName}
          </h3>
          <p className="text-sm text-muted-foreground" data-testid={`text-mrn-${patient.surgeryId}`}>
            {patient.patientNumber} • {t('anesthesia.pacu.age')} {patient.age}
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

        {/* Bed square - right side */}
        <div 
          className="flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setBedSelectorOpen(true);
          }}
        >
          {patient.pacuBedId && patient.pacuBedName ? (
            <div 
              className="p-2 sm:p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-center cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors min-w-[60px] sm:min-w-[80px]"
              data-testid={`button-bed-${patient.surgeryId}`}
            >
              <Bed className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
              <p className="text-sm sm:text-lg font-bold text-blue-700 dark:text-blue-300 truncate" data-testid={`text-bed-name-${patient.surgeryId}`}>
                {patient.pacuBedName}
              </p>
            </div>
          ) : (
            <div 
              className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-w-[60px] sm:min-w-[80px]"
              data-testid={`button-assign-bed-${patient.surgeryId}`}
            >
              <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400 dark:text-gray-500 mx-auto mb-1" />
              <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{t('pacu.bed', 'Bed')}</p>
            </div>
          )}
        </div>
      </div>

      {/* PACU Bed Selector - Hidden trigger mode */}
      <PacuBedSelector
        surgeryId={patient.surgeryId}
        currentBedId={patient.pacuBedId}
        currentBedName={patient.pacuBedName}
        open={bedSelectorOpen}
        onOpenChange={setBedSelectorOpen}
        hideTrigger
      />
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
      patient.patientNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
