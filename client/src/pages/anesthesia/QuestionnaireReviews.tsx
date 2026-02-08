import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Search, 
  User, 
  Calendar, 
  Clock, 
  FileCheck, 
  FileText,
  Pill,
  AlertTriangle,
  Heart,
  Cigarette,
  Stethoscope,
  MessageSquare,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Circle,
  ExternalLink,
  Download,
  Image as ImageIcon,
  Paperclip,
  X
} from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCanWrite } from "@/hooks/useCanWrite";

interface QuestionnaireResponse {
  id: string;
  linkId: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientBirthday?: string;
  patientEmail?: string;
  patientPhone?: string;
  allergies?: string[];
  allergiesNotes?: string;
  medications?: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    reason?: string;
  }>;
  medicationsNotes?: string;
  conditions?: Record<string, { checked: boolean; notes?: string }>;
  smokingStatus?: string;
  smokingDetails?: string;
  alcoholStatus?: string;
  alcoholDetails?: string;
  height?: string;
  weight?: string;
  previousSurgeries?: string;
  previousAnesthesiaProblems?: string;
  pregnancyStatus?: string;
  breastfeeding?: boolean;
  womanHealthNotes?: string;
  additionalNotes?: string;
  questionsForDoctor?: string;
  dentalIssues?: Record<string, boolean>;
  dentalNotes?: string;
  ponvTransfusionIssues?: Record<string, boolean>;
  ponvTransfusionNotes?: string;
  drugUse?: Record<string, boolean>;
  drugUseDetails?: string;
  noAllergies?: boolean;
  noMedications?: boolean;
  noConditions?: boolean;
  noSmokingAlcohol?: boolean;
  noPreviousSurgeries?: boolean;
  noAnesthesiaProblems?: boolean;
  noDentalIssues?: boolean;
  noPonvIssues?: boolean;
  noDrugUse?: boolean;
  outpatientCaregiverFirstName?: string;
  outpatientCaregiverLastName?: string;
  outpatientCaregiverPhone?: string;
  submittedAt?: string;
  lastSavedAt?: string;
}

interface QuestionnaireUpload {
  id: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  category: 'medication_list' | 'diagnosis' | 'exam_result' | 'other';
  fileUrl?: string;
}

interface QuestionnaireReview {
  id: string;
  responseId: string;
  reviewedBy: string;
  mappings?: Record<string, any>;
  reviewNotes?: string;
  status: 'pending' | 'partial' | 'completed';
  completedAt?: string;
}

interface QuestionnaireLink {
  id: string;
  token: string;
  patientId?: string;
  surgeryId?: string;
  status: 'pending' | 'started' | 'submitted' | 'reviewed' | 'expired';
  createdAt?: string;
  expiresAt?: string;
}

interface ResponseListItem {
  id: string;
  response: QuestionnaireResponse;
  link: QuestionnaireLink;
  patient?: {
    id: string;
    firstName: string;
    surname: string;
    patientNumber?: string;
    birthday?: string;
  };
  review?: QuestionnaireReview;
}

interface ResponseDetail {
  response: QuestionnaireResponse;
  link: QuestionnaireLink;
  uploads: QuestionnaireUpload[];
  review?: QuestionnaireReview;
  patient?: {
    id: string;
    firstName: string;
    surname: string;
    patientNumber?: string;
    birthday?: string;
    sex?: 'M' | 'F' | 'O';
  };
}

