import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserCircle, UserRound, Calendar, User, ClipboardList, FileCheck, FileEdit, CalendarPlus, PauseCircle, Mail, Send, Loader2 } from "lucide-react";
import { SiTelegram } from "react-icons/si";
import { formatDate } from "@/lib/dateUtils";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { useToast } from "@/hooks/use-toast";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";

function getPreOpSummary(assessment: any, surgery: any, t: (key: string) => string): string | null {
  if (!assessment) return null;
  
  const parts: string[] = [];
  
  if (assessment.weight != null && assessment.weight !== '' && assessment.weight !== 0) {
    parts.push(`${assessment.weight}kg`);
  }
  if (assessment.height != null && assessment.height !== '' && assessment.height !== 0) {
    parts.push(`${assessment.height}cm`);
  }
  if (assessment.heartRate != null && assessment.heartRate !== '' && assessment.heartRate !== 0) {
    parts.push(`HR ${assessment.heartRate}`);
  }
  if (assessment.bloodPressureSystolic != null && assessment.bloodPressureDiastolic != null && 
      assessment.bloodPressureSystolic !== 0 && assessment.bloodPressureDiastolic !== 0) {
    parts.push(`BP ${assessment.bloodPressureSystolic}/${assessment.bloodPressureDiastolic}`);
  }
  if (assessment.cave != null && assessment.cave !== '') {
    parts.push(`CAVE: ${assessment.cave}`);
  }
  
  if (assessment.specialNotes != null && assessment.specialNotes !== '') {
    parts.push(assessment.specialNotes);
  }
  
  const allergies: string[] = [];
  if (surgery?.patientAllergies && Array.isArray(surgery.patientAllergies) && surgery.patientAllergies.length > 0) {
    allergies.push(...surgery.patientAllergies);
  }
  if (surgery?.patientOtherAllergies) {
    allergies.push(surgery.patientOtherAllergies);
  }
  if (allergies.length > 0) {
    parts.push(`${t('surgery.preop.allergies')}: ${allergies.join(', ')}`);
  }
  
  return parts.length > 0 ? parts.join(', ') : null;
}

