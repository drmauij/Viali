import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserCircle, UserRound, Calendar, User, ClipboardList, FileCheck, FileEdit, CalendarPlus, PauseCircle, Loader2, Stethoscope } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { useActiveHospital } from "@/hooks/useActiveHospital";

function getPreOpSummary(assessment: any, t: (key: string) => string): string | null {
  if (!assessment) return null;
  
  const parts: string[] = [];
  
  if (assessment.asa != null) {
    parts.push(`ASA ${assessment.asa}`);
  }
  if (assessment.weight != null) {
    parts.push(`${assessment.weight}kg`);
  }
  if (assessment.height != null) {
    parts.push(`${assessment.height}cm`);
  }
  if (assessment.heartRate != null) {
    parts.push(`HR ${assessment.heartRate}`);
  }
  if (assessment.bloodPressureSystolic != null && assessment.bloodPressureDiastolic != null) {
    parts.push(`BP ${assessment.bloodPressureSystolic}/${assessment.bloodPressureDiastolic}`);
  }
  if (assessment.cave != null) {
    parts.push(`CAVE: ${assessment.cave}`);
  }
  
  if (assessment.anesthesiaTechniques) {
    const techniques: string[] = [];
    const at = assessment.anesthesiaTechniques;
    
    if (at.general) {
      const generalSubs = at.generalOptions ? Object.entries(at.generalOptions)
        .filter(([_, value]) => value)
        .map(([key]) => key.toUpperCase())
        : [];
      techniques.push(generalSubs.length > 0 ? `General (${generalSubs.join(', ')})` : 'General');
    }
    if (at.spinal) techniques.push('Spinal');
    if (at.epidural) {
      const epiduralSubs = at.epiduralOptions ? Object.entries(at.epiduralOptions)
        .filter(([_, value]) => value)
        .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
        : [];
      techniques.push(epiduralSubs.length > 0 ? `Epidural (${epiduralSubs.join(', ')})` : 'Epidural');
    }
    if (at.regional) {
      const regionalSubs = at.regionalOptions ? Object.entries(at.regionalOptions)
        .filter(([_, value]) => value)
        .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
        : [];
      techniques.push(regionalSubs.length > 0 ? `Regional (${regionalSubs.join(', ')})` : 'Regional');
    }
    if (at.sedation) techniques.push('Sedation');
    if (at.combined) techniques.push('Combined');
    
    if (techniques.length > 0) {
      parts.push(techniques.join(', '));
    }
  }
  
  if (assessment.installations && Object.keys(assessment.installations).length > 0) {
    const installations = Object.entries(assessment.installations)
      .filter(([_, value]) => value)
      .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
      .join(', ');
    if (installations) {
      parts.push(installations);
    }
  }
  
  if (assessment.postOpICU) {
    parts.push(t('anesthesia.preop.postOpICUPlanned'));
  }
  
  if (assessment.specialNotes != null && assessment.specialNotes !== '') {
    parts.push(assessment.specialNotes);
  }
  
  if (assessment.anesthesiaOther != null && assessment.anesthesiaOther !== '') {
    parts.push(assessment.anesthesiaOther);
  }
  
  return parts.length > 0 ? parts.join(', ') : null;
}

