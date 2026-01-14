import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { SignatureCanvas } from "@/components/ui/signature-canvas";
import { Loader2, CheckCircle, AlertCircle, Building2, FileText } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface HospitalInfo {
  id: string;
  name: string;
  companyName: string;
  companyStreet: string;
  companyPostalCode: string;
  companyCity: string;
  companyPhone: string;
  companyEmail: string;
  companyLogoUrl: string;
}

const contractFormSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  street: z.string().min(1, "Strasse ist erforderlich"),
  postalCode: z.string().min(4, "PLZ ist erforderlich"),
  city: z.string().min(1, "Ort ist erforderlich"),
  phone: z.string().optional(),
  email: z.string().email("Gültige E-Mail Adresse erforderlich"),
  dateOfBirth: z.string().min(1, "Geburtsdatum ist erforderlich"),
  iban: z.string().min(15, "IBAN ist erforderlich").max(34),
  role: z.enum(["awr_nurse", "anesthesia_nurse", "anesthesia_doctor"], {
    required_error: "Bitte wählen Sie eine Rolle",
  }),
  workerSignatureLocation: z.string().min(1, "Unterschriftsort ist erforderlich"),
  workerSignature: z.string().min(1, "Unterschrift ist erforderlich"),
});

type ContractFormData = z.infer<typeof contractFormSchema>;

const roleInfo = {
  awr_nurse: {
    title: "Tagesklinik Pflege (AWR-Nurse)",
    rate: "CHF 75.00/Std.",
    description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Intensivpflege",
    roleTitle: "IMC-Pfleger im Aufwachraum",
  },
  anesthesia_nurse: {
    title: "Pflege-Anästhesist",
    rate: "CHF 80.00/Std.",
    description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Anästhesiepflege",
    roleTitle: "Anästhesiepfleger",
  },
  anesthesia_doctor: {
    title: "Arzt Anästhesie",
    rate: "CHF 150.00/Std.",
    description: "Facharzt Anästhesiologie, in der Schweiz anerkannt",
    roleTitle: "Anästhesiearzt",
  },
};