export default function SurgeryPreOpList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"planned" | "draft" | "standby" | "completed">("planned");
  const [standByFilter, setStandByFilter] = useState<"all" | "consent_required" | "signature_missing">("all");

  const activeHospital = useActiveHospital();
  const { addons } = useHospitalAddons();

  // Send questionnaire dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedSurgeryForSend, setSelectedSurgeryForSend] = useState<any>(null);

  const { data: assessments, isLoading } = useQuery<any[]>({
    queryKey: [`/api/surgery/preop?hospitalId=${activeHospital?.id || ''}`],
    enabled: !!activeHospital?.id,
  });

  // Handle sending form to patient - opens the SendQuestionnaireDialog
  const handleSendFormToPatient = (surgery: any) => {
    if (!surgery.patientId) return;
    setSelectedSurgeryForSend(surgery);
    setSendDialogOpen(true);
  };

  const filteredAssessments = (assessments || []).filter((item) => {
    if (!item.surgery) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.surgery.procedureName?.toLowerCase().includes(searchLower) ||
      item.surgery.surgeon?.toLowerCase().includes(searchLower) ||
      item.surgery.patientName?.toLowerCase().includes(searchLower)
    );
  });

  const allStandByItems = filteredAssessments.filter((item) => item.assessment?.standBy);
  
  const filteredStandByItems = allStandByItems.filter((item) => {
    if (standByFilter === 'all') return true;
    return item.assessment?.standByReason === standByFilter;
  });

  const groupedByStatus = {
    planned: filteredAssessments.filter((item) => item.status === 'planned' && !item.assessment?.standBy),
    draft: filteredAssessments.filter((item) => item.status === 'draft' && !item.assessment?.standBy),
    standby: filteredStandByItems,
    completed: filteredAssessments.filter((item) => item.status === 'completed' && !item.assessment?.standBy),
  };

  const sortByPlannedDate = (items: any[]) => {
    const now = Date.now();
    return [...items].sort((a, b) => {
      const dateA = a.surgery?.plannedDate ? new Date(a.surgery.plannedDate).getTime() : Infinity;
      const dateB = b.surgery?.plannedDate ? new Date(b.surgery.plannedDate).getTime() : Infinity;
      
      const aIsFuture = dateA >= now;
      const bIsFuture = dateB >= now;
      
      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      
      if (aIsFuture && bIsFuture) {
        return dateA - dateB;
      } else {
        return dateB - dateA;
      }
    });
  };

  const displayedAssessments = sortByPlannedDate(groupedByStatus[activeTab]);

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
          {t('surgery.preop.status.standBy')}
        </Badge>
      );
    }
    switch (item.status) {
      case 'planned':
        return <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700">
          <CalendarPlus className="h-3 w-3 mr-1" />
          {t('surgery.preop.status.planned')}
        </Badge>;
      case 'draft':
        return <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
          <FileEdit className="h-3 w-3 mr-1" />
          {t('surgery.preop.status.draft')}
        </Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
          <FileCheck className="h-3 w-3 mr-1" />
          {t('surgery.preop.status.completed')}
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
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">{t('surgery.preop.title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('surgery.preop.subtitle')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:grid-cols-4 md:w-full">
            <TabsTrigger value="planned" data-testid="tab-surgery-preop-planned" className="whitespace-nowrap">
              <CalendarPlus className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('surgery.preop.tabPlanned')} ({groupedByStatus.planned.length})
            </TabsTrigger>
            <TabsTrigger value="draft" data-testid="tab-surgery-preop-draft" className="whitespace-nowrap">
              <FileEdit className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('surgery.preop.tabInProgress')} ({groupedByStatus.draft.length})
            </TabsTrigger>
            <TabsTrigger value="standby" data-testid="tab-surgery-preop-standby" className="whitespace-nowrap">
              <PauseCircle className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('surgery.preop.tabStandBy')} ({groupedByStatus.standby.length})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-surgery-preop-completed" className="whitespace-nowrap">
              <FileCheck className="h-4 w-4 mr-1 hidden sm:inline-block" />
              {t('surgery.preop.tabCompleted')} ({groupedByStatus.completed.length})
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('surgery.preop.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-surgery-preop"
          />
        </div>
        
        {activeTab === 'standby' && (
          <div className="flex flex-wrap gap-2">
            <Badge 
              variant={standByFilter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => setStandByFilter('all')}
              data-testid="filter-surgery-standby-all"
            >
              {t('surgery.preop.filterAll')} ({allStandByItems.length})
            </Badge>
            <Badge 
              variant={standByFilter === 'consent_required' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => setStandByFilter('consent_required')}
              data-testid="filter-surgery-standby-consent"
            >
              {t('surgery.preop.standByReasons.consentRequired')} ({allStandByItems.filter(i => i.assessment?.standByReason === 'consent_required').length})
            </Badge>
            <Badge 
              variant={standByFilter === 'signature_missing' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => setStandByFilter('signature_missing')}
              data-testid="filter-surgery-standby-signature"
            >
              {t('surgery.preop.standByReasons.signatureMissing')} ({allStandByItems.filter(i => i.assessment?.standByReason === 'signature_missing').length})
            </Badge>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {displayedAssessments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                {searchTerm ? t('surgery.preop.noMatchingCases') : t('surgery.preop.noAssessments')}
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
                data-testid={`card-surgery-preop-${surgery.id}`}
                onClick={() => setLocation(`/surgery/preop/${surgery.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {surgery.patientSex === "M" ? (
                        <UserCircle className="h-6 w-6 text-blue-500" />
                      ) : (
                        <UserRound className="h-6 w-6 text-pink-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg" data-testid={`text-surgery-patient-name-${surgery.id}`}>
                          {surgery.patientName || t('surgery.preop.unknownPatient')}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {surgery.patientBirthday ? (
                            <>
                              {formatDate(surgery.patientBirthday)}
                              {age !== null && ` (${age} ${t('surgery.preop.years')})`}
                            </>
                          ) : (
                            t('surgery.preop.birthdayNotRecorded')
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="ml-9 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{surgery.procedureName || t('surgery.preop.procedureNotSpecified')}</span>
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
                      {getPreOpSummary(item.assessment, surgery, t) && (
                        <div 
                          className="flex items-start gap-2 text-sm text-muted-foreground mt-2 pt-2 border-t border-border/50 select-text cursor-text"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="whitespace-pre-wrap">{getPreOpSummary(item.assessment, surgery, t)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(item)}
                    {item.assessment?.consentFileUrl && (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-xs">
                        <FileCheck className="h-3 w-3 mr-1" />
                        {t('surgery.preop.consentUploaded')}
                      </Badge>
                    )}
                    {/* Button to send pre-op form to patient (only for planned items and if questionnaire addon is enabled) */}
                    {item.status === 'planned' && addons.questionnaire && (
                      item.questionnaireEmailSent ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {t('surgery.preop.formSent', 'Form sent')}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendFormToPatient(surgery);
                            }}
                            data-testid={`button-resend-form-${surgery.id}`}
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendFormToPatient(surgery);
                          }}
                          data-testid={`button-send-form-${surgery.id}`}
                          title={t('surgery.preop.sendForm', 'Send Form')}
                        >
                          <SiTelegram className="h-4 w-4 text-[#0088cc]" />
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Send Questionnaire Dialog (with Email and SMS options) */}
      {selectedSurgeryForSend && (
        <SendQuestionnaireDialog
          open={sendDialogOpen}
          onOpenChange={(open) => {
            setSendDialogOpen(open);
            if (!open) setSelectedSurgeryForSend(null);
          }}
          patientId={selectedSurgeryForSend.patientId}
          patientName={selectedSurgeryForSend.patientName || ''}
          patientEmail={selectedSurgeryForSend.patientEmail}
          patientPhone={selectedSurgeryForSend.patientPhone}
        />
      )}
    </div>
  );
}
