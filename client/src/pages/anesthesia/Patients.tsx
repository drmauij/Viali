import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserPlus, ScanBarcode, UserCircle, UserRound, Loader2, Send } from "lucide-react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Patient } from "@shared/schema";
import { formatDate } from "@/lib/dateUtils";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import { useModule } from "@/contexts/ModuleContext";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";

export default function Patients() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const activeHospital = useActiveHospital();
  const canWrite = useCanWrite();
  const { addons } = useHospitalAddons();
  const { toast } = useToast();
  const { activeModule } = useModule();
  const { data: anesthesiaSettings } = useHospitalAnesthesiaSettings();
  
  // Module-aware base path for navigation
  const moduleBasePath = activeModule === "surgery" 
    ? "/surgery" 
    : activeModule === "clinic" 
      ? "/clinic" 
      : "/anesthesia";
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({
    surname: "",
    firstName: "",
    birthday: "",
    sex: "",
    email: "",
    phone: "",
    street: "",
    postalCode: "",
    city: "",
    allergies: [] as string[],
    otherAllergies: "",
    internalNotes: "",
  });
  const [birthdayInput, setBirthdayInput] = useState("");
  const [sendFormDialogOpen, setSendFormDialogOpen] = useState(false);
  const [selectedPatientForForm, setSelectedPatientForForm] = useState<Patient | null>(null);

  // Parse birthday from various formats to ISO format (yyyy-mm-dd)
  // Supported formats:
  // - dd.mm.yy or dd.mm.yyyy (with dots)
  // - ddmmyyyy (8 digits without dots)
  // - ddmmyy (6 digits without dots)
  // - dmyy (4 digits: single-digit day and month, 2-digit year)
  const parseBirthday = (input: string): string | null => {
    const trimmed = input.trim();
    
    let day: string, month: string, year: string;
    
    // Try format with dots first: dd.mm.yy or dd.mm.yyyy
    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (dotMatch) {
      [, day, month, year] = dotMatch;
    } else if (/^\d{8}$/.test(trimmed)) {
      // 8 digits: ddmmyyyy (e.g., 03041977)
      day = trimmed.substring(0, 2);
      month = trimmed.substring(2, 4);
      year = trimmed.substring(4, 8);
    } else if (/^\d{6}$/.test(trimmed)) {
      // 6 digits: ddmmyy (e.g., 030477)
      day = trimmed.substring(0, 2);
      month = trimmed.substring(2, 4);
      year = trimmed.substring(4, 6);
    } else if (/^\d{4}$/.test(trimmed)) {
      // 4 digits: dmyy (e.g., 3477 = 3rd April 1977)
      day = trimmed.substring(0, 1);
      month = trimmed.substring(1, 2);
      year = trimmed.substring(2, 4);
    } else {
      return null;
    }
    
    // Convert 2-digit year to 4-digit (yy -> 19yy or 20yy)
    if (year.length === 2) {
      const twoDigitYear = parseInt(year);
      // If year is > 30, assume 19xx, otherwise 20xx
      year = twoDigitYear > 30 ? `19${year}` : `20${year}`;
    }
    
    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    // Basic range validation
    if (dayNum < 1 || dayNum > 31) return null;
    if (monthNum < 1 || monthNum > 12) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;
    
    // Validate that the date actually exists (e.g., reject 31.02.1995, 29.02.2001)
    const testDate = new Date(yearNum, monthNum - 1, dayNum);
    if (
      testDate.getFullYear() !== yearNum ||
      testDate.getMonth() !== monthNum - 1 ||
      testDate.getDate() !== dayNum
    ) {
      return null; // Invalid date (e.g., Feb 31, non-leap-year Feb 29)
    }
    
    // Pad day and month with leading zeros for ISO format
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    // Return ISO format yyyy-mm-dd
    return `${year}-${month}-${day}`;
  };

  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setBirthdayInput(input);
    
    // Try to parse the input
    const parsed = parseBirthday(input);
    if (parsed) {
      setNewPatient({ ...newPatient, birthday: parsed });
    } else if (input.trim() === "") {
      // Clear if empty
      setNewPatient({ ...newPatient, birthday: "" });
    }
    // If input exists but can't be parsed, keep the old value in newPatient.birthday
    // This allows partial typing without clearing the valid date
  };

  // Fetch patients
  const { data: patients = [], isLoading, error } = useQuery<Patient[]>({
    queryKey: [`/api/patients?hospitalId=${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Create patient mutation
  const createPatientMutation = useMutation({
    mutationFn: async (patientData: any) => {
      return await apiRequest('POST', '/api/patients', patientData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients?hospitalId=${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.patients.patientCreatedSuccess'),
        description: "Patient has been created successfully",
      });
      setIsCreateDialogOpen(false);
      setNewPatient({ 
        surname: "", 
        firstName: "", 
        birthday: "", 
        sex: "",
        email: "",
        phone: "",
        street: "",
        postalCode: "",
        city: "",
        allergies: [],
        otherAllergies: "",
        internalNotes: ""
      });
      setBirthdayInput("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || t('anesthesia.patients.failedToCreatePatient'),
        variant: "destructive",
      });
    },
  });

  const toggleAllergy = (allergy: string) => {
    if (newPatient.allergies.includes(allergy)) {
      setNewPatient({ ...newPatient, allergies: newPatient.allergies.filter(a => a !== allergy) });
    } else {
      setNewPatient({ ...newPatient, allergies: [...newPatient.allergies, allergy] });
    }
  };

  // Filter and sort patients alphabetically by surname, then firstName
  const filteredPatients = patients
    .filter(patient => {
      if (!searchQuery.trim()) return true;
      
      const query = searchQuery.toLowerCase();
      const formattedBirthday = formatDate(patient.birthday).toLowerCase();
      
      return patient.surname.toLowerCase().includes(query) ||
        patient.firstName.toLowerCase().includes(query) ||
        patient.patientNumber.toLowerCase().includes(query) ||
        patient.birthday.includes(searchQuery) || // ISO format search
        formattedBirthday.includes(query); // Display format search (DD/MM/YYYY)
    })
    .sort((a, b) => {
      const surnameCompare = a.surname.localeCompare(b.surname);
      if (surnameCompare !== 0) return surnameCompare;
      return a.firstName.localeCompare(b.firstName);
    });

  const handleBarcodeClick = () => {
    // TODO: Implement barcode scanning via camera
    console.log("Opening camera for barcode scan...");
  };

  const handleCreatePatient = () => {
    if (!activeHospital?.id) {
      toast({
        title: "Error",
        description: "No active hospital selected",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    if (!newPatient.surname || !newPatient.firstName || !newPatient.birthday || !newPatient.sex) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Prepare patient data (patientNumber will be auto-generated by the backend)
    const patientData = {
      hospitalId: activeHospital.id,
      surname: newPatient.surname,
      firstName: newPatient.firstName,
      birthday: newPatient.birthday,
      sex: newPatient.sex,
      email: newPatient.email || null,
      phone: newPatient.phone || null,
      street: newPatient.street || null,
      postalCode: newPatient.postalCode || null,
      city: newPatient.city || null,
      allergies: newPatient.allergies.length > 0 ? newPatient.allergies : null,
      otherAllergies: newPatient.otherAllergies || null,
      internalNotes: newPatient.internalNotes || null,
    };

    createPatientMutation.mutate(patientData);
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('anesthesia.patients.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('anesthesia.patients.subtitle')}
          </p>
        </div>
        
        {canWrite && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-patient">
                <UserPlus className="h-4 w-4" />
                {t('anesthesia.patients.createPatient')}
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="sticky top-0 z-10 bg-background px-6 pt-6 pb-4 border-b">
              <DialogTitle>{t('anesthesia.patients.createPatient')}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="personal">{t('anesthesia.patients.tabPersonal', 'Personal')}</TabsTrigger>
                <TabsTrigger value="address">{t('anesthesia.patients.tabAddress', 'Address')}</TabsTrigger>
                <TabsTrigger value="medical">{t('anesthesia.patients.tabMedical', 'Medical')}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="personal" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="surname">{t('anesthesia.patients.surname')} *</Label>
                    <Input
                      id="surname"
                      placeholder={t('anesthesia.patients.surnamePlaceholder')}
                      value={newPatient.surname}
                      onChange={(e) => setNewPatient({ ...newPatient, surname: e.target.value })}
                      data-testid="input-surname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t('anesthesia.patients.firstname')} *</Label>
                    <Input
                      id="firstName"
                      placeholder={t('anesthesia.patients.firstnamePlaceholder')}
                      value={newPatient.firstName}
                      onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
                      data-testid="input-first-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="birthday">{t('anesthesia.patients.dateOfBirth')} *</Label>
                    <Input
                      id="birthday"
                      type="text"
                      placeholder="15.03.95 or 030495"
                      value={birthdayInput}
                      onChange={handleBirthdayChange}
                      data-testid="input-birthday"
                      className={birthdayInput && !newPatient.birthday ? "border-destructive" : ""}
                    />
                    {birthdayInput && newPatient.birthday && (
                      <div className="text-xs text-muted-foreground">
                        {formatDate(newPatient.birthday)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sex">{t('anesthesia.patients.sex')} *</Label>
                    <Select value={newPatient.sex} onValueChange={(value) => setNewPatient({ ...newPatient, sex: value })}>
                      <SelectTrigger data-testid="select-sex">
                        <SelectValue placeholder={t('anesthesia.patients.selectSex')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">{t('anesthesia.patients.male')}</SelectItem>
                        <SelectItem value="F">{t('anesthesia.patients.female')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="pt-2 text-xs text-muted-foreground">
                  * {t('anesthesia.patients.requiredFields', 'Required fields')}
                </div>
              </TabsContent>
              
              <TabsContent value="address" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="patient@example.com"
                      value={newPatient.email}
                      onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('anesthesia.patients.phone')}</Label>
                    <PhoneInputWithCountry
                      id="phone"
                      placeholder="79 123 45 67"
                      value={newPatient.phone}
                      onChange={(value) => setNewPatient({ ...newPatient, phone: value })}
                      data-testid="input-phone"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="street">{t('anesthesia.patients.street', 'Street, Nr')}</Label>
                  <Input
                    id="street"
                    placeholder="Musterstraße 123"
                    value={newPatient.street}
                    onChange={(e) => setNewPatient({ ...newPatient, street: e.target.value })}
                    data-testid="input-street"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">{t('anesthesia.patients.postalCode', 'PLZ')}</Label>
                    <Input
                      id="postalCode"
                      placeholder="8000"
                      value={newPatient.postalCode}
                      onChange={(e) => setNewPatient({ ...newPatient, postalCode: e.target.value })}
                      data-testid="input-postal-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">{t('anesthesia.patients.city', 'City')}</Label>
                    <Input
                      id="city"
                      placeholder="Zürich"
                      value={newPatient.city}
                      onChange={(e) => setNewPatient({ ...newPatient, city: e.target.value })}
                      data-testid="input-city"
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="medical" className="space-y-4 pt-4">
                <div className="space-y-3">
                  <Label>{t('anesthesia.patients.allergies', 'Allergies')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(anesthesiaSettings?.allergyList || []).map((allergy) => (
                      <div key={allergy.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`allergy-${allergy.id}`}
                          checked={newPatient.allergies.includes(allergy.id)}
                          onCheckedChange={() => toggleAllergy(allergy.id)}
                          data-testid={`checkbox-allergy-${allergy.id}`}
                        />
                        <Label htmlFor={`allergy-${allergy.id}`} className="text-sm font-normal cursor-pointer">
                          {allergy.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="otherAllergies">{t('anesthesia.patients.otherAllergies', 'Other Allergies')}</Label>
                    <Textarea
                      id="otherAllergies"
                      placeholder={t('anesthesia.patients.otherAllergiesPlaceholder', 'Other allergies...')}
                      value={newPatient.otherAllergies}
                      onChange={(e) => setNewPatient({ ...newPatient, otherAllergies: e.target.value })}
                      rows={2}
                      data-testid="textarea-other-allergies"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="internalNotes">{t('anesthesia.patients.notes')}</Label>
                  <Textarea
                    id="internalNotes"
                    placeholder={t('anesthesia.patients.notesPlaceholder')}
                    value={newPatient.internalNotes}
                    onChange={(e) => setNewPatient({ ...newPatient, internalNotes: e.target.value })}
                    rows={3}
                    data-testid="textarea-internal-notes"
                  />
                </div>
              </TabsContent>
            </Tabs>
            </div>

            <div className="sticky bottom-0 z-10 bg-background px-6 py-4 border-t">
              <Button 
                onClick={handleCreatePatient} 
                className="w-full" 
                data-testid="button-submit-patient"
                disabled={createPatientMutation.isPending}
              >
                {createPatientMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('anesthesia.patients.creating')}
                  </>
                ) : (
                  t('anesthesia.patients.create')
                )}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mb-6">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('anesthesia.patients.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-patients"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleBarcodeClick}
            title="Scan patient barcode"
            data-testid="button-scan-barcode"
          >
            <ScanBarcode className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading patients...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive">Failed to load patients. Please try again.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {filteredPatients.map((patient) => (
              <Card 
                key={patient.id}
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                data-testid={`patient-item-${patient.id}`}
                onClick={() => setLocation(`${moduleBasePath}/patients/${patient.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {patient.sex === "M" ? (
                      <UserCircle className="h-5 w-5 text-blue-500" />
                    ) : patient.sex === "F" ? (
                      <UserRound className="h-5 w-5 text-pink-500" />
                    ) : (
                      <UserCircle className="h-5 w-5 text-gray-500" />
                    )}
                    <div className="font-semibold text-foreground">
                      {patient.surname}, {patient.firstName}
                    </div>
                  </div>
                  {canWrite && addons.questionnaire && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPatientForForm(patient);
                        setSendFormDialogOpen(true);
                      }}
                      title={t('common.patientCommunication', 'Patient Communication')}
                      data-testid={`button-send-form-${patient.id}`}
                    >
                      <Send className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1 ml-7">
                  {formatDate(patient.birthday)} • {patient.patientNumber}
                </div>
              </Card>
            ))}
          </div>

          {filteredPatients.length === 0 && (
            <div className="text-center py-12">
              <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('anesthesia.patients.noPatients')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery ? "Try adjusting your search" : t('anesthesia.patients.createFirstPatient')}
              </p>
            </div>
          )}
        </>
      )}

      {selectedPatientForForm && (
        <SendQuestionnaireDialog
          open={sendFormDialogOpen}
          onOpenChange={setSendFormDialogOpen}
          patientId={selectedPatientForForm.id}
          patientName={`${selectedPatientForForm.firstName} ${selectedPatientForForm.surname}`}
          patientEmail={selectedPatientForForm.email}
          patientPhone={selectedPatientForForm.phone}
        />
      )}
    </div>
  );
}