export default function WorkerContractForm() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [hospital, setHospital] = useState<HospitalInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const form = useForm<ContractFormData>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      street: "",
      postalCode: "",
      city: "",
      phone: "",
      email: "",
      dateOfBirth: "",
      iban: "",
      role: undefined,
      workerSignatureLocation: "",
      workerSignature: "",
    },
  });

  useEffect(() => {
    async function fetchHospital() {
      try {
        const res = await fetch(`/api/public/contracts/${token}/hospital`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Ungültiger Vertragslink. Bitte wenden Sie sich an die Klinik.");
          } else {
            setError("Fehler beim Laden der Klinikdaten.");
          }
          return;
        }
        const data = await res.json();
        setHospital(data);
      } catch (err) {
        setError("Verbindungsfehler. Bitte versuchen Sie es später erneut.");
      } finally {
        setIsLoading(false);
      }
    }
    
    if (token) {
      fetchHospital();
    }
  }, [token]);

  const onSubmit = async (data: ContractFormData) => {
    if (!hospital) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/public/contracts/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Fehler beim Einreichen des Vertrags");
      }
      
      setIsSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err.message || "Der Vertrag konnte nicht eingereicht werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formValues = form.watch();
  const selectedRole = formValues.role ? roleInfo[formValues.role] : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-gray-500">Laden...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Fehler</h2>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Vertrag eingereicht!</h2>
            <p className="text-gray-600">
              Ihr Vertrag wurde erfolgreich eingereicht und wartet nun auf die Unterschrift des Managers.
              Sie erhalten eine Benachrichtigung, sobald der Vertrag vollständig unterzeichnet ist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {hospital?.companyLogoUrl && (
          <div className="text-center mb-6">
            <img 
              src={hospital.companyLogoUrl} 
              alt={hospital.companyName} 
              className="h-16 mx-auto object-contain"
            />
          </div>
        )}
        
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Vertrag für Kurzzeiteinsätze auf Abruf</CardTitle>
            <CardDescription className="mt-2">
              <div className="flex items-center justify-center gap-2 text-gray-600">
                <Building2 className="w-4 h-4" />
                <span>{hospital?.companyName || hospital?.name}</span>
              </div>
              {hospital?.companyStreet && (
                <div className="text-sm mt-1">
                  {hospital.companyStreet}, {hospital.companyPostalCode} {hospital.companyCity}
                </div>
              )}
            </CardDescription>
          </CardHeader>
        </Card>

        {showPreview ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Vertragsvorschau
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <div className="bg-white border rounded-lg p-6 text-sm">
                <h3 className="text-center font-bold text-lg mb-4">Vertrag für Kurzzeiteinsätze auf Abruf</h3>
                
                <p className="mb-4">zwischen</p>
                
                <p className="font-semibold">{hospital?.companyName}</p>
                <p className="mb-4">{hospital?.companyStreet}, {hospital?.companyPostalCode} {hospital?.companyCity}</p>
                <p className="mb-4 italic">- Auftraggeber -</p>
                
                <p className="mb-4">und</p>
                
                <p className="font-semibold">{formValues.lastName}, {formValues.firstName}</p>
                <p>{formValues.street}, {formValues.postalCode} {formValues.city}</p>
                <p>Tel: {formValues.phone || "-"}, E-Mail: {formValues.email}</p>
                <p className="mb-4 italic">- Auftragnehmer -</p>
                
                <p><strong>IBAN:</strong> {formValues.iban}</p>
                <p className="mb-4"><strong>Geb.:</strong> {formValues.dateOfBirth}</p>

                <Separator className="my-4" />

                <h4 className="font-bold">Präambel</h4>
                <p className="mb-4">
                  Die {hospital?.companyName} bietet die Möglichkeit für einzelne Tage stundenweise Tätigkeiten im Bereich der IMC-Pflege, Anästhesiepflege und ärztlichen Anästhesie anzubieten. Der Auftragnehmer ist bereit, künftig nach Absprache für die Leistungserbringung in seinem Fachbereich auf Abruf stundenweise zur Verfügung zu stehen.
                </p>
                
                <h4 className="font-bold">1. Vertragsgegenstand</h4>
                <p className="mb-4">
                  Der Auftragnehmer ist {selectedRole?.description}, in der Schweiz anerkannt. Er verpflichtet sich, Leistungen als {selectedRole?.roleTitle} für den Auftraggeber zu erbringen. Der Auftragnehmer erbringt seine Leistungen in eigener fachlicher Verantwortung. Der Auftragnehmer beachtet die Weisungen der Geschäftsleitung und der Leitenden Chirurgin (Dr. med. Lena Schumann). Er hat Pausen (ohne Vergütung) auf Anweisung wahrzunehmen.
                </p>

                <h4 className="font-bold">2. Arbeitsort</h4>
                <p className="mb-4">
                  Der Arbeitsort befindet sich an der {hospital?.companyName}, {hospital?.companyStreet}, {hospital?.companyPostalCode} {hospital?.companyCity}.
                </p>

                <h4 className="font-bold">3. Arbeitszeit und Abruf</h4>
                <p className="mb-4">
                  Der Einsatz erfolgt nach Bedarf der Auftraggeberin. Termine, die der Auftragnehmer schriftlich oder per E-Mail bestätigt, sind verbindlich. Die Termine dürfen nur im Krankheitsfall abgesagt werden, wobei der Auftragnehmer möglichst frühzeitig (48h vorher) einen voraussichtlichen Ausfall mitzuteilen hat. Er hat die Auftraggeberin auch über die voraussichtliche Eventualität eines krankheitsbedingten Ausfalls frühzeitig zu informieren, damit rechtzeitig Ersatzpersonal geplant werden kann.
                </p>
                
                <h4 className="font-bold">4. Vergütung</h4>
                <p className="mb-4">
                  Der Auftragnehmer erhält für die erbrachte Arbeitsleistung einen Bruttolohn pro Stunde in Höhe von{" "}
                  <strong>{selectedRole?.rate}</strong> ({selectedRole?.title}).
                </p>
                <p className="mb-4">
                  Die Auszahlung erfolgt im Folgemonat des Einsatzes auf das von dem Auftragnehmer angegebene Bankkonto. Der Auftragnehmer hat den Stundeneinsatz pro Tag von der ärztlichen Leitung (Dr. med. Lena Schumann) bestätigen zu lassen. Am Ende des Monats reicht der Auftragnehmer seine bestätigte Stundenaufstellung zur Abrechnung bei der Auftraggeberin ein.
                </p>

                <h4 className="font-bold">5. Sozialversicherungen</h4>
                <p className="mb-4">
                  Dieser Vertrag unterliegt den gesetzlichen Vorschriften der Sozialversicherungen in der Schweiz. Der Auftraggeber verpflichtet sich, alle erforderlichen Abgaben für AHV, ALV abzuführen. Vom Bruttolohn werden die Auftragnehmerbeiträge in Abzug gebracht.
                </p>

                <h4 className="font-bold">6. Einschluss und Abgeltung von Ferienansprüchen und Lohnfortzahlung</h4>
                <p className="mb-4">
                  Angesichts der kurzen Dauer der Arbeitseinsätze werden der Ferienanspruch sowie der Anspruch auf Lohnfortzahlung bei unverschuldeter Verhinderung an der Arbeitsleistung (Krankheit, Unfall, usw.) durch den vereinbarten Bruttolohn abgegolten. Für Feiertage und bezahlte Absenzen besteht kein besonderer Lohnanspruch, da die entsprechende Entschädigung mit Rücksicht auf die kurze Dauer der Arbeitseinsätze im Lohn eingeschlossen ist.
                </p>

                <h4 className="font-bold">7. Vertraulichkeit</h4>
                <p className="mb-4">
                  Der Auftragnehmer verpflichtet sich, alle im Zusammenhang mit seiner Tätigkeit bekannt gewordenen Informationen über den Auftraggeber und dessen Geschäftsabläufe vertraulich zu behandeln und nicht an Dritte weiterzugeben.
                </p>

                <h4 className="font-bold">8. Beendigung des Arbeitsverhältnisses</h4>
                <p className="mb-4">
                  Die Vereinbarung kann mit einer Frist von einem Monat gekündigt werden.
                </p>

                <h4 className="font-bold">9. Weitere Bestimmungen</h4>
                <p className="mb-4">
                  Änderungen oder Ergänzungen dieses Vertrags bedürfen der Schriftform. Mündliche Abreden sind ungültig.
                </p>

                <h4 className="font-bold">10. Recht und Gerichtsstand</h4>
                <p className="mb-4">
                  Soweit nicht die Bestimmungen dieses Vertrags vorgehen, gelten die allgemeinen Bestimmungen des Obligationenrechts. Abänderungen, Ergänzungen oder die Aufhebung des vorliegenden Vertrages sind nur in Schriftform und von beiden Vertragsparteien unterzeichnet rechtsgültig. Sollten Teile dieses Vertrages unwirksam sein, so wird hierdurch die Gültigkeit der übrigen Bestimmungen nicht berührt. An die Stelle unwirksamer Bestimmungen treten sinngemäss die einschlägigen gesetzlichen Bestimmungen. Auf diesen Arbeitsvertrag ist schweizerisches Recht anwendbar. Der Gerichtsstand ist Kreuzlingen. Jede Vertragspartei erhält ein Exemplar dieses Vertrages.
                </p>

                <Separator className="my-4" />
                
                <div className="mt-6 flex justify-between items-end">
                  <div>
                    <p>{formValues.workerSignatureLocation}, {format(new Date(), "dd.MM.yyyy", { locale: de })}</p>
                    <p className="mt-2">Auftragnehmer/in</p>
                    {formValues.workerSignature && (
                      <img 
                        src={formValues.workerSignature} 
                        alt="Unterschrift" 
                        className="h-16 mt-2 border-b border-gray-300"
                      />
                    )}
                  </div>
                  <div className="text-right">
                    <p>Kreuzlingen, _______________</p>
                    <p className="mt-2">{hospital?.companyName}</p>
                    <p className="text-gray-400 mt-8">_______________</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4 mt-6">
                <Button 
                  variant="outline" 
                  onClick={() => setShowPreview(false)}
                  className="flex-1"
                  data-testid="button-back-to-form"
                >
                  Zurück zum Formular
                </Button>
                <Button 
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={isSubmitting}
                  className="flex-1"
                  data-testid="button-submit-contract"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Wird eingereicht...
                    </>
                  ) : (
                    "Vertrag unterschrieben einreichen"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(() => setShowPreview(true))} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Persönliche Daten</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vorname *</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-first-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nachname *</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Strasse *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-street" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PLZ *</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-postal-code" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Ort *</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-city" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefon</FormLabel>
                          <FormControl>
                            <Input {...field} type="tel" data-testid="input-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-Mail *</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Geburtsdatum *</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-date-of-birth" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Bankverbindung</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="iban"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IBAN *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="CH..." data-testid="input-iban" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Rolle / Tarif</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="space-y-3"
                          >
                            {Object.entries(roleInfo).map(([key, info]) => (
                              <div 
                                key={key} 
                                className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors ${
                                  field.value === key ? "border-primary bg-primary/5" : "border-gray-200 hover:bg-gray-50"
                                }`}
                              >
                                <RadioGroupItem 
                                  value={key} 
                                  id={key}
                                  data-testid={`radio-role-${key}`}
                                />
                                <Label htmlFor={key} className="flex-1 cursor-pointer">
                                  <div className="font-semibold">{info.title}</div>
                                  <div className="text-sm text-gray-500">{info.description}</div>
                                  <div className="text-sm font-medium text-primary mt-1">{info.rate}</div>
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Unterschrift</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="workerSignatureLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unterschriftsort *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="z.B. Kreuzlingen" data-testid="input-signature-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="workerSignature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ihre Unterschrift *</FormLabel>
                        <FormControl>
                          <SignatureCanvas
                            value={field.value}
                            onChange={field.onChange}
                            className="border rounded-lg"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Button 
                type="submit" 
                className="w-full"
                size="lg"
                data-testid="button-preview-contract"
              >
                Vorschau & Unterschreiben
              </Button>
            </form>
          </Form>
        )}

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} {hospital?.companyName || hospital?.name}</p>
          {hospital?.companyPhone && <p>Tel: {hospital.companyPhone}</p>}
          {hospital?.companyEmail && <p>E-Mail: {hospital.companyEmail}</p>}
        </div>
      </div>
    </div>
  );
}
