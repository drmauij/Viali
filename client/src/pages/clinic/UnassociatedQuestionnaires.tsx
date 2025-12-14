import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  FileQuestion, 
  UserPlus, 
  Link2, 
  Calendar,
  Mail,
  Phone,
  Loader2,
  ChevronRight,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/dateUtils";
import type { Patient, PatientQuestionnaireResponse, PatientQuestionnaireLink } from "@shared/schema";

interface UnassociatedResponse extends PatientQuestionnaireResponse {
  link: PatientQuestionnaireLink;
}

export default function UnassociatedQuestionnaires() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [associateDialogOpen, setAssociateDialogOpen] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<UnassociatedResponse | null>(null);
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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

  const hospitalId = activeHospital?.id;
  const dateLocale = i18n.language === 'de' ? de : enUS;

  // Fetch questionnaire token for the hospital
  const { data: questionnaireTokenData } = useQuery<{ questionnaireToken: string | null }>({
    queryKey: [`/api/admin/${hospitalId}/questionnaire-token`],
    enabled: !!hospitalId,
  });

  const getQuestionnaireUrl = () => {
    if (!questionnaireTokenData?.questionnaireToken) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/questionnaire/hospital/${questionnaireTokenData.questionnaireToken}`;
  };

  const handleCopyLink = async () => {
    const url = getQuestionnaireUrl();
    if (url) {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      toast({
        title: t('common.copied', 'Copied'),
        description: t('questionnaire.linkCopied', 'Link copied to clipboard'),
      });
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const { data: responses = [], isLoading } = useQuery<UnassociatedResponse[]>({
    queryKey: ['/api/questionnaire/unassociated', hospitalId],
    queryFn: async () => {
      const res = await fetch('/api/questionnaire/unassociated', {
        credentials: 'include',
        headers: {
          'X-Hospital-Id': hospitalId || '',
        }
      });
      if (!res.ok) throw new Error('Failed to fetch unassociated responses');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['/api/patients', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/patients?hospitalId=${hospitalId}`, {
        credentials: 'include',
        headers: {
          'X-Hospital-Id': hospitalId || '',
        }
      });
      if (!res.ok) throw new Error('Failed to fetch patients');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const associateMutation = useMutation({
    mutationFn: async ({ responseId, patientId }: { responseId: string; patientId: string }) => {
      return await apiRequest('POST', `/api/questionnaire/responses/${responseId}/associate`, { patientId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/unassociated', hospitalId] });
      toast({
        title: t('questionnaire.unassociated.associationSuccess', 'Successfully linked'),
        description: t('questionnaire.unassociated.associationSuccessDesc', 'The questionnaire has been linked to the patient.'),
      });
      setAssociateDialogOpen(false);
      setSelectedResponse(null);
      setSelectedPatient(null);
      setPatientSearchTerm("");
    },
    onError: () => {
      toast({
        title: t('common.error', 'Error'),
        description: t('questionnaire.unassociated.associationError', 'Failed to link questionnaire to patient.'),
        variant: 'destructive',
      });
    },
  });

  const filteredResponses = responses.filter(response => {
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    const name = `${response.patientFirstName || ''} ${response.patientLastName || ''}`.toLowerCase();
    const email = (response.patientEmail || '').toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const filteredPatients = patients.filter(patient => {
    if (!patientSearchTerm.trim()) return true;
    const query = patientSearchTerm.toLowerCase();
    const fullName = `${patient.firstName} ${patient.surname}`.toLowerCase();
    const reverseName = `${patient.surname} ${patient.firstName}`.toLowerCase();
    return fullName.includes(query) || 
           reverseName.includes(query) || 
           patient.patientNumber.toLowerCase().includes(query) ||
           patient.birthday.includes(patientSearchTerm);
  });

  const handleOpenAssociateDialog = (response: UnassociatedResponse) => {
    setSelectedResponse(response);
    setAssociateDialogOpen(true);
    setPatientSearchTerm("");
    setSelectedPatient(null);
  };

  const handleAssociate = () => {
    if (!selectedResponse || !selectedPatient) return;
    associateMutation.mutate({
      responseId: selectedResponse.id,
      patientId: selectedPatient.id,
    });
  };

  const handleCreatePatient = () => {
    if (!selectedResponse) return;
    setLocation(`/clinic/patients?create=true&firstName=${encodeURIComponent(selectedResponse.patientFirstName || '')}&lastName=${encodeURIComponent(selectedResponse.patientLastName || '')}&birthday=${encodeURIComponent(selectedResponse.patientBirthday || '')}&email=${encodeURIComponent(selectedResponse.patientEmail || '')}`);
  };

  if (!hospitalId) {
    return (
      <div className="container mx-auto p-4">
        <p className="text-muted-foreground">{t('common.noHospitalAccess')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('questionnaire.unassociated.title', 'Unassociated Questionnaires')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('questionnaire.unassociated.subtitle', 'Link questionnaire submissions to patient records')}
          </p>
        </div>
        {questionnaireTokenData?.questionnaireToken && (
          <Button
            variant="outline"
            onClick={handleCopyLink}
            className="gap-2"
            data-testid="button-copy-open-questionnaire-link"
          >
            {linkCopied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {t('questionnaire.openLink', 'Open Questionnaire Link')}
          </Button>
        )}
      </div>

      <div className="mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('questionnaire.unassociated.searchPlaceholder', 'Search by name or email...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-questionnaires"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredResponses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {t('questionnaire.unassociated.noResponses', 'No unassociated questionnaires')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              {t('questionnaire.unassociated.noResponsesDesc', 'When patients submit questionnaires through the general clinic link, they will appear here for review and association.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredResponses.map((response) => (
            <Card 
              key={response.id}
              className="hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => handleOpenAssociateDialog(response)}
              data-testid={`questionnaire-response-${response.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">
                        {response.patientFirstName} {response.patientLastName}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {t('questionnaire.unassociated.newSubmission', 'New')}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {response.patientBirthday && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(response.patientBirthday)}
                        </span>
                      )}
                      {response.patientEmail && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {response.patientEmail}
                        </span>
                      )}
                      {response.patientPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {response.patientPhone}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('questionnaire.unassociated.submittedAt', 'Submitted')}: {
                        response.submittedAt 
                          ? format(new Date(response.submittedAt), 'PPp', { locale: dateLocale })
                          : '-'
                      }
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={associateDialogOpen} onOpenChange={setAssociateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-associate-questionnaire">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              {t('questionnaire.unassociated.linkToPatient', 'Link to Patient')}
            </DialogTitle>
            <DialogDescription>
              {t('questionnaire.unassociated.linkDescription', 'Search for an existing patient or create a new one.')}
            </DialogDescription>
          </DialogHeader>

          {selectedResponse && (
            <div className="space-y-4">
              <Card className="bg-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('questionnaire.unassociated.questionnaireData', 'Questionnaire Data')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('anesthesia.patients.firstname')}:</span>
                      <p className="font-medium">{selectedResponse.patientFirstName || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('anesthesia.patients.surname')}:</span>
                      <p className="font-medium">{selectedResponse.patientLastName || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('anesthesia.patients.dateOfBirth')}:</span>
                      <p className="font-medium">{selectedResponse.patientBirthday ? formatDate(selectedResponse.patientBirthday) : '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <p className="font-medium">{selectedResponse.patientEmail || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('questionnaire.unassociated.searchPatients', 'Search patients...')}
                    value={patientSearchTerm}
                    onChange={(e) => setPatientSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-patients-associate"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto border rounded-md">
                  {filteredPatients.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {t('questionnaire.unassociated.noPatientsFound', 'No patients found')}
                    </div>
                  ) : (
                    filteredPatients.slice(0, 10).map((patient) => (
                      <div
                        key={patient.id}
                        className={`p-3 cursor-pointer hover:bg-accent border-b last:border-b-0 ${
                          selectedPatient?.id === patient.id ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => setSelectedPatient(patient)}
                        data-testid={`patient-option-${patient.id}`}
                      >
                        <div className="font-medium">
                          {patient.surname}, {patient.firstName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(patient.birthday)} • {patient.patientNumber}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">{t('common.or', 'or')}</span>
                <div className="flex-1 border-t" />
              </div>

              <Button 
                variant="outline" 
                className="w-full gap-2" 
                onClick={handleCreatePatient}
                data-testid="button-create-new-patient"
              >
                <UserPlus className="h-4 w-4" />
                {t('questionnaire.unassociated.createNewPatient', 'Create New Patient')}
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAssociateDialogOpen(false)}
              data-testid="button-cancel-associate"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button 
              onClick={handleAssociate}
              disabled={!selectedPatient || associateMutation.isPending}
              data-testid="button-confirm-associate"
            >
              {associateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              {t('questionnaire.unassociated.linkButton', 'Link to Patient')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
