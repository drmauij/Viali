import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import { DateInput } from "@/components/ui/date-input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PatientPositionFields } from "@/components/surgery/PatientPositionFields";
import { 
  User,
  Stethoscope,
  Calendar,
  Phone,
  Mail,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Building2,
  Check,
  ChevronsUpDown
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { formatDateForInput } from "@/lib/dateUtils";
import AddressAutocomplete from "@/components/AddressAutocomplete";

interface FormData {
  surgeonFirstName: string;
  surgeonLastName: string;
  surgeonEmail: string;
  surgeonPhone: string;
  surgeryName: string;
  chopCode: string;
  surgerySide: "" | "left" | "right" | "both";
  patientPosition: "" | "supine" | "trendelenburg" | "reverse_trendelenburg" | "lithotomy" | "lateral_decubitus" | "prone" | "jackknife" | "sitting" | "kidney" | "lloyd_davies";
  leftArmPosition: "" | "ausgelagert" | "angelagert";
  rightArmPosition: "" | "ausgelagert" | "angelagert";
  antibioseProphylaxe: boolean;
  surgeryDurationMinutes: number;
  withAnesthesia: boolean;
  anesthesiaNotes: string;
  surgeryNotes: string;
  wishedDate: string;
  wishedTimeFrom: number | null;
  wishedTimeTo: number | null;
  patientFirstName: string;
  patientLastName: string;
  patientBirthday: string;
  patientEmail: string;
  patientPhone: string;
  patientStreet: string;
  patientPostalCode: string;
  patientCity: string;
  isReservationOnly: boolean;
}

interface UploadedFile {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  isUploading?: boolean;
}

function formatTimeMins(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${mins % 60 === 0 ? '00' : '30'}`;
}

const ALL_STEPS = [
  { id: 'surgeon', title: 'Surgeon Information', titleDe: 'Chirurg Informationen' },
  { id: 'surgery', title: 'Surgery Details', titleDe: 'OP Details' },
  { id: 'patient', title: 'Patient Information', titleDe: 'Patienten Informationen' },
  { id: 'documents', title: 'Documents', titleDe: 'Dokumente' },
];

export default function ExternalSurgeryRequest() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isReservationOnly, setIsReservationOnly] = useState(false);

  const handleReservationToggle = (checked: boolean) => {
    setIsReservationOnly(checked);
    // Reset to surgeon step when toggling to avoid invalid step index
    if (currentStep > 0) {
      setCurrentStep(0);
    }
  };

  // When reservation-only, skip patient step (step index 2)
  const STEPS = isReservationOnly
    ? ALL_STEPS.filter(s => s.id !== 'patient')
    : ALL_STEPS;

  const [chopSearchTerm, setChopSearchTerm] = useState("");
  const [chopSearchOpen, setChopSearchOpen] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    surgeonFirstName: '',
    surgeonLastName: '',
    surgeonEmail: '',
    surgeonPhone: '',
    surgeryName: '',
    chopCode: '',
    surgerySide: '',
    patientPosition: '',
    leftArmPosition: '',
    rightArmPosition: '',
    antibioseProphylaxe: false,
    surgeryDurationMinutes: 60,
    withAnesthesia: true,
    anesthesiaNotes: '',
    surgeryNotes: '',
    wishedDate: '',
    wishedTimeFrom: null,
    wishedTimeTo: null,
    patientFirstName: '',
    patientLastName: '',
    patientBirthday: '',
    patientEmail: '',
    patientPhone: '',
    patientStreet: '',
    patientPostalCode: '',
    patientCity: '',
    isReservationOnly: false,
  });

  const { data: hospitalData, isLoading, error } = useQuery({
    queryKey: ['external-surgery', token],
    queryFn: async () => {
      const res = await fetch(`/public/external-surgery/${token}`);
      if (!res.ok) throw new Error('Invalid link');
      return res.json();
    },
    enabled: !!token,
  });

  // Fetch clinic closures for date picker
  const { data: closures = [] } = useQuery<{ startDate: string; endDate: string; name: string }[]>({
    queryKey: ['external-surgery-closures', token],
    queryFn: async () => {
      const res = await fetch(`/public/external-surgery/${token}/closures`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const isDateClosed = useCallback((date: Date) => {
    const dateStr = formatDateForInput(date);
    return closures.some(c => dateStr >= c.startDate && dateStr <= c.endDate);
  }, [closures]);

  const getClosureNameForDate = useCallback((dateStr: string) => {
    const closure = closures.find(c => dateStr >= c.startDate && dateStr <= c.endDate);
    return closure?.name || null;
  }, [closures]);

  // CHOP procedure search query
  const { data: chopProcedures = [], isLoading: isLoadingChop } = useQuery<Array<{
    id: string;
    code: string;
    descriptionDe: string;
    chapter: string | null;
    indentLevel: number | null;
    laterality: string | null;
  }>>({
    queryKey: ['/api/chop-procedures', chopSearchTerm],
    queryFn: async () => {
      if (chopSearchTerm.length < 2) return [];
      const response = await fetch(`/api/chop-procedures?search=${encodeURIComponent(chopSearchTerm)}&limit=30`);
      if (!response.ok) throw new Error('Failed to search procedures');
      return response.json();
    },
    enabled: chopSearchTerm.length >= 2,
    staleTime: 60000,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch(`/public/external-surgery/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to submit');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRequestId(data.requestId);
      // Always proceed to documents step (last step)
      setCurrentStep(STEPS.length - 1);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = useCallback(async (files: FileList) => {
    if (!requestId) return;
    
    for (const file of Array.from(files)) {
      const tempId = Math.random().toString(36).substr(2, 9);
      
      setUploadedFiles(prev => [...prev, {
        id: tempId,
        fileName: file.name,
        fileUrl: '',
        mimeType: file.type,
        fileSize: file.size,
        isUploading: true,
      }]);
      
      try {
        const urlRes = await fetch(`/public/external-surgery/${token}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            requestId,
          }),
        });
        
        if (!urlRes.ok) throw new Error('Failed to get upload URL');
        
        const { uploadUrl, fileUrl } = await urlRes.json();
        
        const s3Response = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        
        if (!s3Response.ok) {
          throw new Error('Failed to upload file to storage');
        }
        
        const docRes = await fetch(`/public/external-surgery/${token}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            fileName: file.name,
            fileUrl,
            mimeType: file.type,
            fileSize: file.size,
          }),
        });
        
        if (!docRes.ok) throw new Error('Failed to save document');
        
        const doc = await docRes.json();
        
        setUploadedFiles(prev => prev.map(f => 
          f.id === tempId ? { ...f, id: doc.id, fileUrl, isUploading: false } : f
        ));
      } catch (err) {
        setUploadedFiles(prev => prev.filter(f => f.id !== tempId));
        toast({
          title: "Upload failed",
          description: "Could not upload file",
          variant: "destructive",
        });
      }
    }
  }, [requestId, token, toast]);

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const currentStepId = STEPS[currentStep]?.id;

  const canProceed = () => {
    switch (currentStepId) {
      case 'surgeon':
        return formData.surgeonFirstName && formData.surgeonLastName &&
               formData.surgeonEmail && formData.surgeonPhone;
      case 'surgery': {
        // Block if selected date is in a closure
        const dateIsValid = formData.wishedDate && !getClosureNameForDate(formData.wishedDate);
        const durationValid = formData.surgeryDurationMinutes >= 15 && formData.surgeryDurationMinutes <= 720;
        // In reservation mode, surgery name is optional
        if (isReservationOnly) {
          return durationValid && dateIsValid;
        }
        return formData.surgeryName && durationValid && dateIsValid;
      }
      case 'patient':
        return formData.patientFirstName && formData.patientLastName &&
               formData.patientBirthday && formData.patientPhone &&
               formData.patientStreet && formData.patientPostalCode && formData.patientCity;
      case 'documents':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      // Submit the form on the step right before documents
      const nextStepId = STEPS[currentStep + 1]?.id;
      if (nextStepId === 'documents' && !requestId) {
        // Sync reservation flag before submitting
        submitMutation.mutate({ ...formData, isReservationOnly });
      } else {
        setCurrentStep(prev => prev + 1);
      }
    } else {
      setIsSubmitted(true);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const isGerman = i18n.language === 'de';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !hospitalData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                {t('surgery.externalRequest.invalidLink')}
              </h2>
              <p className="text-muted-foreground">
                {t('surgery.externalRequest.invalidLinkDesc')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">
                {t('surgery.externalRequest.requestSubmitted')}
              </h2>
              <p className="text-muted-foreground mb-4">
                {t('surgery.externalRequest.requestSubmittedDesc')}
              </p>
              <p className="text-sm text-muted-foreground">
                {hospitalData.hospitalName}
              </p>
              {isReservationOnly && (
                <div className="mt-6 p-4 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-left">
                  <p className="text-sm text-violet-700 dark:text-violet-300">
                    {t('surgery.externalRequest.reservationNote', 'When you have patient details ready, use the same link to submit a new request with the full information.')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{hospitalData.hospitalName}</h1>
          </div>
          <p className="text-muted-foreground">
            {t('surgery.externalRequest.surgeryReservation')}
          </p>
          <div className="flex justify-center mt-3">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => changeLanguage("de")}
                className={`px-3 py-1.5 text-sm rounded flex items-center gap-1 transition-colors ${
                  isGerman 
                    ? "bg-white dark:bg-gray-700 shadow-sm font-medium" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
                data-testid="button-lang-de"
              >
                🇩🇪 DE
              </button>
              <button
                onClick={() => changeLanguage("en")}
                className={`px-3 py-1.5 text-sm rounded flex items-center gap-1 transition-colors ${
                  !isGerman 
                    ? "bg-white dark:bg-gray-700 shadow-sm font-medium" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
                data-testid="button-lang-en"
              >
                🇬🇧 EN
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>{t(`surgery.externalRequest.steps.${STEPS[currentStep].id}`)}</span>
            <span>{currentStep + 1} / {STEPS.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {hospitalData && !isSubmitted && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {i18n.language === 'de'
                ? 'Haben Sie bereits Anfragen gestellt?'
                : 'Already submitted requests?'}
              {' '}
              <a
                href={`/surgeon-portal/${token}`}
                className="font-medium underline hover:no-underline"
              >
                {i18n.language === 'de' ? 'Ihre OPs ansehen →' : 'View your surgeries →'}
              </a>
            </span>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            {currentStepId === 'surgeon' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {t('surgery.externalRequest.yourInformation')}
                  </h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="surgeonFirstName">
                      {t('surgery.externalRequest.firstName')} *
                    </Label>
                    <Input
                      id="surgeonFirstName"
                      value={formData.surgeonFirstName}
                      onChange={(e) => updateField('surgeonFirstName', e.target.value)}
                      data-testid="input-surgeon-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surgeonLastName">
                      {t('surgery.externalRequest.lastName')} *
                    </Label>
                    <Input
                      id="surgeonLastName"
                      value={formData.surgeonLastName}
                      onChange={(e) => updateField('surgeonLastName', e.target.value)}
                      data-testid="input-surgeon-last-name"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="surgeonEmail">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Email *
                  </Label>
                  <Input
                    id="surgeonEmail"
                    type="email"
                    value={formData.surgeonEmail}
                    onChange={(e) => updateField('surgeonEmail', e.target.value)}
                    data-testid="input-surgeon-email"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="surgeonPhone">
                    <Phone className="h-4 w-4 inline mr-1" />
                    {t('surgery.externalRequest.phone')} *
                  </Label>
                  <PhoneInputWithCountry
                    id="surgeonPhone"
                    value={formData.surgeonPhone}
                    onChange={(value) => updateField('surgeonPhone', value)}
                    data-testid="input-surgeon-phone"
                  />
                </div>

                {/* Reservation-only toggle - prominent card */}
                <div
                  className={cn(
                    "rounded-lg border-2 p-4 cursor-pointer transition-all mt-2",
                    isReservationOnly
                      ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-600"
                      : "border-dashed border-muted-foreground/30 hover:border-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-950/10"
                  )}
                  onClick={() => handleReservationToggle(!isReservationOnly)}
                  data-testid="card-reservation-only"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className={cn("h-5 w-5", isReservationOnly ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground")} />
                      <div>
                        <p className={cn("font-medium text-sm", isReservationOnly ? "text-violet-700 dark:text-violet-300" : "")}>
                          {t('externalSurgery.reservationOnly', 'Reserve time slot only')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('externalSurgery.reservationOnlyDesc', 'Book OR time without patient details — submit a separate request later with patient info')}
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="reservationOnly"
                      checked={isReservationOnly}
                      onCheckedChange={handleReservationToggle}
                      onClick={(e) => e.stopPropagation()}
                      data-testid="switch-reservation-only"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStepId === 'surgery' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {t('surgery.externalRequest.surgeryDetails')}
                  </h3>
                </div>
                
                {!isReservationOnly && (
                <>
                <div className="space-y-2">
                  <Label>
                    {t('surgery.externalRequest.surgeryName')} *
                  </Label>
                  <Popover open={chopSearchOpen} onOpenChange={setChopSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={chopSearchOpen}
                        className="w-full justify-between h-auto min-h-10 text-left font-normal"
                        data-testid="select-surgery-procedure"
                      >
                        {formData.surgeryName ? (
                          <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                            <span className="text-sm whitespace-normal text-left">{formData.surgeryName}</span>
                            {formData.chopCode && (
                              <span className="text-xs text-muted-foreground">CHOP: {formData.chopCode}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            {t('surgery.externalRequest.searchOrEnter')}
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[450px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder={t('surgery.externalRequest.searchChop')}
                          value={chopSearchTerm}
                          onValueChange={setChopSearchTerm}
                          data-testid="input-chop-search-external"
                        />
                        <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                          {chopSearchTerm.length < 2 ? (
                            <CommandEmpty className="py-4 px-2 text-center text-sm text-muted-foreground">
                              {t('surgery.externalRequest.minChars')}
                            </CommandEmpty>
                          ) : isLoadingChop ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : chopProcedures.length === 0 ? (
                            <CommandEmpty>
                              <div className="py-2 px-2 space-y-2">
                                <p className="text-sm">{t('surgery.externalRequest.noChopFound')}</p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full"
                                  onClick={() => {
                                    updateField('surgeryName', chopSearchTerm);
                                    updateField('chopCode', '');
                                    setChopSearchOpen(false);
                                  }}
                                  data-testid="button-use-custom-surgery-external"
                                >
                                  {t('surgery.externalRequest.useCustom', { term: chopSearchTerm })}
                                </Button>
                              </div>
                            </CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {chopProcedures.map((proc) => (
                                <CommandItem
                                  key={proc.id}
                                  value={proc.code}
                                  onSelect={() => {
                                    updateField('surgeryName', proc.descriptionDe);
                                    updateField('chopCode', proc.code);
                                    setChopSearchOpen(false);
                                  }}
                                  className="flex flex-col items-start gap-0.5 cursor-pointer"
                                  data-testid={`chop-option-external-${proc.code}`}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <Check
                                      className={cn(
                                        "h-4 w-4 shrink-0",
                                        formData.chopCode === proc.code ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{proc.code}</span>
                                        {proc.laterality && (
                                          <span className="text-xs text-muted-foreground">({proc.laterality})</span>
                                        )}
                                      </div>
                                      <p className="text-sm whitespace-normal break-words">{proc.descriptionDe}</p>
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                        {chopSearchTerm.length >= 2 && chopProcedures.length > 0 && (
                          <div className="sticky bottom-0 border-t bg-popover p-1">
                            <CommandItem
                              value="__custom__"
                              onSelect={() => {
                                updateField('surgeryName', chopSearchTerm);
                                updateField('chopCode', '');
                                setChopSearchOpen(false);
                              }}
                              className="cursor-pointer"
                              data-testid="chop-option-external-custom"
                            >
                              <Check className="h-4 w-4 shrink-0 opacity-0" />
                              <span className="text-sm text-muted-foreground">
                                {t('surgery.externalRequest.useAsCustom', { term: chopSearchTerm })}
                              </span>
                            </CommandItem>
                          </div>
                        )}
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Surgery Side */}
                <div className="space-y-2">
                  <Label>
                    {t('surgery.externalRequest.surgerySide')}
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    <label 
                      className={`flex items-center justify-center cursor-pointer px-4 py-2.5 rounded-lg border transition-colors min-h-[44px] ${
                        formData.surgerySide === "left" 
                          ? "border-primary bg-primary/10 text-primary" 
                          : "border-input bg-background hover:bg-accent"
                      }`}
                      data-testid="radio-external-surgery-side-left"
                    >
                      <input
                        type="radio"
                        name="externalSurgerySide"
                        value="left"
                        checked={formData.surgerySide === "left"}
                        onChange={() => updateField('surgerySide', 'left')}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{t('surgery.externalRequest.sideLeft')}</span>
                    </label>
                    <label
                      className={`flex items-center justify-center cursor-pointer px-4 py-2.5 rounded-lg border transition-colors min-h-[44px] ${
                        formData.surgerySide === "right"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input bg-background hover:bg-accent"
                      }`}
                      data-testid="radio-external-surgery-side-right"
                    >
                      <input
                        type="radio"
                        name="externalSurgerySide"
                        value="right"
                        checked={formData.surgerySide === "right"}
                        onChange={() => updateField('surgerySide', 'right')}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{t('surgery.externalRequest.sideRight')}</span>
                    </label>
                    <label
                      className={`flex items-center justify-center cursor-pointer px-4 py-2.5 rounded-lg border transition-colors min-h-[44px] ${
                        formData.surgerySide === "both"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input bg-background hover:bg-accent"
                      }`}
                      data-testid="radio-external-surgery-side-both"
                    >
                      <input
                        type="radio"
                        name="externalSurgerySide"
                        value="both"
                        checked={formData.surgerySide === "both"}
                        onChange={() => updateField('surgerySide', 'both')}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{t('surgery.externalRequest.sideBoth')}</span>
                    </label>
                    {formData.surgerySide && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateField('surgerySide', '')}
                        className="text-xs min-h-[44px] px-3"
                      >
                        {t('surgery.externalRequest.clear')}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Patient Positioning */}
                <PatientPositionFields
                  patientPosition={formData.patientPosition}
                  leftArmPosition={formData.leftArmPosition}
                  rightArmPosition={formData.rightArmPosition}
                  onPatientPositionChange={(v) => updateField('patientPosition', v)}
                  onLeftArmPositionChange={(v) => updateField('leftArmPosition', v)}
                  onRightArmPositionChange={(v) => updateField('rightArmPosition', v)}
                  testIdPrefix="external-"
                />
                </>
                )}

                {/* Section Divider: Scheduling */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('surgery.externalRequest.scheduling')}</span>
                  <div className="h-px bg-border flex-1" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wishedDate">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      {t('surgery.externalRequest.wishedDate')} *
                    </Label>
                    <DateInput
                      value={formData.wishedDate}
                      onChange={(v) => updateField('wishedDate', v)}
                      min={formatDateForInput(new Date())}
                      disabledDate={isDateClosed}
                      data-testid="input-wished-date"
                    />
                    {formData.wishedDate && getClosureNameForDate(formData.wishedDate) && (
                      <p className="text-sm text-destructive mt-1">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        {t('surgery.externalRequest.clinicClosedWarning', 'The clinic is closed on this date ({{name}}). Please select a different date.', { name: getClosureNameForDate(formData.wishedDate) })}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surgeryDuration">
                      {t('surgery.externalRequest.durationMinutes')} *
                    </Label>
                    <Input
                      id="surgeryDuration"
                      type="number"
                      min={15}
                      max={720}
                      value={formData.surgeryDurationMinutes}
                      onChange={(e) => updateField('surgeryDurationMinutes', parseInt(e.target.value) || 60)}
                      data-testid="input-surgery-duration"
                    />
                  </div>
                </div>

                {/* Wished Time Slot */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t('surgery.externalRequest.wishedTimeSlot')}</Label>
                    <div className="flex items-center gap-2">
                      {formData.wishedTimeFrom !== null && formData.wishedTimeTo !== null ? (
                        <>
                          <span className="text-sm font-medium tabular-nums">
                            {formatTimeMins(formData.wishedTimeFrom)} – {formatTimeMins(formData.wishedTimeTo)}
                          </span>
                          <button
                            type="button"
                            onClick={() => { updateField('wishedTimeFrom', null); updateField('wishedTimeTo', null); }}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            {t('surgery.externalRequest.clear')}
                          </button>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t('surgery.externalRequest.wishedTimeSlotAnyTime')}</span>
                      )}
                    </div>
                  </div>
                  <Slider
                    min={480}
                    max={960}
                    step={30}
                    value={formData.wishedTimeFrom !== null && formData.wishedTimeTo !== null
                      ? [formData.wishedTimeFrom, formData.wishedTimeTo]
                      : [480, 960]}
                    onValueChange={([from, to]) => {
                      updateField('wishedTimeFrom', from);
                      updateField('wishedTimeTo', to);
                    }}
                    onPointerDown={() => {
                      if (formData.wishedTimeFrom === null) {
                        updateField('wishedTimeFrom', 480);
                        updateField('wishedTimeTo', 960);
                      }
                    }}
                    data-testid="slider-wished-time"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>08:00</span>
                    <span>16:00</span>
                  </div>
                </div>

                {!isReservationOnly && (
                <>
                {/* Section Divider: Requirements */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('surgery.externalRequest.requirements')}</span>
                  <div className="h-px bg-border flex-1" />
                </div>

                {/* Antibiose Prophylaxe */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <Label htmlFor="antibioseProphylaxe" className="cursor-pointer">
                    {t('surgery.externalRequest.antibioticProphylaxis')}
                  </Label>
                  <Switch
                    id="antibioseProphylaxe"
                    checked={formData.antibioseProphylaxe}
                    onCheckedChange={(checked) => updateField('antibioseProphylaxe', checked)}
                    data-testid="switch-antibiose-prophylaxe"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <Label htmlFor="withAnesthesia" className="cursor-pointer">
                    {t('surgery.externalRequest.withAnesthesia')}
                  </Label>
                  <Switch
                    id="withAnesthesia"
                    checked={formData.withAnesthesia}
                    onCheckedChange={(checked) => updateField('withAnesthesia', checked)}
                    data-testid="switch-anesthesia"
                  />
                </div>

                {formData.withAnesthesia && (
                  <div className="space-y-2">
                    <Label htmlFor="anesthesiaNotes">
                      {t('surgery.externalRequest.anesthesiaNotes')}
                    </Label>
                    <Textarea
                      id="anesthesiaNotes"
                      value={formData.anesthesiaNotes}
                      onChange={(e) => updateField('anesthesiaNotes', e.target.value)}
                      placeholder=""
                      rows={3}
                      data-testid="textarea-anesthesia-notes"
                    />
                  </div>
                )}
                </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="surgeryNotes">
                    <FileText className="h-4 w-4 inline mr-1" />
                    {t('surgery.externalRequest.surgeryNotes')}
                  </Label>
                  <Textarea
                    id="surgeryNotes"
                    value={formData.surgeryNotes}
                    onChange={(e) => updateField('surgeryNotes', e.target.value)}
                    placeholder={t('surgery.externalRequest.additionalInfo')}
                    rows={3}
                    data-testid="textarea-surgery-notes"
                  />
                </div>
              </div>
            )}

            {currentStepId === 'patient' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {t('surgery.externalRequest.patientInformation')}
                  </h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patientFirstName">
                      {t('surgery.externalRequest.firstName')} *
                    </Label>
                    <Input
                      id="patientFirstName"
                      value={formData.patientFirstName}
                      onChange={(e) => updateField('patientFirstName', e.target.value)}
                      data-testid="input-patient-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientLastName">
                      {t('surgery.externalRequest.lastName')} *
                    </Label>
                    <Input
                      id="patientLastName"
                      value={formData.patientLastName}
                      onChange={(e) => updateField('patientLastName', e.target.value)}
                      data-testid="input-patient-last-name"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="patientBirthday">
                    {t('surgery.externalRequest.birthday')} *
                  </Label>
                  <FlexibleDateInput
                    value={formData.patientBirthday}
                    onChange={(val) => updateField('patientBirthday', val)}
                    data-testid="input-patient-birthday"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="patientPhone">
                    <Phone className="h-4 w-4 inline mr-1" />
                    {t('surgery.externalRequest.phone')} *
                  </Label>
                  <PhoneInputWithCountry
                    id="patientPhone"
                    value={formData.patientPhone}
                    onChange={(value) => updateField('patientPhone', value)}
                    data-testid="input-patient-phone"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="patientEmail">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Email ({t('surgery.externalRequest.optional')})
                  </Label>
                  <Input
                    id="patientEmail"
                    type="email"
                    value={formData.patientEmail}
                    onChange={(e) => updateField('patientEmail', e.target.value)}
                    data-testid="input-patient-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    {t('surgery.externalRequest.address', 'Address')} *
                  </Label>
                  <AddressAutocomplete
                    showLabels
                    values={{
                      street: formData.patientStreet,
                      postalCode: formData.patientPostalCode,
                      city: formData.patientCity,
                    }}
                    onChange={(addr) => {
                      updateField('patientStreet', addr.street);
                      updateField('patientPostalCode', addr.postalCode);
                      updateField('patientCity', addr.city);
                    }}
                  />
                </div>
              </div>
            )}

            {currentStepId === 'documents' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">
                    {t('surgery.externalRequest.requestSuccess')}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {t('surgery.externalRequest.uploadDocuments')}
                  </h3>
                </div>
                
                <p className="text-sm text-muted-foreground mb-4">
                  {t('surgery.externalRequest.uploadDocumentsDesc')}
                </p>
                
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length) {
                      handleFileUpload(e.dataTransfer.files);
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('surgery.externalRequest.dragOrClick')}
                  </p>
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        handleFileUpload(e.target.files);
                      }
                    }}
                    accept="image/*,.pdf,.doc,.docx"
                  />
                </div>
                
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {uploadedFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm truncate max-w-[200px]">{file.fileName}</span>
                          {file.isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                        </div>
                        {!file.isUploading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setUploadedFiles(prev => prev.filter(f => f.id !== file.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
                data-testid="button-back"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('surgery.externalRequest.back')}
              </Button>
              
              <Button
                onClick={handleNext}
                disabled={!canProceed() || submitMutation.isPending}
                data-testid="button-next"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : currentStepId === 'documents' ? (
                  t('surgery.externalRequest.finish')
                ) : STEPS[currentStep + 1]?.id === 'documents' ? (
                  <>
                    {t('surgery.externalRequest.continueAndSubmit')}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    {t('surgery.externalRequest.next')}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center mt-4 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => i18n.changeLanguage('de')}
            className={i18n.language === 'de' ? 'bg-muted' : ''}
          >
            🇩🇪 Deutsch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => i18n.changeLanguage('en')}
            className={i18n.language === 'en' ? 'bg-muted' : ''}
          >
            🇬🇧 English
          </Button>
        </div>
      </div>
    </div>
  );
}
