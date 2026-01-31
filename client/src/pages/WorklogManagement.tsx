import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import type { Hospital } from "@shared/schema";
import { Loader2, Clock, Download, User, Building2, Filter, FileText } from "lucide-react";
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
  activityType?: "anesthesia_nurse" | "op_nurse" | "springer_nurse" | "anesthesia_doctor" | "other";
  workerSignature: string;
  status: "pending" | "countersigned" | "rejected";
  countersignature?: string;
  countersignedAt?: string;
  countersignedBy?: string;
  countersignerName?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
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
  
  doc.text(t('worklogs.pdf.worker') + ":", leftCol, y);
  doc.text(`${entry.firstName} ${entry.lastName}`, rightCol, y);
  
  y += 10;
  doc.text(t('worklogs.pdf.email') + ":", leftCol, y);
  doc.text(entry.email, rightCol, y);
  
  y += 10;
  doc.text(t('worklogs.pdf.workDate') + ":", leftCol, y);
  doc.text(format(new Date(entry.workDate), "dd.MM.yyyy", { locale }), rightCol, y);
  
  y += 10;
  doc.text(t('worklogs.pdf.workTime') + ":", leftCol, y);
  doc.text(`${entry.timeStart} - ${entry.timeEnd}`, rightCol, y);
  
  y += 10;
  doc.text(t('worklogs.pdf.break') + ":", leftCol, y);
  doc.text(`${entry.pauseMinutes} ${t('worklogs.minutes')}`, rightCol, y);
  
  y += 10;
  doc.text(t('worklogs.pdf.activity') + ":", leftCol, y);
  const activityLabels: Record<string, string> = {
    anesthesia_nurse: t('externalWorklog.activityTypes.anesthesia_nurse'),
    op_nurse: t('externalWorklog.activityTypes.op_nurse'),
    springer_nurse: t('externalWorklog.activityTypes.springer_nurse'),
    anesthesia_doctor: t('externalWorklog.activityTypes.anesthesia_doctor'),
    other: t('externalWorklog.activityTypes.other'),
  };
  doc.text(entry.activityType ? activityLabels[entry.activityType] || entry.activityType : "-", rightCol, y);
  
  y += 10;
  doc.text(t('worklogs.pdf.netWorkTime') + ":", leftCol, y);
  doc.text(calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes), rightCol, y);
  
  if (entry.notes) {
    y += 15;
    doc.text(t('worklogs.pdf.notes') + ":", leftCol, y);
    y += 7;
    const splitNotes = doc.splitTextToSize(entry.notes, pageWidth - 40);
    doc.text(splitNotes, leftCol, y);
    y += splitNotes.length * 6;
  }
  
  y += 20;
  doc.setLineWidth(0.5);
  doc.line(leftCol, y, pageWidth - 20, y);
  
  y += 15;
  doc.text(t('worklogs.pdf.workerSignature') + ":", leftCol, y);
  
  if (entry.workerSignature) {
    try {
      doc.addImage(entry.workerSignature, "PNG", leftCol, y + 5, 60, 25);
    } catch (e) {
      doc.text("[" + t('worklogs.signature') + "]", leftCol, y + 15);
    }
  }
  
  y += 40;
  doc.text(t('worklogs.pdf.countersignature') + ":", leftCol, y);
  
  if (entry.status === "countersigned" && entry.countersignature) {
    try {
      doc.addImage(entry.countersignature, "PNG", leftCol, y + 5, 60, 25);
    } catch (e) {
      doc.text("[" + t('worklogs.countersignature') + "]", leftCol, y + 15);
    }
    y += 35;
    doc.setFontSize(9);
    doc.text(`${t('worklogs.pdf.countersignedBy')}: ${entry.countersignerName || t('common.noData')}`, leftCol, y);
    if (entry.countersignedAt) {
      doc.text(`${t('worklogs.pdf.on')} ${format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale })}`, leftCol, y + 5);
    }
  }
  
  const fileName = `${t('worklogs.pdf.title')}_${entry.lastName}_${format(new Date(entry.workDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

export default function WorklogManagement() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'de' ? de : enUS;
  const activeHospital = useActiveHospital() as Hospital & { id: string; name: string } | null;
  const hospitalId = activeHospital?.id;
  const hospitalName = activeHospital?.name;
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEmail, setFilterEmail] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Build the query URL with filters
  const buildWorklogEntriesUrl = () => {
    const params = new URLSearchParams();
    if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus);
    if (filterEmail) params.append('email', filterEmail);
    if (filterDateFrom) params.append('dateFrom', filterDateFrom);
    if (filterDateTo) params.append('dateTo', filterDateTo);
    const queryString = params.toString();
    return `/api/hospitals/${hospitalId}/worklog/entries${queryString ? `?${queryString}` : ''}`;
  };

  const { data: allEntries = [], isLoading } = useQuery<WorklogEntry[]>({
    queryKey: [buildWorklogEntriesUrl()],
    enabled: !!hospitalId,
  });

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
          <div>
            <span className="text-gray-500">{t('worklogs.activity')}:</span>
            <div className="font-medium">
              {entry.activityType ? t(`externalWorklog.activityTypes.${entry.activityType}`) : "-"}
            </div>
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
          <>
            <div className="mt-3 text-sm text-gray-500">
              {t('worklogs.countersignedBy', { 
                name: entry.countersignerName, 
                date: entry.countersignedAt ? format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale: dateLocale }) : "" 
              })}
            </div>
            <div className="mt-3 pt-3 border-t">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => generateWorklogPDF(entry, hospitalName || '', t, dateLocale)}
                data-testid={`button-pdf-${entry.id}`}
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6" />
          {t('worklogs.title')} ({t('worklogs.allEntries')})
        </h1>
        <p className="text-gray-500 mt-1">
          {t('worklogs.descriptionReadOnly')}
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>{t('common.search')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>{t('worklogs.filterStatus')}</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue placeholder={t('worklogs.filterAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('worklogs.filterAll')}</SelectItem>
                  <SelectItem value="pending">{t('worklogs.statusPending')}</SelectItem>
                  <SelectItem value="countersigned">{t('worklogs.statusCountersigned')}</SelectItem>
                  <SelectItem value="rejected">{t('worklogs.statusRejected')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('worklogs.filterEmail')}</Label>
              <Input 
                placeholder={t('common.search') + "..."}
                value={filterEmail}
                onChange={(e) => setFilterEmail(e.target.value)}
                data-testid="input-filter-email"
              />
            </div>
            <div>
              <Label>{t('worklogs.filterFrom')}</Label>
              <Input 
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-datefrom"
              />
            </div>
            <div>
              <Label>{t('worklogs.filterTo')}</Label>
              <Input 
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-dateto"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : allEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>{t('worklogs.noEntries')}</p>
            <p className="text-sm mt-1">{t('worklogs.noEntriesHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div>
          <div className="text-sm text-muted-foreground mb-4">
            {t('worklogs.entriesFound', { count: allEntries.length })}
          </div>
          {allEntries.map(entry => renderEntryCard(entry))}
        </div>
      )}
    </div>
  );
}
