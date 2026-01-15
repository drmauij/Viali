import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import SignaturePad from "@/components/SignaturePad";
import { Loader2, CheckCircle, AlertCircle, Clock, Building2, FileText, PenLine, Download, Plus, History } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import jsPDF from "jspdf";

interface WorklogEntry {
  id: string;
  firstName: string;
  lastName: string;
  workDate: string;
  timeStart: string;
  timeEnd: string;
  pauseMinutes: number;
  workerSignature: string;
  status: "pending" | "countersigned" | "rejected";
  countersignature?: string;
  countersignedAt?: string;
  countersignerName?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

interface WorklogLinkInfo {
  email: string;
  unitName: string;
  hospitalName: string;
  linkId: string;
  unitId: string;
  hospitalId: string;
  entries: WorklogEntry[];
}

const worklogFormSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  workDate: z.string().min(1, "Arbeitsdatum ist erforderlich"),
  timeStart: z.string().min(1, "Startzeit ist erforderlich"),
  timeEnd: z.string().min(1, "Endzeit ist erforderlich"),
  pauseMinutes: z.coerce.number().min(0, "Pause muss positiv sein").default(0),
  notes: z.string().optional(),
  workerSignature: z.string().min(1, "Unterschrift ist erforderlich"),
});

type WorklogFormData = z.infer<typeof worklogFormSchema>;