export default function PreOpList() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "planned" | "draft" | "standby" | "completed">("all");

  // Get active hospital
  const activeHospital = useActiveHospital();

  // Fetch all pre-op assessments
  const { data: assessments, isLoading } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id || ''}`],
    enabled: !!activeHospital?.id,
  });

  // Filter and group assessments by status
  const filteredAssessments = (assessments || []).filter((item) => {
    if (!item.surgery) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.surgery.procedureName?.toLowerCase().includes(searchLower) ||
      item.surgery.surgeon?.toLowerCase().includes(searchLower) ||
      item.surgery.patientName?.toLowerCase().includes(searchLower)
    );
  });

  const groupedByStatus = {
    planned: filteredAssessments.filter((item) => item.status === 'planned' && !item.assessment?.standBy),
    draft: filteredAssessments.filter((item) => item.status === 'draft' && !item.assessment?.standBy),
    standby: filteredAssessments.filter((item) => item.assessment?.standBy),
    completed: filteredAssessments.filter((item) => item.status === 'completed' && !item.assessment?.standBy),
  };

  const displayedAssessments = activeTab === 'all' 
    ? filteredAssessments 
    : groupedByStatus[activeTab];

  const getStandByReasonLabel = (reason: string) => {
    switch (reason) {
      case 'signature_missing':
        return t('anesthesia.preop.standByReasons.signatureMissing');
      case 'consent_required':
        return t('anesthesia.preop.standByReasons.consentRequired');
      case 'waiting_exams':
        return t('anesthesia.preop.standByReasons.waitingExams');
      case 'other':
        return t('anesthesia.preop.standByReasons.other');
      default:
        return reason;
    }
  };

  const calculateAge = (birthday: string) => {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getStatusBadge = (item: any) => {
    if (item.assessment?.standBy) {
      return (
        <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">
          <PauseCircle className="h-3 w-3 mr-1" />
          {t('anesthesia.preop.status.standBy')}
        </Badge>
      );
    }
    switch (item.status) {
      case 'planned':
        return <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700">
          <CalendarPlus className="h-3 w-3 mr-1" />
          {t('anesthesia.preop.status.planned')}
        </Badge>;
      case 'draft':
        return <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
          <FileEdit className="h-3 w-3 mr-1" />
          {t('anesthesia.preop.status.draft')}
        </Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
          <FileCheck className="h-3 w-3 mr-1" />
          {t('anesthesia.preop.status.completed')}
        </Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{t('anesthesia.preop.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('anesthesia.preop.subtitle')}
        </p>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:grid-cols-5 md:w-full">
            <TabsTrigger value="all" data-testid="tab-all" className="whitespace-nowrap">
              {t('anesthesia.preop.tabAll')} ({filteredAssessments.length})
            </TabsTrigger>
            <TabsTrigger value="planned" data-testid="tab-planned" className="whitespace-nowrap">
              <CalendarPlus className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('anesthesia.preop.tabPlanned')} ({groupedByStatus.planned.length})
            </TabsTrigger>
            <TabsTrigger value="draft" data-testid="tab-draft" className="whitespace-nowrap">
              <FileEdit className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('anesthesia.preop.tabInProgress')} ({groupedByStatus.draft.length})
            </TabsTrigger>
            <TabsTrigger value="standby" data-testid="tab-standby" className="whitespace-nowrap">
              <PauseCircle className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('anesthesia.preop.tabStandBy')} ({groupedByStatus.standby.length})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed" className="whitespace-nowrap">
              <FileCheck className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('anesthesia.preop.tabCompleted')} ({groupedByStatus.completed.length})
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('anesthesia.preop.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-preop"
          />
        </div>
      </div>

      {/* Cases List */}
      <div className="space-y-4">
        {displayedAssessments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                {searchTerm ? t('anesthesia.preop.noMatchingCases') : t('anesthesia.preop.noAssessments')}
              </p>
            </CardContent>
          </Card>
        ) : (
          displayedAssessments.map((item) => {
            const surgery = item.surgery;
            const age = calculateAge(surgery.patientBirthday);
            
            return (
              <Card 
                key={surgery.id} 
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors" 
                data-testid={`card-preop-${surgery.id}`}
                onClick={() => setLocation(`/anesthesia/patients/${surgery.patientId}?openPreOp=${surgery.id}`)}
              >
                <div className="flex items-start justify-between">
                  {/* Patient Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {surgery.patientSex === "M" ? (
                        <UserCircle className="h-6 w-6 text-blue-500" />
                      ) : (
                        <UserRound className="h-6 w-6 text-pink-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg" data-testid={`text-patient-name-${surgery.id}`}>
                          {surgery.patientName || t('anesthesia.preop.unknownPatient')}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {surgery.patientBirthday ? (
                            <>
                              {formatDate(surgery.patientBirthday)}
                              {age !== null && ` (${age} ${t('anesthesia.preop.years')})`}
                            </>
                          ) : (
                            t('anesthesia.preop.birthdayNotRecorded')
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Surgery Details */}
                    <div className="ml-9 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{surgery.procedureName || t('anesthesia.preop.procedureNotSpecified')}</span>
                      </div>
                      {surgery.surgeon && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span>{surgery.surgeon}</span>
                        </div>
                      )}
                      {surgery.plannedDate && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(surgery.plannedDate)}</span>
                        </div>
                      )}
                      {/* Pre-Op Assessment Summary */}
                      {getPreOpSummary(item.assessment, t) && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground mt-2 pt-2 border-t border-border/50">
                          <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                          <span data-testid={`text-preop-summary-${surgery.id}`}>{getPreOpSummary(item.assessment, t)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge & Stand-By Reason */}
                  <div className="flex flex-col items-end gap-1" data-testid={`badge-status-${surgery.id}`}>
                    {getStatusBadge(item)}
                    {item.assessment?.standBy && item.assessment?.standByReason && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 max-w-[180px] text-right">
                        {item.assessment?.standByReason === 'other' && item.assessment?.standByReasonNote 
                          ? item.assessment?.standByReasonNote 
                          : getStandByReasonLabel(item.assessment?.standByReason)}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
