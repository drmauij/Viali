import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import type { Patient, Surgery } from "@shared/schema";

export default function SurgeryPatients() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    return userHospitals[0];
  }, [user]);

  const { data: patients = [], isLoading: patientsLoading } = useQuery<Patient[]>({
    queryKey: ['/api/patients', activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const { data: surgeries = [] } = useQuery<Surgery[]>({
    queryKey: ['/api/surgeries', activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const todaySurgeries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return surgeries.filter(s => {
      const surgeryDate = new Date(s.plannedDate);
      return surgeryDate >= today && surgeryDate < tomorrow;
    });
  }, [surgeries]);

  const filteredPatients = useMemo(() => {
    const todayPatientIds = new Set(todaySurgeries.map(s => s.patientId));
    
    return patients.filter(p => {
      const fullName = `${p.firstName} ${p.surname}`.toLowerCase();
      const matchesSearch = !searchTerm || 
        fullName.includes(searchTerm.toLowerCase()) ||
        (p.patientNumber && p.patientNumber.includes(searchTerm));
      
      const hasTodaySurgery = todayPatientIds.has(p.id);
      
      return matchesSearch && hasTodaySurgery;
    });
  }, [patients, searchTerm, todaySurgeries]);

  const getSurgeryForPatient = (patientId: string) => {
    return todaySurgeries.find(s => s.patientId === patientId);
  };

  if (!activeHospital) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.noHospitalSelected')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-background">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <i className="fas fa-users text-teal-500"></i>
          {t('surgery.patients.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('surgery.patients.subtitle')}
        </p>
        
        <div className="mt-4">
          <Input
            placeholder={t('surgery.patients.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            data-testid="patient-search"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        {patientsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <i className="fas fa-calendar-day text-4xl mb-2"></i>
            <p>{t('surgery.patients.noTodaySurgeries')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPatients.map(patient => {
              const surgery = getSurgeryForPatient(patient.id);
              return (
                <div
                  key={patient.id}
                  onClick={() => surgery && navigate(`/surgery/op/${surgery.id}`)}
                  className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:bg-accent transition-colors"
                  data-testid={`patient-card-${patient.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{patient.firstName} {patient.surname}</h3>
                      <p className="text-sm text-muted-foreground">
                        {patient.patientNumber && `#${patient.patientNumber} • `}
                        {patient.birthday && new Date(patient.birthday).toLocaleDateString('de-CH')}
                      </p>
                    </div>
                    {surgery && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{surgery.plannedSurgery}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(surgery.plannedDate).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
