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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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

interface FormData {
  surgeonFirstName: string;
  surgeonLastName: string;
  surgeonEmail: string;
  surgeonPhone: string;
  surgeryName: string;
  chopCode: string;
  surgerySide: "" | "left" | "right" | "both";
  antibioseProphylaxe: boolean;
  surgeryDurationMinutes: number;
  withAnesthesia: boolean;
  surgeryNotes: string;
  wishedDate: string;
  patientFirstName: string;
  patientLastName: string;
  patientBirthday: string;
  patientEmail: string;
  patientPhone: string;
}

interface UploadedFile {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  isUploading?: boolean;
}

const STEPS = [
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
    antibioseProphylaxe: false,
    surgeryDurationMinutes: 60,
    withAnesthesia: true,
    surgeryNotes: '',
    wishedDate: '',
    patientFirstName: '',
    patientLastName: '',
    patientBirthday: '',
    patientEmail: '',
    patientPhone: '',
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
      // Always proceed to documents step to allow file uploads
      setCurrentStep(3);
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

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.surgeonFirstName && formData.surgeonLastName && 
               formData.surgeonEmail && formData.surgeonPhone;
      case 1:
        return formData.surgeryName && formData.surgeryDurationMinutes > 0 && formData.wishedDate;
      case 2:
        return formData.patientFirstName && formData.patientLastName && 
               formData.patientBirthday && formData.patientPhone;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      if (currentStep === 2 && !requestId) {
        submitMutation.mutate(formData);
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
                {isGerman ? 'Ungültiger Link' : 'Invalid Link'}
              </h2>
              <p className="text-muted-foreground">
                {isGerman 
                  ? 'Dieser Link ist ungültig oder abgelaufen.'
                  : 'This link is invalid or has expired.'}
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
                {isGerman ? 'Anfrage gesendet!' : 'Request Submitted!'}
              </h2>
              <p className="text-muted-foreground mb-4">
                {isGerman 
                  ? 'Ihre OP-Reservierungsanfrage wurde erfolgreich eingereicht. Sie erhalten eine Bestätigung, sobald der Termin geplant wurde.'
                  : 'Your surgery reservation request has been successfully submitted. You will receive a confirmation once the appointment has been scheduled.'}
              </p>
              <p className="text-sm text-muted-foreground">
                {hospitalData.hospitalName}
              </p>
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
            {isGerman ? 'OP-Terminreservierung' : 'Surgery Reservation Request'}
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
            <span>{isGerman ? STEPS[currentStep].titleDe : STEPS[currentStep].title}</span>
            <span>{currentStep + 1} / {STEPS.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card>
          <CardContent className="pt-6">
            {currentStep === 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {isGerman ? 'Ihre Informationen' : 'Your Information'}
                  </h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="surgeonFirstName">
                      {isGerman ? 'Vorname' : 'First Name'} *
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
                      {isGerman ? 'Nachname' : 'Last Name'} *
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
                    {isGerman ? 'Telefon' : 'Phone'} *
                  </Label>
                  <PhoneInputWithCountry
                    id="surgeonPhone"
                    value={formData.surgeonPhone}
                    onChange={(value) => updateField('surgeonPhone', value)}
                    data-testid="input-surgeon-phone"
                  />
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {isGerman ? 'OP Details' : 'Surgery Details'}
                  </h3>
                </div>
                
                <div className="space-y-2">
                  <Label>
                    {isGerman ? 'OP Name / Eingriff' : 'Surgery Name'} *
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
                            {isGerman ? 'Suchen oder eingeben...' : 'Search or enter procedure...'}
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[450px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder={isGerman ? 'CHOP-Eingriff suchen...' : 'Search CHOP procedures...'}
                          value={chopSearchTerm}
                          onValueChange={setChopSearchTerm}
                          data-testid="input-chop-search-external"
                        />
                        <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                          {chopSearchTerm.length < 2 ? (
                            <CommandEmpty className="py-4 px-2 text-center text-sm text-muted-foreground">
                              {isGerman ? 'Mind. 2 Zeichen eingeben' : 'Type at least 2 characters'}
                            </CommandEmpty>
                          ) : isLoadingChop ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : chopProcedures.length === 0 ? (
                            <CommandEmpty>
                              <div className="py-2 px-2 space-y-2">
                                <p className="text-sm">{isGerman ? 'Keine CHOP-Eingriffe gefunden' : 'No CHOP procedures found'}</p>
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
                                  {isGerman ? `"${chopSearchTerm}" verwenden` : `Use "${chopSearchTerm}"`}
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
                                {isGerman ? `Als eigene Eingabe: "${chopSearchTerm}"` : `Use as custom: "${chopSearchTerm}"`}
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
                    {isGerman ? 'OP-Seite' : 'Surgery Side'}
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
                      <span className="text-sm font-medium">{isGerman ? 'Links' : 'Left'}</span>
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
                      <span className="text-sm font-medium">{isGerman ? 'Rechts' : 'Right'}</span>
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
                      <span className="text-sm font-medium">{isGerman ? 'Beidseitig' : 'Both'}</span>
                    </label>
                    {formData.surgerySide && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateField('surgerySide', '')}
                        className="text-xs min-h-[44px] px-3"
                      >
                        {isGerman ? 'Löschen' : 'Clear'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Section Divider: Scheduling */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isGerman ? 'Terminplanung' : 'Scheduling'}</span>
                  <div className="h-px bg-border flex-1" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="surgeryDuration">
                      {isGerman ? 'Dauer (Minuten)' : 'Duration (minutes)'} *
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
                  <div className="space-y-2">
                    <Label htmlFor="wishedDate">
                      <Calendar className="h-4 w-4 inline mr-1" />
                      {isGerman ? 'Wunschdatum' : 'Wished Date'} *
                    </Label>
                    <Input
                      id="wishedDate"
                      type="date"
                      value={formData.wishedDate}
                      onChange={(e) => updateField('wishedDate', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      data-testid="input-wished-date"
                    />
                  </div>
                </div>

                {/* Section Divider: Requirements */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isGerman ? 'Anforderungen' : 'Requirements'}</span>
                  <div className="h-px bg-border flex-1" />
                </div>

                {/* Antibiose Prophylaxe */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <Label htmlFor="antibioseProphylaxe" className="cursor-pointer">
                    {isGerman ? 'Antibiose-Prophylaxe erforderlich' : 'Antibiotic Prophylaxis Required'}
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
                    {isGerman ? 'Mit Anästhesie' : 'With Anesthesia'}
                  </Label>
                  <Switch
                    id="withAnesthesia"
                    checked={formData.withAnesthesia}
                    onCheckedChange={(checked) => updateField('withAnesthesia', checked)}
                    data-testid="switch-anesthesia"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="surgeryNotes">
                    <FileText className="h-4 w-4 inline mr-1" />
                    {isGerman ? 'OP Notizen' : 'Surgery Notes'}
                  </Label>
                  <Textarea
                    id="surgeryNotes"
                    value={formData.surgeryNotes}
                    onChange={(e) => updateField('surgeryNotes', e.target.value)}
                    placeholder={isGerman ? 'Zusätzliche Informationen...' : 'Additional information...'}
                    rows={3}
                    data-testid="textarea-surgery-notes"
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {isGerman ? 'Patienten Daten' : 'Patient Information'}
                  </h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patientFirstName">
                      {isGerman ? 'Vorname' : 'First Name'} *
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
                      {isGerman ? 'Nachname' : 'Last Name'} *
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
                    {isGerman ? 'Geburtsdatum' : 'Birthday'} *
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
                    {isGerman ? 'Telefon' : 'Phone'} *
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
                    Email ({isGerman ? 'optional' : 'optional'})
                  </Label>
                  <Input
                    id="patientEmail"
                    type="email"
                    value={formData.patientEmail}
                    onChange={(e) => updateField('patientEmail', e.target.value)}
                    data-testid="input-patient-email"
                  />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">
                    {isGerman ? 'Anfrage erfolgreich übermittelt!' : 'Request successfully submitted!'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {isGerman ? 'Dokumente hochladen (optional)' : 'Upload Documents (optional)'}
                  </h3>
                </div>
                
                <p className="text-sm text-muted-foreground mb-4">
                  {isGerman 
                    ? 'Sie können relevante Dokumente hochladen (Befunde, Laborergebnisse, etc.). Diese werden mit der Patientenakte verknüpft.'
                    : 'You can upload relevant documents (findings, lab results, etc.). These will be linked to the patient record.'}
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
                    {isGerman 
                      ? 'Dateien hierher ziehen oder klicken zum Auswählen'
                      : 'Drag files here or click to select'}
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
                {isGerman ? 'Zurück' : 'Back'}
              </Button>
              
              <Button
                onClick={handleNext}
                disabled={!canProceed() || submitMutation.isPending}
                data-testid="button-next"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : currentStep === STEPS.length - 1 ? (
                  isGerman ? 'Fertig' : 'Finish'
                ) : currentStep === 2 ? (
                  <>
                    {isGerman ? 'Weiter & Absenden' : 'Continue & Submit'}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    {isGerman ? 'Weiter' : 'Next'}
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
