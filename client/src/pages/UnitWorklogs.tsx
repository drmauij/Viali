import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import SignaturePad from "@/components/SignaturePad";
import { WorklogLinkManager } from "@/components/WorklogLinkManager";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import type { Hospital } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Clock, CheckCircle, XCircle, PenLine, Download, User, Building2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import jsPDF from "jspdf";

interface WorklogEntry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  workDate: string;
  timeStart: string;
  timeEnd: string;
  pauseMinutes: number;
  workerSignature: string;
  status: "pending" | "countersigned" | "rejected";
  countersignature?: string;
  countersignedAt?: string;
  countersignedBy?: string;
  countersignerName?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  unitId: string;
  unit: {
    id: string;
    name: string;
  };
}

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

function generateWorklogPDF(entry: WorklogEntry, hospitalName: string) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(18);
  doc.text("Arbeitszeitnachweis", pageWidth / 2, 25, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(hospitalName, pageWidth / 2, 35, { align: "center" });
  doc.text(entry.unit?.name || "", pageWidth / 2, 42, { align: "center" });
  
  doc.setFontSize(11);
  let y = 60;
  const leftCol = 20;
  const rightCol = 80;
  
  doc.text("Mitarbeiter:", leftCol, y);
  doc.text(`${entry.firstName} ${entry.lastName}`, rightCol, y);
  
  y += 10;
  doc.text("Email:", leftCol, y);
  doc.text(entry.email, rightCol, y);
  
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
  }
  
  const fileName = `Arbeitszeitnachweis_${entry.lastName}_${format(new Date(entry.workDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

export default function UnitWorklogs() {
  const { toast } = useToast();
  const activeHospital = useActiveHospital() as (Hospital & { id: string; name: string; unitId: string; unitName?: string }) | null;
  const hospitalId = activeHospital?.id;
  const hospitalName = activeHospital?.name;
  const unitId = activeHospital?.unitId;
  const unitName = activeHospital?.unitName || "Abteilung";
  
  const [activeTab, setActiveTab] = useState("pending");
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WorklogEntry | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: pendingEntries = [], isLoading: isPendingLoading } = useQuery<WorklogEntry[]>({
    queryKey: ['/api/hospitals', hospitalId, 'worklog', 'pending', unitId],
    enabled: !!hospitalId && !!unitId,
  });

  const countersignMutation = useMutation({
    mutationFn: async ({ entryId, signature }: { entryId: string; signature: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/worklog/entries/${entryId}/countersign`, { signature });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId, 'worklog'] });
      toast({
        title: "Erfolgreich gegengezeichnet",
        description: "Der Arbeitszeitnachweis wurde bestätigt.",
      });
      setSelectedEntry(null);
      setShowSignaturePad(false);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Gegenzeichnung fehlgeschlagen.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/worklog/entries/${entryId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId, 'worklog'] });
      toast({
        title: "Eintrag abgelehnt",
        description: "Der Arbeitszeitnachweis wurde abgelehnt.",
      });
      setSelectedEntry(null);
      setShowRejectDialog(false);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Ablehnung fehlgeschlagen.",
        variant: "destructive",
      });
    },
  });

  const handleCountersign = (entry: WorklogEntry) => {
    setSelectedEntry(entry);
    setShowSignaturePad(true);
  };

  const handleReject = (entry: WorklogEntry) => {
    setSelectedEntry(entry);
    setShowRejectDialog(true);
  };

  const handleSignature = (signature: string) => {
    if (selectedEntry) {
      countersignMutation.mutate({ entryId: selectedEntry.id, signature });
    }
  };

  const handleConfirmReject = () => {
    if (selectedEntry) {
      rejectMutation.mutate({ entryId: selectedEntry.id, reason: rejectionReason });
    }
  };

  const renderEntryCard = (entry: WorklogEntry) => (
    <Card key={entry.id} className="mb-4" data-testid={`worklog-entry-${entry.id}`}>
      <CardContent className="pt-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <span className="font-medium">{entry.firstName} {entry.lastName}</span>
            </div>
            <div className="text-sm text-gray-500">{entry.email}</div>
          </div>
          {getStatusBadge(entry.status)}
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
          <div>
            <span className="text-gray-500">Datum:</span>
            <div className="font-medium">{format(new Date(entry.workDate), "EEEE, dd.MM.yyyy", { locale: de })}</div>
          </div>
          <div>
            <span className="text-gray-500">Abteilung:</span>
            <div className="font-medium flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {entry.unit?.name || 'Unbekannt'}
            </div>
          </div>
          <div>
            <span className="text-gray-500">Arbeitszeit:</span>
            <div className="font-medium">{entry.timeStart} - {entry.timeEnd}</div>
          </div>
          <div>
            <span className="text-gray-500">Netto:</span>
            <div className="font-medium">{calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes)}</div>
          </div>
        </div>
        
        {entry.notes && (
          <div className="mt-3 text-sm">
            <span className="text-gray-500">Bemerkungen:</span>
            <p className="mt-1">{entry.notes}</p>
          </div>
        )}
        
        {entry.status === "rejected" && entry.rejectionReason && (
          <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
            <strong>Ablehnungsgrund:</strong> {entry.rejectionReason}
          </div>
        )}
        
        {entry.status === "countersigned" && (
          <div className="mt-3 text-sm text-gray-500">
            Gegengezeichnet von {entry.countersignerName} am {entry.countersignedAt ? format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale: de }) : ""}
          </div>
        )}
        
        <div className="mt-4 pt-3 border-t flex gap-2 flex-wrap">
          {entry.status === "pending" && (
            <>
              <Button 
                size="sm" 
                onClick={() => handleCountersign(entry)}
                data-testid={`button-countersign-${entry.id}`}
              >
                <PenLine className="w-4 h-4 mr-1" />
                Gegenzeichnen
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleReject(entry)}
                data-testid={`button-reject-${entry.id}`}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Ablehnen
              </Button>
            </>
          )}
          
          {entry.status === "countersigned" && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => generateWorklogPDF(entry, hospitalName || '')}
              data-testid={`button-pdf-${entry.id}`}
            >
              <Download className="w-4 h-4 mr-1" />
              PDF
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!hospitalId || !unitId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p>Bitte wählen Sie eine Abteilung aus.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6" />
          Arbeitszeitnachweise
        </h1>
        <p className="text-gray-500 mt-1">Externe Arbeitszeitnachweise für {unitName}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="tab-pending">
            <Clock className="w-4 h-4" />
            Ausstehend
            {pendingEntries.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingEntries.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="links" className="flex items-center gap-2" data-testid="tab-links">
            Links verwalten
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {isPendingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : pendingEntries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                <p>Keine ausstehenden Arbeitszeitnachweise.</p>
              </CardContent>
            </Card>
          ) : (
            pendingEntries.map(entry => renderEntryCard(entry))
          )}
        </TabsContent>

        <TabsContent value="links">
          <WorklogLinkManager 
            hospitalId={hospitalId} 
            unitId={unitId} 
            unitName={unitName} 
          />
        </TabsContent>
      </Tabs>

      {/* Signature Pad */}
      <SignaturePad 
        isOpen={showSignaturePad}
        onClose={() => {
          setShowSignaturePad(false);
          setSelectedEntry(null);
        }}
        onSave={handleSignature}
        title="Gegenzeichnung"
      />

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle>Arbeitszeitnachweis ablehnen</DialogTitle>
            <DialogDescription>
              Bitte geben Sie einen Grund für die Ablehnung an.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ablehnungsgrund..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            data-testid="input-rejection-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Abbrechen
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmReject}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