function calculateWorkHours(timeStart: string, timeEnd: string, pauseMinutes: number): string {
  if (!timeStart || !timeEnd) return "0:00";
  
  const [startH, startM] = timeStart.split(":").map(Number);
  const [endH, endM] = timeEnd.split(":").map(Number);
  
  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - pauseMinutes;
  if (totalMinutes < 0) totalMinutes = 0;
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Ausstehend</Badge>;
    case "countersigned":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Gegengezeichnet</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Abgelehnt</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function generateWorklogPDF(entry: WorklogEntry, hospitalName: string, unitName: string) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(18);
  doc.text("Arbeitszeitnachweis", pageWidth / 2, 25, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(hospitalName, pageWidth / 2, 35, { align: "center" });
  doc.text(unitName, pageWidth / 2, 42, { align: "center" });
  
  doc.setFontSize(11);
  let y = 60;
  const leftCol = 20;
  const rightCol = 80;
  
  doc.text("Mitarbeiter:", leftCol, y);
  doc.text(`${entry.firstName} ${entry.lastName}`, rightCol, y);
  
  y += 10;
  doc.text("Arbeitsdatum:", leftCol, y);
  doc.text(format(new Date(entry.workDate), "dd.MM.yyyy", { locale: de }), rightCol, y);
  
  y += 10;
  doc.text("Arbeitszeit:", leftCol, y);
  doc.text(`${entry.timeStart} - ${entry.timeEnd}`, rightCol, y);
  
  y += 10;
  doc.text("Pause:", leftCol, y);
  doc.text(`${entry.pauseMinutes} Minuten`, rightCol, y);
  
  y += 10;
  doc.text("Arbeitszeit netto:", leftCol, y);
  doc.text(calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes), rightCol, y);
  
  if (entry.notes) {
    y += 15;
    doc.text("Bemerkungen:", leftCol, y);
    y += 7;
    const splitNotes = doc.splitTextToSize(entry.notes, pageWidth - 40);
    doc.text(splitNotes, leftCol, y);
    y += splitNotes.length * 6;
  }
  
  y += 20;
  doc.setLineWidth(0.5);
  doc.line(leftCol, y, pageWidth - 20, y);
  
  y += 15;
  doc.text("Unterschrift Mitarbeiter:", leftCol, y);
  
  if (entry.workerSignature) {
    try {
      doc.addImage(entry.workerSignature, "PNG", leftCol, y + 5, 60, 25);
    } catch (e) {
      doc.text("[Unterschrift]", leftCol, y + 15);
    }
  }
  
  y += 40;
  doc.text("Gegenzeichnung:", leftCol, y);
  
  if (entry.status === "countersigned" && entry.countersignature) {
    try {
      doc.addImage(entry.countersignature, "PNG", leftCol, y + 5, 60, 25);
    } catch (e) {
      doc.text("[Gegenzeichnung]", leftCol, y + 15);
    }
    y += 35;
    doc.setFontSize(9);
    doc.text(`Gegengezeichnet von: ${entry.countersignerName || "Unbekannt"}`, leftCol, y);
    if (entry.countersignedAt) {
      doc.text(`am ${format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale: de })}`, leftCol, y + 5);
    }
  } else if (entry.status === "rejected") {
    y += 15;
    doc.setFontSize(10);
    doc.text("Status: ABGELEHNT", leftCol, y);
    if (entry.rejectionReason) {
      y += 7;
      doc.text(`Grund: ${entry.rejectionReason}`, leftCol, y);
    }
  } else {
    y += 15;
    doc.text("(Ausstehend)", leftCol, y);
  }
  
  const fileName = `Arbeitszeitnachweis_${entry.lastName}_${format(new Date(entry.workDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

export default function ExternalWorklog() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [linkInfo, setLinkInfo] = useState<WorklogLinkInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<WorklogFormData>({
    resolver: zodResolver(worklogFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      workDate: format(new Date(), "yyyy-MM-dd"),
      timeStart: "08:00",
      timeEnd: "17:00",
      pauseMinutes: 30,
      notes: "",
      workerSignature: "",
    },
  });

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/worklog/${token}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Ungültiger Link. Bitte wenden Sie sich an die Klinik.");
        } else if (res.status === 410) {
          setError("Dieser Link wurde deaktiviert.");
        } else {
          setError("Fehler beim Laden der Daten.");
        }
        return;
      }
      const data = await res.json();
      setLinkInfo(data);
    } catch (err) {
      setError("Verbindungsfehler. Bitte versuchen Sie es später erneut.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  const onSubmit = async (data: WorklogFormData) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/worklog/${token}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Fehler beim Einreichen");
      }
      
      setIsSubmitted(true);
      setShowForm(false);
      form.reset();
      
      await fetchData();
      
      toast({
        title: "Erfolgreich eingereicht",
        description: "Ihre Arbeitszeit wurde erfolgreich erfasst und wartet auf Gegenzeichnung.",
      });
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err.message || "Der Eintrag konnte nicht eingereicht werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignature = (signature: string) => {
    form.setValue("workerSignature", signature);
    setShowSignaturePad(false);
  };

  const formValues = form.watch();
  const workHours = calculateWorkHours(formValues.timeStart, formValues.timeEnd, formValues.pauseMinutes || 0);

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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <Clock className="w-5 h-5" />
              Arbeitszeiterfassung
            </CardTitle>
            <CardDescription className="mt-2">
              <div className="flex items-center justify-center gap-2 text-gray-600">
                <Building2 className="w-4 h-4" />
                <span>{linkInfo?.hospitalName} - {linkInfo?.unitName}</span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Registriert für: {linkInfo?.email}
              </div>
            </CardDescription>
          </CardHeader>
        </Card>

        {!showForm ? (
          <div className="space-y-4">
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => setShowForm(true)}
              data-testid="button-new-entry"
            >
              <Plus className="w-4 h-4 mr-2" />
              Neue Arbeitszeit erfassen
            </Button>

            {linkInfo && linkInfo.entries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Meine Einträge
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {linkInfo.entries.map((entry) => (
                    <div 
                      key={entry.id} 
                      className="border rounded-lg p-4 hover:bg-gray-50"
                      data-testid={`entry-row-${entry.id}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium">
                            {format(new Date(entry.workDate), "EEEE, dd.MM.yyyy", { locale: de })}
                          </div>
                          <div className="text-sm text-gray-600">
                            {entry.timeStart} - {entry.timeEnd} ({calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes)} netto)
                          </div>
                        </div>
                        {getStatusBadge(entry.status)}
                      </div>
                      
                      {entry.notes && (
                        <p className="text-sm text-gray-500 mt-2">{entry.notes}</p>
                      )}
                      
                      {entry.status === "rejected" && entry.rejectionReason && (
                        <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                          Grund: {entry.rejectionReason}
                        </div>
                      )}
                      
                      {entry.status === "countersigned" && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="text-sm text-gray-500 mb-2">
                            Gegengezeichnet von {entry.countersignerName}
                            {entry.countersignedAt && (
                              <> am {format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale: de })}</>
                            )}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => linkInfo && generateWorklogPDF(entry, linkInfo.hospitalName, linkInfo.unitName)}
                            data-testid={`button-download-${entry.id}`}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            PDF herunterladen
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {linkInfo && linkInfo.entries.length === 0 && !isSubmitted && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Sie haben noch keine Arbeitszeiten erfasst.</p>
                  <p className="text-sm mt-1">Klicken Sie oben, um Ihren ersten Eintrag zu erstellen.</p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Arbeitszeit erfassen</CardTitle>
              <CardDescription>
                Bitte füllen Sie alle Felder aus und unterschreiben Sie unten.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vorname</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-firstname" />
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
                          <FormLabel>Nachname</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-lastname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="workDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Arbeitsdatum</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-workdate" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="timeStart"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Von</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-timestart" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="timeEnd"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bis</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-timeend" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="pauseMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pause (Minuten)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} data-testid="input-pause" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <span className="text-sm text-gray-600">Nettoarbeitszeit: </span>
                    <span className="font-semibold text-blue-700">{workHours}</span>
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bemerkungen (optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="z.B. Tätigkeit, besondere Umstände..."
                            {...field} 
                            data-testid="input-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <FormField
                    control={form.control}
                    name="workerSignature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unterschrift</FormLabel>
                        <FormControl>
                          <div>
                            {field.value ? (
                              <div className="border rounded-lg p-2 bg-white">
                                <img 
                                  src={field.value} 
                                  alt="Unterschrift" 
                                  className="h-20 mx-auto"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full mt-2"
                                  onClick={() => setShowSignaturePad(true)}
                                  data-testid="button-change-signature"
                                >
                                  Unterschrift ändern
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => setShowSignaturePad(true)}
                                data-testid="button-add-signature"
                              >
                                <PenLine className="w-4 h-4 mr-2" />
                                Unterschrift hinzufügen
                              </Button>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowForm(false)}
                      disabled={isSubmitting}
                      data-testid="button-cancel"
                    >
                      Abbrechen
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={isSubmitting}
                      data-testid="button-submit"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Wird eingereicht...
                        </>
                      ) : (
                        "Einreichen"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>

      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onSave={handleSignature}
        title="Unterschrift"
      />
    </div>
  );
}