export default function QuestionnaireReviews() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const canWrite = useCanWrite();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "reviewed">("pending");
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "partial" | "completed">("pending");

  const { data: responses = [], isLoading } = useQuery<ResponseListItem[]>({
    queryKey: ['/api/questionnaire/responses'],
    queryFn: async () => {
      const res = await fetch('/api/questionnaire/responses', {
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch responses');
      return res.json();
    },
    enabled: !!activeHospital?.id,
  });

  const { data: responseDetail, isLoading: isLoadingDetail } = useQuery<ResponseDetail>({
    queryKey: ['/api/questionnaire/responses', selectedResponseId],
    queryFn: async () => {
      const res = await fetch(`/api/questionnaire/responses/${selectedResponseId}`, {
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch response details');
      return res.json();
    },
    enabled: !!selectedResponseId && !!activeHospital?.id,
  });

  const reviewMutation = useMutation({
    mutationFn: async (data: { status: string; reviewNotes: string }) => {
      const res = await fetch(`/api/questionnaire/responses/${selectedResponseId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save review');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/responses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/responses', selectedResponseId] });
      toast({
        title: t('questionnaire.review.saved'),
        description: t('questionnaire.review.savedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('questionnaire.review.saveError'),
        variant: 'destructive',
      });
    },
  });

  const filteredResponses = responses.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const patientName = `${item.patient?.firstName || ''} ${item.patient?.surname || ''} ${item.response?.patientFirstName || ''} ${item.response?.patientLastName || ''}`.toLowerCase();
    const patientNumber = item.patient?.patientNumber?.toLowerCase() || '';
    return patientName.includes(searchLower) || patientNumber.includes(searchLower);
  });

  const pendingResponses = filteredResponses.filter((item) => 
    !item.review || item.review.status !== 'completed'
  );
  const reviewedResponses = filteredResponses.filter((item) => 
    item.review?.status === 'completed'
  );

  const displayedResponses = activeTab === "pending" ? pendingResponses : reviewedResponses;

  const handleSelectResponse = (responseId: string) => {
    setSelectedResponseId(responseId);
    const response = responses.find(r => r.id === responseId);
    if (response?.review) {
      setReviewNotes(response.review.reviewNotes || '');
      setReviewStatus(response.review.status);
    } else {
      setReviewNotes('');
      setReviewStatus('pending');
    }
  };

  const handleSaveReview = () => {
    if (!selectedResponseId) return;
    reviewMutation.mutate({ status: reviewStatus, reviewNotes });
  };

  const formatUploadCategory = (category: string) => {
    switch (category) {
      case 'medication_list': return t('questionnaire.uploads.category.medication_list');
      case 'diagnosis': return t('questionnaire.uploads.category.diagnosis');
      case 'exam_result': return t('questionnaire.uploads.category.exam_result');
      default: return t('questionnaire.uploads.category.other');
    }
  };

  const formatSmokingStatus = (status: string) => {
    switch (status) {
      case 'never': return t('questionnaire.lifestyle.smoking.never');
      case 'former': return t('questionnaire.lifestyle.smoking.former');
      case 'current': return t('questionnaire.lifestyle.smoking.current');
      default: return status;
    }
  };

  const formatAlcoholStatus = (status: string) => {
    switch (status) {
      case 'never': return t('questionnaire.lifestyle.alcohol.never');
      case 'occasional': return t('questionnaire.lifestyle.alcohol.occasional');
      case 'moderate': return t('questionnaire.lifestyle.alcohol.moderate');
      case 'heavy': return t('questionnaire.lifestyle.alcohol.heavy');
      default: return status;
    }
  };

  const formatPregnancyStatus = (status: string) => {
    switch (status) {
      case 'not_applicable': return t('questionnaire.history.pregnancy.notApplicable');
      case 'no': return t('questionnaire.history.pregnancy.no');
      case 'possible': return t('questionnaire.history.pregnancy.possible');
      case 'yes': return t('questionnaire.history.pregnancy.yes');
      default: return status;
    }
  };

  const formatConditionKey = (key: string) => {
    const labelMap: Record<string, string> = {
      'anesthesiaHistory': 'Anesthesia History',
      'ponvTransfusion': 'PONV/Transfusions',
      'dentalIssues': 'Dental Issues',
    };
    if (labelMap[key]) return labelMap[key];
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
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

  const getStatusBadge = (item: ResponseListItem) => {
    if (item.review?.status === 'completed') {
      return <Badge className="bg-green-500 text-white" data-testid={`badge-status-completed-${item.id}`}>{t('questionnaire.review.statusCompleted')}</Badge>;
    }
    if (item.review?.status === 'partial') {
      return <Badge className="bg-yellow-500 text-white" data-testid={`badge-status-partial-${item.id}`}>{t('questionnaire.review.statusPartial')}</Badge>;
    }
    return <Badge variant="secondary" data-testid={`badge-status-pending-${item.id}`}>{t('questionnaire.review.statusPending')}</Badge>;
  };

  return (
    <div className="page-container" data-testid="questionnaire-reviews-page">
      <div className="content-card">
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)]">
          <div className="lg:w-1/3 flex flex-col">
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2" data-testid="text-page-title">
                  <FileCheck className="h-5 w-5" />
                  {t('questionnaire.review.title')}
                </CardTitle>
                <CardDescription>{t('questionnaire.review.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('questionnaire.review.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "reviewed")}>
                  <TabsList className="w-full">
                    <TabsTrigger value="pending" className="flex-1" data-testid="tab-pending">
                      {t('questionnaire.review.tabPending')}
                      {pendingResponses.length > 0 && (
                        <Badge variant="secondary" className="ml-2">{pendingResponses.length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="reviewed" className="flex-1" data-testid="tab-reviewed">
                      {t('questionnaire.review.tabReviewed')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <ScrollArea className="flex-1">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" data-testid="loading-spinner" />
                    </div>
                  ) : displayedResponses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground" data-testid="text-empty-list">
                      {activeTab === "pending" 
                        ? t('questionnaire.review.noPending')
                        : t('questionnaire.review.noReviewed')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayedResponses.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSelectResponse(item.id)}
                          className={`w-full p-3 rounded-lg border text-left transition-colors ${
                            selectedResponseId === item.id 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:bg-accent'
                          }`}
                          data-testid={`button-response-${item.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span className="font-medium truncate" data-testid={`text-patient-name-${item.id}`}>
                                  {item.patient?.firstName} {item.patient?.surname}
                                  {!item.patient && item.response?.patientFirstName && (
                                    <> ({item.response.patientFirstName} {item.response.patientLastName})</>
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <Calendar className="h-3 w-3" />
                                <span data-testid={`text-submitted-date-${item.id}`}>
                                  {item.response?.submittedAt 
                                    ? formatDate(item.response.submittedAt)
                                    : formatDate(item.response?.lastSavedAt || '')}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(item)}
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="lg:w-2/3 flex flex-col">
            {!selectedResponseId ? (
              <Card className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground" data-testid="text-select-response">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('questionnaire.review.selectResponse')}</p>
                </div>
              </Card>
            ) : isLoadingDetail ? (
              <Card className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" data-testid="loading-detail" />
              </Card>
            ) : responseDetail ? (
              <Card className="flex-1 flex flex-col overflow-hidden">
                <CardHeader className="pb-2 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2" data-testid="text-detail-patient-name">
                        <User className="h-5 w-5" />
                        {responseDetail.patient?.firstName} {responseDetail.patient?.surname}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        {responseDetail.patient?.birthday && (
                          <span data-testid="text-patient-age">
                            {calculateAge(responseDetail.patient.birthday)} {t('common.years')} 
                            ({formatDate(responseDetail.patient.birthday)})
                          </span>
                        )}
                        {responseDetail.patient?.patientNumber && (
                          <span data-testid="text-patient-number">#{responseDetail.patient.patientNumber}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedResponseId(null)}
                      data-testid="button-close-detail"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.personal.height')}</div>
                        <div data-testid="text-height">{responseDetail.response.height || '-'} cm</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.personal.weight')}</div>
                        <div data-testid="text-weight">{responseDetail.response.weight || '-'} kg</div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-3">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        {t('questionnaire.allergies.title')}
                        {responseDetail.response.noAllergies && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" data-testid="badge-no-allergies">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('questionnaire.review.noneConfirmed')}
                          </span>
                        )}
                      </h3>
                      {responseDetail.response.noAllergies ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-no-allergies">
                          {t('questionnaire.allergies.none')}
                        </p>
                      ) : responseDetail.response.allergies && responseDetail.response.allergies.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2" data-testid="list-allergies">
                            {responseDetail.response.allergies.map((allergy, i) => (
                              <Badge key={i} variant="destructive">{allergy}</Badge>
                            ))}
                          </div>
                          {responseDetail.response.allergiesNotes && (
                            <p className="text-sm text-muted-foreground" data-testid="text-allergies-notes">
                              {responseDetail.response.allergiesNotes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground" data-testid="text-no-allergies">
                          {t('questionnaire.allergies.none')}
                        </p>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-3">
                        <Pill className="h-4 w-4 text-blue-500" />
                        {t('questionnaire.medications.title')}
                        {responseDetail.response.noMedications && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" data-testid="badge-no-medications">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('questionnaire.review.noneConfirmed')}
                          </span>
                        )}
                      </h3>
                      {responseDetail.response.noMedications ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-no-medications">
                          {t('questionnaire.review.noMedications')}
                        </p>
                      ) : responseDetail.response.medications && responseDetail.response.medications.length > 0 ? (
                        <div className="space-y-2" data-testid="list-medications">
                          {responseDetail.response.medications.map((med, i) => (
                            <div key={i} className="p-2 rounded border bg-muted/50">
                              <div className="font-medium">{med.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {med.dosage && <span>{med.dosage}</span>}
                                {med.frequency && <span> • {med.frequency}</span>}
                                {med.reason && <span> • {med.reason}</span>}
                              </div>
                            </div>
                          ))}
                          {responseDetail.response.medicationsNotes && (
                            <p className="text-sm text-muted-foreground mt-2" data-testid="text-medications-notes">
                              {responseDetail.response.medicationsNotes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground" data-testid="text-no-medications">
                          {t('questionnaire.review.noMedications')}
                        </p>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-3">
                        <Heart className="h-4 w-4 text-red-500" />
                        {t('questionnaire.conditions.title')}
                        {responseDetail.response.noConditions && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" data-testid="badge-no-conditions">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('questionnaire.review.noneConfirmed')}
                          </span>
                        )}
                      </h3>
                      {responseDetail.response.noConditions ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-no-conditions">
                          {t('questionnaire.review.noConditions')}
                        </p>
                      ) : responseDetail.response.conditions && Object.keys(responseDetail.response.conditions).length > 0 ? (
                        <div className="space-y-2" data-testid="list-conditions">
                          {Object.entries(responseDetail.response.conditions)
                            .filter(([_, val]) => val.checked)
                            .map(([key, val]) => (
                              <div key={key} className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                                <div>
                                  <span className="font-medium">{formatConditionKey(key)}</span>
                                  {val.notes && (
                                    <p className="text-sm text-muted-foreground">{val.notes}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          {Object.values(responseDetail.response.conditions).every(v => !v.checked) && (
                            <p className="text-sm text-muted-foreground">{t('questionnaire.review.noConditions')}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground" data-testid="text-no-conditions">
                          {t('questionnaire.review.noConditions')}
                        </p>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-3">
                        <Cigarette className="h-4 w-4 text-gray-500" />
                        {t('questionnaire.lifestyle.title')}
                        {responseDetail.response.noSmokingAlcohol && responseDetail.response.noDrugUse && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" data-testid="badge-no-lifestyle">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('questionnaire.review.noneConfirmed')}
                          </span>
                        )}
                      </h3>
                      {responseDetail.response.noSmokingAlcohol ? (
                        <p className="text-sm text-muted-foreground mb-2" data-testid="text-no-smoking-alcohol">
                          {t('questionnaire.review.noSmokingAlcohol')}
                        </p>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2 mb-2">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.lifestyle.smoking.title')}</div>
                            <div data-testid="text-smoking-status">
                              {responseDetail.response.smokingStatus 
                                ? formatSmokingStatus(responseDetail.response.smokingStatus)
                                : '-'}
                            </div>
                            {responseDetail.response.smokingDetails && (
                              <p className="text-sm text-muted-foreground">{responseDetail.response.smokingDetails}</p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.lifestyle.alcohol.title')}</div>
                            <div data-testid="text-alcohol-status">
                              {responseDetail.response.alcoholStatus 
                                ? formatAlcoholStatus(responseDetail.response.alcoholStatus)
                                : '-'}
                            </div>
                            {responseDetail.response.alcoholDetails && (
                              <p className="text-sm text-muted-foreground">{responseDetail.response.alcoholDetails}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-3">
                        <Stethoscope className="h-4 w-4 text-purple-500" />
                        {t('questionnaire.history.title')}
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.history.surgeries')}</div>
                          {responseDetail.response.noPreviousSurgeries ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" data-testid="badge-no-surgeries">
                              <CheckCircle2 className="h-3 w-3" />
                              {t('questionnaire.review.noneConfirmed')}
                            </span>
                          ) : (
                            <div data-testid="text-previous-surgeries">
                              {responseDetail.response.previousSurgeries || '-'}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.history.anesthesia')}</div>
                          {responseDetail.response.noAnesthesiaProblems ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" data-testid="badge-no-anesthesia">
                              <CheckCircle2 className="h-3 w-3" />
                              {t('questionnaire.review.noneConfirmed')}
                            </span>
                          ) : (
                            <div data-testid="text-anesthesia-problems">
                              {responseDetail.response.previousAnesthesiaProblems || '-'}
                            </div>
                          )}
                        </div>
                        {(responseDetail.response.pregnancyStatus || responseDetail.response.breastfeeding) && (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.history.pregnancy')}</div>
                            <div data-testid="text-pregnancy-status">
                              {responseDetail.response.pregnancyStatus 
                                ? formatPregnancyStatus(responseDetail.response.pregnancyStatus)
                                : '-'}
                              {responseDetail.response.breastfeeding && ` • ${t('questionnaire.history.breastfeeding')}`}
                            </div>
                            {responseDetail.response.womanHealthNotes && (
                              <p className="text-sm text-muted-foreground">{responseDetail.response.womanHealthNotes}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {responseDetail.uploads && responseDetail.uploads.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="flex items-center gap-2 font-semibold mb-3">
                            <Paperclip className="h-4 w-4 text-indigo-500" />
                            {t('questionnaire.uploads.title')}
                          </h3>
                          <div className="space-y-2" data-testid="list-uploads">
                            {responseDetail.uploads.map((upload) => (
                              <div key={upload.id} className="flex items-center justify-between p-2 rounded border">
                                <div className="flex items-center gap-2">
                                  {upload.mimeType?.startsWith('image/') ? (
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <div>
                                    <div className="font-medium text-sm">{upload.fileName}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatUploadCategory(upload.category)}
                                      {upload.fileSize && ` • ${(upload.fileSize / 1024).toFixed(0)} KB`}
                                    </div>
                                  </div>
                                </div>
                                {upload.fileUrl && (
                                  <Button variant="ghost" size="sm" asChild data-testid={`button-download-${upload.id}`}>
                                    <a href={upload.fileUrl} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {(responseDetail.response.outpatientCaregiverFirstName || responseDetail.response.outpatientCaregiverLastName || responseDetail.response.outpatientCaregiverPhone) && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="flex items-center gap-2 font-semibold mb-3">
                            <User className="h-4 w-4 text-blue-500" />
                            {t('questionnaire.outpatientCaregiver.title', 'Outpatient Caregiver')}
                          </h3>
                          <div className="grid grid-cols-3 gap-4">
                            {responseDetail.response.outpatientCaregiverFirstName && (
                              <div>
                                <div className="text-sm text-muted-foreground">{t('questionnaire.outpatientCaregiver.firstName', 'First Name')}</div>
                                <div className="font-medium" data-testid="text-caregiver-firstname">{responseDetail.response.outpatientCaregiverFirstName}</div>
                              </div>
                            )}
                            {responseDetail.response.outpatientCaregiverLastName && (
                              <div>
                                <div className="text-sm text-muted-foreground">{t('questionnaire.outpatientCaregiver.lastName', 'Last Name')}</div>
                                <div className="font-medium" data-testid="text-caregiver-lastname">{responseDetail.response.outpatientCaregiverLastName}</div>
                              </div>
                            )}
                            {responseDetail.response.outpatientCaregiverPhone && (
                              <div>
                                <div className="text-sm text-muted-foreground">{t('questionnaire.outpatientCaregiver.phone', 'Phone')}</div>
                                <div className="font-medium" data-testid="text-caregiver-phone">{responseDetail.response.outpatientCaregiverPhone}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {(responseDetail.response.dentalNotes || responseDetail.response.ponvTransfusionNotes || 
                      (responseDetail.response.drugUse && Object.values(responseDetail.response.drugUse).some(v => v))) && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="flex items-center gap-2 font-semibold mb-3">
                            <Stethoscope className="h-4 w-4 text-red-500" />
                            {t('questionnaire.additionalMedical.title', 'Additional Medical Information')}
                          </h3>
                          <div className="space-y-4">
                            {responseDetail.response.dentalNotes && (
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.additionalMedical.dentalNotes', 'Dental Notes')}</div>
                                <div className="p-2 rounded bg-muted/50" data-testid="text-dental-notes">
                                  {responseDetail.response.dentalNotes}
                                </div>
                              </div>
                            )}
                            {responseDetail.response.ponvTransfusionNotes && (
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.additionalMedical.ponvTransfusionNotes', 'PONV/Transfusion Notes')}</div>
                                <div className="p-2 rounded bg-muted/50" data-testid="text-ponv-notes">
                                  {responseDetail.response.ponvTransfusionNotes}
                                </div>
                              </div>
                            )}
                            {responseDetail.response.drugUse && Object.values(responseDetail.response.drugUse).some(v => v) && (
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.additionalMedical.drugUse', 'Drug Use')}</div>
                                <div className="p-2 rounded bg-muted/50" data-testid="text-drug-use">
                                  <div>{Object.entries(responseDetail.response.drugUse).filter(([_, v]) => v).map(([k]) => k).join(', ')}</div>
                                  {responseDetail.response.drugUseDetails && (
                                    <div className="mt-1 text-sm">{responseDetail.response.drugUseDetails}</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {(responseDetail.response.additionalNotes || responseDetail.response.questionsForDoctor) && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="flex items-center gap-2 font-semibold mb-3">
                            <MessageSquare className="h-4 w-4 text-teal-500" />
                            {t('questionnaire.notes.title')}
                          </h3>
                          <div className="space-y-4">
                            {responseDetail.response.additionalNotes && (
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.notes.additional')}</div>
                                <div className="p-2 rounded bg-muted/50" data-testid="text-additional-notes">
                                  {responseDetail.response.additionalNotes}
                                </div>
                              </div>
                            )}
                            {responseDetail.response.questionsForDoctor && (
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-muted-foreground">{t('questionnaire.notes.questions')}</div>
                                <Alert>
                                  <AlertDescription data-testid="text-questions-for-doctor">
                                    {responseDetail.response.questionsForDoctor}
                                  </AlertDescription>
                                </Alert>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    <Separator />

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-3">
                        <FileCheck className="h-4 w-4 text-green-500" />
                        {t('questionnaire.review.reviewSection')}
                      </h3>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t('questionnaire.review.status')}</label>
                          <Select 
                            value={reviewStatus} 
                            onValueChange={(v) => setReviewStatus(v as typeof reviewStatus)}
                            disabled={!canWrite}
                          >
                            <SelectTrigger data-testid="select-review-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">{t('questionnaire.review.statusPending')}</SelectItem>
                              <SelectItem value="partial">{t('questionnaire.review.statusPartial')}</SelectItem>
                              <SelectItem value="completed">{t('questionnaire.review.statusCompleted')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t('questionnaire.review.notes')}</label>
                          <Textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder={t('questionnaire.review.notesPlaceholder')}
                            rows={3}
                            disabled={!canWrite}
                            data-testid="textarea-review-notes"
                          />
                        </div>
                        {canWrite && (
                          <Button 
                            onClick={handleSaveReview}
                            disabled={reviewMutation.isPending}
                            data-testid="button-save-review"
                          >
                            {reviewMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                            )}
                            {t('questionnaire.review.saveReview')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
