import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, ClipboardList, Activity, ChevronRight, ChevronDown, Download, Loader2, ExternalLink, UserRoundCog, Send, Eye, EyeOff, Bed, Mail, StickyNote, MessageSquare } from "lucide-react";
import { getPositionDisplayLabel, getArmDisplayLabel } from "@/components/surgery/PatientPositionFields";
import { PacuBedSelector } from "@/components/anesthesia/PacuBedSelector";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import { useToast } from "@/hooks/use-toast";
import type { Module } from "@/contexts/ModuleContext";
import { downloadAnesthesiaRecordPdf } from "@/lib/downloadAnesthesiaRecordPdf";
import { SendSurgeonSummaryDialog } from "@/components/anesthesia/SendSurgeonSummaryDialog";
import { format } from "date-fns";

interface SurgerySummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surgeryId: string;
  onEditSurgery: () => void;
  onOpenPreOp: () => void;
  onOpenAnesthesia: () => void;
  onOpenSurgeryDocumentation?: () => void;
  onOpenSurgeryPreOp?: () => void;
  onEditPatient?: () => void;
  activeModule?: Module;
}

export default function SurgerySummaryDialog({
  open,
  onOpenChange,
  surgeryId,
  onEditSurgery,
  onOpenPreOp,
  onOpenAnesthesia,
  onOpenSurgeryDocumentation,
  onOpenSurgeryPreOp,
  onEditPatient,
  activeModule,
}: SurgerySummaryDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const { addons } = useHospitalAddons();
  const { data: anesthesiaSettings } = useHospitalAnesthesiaSettings();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendSummaryDialogOpen, setSendSummaryDialogOpen] = useState(false);
  const [isPhoneRevealed, setIsPhoneRevealed] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");

  // Reset phone reveal state when dialog opens
  useEffect(() => {
    if (open) {
      setIsPhoneRevealed(false);
      setNotesExpanded(false);
      setNewNoteContent("");
    }
  }, [open]);

  const obfuscatePhone = (phone: string): string => {
    if (!phone || phone.length < 4) return phone;
    const visibleEnd = phone.slice(-4);
    const hiddenPart = phone.slice(0, -4).replace(/[0-9]/g, '*');
    return hiddenPart + visibleEnd;
  };

  const handleRevealPhone = async () => {
    if (!isPhoneRevealed && patient?.id && activeHospital?.id) {
      try {
        await apiRequest('POST', '/api/activity/log', {
          action: 'view_patient_phone',
          resourceType: 'patient',
          resourceId: patient.id,
          hospitalId: activeHospital.id,
          details: { context: 'surgery_summary_dialog', surgeryId }
        });
      } catch (error) {
        console.error('Failed to log phone reveal action:', error);
      }
    }
    setIsPhoneRevealed(!isPhoneRevealed);
  };

  const { data: surgery } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId && open,
  });

  const { data: patient } = useQuery<any>({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId && open,
  });

  const { data: rooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && open,
  });

  // Find the specific room for this surgery
  const room = rooms.find(r => r.id === surgery?.surgeryRoomId);
  
  // Find the PACU bed name
  const pacuBed = rooms.find(r => r.id === surgery?.pacuBedId);

  // Fetch pre-op assessment data
  const { data: preOpAssessment, isLoading: isLoadingPreOp, isError: isPreOpError, error: preOpError } = useQuery<any>({
    queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId && open,
    retry: (failureCount, error: any) => {
      // Don't retry on 404 (not found) - it just means no data exists yet
      if (error?.status === 404) return false;
      return failureCount < 3;
    },
  });
  
  // Treat 404 as "no data" rather than an error
  const isRealError = isPreOpError && (preOpError as any)?.status !== 404;

  // Fetch case notes for this surgery
  const { data: caseNotes = [] } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/surgeries/${surgeryId}/notes`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!surgeryId && open,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", `/api/anesthesia/surgeries/${surgeryId}/notes`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
      setNewNoteContent("");
      toast({ title: t('anesthesia.caseNotes.noteAdded') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('anesthesia.caseNotes.errorCreating'), variant: "destructive" });
    },
  });

  // Fetch surgery pre-op assessment data (for surgery module)
  const { data: surgeryPreOpAssessment, isLoading: isLoadingSurgeryPreOp, isError: isSurgeryPreOpError, error: surgeryPreOpError } = useQuery<any>({
    queryKey: [`/api/surgery/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId && open && activeModule === 'surgery',
    retry: (failureCount, error: any) => {
      // Don't retry on 404 - check both error.status and error.message for 404
      const errorMessage = error?.message || '';
      if (error?.status === 404 || errorMessage.includes('404')) return false;
      return failureCount < 3;
    },
  });
  
  // Treat 404 as "no data" rather than an error - check both status and message
  const surgeryPreOpErrorMessage = (surgeryPreOpError as any)?.message || '';
  const isSurgeryPreOpRealError = isSurgeryPreOpError && 
    (surgeryPreOpError as any)?.status !== 404 && 
    !surgeryPreOpErrorMessage.includes('404');
  
  const hasSurgeryPreOpData = surgeryPreOpAssessment && (
    surgeryPreOpAssessment.height != null ||
    surgeryPreOpAssessment.weight != null ||
    surgeryPreOpAssessment.cave != null ||
    surgeryPreOpAssessment.specialNotes != null ||
    surgeryPreOpAssessment.heartRate != null ||
    surgeryPreOpAssessment.bloodPressureSystolic != null ||
    surgeryPreOpAssessment.lastSolids != null ||
    surgeryPreOpAssessment.lastClear != null ||
    surgeryPreOpAssessment.medicationsNotes != null ||
    surgeryPreOpAssessment.heartNotes != null ||
    surgeryPreOpAssessment.lungNotes != null ||
    surgeryPreOpAssessment.standBy != null ||
    surgeryPreOpAssessment.status === 'completed' ||
    surgeryPreOpAssessment.status === 'draft'
  );
  
  // Check if pre-op assessment has any meaningful data (check for presence, not truthiness)
  const hasPreOpData = preOpAssessment && (
    preOpAssessment.asa != null ||
    preOpAssessment.height != null ||
    preOpAssessment.weight != null ||
    preOpAssessment.cave != null ||
    preOpAssessment.specialNotes != null ||
    preOpAssessment.heartRate != null ||
    preOpAssessment.bloodPressureSystolic != null ||
    preOpAssessment.anesthesiaTechniques != null ||
    preOpAssessment.postOpICU != null ||
    preOpAssessment.installations != null ||
    preOpAssessment.anesthesiaOther != null ||
    preOpAssessment.informedConsentSignature != null
  );

  if (!surgery || !patient) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const patientName = `${patient.surname}, ${patient.firstName}`;
  const patientBirthday = formatDate(patient.birthday);
  const surgeryDate = formatDate(surgery.plannedDate);
  const surgeryTime = formatTime(surgery.plannedDate);
  
  // Calculate duration
  const duration = surgery.endDate ? 
    Math.round((new Date(surgery.endDate).getTime() - new Date(surgery.plannedDate).getTime()) / 60000) : 
    null;

  const handleDownloadPDF = async () => {
    if (!patient || !surgery) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: t('anesthesia.op.pdfMissingData'),
        variant: "destructive",
      });
      return;
    }

    if (!activeHospital?.id) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: t('anesthesia.op.pdfHospitalNotSelected'),
        variant: "destructive",
      });
      return;
    }

    setIsDownloadingPdf(true);
    try {
      const result = await downloadAnesthesiaRecordPdf({
        surgery,
        patient: patient as any,
        hospitalId: activeHospital.id,
        anesthesiaSettings,
      });

      if (result.success) {
        toast({
          title: t('anesthesia.patientDetail.pdfGenerated'),
          description: result.hasWarnings 
            ? t('anesthesia.patientDetail.pdfGeneratedWithWarnings')
            : t('anesthesia.patientDetail.pdfGeneratedSuccess'),
        });
      } else {
        toast({
          title: t('anesthesia.op.pdfCannotGenerate'),
          description: result.error || t('anesthesia.op.pdfGenerationFailed'),
          variant: "destructive",
        });
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <DialogTitle>{t('anesthesia.surgerySummary.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Patient Info with Allergies */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="grid grid-cols-2 gap-3 flex-1">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">{t('anesthesia.surgerySummary.name')}</div>
                  <div className="font-medium">{patientName}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">{t('anesthesia.surgerySummary.birthday')}</div>
                  <div className="font-medium">{patientBirthday}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">{t('anesthesia.surgerySummary.phone', 'Phone')}</div>
                  {patient.phone ? (
                    <div className="font-medium flex items-center gap-1">
                      <span data-testid="text-patient-phone">
                        {isPhoneRevealed ? patient.phone : obfuscatePhone(patient.phone)}
                      </span>
                      <button
                        onClick={handleRevealPhone}
                        className="p-0.5 hover:bg-muted rounded"
                        data-testid="button-reveal-phone"
                        title={isPhoneRevealed ? t('anesthesia.surgerySummary.hidePhone', 'Hide phone') : t('anesthesia.surgerySummary.showPhone', 'Show phone')}
                      >
                        {isPhoneRevealed ? (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="font-medium text-muted-foreground" data-testid="text-patient-phone-unavailable">
                      {t('anesthesia.surgerySummary.notAvailable', 'Not available')}
                    </div>
                  )}
                </div>
                {patient.sex && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">{t('anesthesia.surgerySummary.sex')}</div>
                    <div className="font-medium">{patient.sex}</div>
                  </div>
                )}
              </div>
              
              {/* Action buttons - vertically stacked on the right */}
              <div className="flex flex-col gap-2 shrink-0">
                {/* View Patient Detail Link */}
                <Link 
                  href={activeModule === 'surgery' ? `/surgery/patients/${patient.id}` : `/anesthesia/patients/${patient.id}`}
                  onClick={() => onOpenChange(false)}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    data-testid="button-view-patient-detail"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    {t('anesthesia.surgerySummary.viewPatientDetail')}
                  </Button>
                </Link>
                {/* Send Questionnaire Button */}
                {addons.questionnaire && patient && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSendDialogOpen(true)}
                    data-testid="button-send-questionnaire"
                  >
                    <Send className="h-4 w-4 mr-1 text-primary" />
                    {t('common.patientCommunication', 'Patient Communication')}
                  </Button>
                )}
              </div>
            </div>
            
            {/* Patient Allergies from Patient Record */}
            {((patient.allergies && patient.allergies.length > 0) || patient.otherAllergies) && (
              <div className="pt-2 border-t border-border/50">
                <span className="text-xs font-medium text-muted-foreground">{t('anesthesia.surgerySummary.allergies')}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {patient.allergies?.map((allergyId: string) => {
                    const allergyItem = anesthesiaSettings?.allergyList?.find(a => a.id === allergyId);
                    const displayLabel = allergyItem?.label || allergyId;
                    return (
                      <span 
                        key={allergyId}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        data-testid={`badge-summary-allergy-${allergyId}`}
                      >
                        {displayLabel}
                      </span>
                    );
                  })}
                  {patient.otherAllergies && patient.otherAllergies.split(',').map((allergy: string, index: number) => {
                    const trimmed = allergy.trim();
                    if (!trimmed) return null;
                    return (
                      <span 
                        key={`other-${index}`}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        data-testid={`badge-summary-other-allergy-${index}`}
                      >
                        {trimmed}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Collapsible Case Notes Section */}
          <div data-testid="section-case-notes">
            <button
              onClick={() => setNotesExpanded(!notesExpanded)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
              data-testid="button-toggle-case-notes"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{t('anesthesia.caseNotes.title')}</span>
                {caseNotes.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary font-medium rounded-full px-1.5 py-0.5" data-testid="badge-notes-count">
                    {caseNotes.length}
                  </span>
                )}
                {!notesExpanded && caseNotes.length > 0 && (
                  <span className="text-xs text-muted-foreground truncate ml-1" data-testid="text-latest-note-preview">
                    {caseNotes[0]?.author?.firstName ? `${caseNotes[0].author.firstName}: ` : ''}
                    {caseNotes[0]?.content?.slice(0, 60)}{caseNotes[0]?.content?.length > 60 ? '…' : ''}
                  </span>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${notesExpanded ? 'rotate-180' : ''}`} />
            </button>

            {notesExpanded && (
              <div className="mt-2 space-y-3 px-1">
                <div className="flex gap-2">
                  <Textarea
                    placeholder={t('anesthesia.caseNotes.placeholder')}
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    rows={2}
                    className="text-sm min-h-[60px]"
                    data-testid="textarea-summary-case-note"
                  />
                  <Button
                    size="icon"
                    className="shrink-0 h-[60px] w-10"
                    onClick={() => {
                      if (newNoteContent.trim()) {
                        createNoteMutation.mutate(newNoteContent.trim());
                      }
                    }}
                    disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                    data-testid="button-add-summary-note"
                  >
                    {createNoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {caseNotes.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <StickyNote className="h-6 w-6 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">{t('anesthesia.caseNotes.noNotes')}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {caseNotes.map((note: any) => (
                      <div
                        key={note.id}
                        className="border rounded-md p-2.5 text-sm"
                        data-testid={`summary-case-note-${note.id}`}
                      >
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <span className="font-medium text-foreground">
                            {note.author?.firstName} {note.author?.lastName}
                          </span>
                          <span>•</span>
                          {note.createdAt && format(new Date(note.createdAt), 'dd.MM HH:mm')}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-snug">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Cards */}
          <div className="space-y-3">
            {/* Surgery Data */}
            <Card 
              className="cursor-pointer hover:bg-accent transition-colors"
              onClick={onEditSurgery}
              data-testid="card-edit-surgery"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg shrink-0">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold mb-2">{t('anesthesia.surgerySummary.surgeryData')}</div>
                      <div className="text-sm">
                        {[
                          surgery.plannedSurgery || 'Not specified',
                          `${surgeryDate} at ${surgeryTime}`,
                          duration != null ? `${duration} min` : null,
                          room?.name,
                          surgery.surgeon ? (surgery.surgeonPhone ? `${surgery.surgeon} (${surgery.surgeonPhone})` : surgery.surgeon) : null,
                          surgery.status === 'cancelled' ? 'CANCELLED' : null
                        ].filter(Boolean).join(', ')}
                      </div>
                      {surgery.notes && (
                        <div className="text-sm mt-2 pt-2 border-t border-border/50">
                          <span className="text-xs font-medium text-muted-foreground">{t('anesthesia.surgerySummary.notes')}</span>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap" data-testid="text-summary-notes">{surgery.notes}</p>
                        </div>
                      )}
                      {(surgery.patientPosition || surgery.leftArmPosition || surgery.rightArmPosition) && (
                        <div className="mt-3 p-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg" data-testid="text-summary-positioning">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Bed className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">{t('anesthesia.surgerySummary.positioning', 'Positioning')}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {surgery.patientPosition && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                                {getPositionDisplayLabel(surgery.patientPosition, i18n.language === 'de')}
                              </span>
                            )}
                            {surgery.leftArmPosition && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/60 text-xs font-medium text-blue-800 dark:text-blue-200">
                                {i18n.language === 'de' ? 'L. Arm' : 'L. Arm'}: {getArmDisplayLabel(surgery.leftArmPosition, i18n.language === 'de')}
                              </span>
                            )}
                            {surgery.rightArmPosition && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/60 text-xs font-medium text-blue-800 dark:text-blue-200">
                                {i18n.language === 'de' ? 'R. Arm' : 'R. Arm'}: {getArmDisplayLabel(surgery.rightArmPosition, i18n.language === 'de')}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>

            {/* Pre-OP Assessment - Only shown in anesthesia module */}
            {activeModule !== 'surgery' && (
              <Card 
                className={surgery?.anesthesiaType ? "cursor-pointer hover:bg-accent transition-colors" : "opacity-50 pointer-events-none"}
                onClick={surgery?.anesthesiaType ? onOpenPreOp : undefined}
                data-testid="card-open-preop"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg shrink-0 ${surgery?.anesthesiaType ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                        <ClipboardList className={`h-5 w-5 ${surgery?.anesthesiaType ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold mb-2">{t('anesthesia.surgerySummary.preOpAssessment')}</div>
                        {!surgery?.anesthesiaType ? (
                          <div className="text-sm text-muted-foreground">
                            {t('anesthesia.surgerySummary.noAnesthesiaPlanned')}
                          </div>
                        ) : isLoadingPreOp ? (
                          <div className="text-sm text-muted-foreground">
                            {t('anesthesia.surgerySummary.loading')}
                          </div>
                        ) : isRealError ? (
                          <div className="text-sm text-destructive">
                            {t('anesthesia.surgerySummary.errorLoading')}
                          </div>
                        ) : hasPreOpData ? (
                          <div className="text-sm">
                            {(() => {
                              const parts = [];
                              
                              // General Data
                              if (preOpAssessment.asa != null && preOpAssessment.asa !== '') {
                                parts.push(`ASA ${preOpAssessment.asa}`);
                              }
                              if (preOpAssessment.weight != null && preOpAssessment.weight !== '' && preOpAssessment.weight !== 0) {
                                parts.push(`${preOpAssessment.weight}kg`);
                              }
                              if (preOpAssessment.height != null && preOpAssessment.height !== '' && preOpAssessment.height !== 0) {
                                parts.push(`${preOpAssessment.height}cm`);
                              }
                              if (preOpAssessment.heartRate != null && preOpAssessment.heartRate !== '' && preOpAssessment.heartRate !== 0) {
                                parts.push(`HR ${preOpAssessment.heartRate}`);
                              }
                              if (preOpAssessment.bloodPressureSystolic != null && preOpAssessment.bloodPressureDiastolic != null &&
                                  preOpAssessment.bloodPressureSystolic !== 0 && preOpAssessment.bloodPressureDiastolic !== 0) {
                                parts.push(`BP ${preOpAssessment.bloodPressureSystolic}/${preOpAssessment.bloodPressureDiastolic}`);
                              }
                              if (preOpAssessment.cave != null && preOpAssessment.cave !== '') {
                                parts.push(`CAVE: ${preOpAssessment.cave}`);
                              }
                              
                              // Anesthesia Techniques with sub-options
                              if (preOpAssessment.anesthesiaTechniques) {
                                const techniques = [];
                                const at = preOpAssessment.anesthesiaTechniques;
                                
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
                              
                              // Installations
                              if (preOpAssessment.installations && Object.keys(preOpAssessment.installations).length > 0) {
                                const installations = Object.entries(preOpAssessment.installations)
                                  .filter(([_, value]) => value)
                                  .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
                                  .join(', ');
                                if (installations) {
                                  parts.push(installations);
                                }
                              }
                              
                              // Post-OP ICU
                              if (preOpAssessment.postOpICU) {
                                parts.push('Post-OP ICU planned');
                              }
                              
                              // Other notes
                              if (preOpAssessment.specialNotes != null && preOpAssessment.specialNotes !== '') {
                                parts.push(preOpAssessment.specialNotes);
                              }
                              if (preOpAssessment.anesthesiaOther != null && preOpAssessment.anesthesiaOther !== '') {
                                parts.push(preOpAssessment.anesthesiaOther);
                              }
                              
                              return parts.join(', ');
                            })()}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {t('anesthesia.surgerySummary.notYetCompleted')}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Anesthesia Record - Only shown in anesthesia module */}
            {activeModule !== 'surgery' && (
              <Card 
                className={surgery?.anesthesiaType ? "cursor-pointer hover:bg-accent transition-colors" : "opacity-50 pointer-events-none"}
                onClick={surgery?.anesthesiaType ? onOpenAnesthesia : undefined}
                data-testid="card-open-anesthesia"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${surgery?.anesthesiaType ? 'bg-red-100 dark:bg-red-900' : 'bg-muted'}`}>
                        <Activity className={`h-5 w-5 ${surgery?.anesthesiaType ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="font-semibold">{t('anesthesia.surgerySummary.anesthesiaRecord')}</div>
                        <div className="text-sm text-muted-foreground">
                          {surgery?.anesthesiaType
                            ? t('anesthesia.surgerySummary.viewManage')
                            : t('anesthesia.surgerySummary.noAnesthesiaPlanned')
                          }
                        </div>
                      </div>
                    </div>
                    {surgery?.anesthesiaType && <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PACU Bed Assignment - Only shown in anesthesia module */}
            {(!activeModule || activeModule === 'anesthesia') && (
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900" data-testid="section-pacu-bed-assignment">
                <div className="flex items-center gap-2">
                  <Bed className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium">{t('anesthesia.pacu.pacuBed', 'PACU Bed')}</span>
                  {pacuBed && (
                    <span className="text-sm text-blue-700 dark:text-blue-300 font-semibold" data-testid="text-pacu-bed-current">{pacuBed.name}</span>
                  )}
                </div>
                <PacuBedSelector
                  surgeryId={surgeryId}
                  hospitalId={activeHospital?.id}
                  currentBedId={surgery?.pacuBedId}
                  currentBedName={pacuBed?.name}
                  variant="inline"
                  size="sm"
                />
              </div>
            )}

            {/* Surgery Pre-Op Assessment - Only shown in surgery module */}
            {activeModule === 'surgery' && onOpenSurgeryPreOp && (
              <Card 
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={onOpenSurgeryPreOp}
                data-testid="card-open-surgery-preop"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg shrink-0">
                        <ClipboardList className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold mb-2">{t('surgery.preop.title')}</div>
                        {isLoadingSurgeryPreOp ? (
                          <div className="text-sm text-muted-foreground">
                            {t('anesthesia.surgerySummary.loading')}
                          </div>
                        ) : hasSurgeryPreOpData ? (
                          <div className="text-sm">
                            {(() => {
                              const parts = [];
                              if (surgeryPreOpAssessment.weight != null && surgeryPreOpAssessment.weight !== '' && surgeryPreOpAssessment.weight !== 0) {
                                parts.push(`${surgeryPreOpAssessment.weight}kg`);
                              }
                              if (surgeryPreOpAssessment.height != null && surgeryPreOpAssessment.height !== '' && surgeryPreOpAssessment.height !== 0) {
                                parts.push(`${surgeryPreOpAssessment.height}cm`);
                              }
                              if (surgeryPreOpAssessment.heartRate != null && surgeryPreOpAssessment.heartRate !== '' && surgeryPreOpAssessment.heartRate !== 0) {
                                parts.push(`HR ${surgeryPreOpAssessment.heartRate}`);
                              }
                              if (surgeryPreOpAssessment.bloodPressureSystolic != null && surgeryPreOpAssessment.bloodPressureDiastolic != null &&
                                  surgeryPreOpAssessment.bloodPressureSystolic !== 0 && surgeryPreOpAssessment.bloodPressureDiastolic !== 0) {
                                parts.push(`BP ${surgeryPreOpAssessment.bloodPressureSystolic}/${surgeryPreOpAssessment.bloodPressureDiastolic}`);
                              }
                              if (surgeryPreOpAssessment.cave != null && surgeryPreOpAssessment.cave !== '') {
                                parts.push(`CAVE: ${surgeryPreOpAssessment.cave}`);
                              }
                              if (surgeryPreOpAssessment.specialNotes != null && surgeryPreOpAssessment.specialNotes !== '') {
                                parts.push(surgeryPreOpAssessment.specialNotes);
                              }
                              if (surgeryPreOpAssessment.status === 'completed') {
                                parts.push(`✓ ${t('common.completed')}`);
                              }
                              return parts.join(', ');
                            })()}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {t('anesthesia.surgerySummary.notYetCompleted')}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Surgery Nursing Documentation - Only shown in surgery module */}
            {activeModule === 'surgery' && onOpenSurgeryDocumentation && (
              <Card 
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={onOpenSurgeryDocumentation}
                data-testid="card-open-surgery-documentation"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                        <UserRoundCog className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <div className="font-semibold">{t('surgery.opDetail.title')}</div>
                        <div className="text-sm text-muted-foreground">
                          {t('surgery.opList.subtitle')}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer with Buttons */}
        <div className="shrink-0 bg-background border-t px-6 py-4 flex flex-wrap gap-2 justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadPDF}
              disabled={isDownloadingPdf}
              data-testid="button-download-pdf-summary"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('anesthesia.op.generatingPdf')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  {t('anesthesia.op.downloadPdf')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setSendSummaryDialogOpen(true)}
              data-testid="button-send-surgeon-summary"
            >
              <Mail className="h-4 w-4 mr-2" />
              {t('anesthesia.surgerySummary.sendSummary', 'Send Summary')}
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-summary"
          >
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
      
      {/* Send Questionnaire Dialog */}
      {patient && (
        <SendQuestionnaireDialog
          open={sendDialogOpen}
          onOpenChange={setSendDialogOpen}
          patientId={patient.id}
          patientName={`${patient.firstName} ${patient.surname}`}
          patientEmail={patient.email}
          patientPhone={patient.phone}
        />
      )}

      {/* Send Surgeon Summary Dialog */}
      {patient && surgery && (
        <SendSurgeonSummaryDialog
          open={sendSummaryDialogOpen}
          onOpenChange={setSendSummaryDialogOpen}
          surgery={surgery}
          patient={patient}
        />
      )}
    </Dialog>
  );
}
