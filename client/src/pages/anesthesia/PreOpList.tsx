import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, UserCircle, UserRound, Calendar, User, ClipboardList, FileCheck, FileEdit, CalendarPlus, PauseCircle, Loader2, Stethoscope, EyeOff, Mail, Send } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function getPreOpSummary(assessment: any, surgery: any, t: (key: string) => string): string | null {
  if (!assessment) return null;
  
  const parts: string[] = [];
  
  if (assessment.asa != null && assessment.asa !== '') {
    parts.push(`ASA ${assessment.asa}`);
  }
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
  
  // Add patient allergies from surgery data (fetched from patient record)
  const allergies: string[] = [];
  if (surgery?.patientAllergies && Array.isArray(surgery.patientAllergies) && surgery.patientAllergies.length > 0) {
    allergies.push(...surgery.patientAllergies);
  }
  if (surgery?.patientOtherAllergies) {
    allergies.push(surgery.patientOtherAllergies);
  }
  if (allergies.length > 0) {
    parts.push(`${t('anesthesia.preop.allergies')}: ${allergies.join(', ')}`);
  }
  
  return parts.length > 0 ? parts.join(', ') : null;
}

export default function PreOpList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"planned" | "draft" | "standby" | "completed">("planned");
  const [standByFilter, setStandByFilter] = useState<"all" | "consent_required" | "signature_missing">("all");

  // Get active hospital
  const activeHospital = useActiveHospital();

  // Fetch all pre-op assessments
  const { data: assessments, isLoading } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id || ''}`],
    enabled: !!activeHospital?.id,
  });

  // Mutation to toggle noPreOpRequired flag
  const toggleNoPreOpMutation = useMutation({
    mutationFn: async ({ surgeryId, currentValue }: { surgeryId: string; currentValue: boolean }) => {
      return await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        noPreOpRequired: !currentValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id || ''}`] });
      toast({
        title: t('anesthesia.preop.noPreOpRequiredSuccess'),
        description: t('anesthesia.preop.noPreOpRequiredSuccessDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('anesthesia.preop.noPreOpRequiredError'),
        variant: "destructive",
      });
    },
  });

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [saveEmailToPatient, setSaveEmailToPatient] = useState(true);
  const [selectedSurgeryForEmail, setSelectedSurgeryForEmail] = useState<any>(null);
  
  // Track surgeries that have had forms sent in this session
  const [sentForms, setSentForms] = useState<Set<string>>(new Set());

  // Mutation to generate questionnaire link
  const generateLinkMutation = useMutation({
    mutationFn: async ({ patientId, surgeryId }: { patientId: string; surgeryId: string }) => {
      return await apiRequest("POST", "/api/questionnaire/generate-link", {
        patientId,
        surgeryId,
        expiresInDays: 14,
        language: "de",
      });
    },
  });

  // Mutation to send email with questionnaire link
  const sendEmailMutation = useMutation({
    mutationFn: async ({ linkId, email }: { linkId: string; email: string }) => {
      return await apiRequest("POST", `/api/questionnaire/links/${linkId}/send-email`, {
        email,
      });
    },
    onSuccess: () => {
      toast({
        title: t('anesthesia.preop.emailSent'),
        description: t('anesthesia.preop.emailSentDesc'),
      });
      setEmailDialogOpen(false);
      setEmailInput("");
      setSelectedSurgeryForEmail(null);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('anesthesia.preop.emailSendError'),
        variant: "destructive",
      });
    },
  });

  // Mutation to update patient email
  const updatePatientEmailMutation = useMutation({
    mutationFn: async ({ patientId, email }: { patientId: string; email: string }) => {
      return await apiRequest("PATCH", `/api/anesthesia/patients/${patientId}`, {
        email,
      });
    },
  });

  // Handle sending form to patient
  const handleSendFormToPatient = async (surgery: any) => {
    if (!surgery.patientId) return;

    // If patient has no email, open dialog to enter one
    if (!surgery.patientEmail) {
      setSelectedSurgeryForEmail(surgery);
      setEmailInput(""); // Reset email input for new dialog
      setSaveEmailToPatient(true); // Default to save since patient has no email
      setEmailDialogOpen(true);
      return;
    }

    // Generate link and send email
    try {
      const response = await generateLinkMutation.mutateAsync({
        patientId: surgery.patientId,
        surgeryId: surgery.id,
      });
      const linkData = await response.json();
      
      await sendEmailMutation.mutateAsync({
        linkId: linkData.link.id,
        email: surgery.patientEmail,
      });
      
      // Track that form was sent for this surgery
      setSentForms(prev => new Set(prev).add(surgery.id));
    } catch (error) {
      console.error("Failed to send form:", error);
      toast({
        title: t('common.error'),
        description: t('anesthesia.preop.emailSendError'),
        variant: "destructive",
      });
    }
  };

  // Handle sending email after entering in dialog
  const handleSendEmailFromDialog = async () => {
    if (!selectedSurgeryForEmail || !emailInput) return;

    try {
      // Save email to patient record if checkbox is checked
      if (saveEmailToPatient && selectedSurgeryForEmail.patientId) {
        await updatePatientEmailMutation.mutateAsync({
          patientId: selectedSurgeryForEmail.patientId,
          email: emailInput,
        });
        // Invalidate preop query to get updated patient email
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id || ''}`] });
      }

      // Generate link and send email
      const response = await generateLinkMutation.mutateAsync({
        patientId: selectedSurgeryForEmail.patientId,
        surgeryId: selectedSurgeryForEmail.id,
      });
      const linkData = await response.json();
      
      await sendEmailMutation.mutateAsync({
        linkId: linkData.link.id,
        email: emailInput,
      });
      
      // Track that form was sent for this surgery
      setSentForms(prev => new Set(prev).add(selectedSurgeryForEmail.id));
    } catch (error) {
      console.error("Failed to send form:", error);
      toast({
        title: t('common.error'),
        description: t('anesthesia.preop.emailSendError'),
        variant: "destructive",
      });
    }
  };

  // Filter assessments by search term
  const filteredAssessments = (assessments || []).filter((item) => {
    if (!item.surgery) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.surgery.procedureName?.toLowerCase().includes(searchLower) ||
      item.surgery.surgeon?.toLowerCase().includes(searchLower) ||
      item.surgery.patientName?.toLowerCase().includes(searchLower)
    );
  });

  // Get all standby items (before filter, for count display)
  const allStandByItems = filteredAssessments.filter((item) => item.assessment?.standBy);
  
  // Apply standby reason filter
  const filteredStandByItems = allStandByItems.filter((item) => {
    if (standByFilter === 'all') return true;
    return item.assessment?.standByReason === standByFilter;
  });

  const groupedByStatus = {
    // Filter out noPreOpRequired surgeries from all tabs (local anesthesia only cases)
    planned: filteredAssessments.filter((item) => item.status === 'planned' && !item.assessment?.standBy && !item.surgery?.noPreOpRequired),
    draft: filteredAssessments.filter((item) => item.status === 'draft' && !item.assessment?.standBy && !item.surgery?.noPreOpRequired),
    standby: filteredStandByItems.filter((item) => !item.surgery?.noPreOpRequired),
    completed: filteredAssessments.filter((item) => item.status === 'completed' && !item.assessment?.standBy && !item.surgery?.noPreOpRequired),
  };

  // Sort by upcoming surgery date (future dates first, nearest at top; past dates after)
  const sortByPlannedDate = (items: any[]) => {
    const now = Date.now();
    return [...items].sort((a, b) => {
      const dateA = a.surgery?.plannedDate ? new Date(a.surgery.plannedDate).getTime() : Infinity;
      const dateB = b.surgery?.plannedDate ? new Date(b.surgery.plannedDate).getTime() : Infinity;
      
      const aIsFuture = dateA >= now;
      const bIsFuture = dateB >= now;
      
      // Future dates come first
      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      
      // Both future: sort ascending (closest first)
      // Both past: sort descending (most recent first)
      if (aIsFuture && bIsFuture) {
        return dateA - dateB;
      } else {
        return dateB - dateA;
      }
    });
  };

  const displayedAssessments = sortByPlannedDate(groupedByStatus[activeTab]);

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
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">{t('anesthesia.preop.title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('anesthesia.preop.subtitle')}
        </p>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mb-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:grid-cols-4 md:w-full">
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

      {/* Search and Stand-By Filter */}
      <div className="mb-6 space-y-3">
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
        
        {/* Stand-By Filter - only visible when Stand-By tab is active */}
        {activeTab === 'standby' && (
          <div className="flex flex-wrap gap-2">
            <Badge 
              variant={standByFilter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => setStandByFilter('all')}
              data-testid="filter-standby-all"
            >
              {t('anesthesia.preop.filterAll')} ({allStandByItems.length})
            </Badge>
            <Badge 
              variant={standByFilter === 'consent_required' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => setStandByFilter('consent_required')}
              data-testid="filter-standby-consent"
            >
              {t('anesthesia.preop.standByReasons.consentRequired')} ({allStandByItems.filter(i => i.assessment?.standByReason === 'consent_required').length})
            </Badge>
            <Badge 
              variant={standByFilter === 'signature_missing' ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => setStandByFilter('signature_missing')}
              data-testid="filter-standby-signature"
            >
              {t('anesthesia.preop.standByReasons.signatureMissing')} ({allStandByItems.filter(i => i.assessment?.standByReason === 'signature_missing').length})
            </Badge>
          </div>
        )}
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
                      {getPreOpSummary(item.assessment, surgery, t) && (
                        <div 
                          className="flex items-start gap-2 text-sm text-muted-foreground mt-2 pt-2 border-t border-border/50 select-text cursor-text"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                          <span data-testid={`text-preop-summary-${surgery.id}`}>{getPreOpSummary(item.assessment, surgery, t)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge & Stand-By Reason */}
                  <div className="flex flex-col items-end gap-2" data-testid={`badge-status-${surgery.id}`}>
                    {getStatusBadge(item)}
                    {item.assessment?.standBy && item.assessment?.standByReason && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 max-w-[180px] text-right">
                        {item.assessment?.standByReason === 'other' && item.assessment?.standByReasonNote 
                          ? item.assessment?.standByReasonNote 
                          : getStandByReasonLabel(item.assessment?.standByReason)}
                      </span>
                    )}
                    {/* Button to send pre-op form to patient (only for planned items) */}
                    {item.status === 'planned' && (
                      sentForms.has(surgery.id) ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {t('anesthesia.preop.formSent')}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendFormToPatient(surgery);
                            }}
                            disabled={generateLinkMutation.isPending || sendEmailMutation.isPending}
                            data-testid={`button-resend-form-${surgery.id}`}
                          >
                            {(generateLinkMutation.isPending || sendEmailMutation.isPending) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendFormToPatient(surgery);
                          }}
                          disabled={generateLinkMutation.isPending || sendEmailMutation.isPending}
                          data-testid={`button-send-form-${surgery.id}`}
                        >
                          {(generateLinkMutation.isPending || sendEmailMutation.isPending) ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Mail className="h-3 w-3 mr-1" />
                          )}
                          {t('anesthesia.preop.sendForm')}
                        </Button>
                      )
                    )}
                    {/* Button to mark surgery as not requiring pre-op (only for planned items without assessment) */}
                    {item.status === 'planned' && !item.assessment && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNoPreOpMutation.mutate({ 
                            surgeryId: surgery.id, 
                            currentValue: !!surgery.noPreOpRequired 
                          });
                        }}
                        disabled={toggleNoPreOpMutation.isPending}
                        data-testid={`button-no-preop-${surgery.id}`}
                      >
                        <EyeOff className="h-3 w-3 mr-1" />
                        {t('anesthesia.preop.noPreOpRequired')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Email Dialog for patients without email */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.preop.enterEmail')}</DialogTitle>
            <DialogDescription>
              {selectedSurgeryForEmail?.patientName && (
                <span>{t('anesthesia.preop.noEmailForPatient', { name: selectedSurgeryForEmail.patientName })}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('anesthesia.preop.patientEmail')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="patient@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                data-testid="input-patient-email"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="save-email"
                checked={saveEmailToPatient}
                onCheckedChange={(checked) => setSaveEmailToPatient(!!checked)}
                data-testid="checkbox-save-email"
              />
              <Label htmlFor="save-email" className="text-sm font-normal cursor-pointer">
                {t('anesthesia.preop.saveEmailToPatient')}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEmailDialogOpen(false);
                setEmailInput("");
                setSelectedSurgeryForEmail(null);
              }}
              data-testid="button-cancel-email"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSendEmailFromDialog}
              disabled={!emailInput || generateLinkMutation.isPending || sendEmailMutation.isPending || updatePatientEmailMutation.isPending}
              data-testid="button-send-email"
            >
              {(generateLinkMutation.isPending || sendEmailMutation.isPending || updatePatientEmailMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {t('anesthesia.preop.sendEmail')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
