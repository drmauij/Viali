import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Loader2, Clock, CheckCircle, XCircle, PenLine, Download, User, Building2, Search } from "lucide-react";
import { format } from "date-fns";
import { de, enUS, type Locale } from "date-fns/locale";
import jsPDF from "jspdf";
import type { TFunction } from "i18next";

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

function getStatusBadge(status: string, t: TFunction) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">{t('worklogs.statusPending')}</Badge>;
    case "countersigned":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">{t('worklogs.statusCountersigned')}</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">{t('worklogs.statusRejected')}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function generateWorklogPDF(entry: WorklogEntry, hospitalName: string, t: TFunction, locale: Locale) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(18);
  doc.text(t('worklogs.pdf.title'), pageWidth / 2, 25, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(hospitalName, pageWidth / 2, 35, { align: "center" });
  doc.text(entry.unit?.name || "", pageWidth / 2, 42, { align: "center" });
  
  doc.setFontSize(11);
  let y = 60;
  const leftCol = 20;
  const rightCol = 80;
  
  doc.text(`${t('worklogs.pdf.worker')}:`, leftCol, y);
  doc.text(`${entry.firstName} ${entry.lastName}`, rightCol, y);
  
  y += 10;
  doc.text(`${t('worklogs.pdf.email')}:`, leftCol, y);
  doc.text(entry.email, rightCol, y);
  
  y += 10;
  doc.text(`${t('worklogs.pdf.workDate')}:`, leftCol, y);
  doc.text(format(new Date(entry.workDate), "dd.MM.yyyy", { locale }), rightCol, y);
  
  y += 10;
  doc.text(`${t('worklogs.pdf.workTime')}:`, leftCol, y);
  doc.text(`${entry.timeStart} - ${entry.timeEnd}`, rightCol, y);
  
  y += 10;
  doc.text(`${t('worklogs.pdf.break')}:`, leftCol, y);
  doc.text(`${entry.pauseMinutes} ${t('worklogs.minutes')}`, rightCol, y);
  
  y += 10;
  doc.text(`${t('worklogs.pdf.netWorkTime')}:`, leftCol, y);
  doc.text(calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes), rightCol, y);
  
  if (entry.notes) {
    y += 15;
    doc.text(`${t('worklogs.pdf.notes')}:`, leftCol, y);
    y += 7;
    const splitNotes = doc.splitTextToSize(entry.notes, pageWidth - 40);
    doc.text(splitNotes, leftCol, y);
    y += splitNotes.length * 6;
  }
  
  y += 20;
  doc.setLineWidth(0.5);
  doc.line(leftCol, y, pageWidth - 20, y);
  
  y += 15;
  doc.text(`${t('worklogs.pdf.workerSignature')}:`, leftCol, y);
  
  if (entry.workerSignature) {
    try {
      doc.addImage(entry.workerSignature, "PNG", leftCol, y + 5, 60, 25);
    } catch (e) {
      doc.text(`[${t('worklogs.signature')}]`, leftCol, y + 15);
    }
  }
  
  y += 40;
  doc.text(`${t('worklogs.pdf.countersignature')}:`, leftCol, y);
  
  if (entry.status === "countersigned" && entry.countersignature) {
    try {
      doc.addImage(entry.countersignature, "PNG", leftCol, y + 5, 60, 25);
    } catch (e) {
      doc.text(`[${t('worklogs.countersignature')}]`, leftCol, y + 15);
    }
    y += 35;
    doc.setFontSize(9);
    doc.text(`${t('worklogs.pdf.countersignedBy')}: ${entry.countersignerName || "Unknown"}`, leftCol, y);
    if (entry.countersignedAt) {
      doc.text(`${t('worklogs.pdf.on')} ${format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale })}`, leftCol, y + 5);
    }
  }
  
  const fileName = `Worklog_${entry.lastName}_${format(new Date(entry.workDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

export default function UnitWorklogs() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital() as (Hospital & { id: string; name: string; unitId: string; unitName?: string }) | null;
  const hospitalId = activeHospital?.id;
  const hospitalName = activeHospital?.name;
  const unitId = activeHospital?.unitId;
  const unitName = activeHospital?.unitName || t('worklogs.department');
  const dateLocale = i18n.language === 'de' ? de : enUS;
  
  const [activeTab, setActiveTab] = useState("pending");
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WorklogEntry | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: pendingEntries = [], isLoading: isPendingLoading } = useQuery<WorklogEntry[]>({
    queryKey: [`/api/hospitals/${hospitalId}/worklog/pending?unitId=${unitId}`],
    enabled: !!hospitalId && !!unitId,
  });

  const { data: countersignedEntries = [], isLoading: isCountersignedLoading } = useQuery<WorklogEntry[]>({
    queryKey: [`/api/hospitals/${hospitalId}/worklog/entries?unitId=${unitId}&status=countersigned`],
    enabled: !!hospitalId && !!unitId,
  });

  const countersignMutation = useMutation({
    mutationFn: async ({ entryId, signature }: { entryId: string; signature: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/worklog/entries/${entryId}/countersign`, { signature });
    },
    onSuccess: () => {
      // Invalidate pending, countersigned, and all worklog entries
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/worklog/pending?unitId=${unitId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/worklog/entries?unitId=${unitId}&status=countersigned`] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/hospitals/${hospitalId}/worklog/entries`);
        }
      });
      toast({
        title: t('worklogs.countersignSuccess'),
        description: t('worklogs.countersignSuccessDesc'),
      });
      setSelectedEntry(null);
      setShowSignaturePad(false);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.countersignError'),
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/worklog/entries/${entryId}/reject`, { reason });
    },
    onSuccess: () => {
      // Invalidate both pending worklogs (this page) and all worklog entries (business module)
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${hospitalId}/worklog/pending?unitId=${unitId}`] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/hospitals/${hospitalId}/worklog/entries`);
        }
      });
      toast({
        title: t('worklogs.rejectSuccess'),
        description: t('worklogs.rejectSuccessDesc'),
      });
      setSelectedEntry(null);
      setShowRejectDialog(false);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.rejectError'),
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
          {getStatusBadge(entry.status, t)}
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
          <div>
            <span className="text-gray-500">{t('worklogs.date')}:</span>
            <div className="font-medium">{format(new Date(entry.workDate), "EEEE, dd.MM.yyyy", { locale: dateLocale })}</div>
          </div>
          <div>
            <span className="text-gray-500">{t('worklogs.department')}:</span>
            <div className="font-medium flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {entry.unit?.name || t('common.noData')}
            </div>
          </div>
          <div>
            <span className="text-gray-500">{t('worklogs.workTime')}:</span>
            <div className="font-medium">{entry.timeStart} - {entry.timeEnd}</div>
          </div>
          <div>
            <span className="text-gray-500">{t('worklogs.netTime')}:</span>
            <div className="font-medium">{calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes)}</div>
          </div>
        </div>
        
        {entry.notes && (
          <div className="mt-3 text-sm">
            <span className="text-gray-500">{t('worklogs.notes')}:</span>
            <p className="mt-1">{entry.notes}</p>
          </div>
        )}
        
        {entry.status === "rejected" && entry.rejectionReason && (
          <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
            <strong>{t('worklogs.rejectionReason')}:</strong> {entry.rejectionReason}
          </div>
        )}
        
        {entry.status === "countersigned" && (
          <div className="mt-3 text-sm text-gray-500">
            {t('worklogs.countersignedBy', { name: entry.countersignerName, date: entry.countersignedAt ? format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale: dateLocale }) : "" })}
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
                {t('worklogs.countersign')}
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleReject(entry)}
                data-testid={`button-reject-${entry.id}`}
              >
                <XCircle className="w-4 h-4 mr-1" />
                {t('worklogs.reject')}
              </Button>
            </>
          )}
          
          {entry.status === "countersigned" && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => generateWorklogPDF(entry, hospitalName || '', t, dateLocale)}
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
            <p>{t('worklogs.noLinks')}</p>
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
          {t('worklogs.title')}
        </h1>
        <p className="text-gray-500 mt-1">{t('worklogs.description')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="tab-pending">
            <Clock className="w-4 h-4" />
            {t('worklogs.pending')}
            {pendingEntries.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingEntries.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="countersigned" className="flex items-center gap-2" data-testid="tab-countersigned">
            <CheckCircle className="w-4 h-4" />
            {t('worklogs.statusCountersigned')}
          </TabsTrigger>
          <TabsTrigger value="links" className="flex items-center gap-2" data-testid="tab-links">
            {t('worklogs.manageLinks')}
          </TabsTrigger>
        </TabsList>

        {(activeTab === "pending" || activeTab === "countersigned") && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('worklogs.searchPlaceholder', 'Search by name or notes...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-worklogs"
            />
          </div>
        )}

        <TabsContent value="pending">
          {isPendingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : pendingEntries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                <p>{t('worklogs.noPending')}</p>
              </CardContent>
            </Card>
          ) : (
            (() => {
              const filtered = pendingEntries.filter(entry => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  entry.firstName?.toLowerCase().includes(q) ||
                  entry.lastName?.toLowerCase().includes(q) ||
                  `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(q) ||
                  entry.notes?.toLowerCase().includes(q)
                );
              });
              return filtered.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>{t('common.noResults', 'No results found')}</p>
                  </CardContent>
                </Card>
              ) : (
                filtered.map(entry => renderEntryCard(entry))
              );
            })()
          )}
        </TabsContent>

        <TabsContent value="countersigned">
          {isCountersignedLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : countersignedEntries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>{t('worklogs.noCountersigned', 'No countersigned records yet')}</p>
              </CardContent>
            </Card>
          ) : (
            (() => {
              const filtered = countersignedEntries.filter(entry => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  entry.firstName?.toLowerCase().includes(q) ||
                  entry.lastName?.toLowerCase().includes(q) ||
                  `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(q) ||
                  entry.notes?.toLowerCase().includes(q)
                );
              });
              return filtered.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>{t('common.noResults', 'No results found')}</p>
                  </CardContent>
                </Card>
              ) : (
                filtered.map(entry => renderEntryCard(entry))
              );
            })()
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
        title={t('worklogs.countersignature')}
      />

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle>{t('worklogs.reject')} - {t('worklogs.title')}</DialogTitle>
            <DialogDescription>
              {t('worklogs.enterRejectionReason')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={t('worklogs.rejectionReason')}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            data-testid="input-rejection-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {t('common.cancel')}
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
              {t('worklogs.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
