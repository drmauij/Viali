import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, BedDouble, Clock, ArrowRight, Activity, LogOut, Bed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const getDestinationBadge = (destination: string | null) => {
    if (!destination) return null;
    const label = destination.toUpperCase();
    const colors: Record<string, string> = {
      pacu: "bg-blue-500",
      icu: "bg-red-500",
      ward: "bg-green-500",
      home: "bg-gray-500",
    };
    return (
      <Badge className={colors[destination] || "bg-gray-500"}>
        {label}
      </Badge>
    );
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
            <Card
              key={patient.surgeryId}
              className="p-4 hover:bg-accent/50 transition-colors"
              data-testid={`card-pacu-${patient.surgeryId}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div 
                  className="cursor-pointer flex-1"
                  onClick={() => setLocation(`/anesthesia/cases/${patient.surgeryId}/pacu`)}
                >
                  {/* Bed Badge - Prominent display at top */}
                  {patient.pacuBedId && patient.pacuBedName && (
                    <Badge 
                      className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 mb-2"
                      data-testid={`badge-bed-${patient.surgeryId}`}
                    >
                      <Bed className="h-3 w-3 mr-1" />
                      {patient.pacuBedName}
                    </Badge>
                  )}
                  <h3 className="font-semibold text-lg" data-testid={`text-patient-name-${patient.surgeryId}`}>
                    {patient.patientName}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid={`text-mrn-${patient.surgeryId}`}>
                    {patient.patientNumber} • {t('anesthesia.pacu.age')} {patient.age}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getDestinationBadge(patient.postOpDestination)}
                  {/* Quick PACU Bed Assignment */}
                  {activeHospital?.id && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <PacuBedSelector
                        surgeryId={patient.surgeryId}
                        hospitalId={activeHospital.id}
                        currentBedId={patient.pacuBedId}
                        currentBedName={patient.pacuBedName}
                        variant="inline"
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div 
                className="space-y-2 cursor-pointer"
                onClick={() => setLocation(`/anesthesia/cases/${patient.surgeryId}/pacu`)}
              >
                <div className="flex items-center text-sm">
                  <BedDouble className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span data-testid={`text-procedure-${patient.surgeryId}`}>{patient.procedure}</span>
                </div>
                
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    {t('anesthesia.pacu.anesthesiaEnd')} {formatTime(patient.anesthesiaPresenceEndTime)} • {t('anesthesia.pacu.timeInPacu')} {getTimeInPacu(patient.anesthesiaPresenceEndTime)}
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
