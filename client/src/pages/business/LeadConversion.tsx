import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Upload, Users, Calendar, Scissors, CheckCircle2, XCircle, ArrowRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LeadDetail = {
  leadName: string;
  matchMethod: string;
  hasAppointment: boolean;
  hasSurgeryPlanned: boolean;
};

type ConversionResult = {
  totalLeads: number;
  matchedPatients: number;
  withAppointment: number;
  withSurgeryPlanned: number;
  matchedDetails: LeadDetail[];
};

function parseLeads(text: string): Array<{ firstName?: string; lastName?: string; email?: string; phone?: string }> {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const leads: Array<{ firstName?: string; lastName?: string; email?: string; phone?: string }> = [];

  for (const line of lines) {
    const parts = line.split(/[,;\t]+/).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) continue;

    const lead: { firstName?: string; lastName?: string; email?: string; phone?: string } = {};

    for (const part of parts) {
      if (part.includes('@') && part.includes('.')) {
        lead.email = part;
      } else if (/^[\+0][\d\s\-\(\)\.]{6,}$/.test(part)) {
        lead.phone = part;
      } else if (!lead.firstName) {
        lead.firstName = part;
      } else if (!lead.lastName) {
        lead.lastName = part;
      }
    }

    if (lead.firstName && !lead.lastName && lead.firstName.includes(' ')) {
      const nameParts = lead.firstName.split(/\s+/);
      lead.firstName = nameParts[0];
      lead.lastName = nameParts.slice(1).join(' ');
    }

    if (lead.firstName || lead.email || lead.phone) {
      leads.push(lead);
    }
  }

  return leads;
}

function FunnelBar({ label, helpText, count, total, icon, color }: { label: string; helpText?: string; count: number; total: number; icon: React.ReactNode; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const widthPct = total > 0 ? Math.max(8, (count / total) * 100) : 8;

  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate">{label}</span>
          <span className="text-sm font-bold tabular-nums ml-2">{count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
        </div>
        <div className="h-6 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
            style={{ width: `${widthPct}%` }}
          />
        </div>
        {helpText && (
          <p className="text-xs text-muted-foreground mt-1">{helpText}</p>
        )}
      </div>
    </div>
  );
}

export function LeadConversionTab({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rawText, setRawText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);

  const handleAnalyze = async () => {
    if (!hospitalId || !rawText.trim()) return;

    const leads = parseLeads(rawText);
    if (leads.length === 0) {
      toast({ title: "No valid leads found", description: "Paste leads as: name, surname, email, phone (one per line)", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await apiRequest("POST", `/api/business/${hospitalId}/lead-conversion`, { leads });
      const data = await res.json();
      setResult(data);
    } catch (error: any) {
      toast({ title: "Analysis failed", description: error.message || "Could not analyze leads", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const matchedDetails = result?.matchedDetails || [];

  return (
    <div className="space-y-6">

      {/* Input area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            {t("business.leads.pasteLeads", "Paste Leads")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t("business.leads.leadConversionPrivacy", "This analysis runs a one-time comparison. No lead data is stored. The action is logged for audit purposes.")}
            </p>
          </div>
          <Textarea
            placeholder={"John, Doe, john@example.com, +41 79 123 45 67\nJane, Smith, jane@email.ch\nMax Muster, max@test.com\n..."}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("business.leads.leadFormatHint", "One lead per line. Format: name, surname, email, phone (any order, comma/semicolon/tab separated — paste directly from Excel)")}
            </p>
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !rawText.trim()}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("common.analyzing", "Analyzing...")}
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  {t("business.leads.analyzeLeads", "Analyze Leads")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Funnel visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("business.leads.conversionFunnel", "Conversion Funnel")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FunnelBar
                label={t("business.leads.totalLeads", "Total Leads")}
                helpText={t("business.leads.totalLeadsHelp", "Number of pasted rows recognized as valid leads")}
                count={result.totalLeads}
                total={result.totalLeads}
                icon={<Upload className="h-5 w-5 text-slate-500" />}
                color="bg-slate-400"
              />
              <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" /></div>
              <FunnelBar
                label={t("business.leads.matchedAsPatient", "Matched as Patient")}
                helpText={t("business.leads.matchedAsPatientHelp", "Leads matched to an existing patient record by name, email, or phone number")}
                count={result.matchedPatients}
                total={result.totalLeads}
                icon={<Users className="h-5 w-5 text-blue-500" />}
                color="bg-blue-500"
              />
              <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" /></div>
              <FunnelBar
                label={t("business.leads.hadAppointment", "Had Appointment")}
                helpText={t("business.leads.hadAppointmentHelp", "Matched patients who had at least one non-cancelled appointment at the clinic")}
                count={result.withAppointment}
                total={result.totalLeads}
                icon={<Calendar className="h-5 w-5 text-indigo-500" />}
                color="bg-indigo-500"
              />
              <div className="flex justify-center"><ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" /></div>
              <FunnelBar
                label={t("business.leads.surgeryPlanned", "Surgery Planned")}
                helpText={t("business.leads.surgeryPlannedHelp", "Matched patients who have at least one planned surgery")}
                count={result.withSurgeryPlanned}
                total={result.totalLeads}
                icon={<Scissors className="h-5 w-5 text-orange-500" />}
                color="bg-orange-500"
              />
            </CardContent>
          </Card>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">{t("business.leads.leadsToPatient", "Leads → Patient")}</p>
              <p className="text-xl font-bold">{result.totalLeads > 0 ? Math.round((result.matchedPatients / result.totalLeads) * 100) : 0}%</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">{t("business.leads.patientToAppointment", "Patient → Appointment")}</p>
              <p className="text-xl font-bold">{result.matchedPatients > 0 ? Math.round((result.withAppointment / result.matchedPatients) * 100) : 0}%</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">{t("business.leads.leadToSurgery", "Lead → Surgery (overall)")}</p>
              <p className="text-xl font-bold">{result.totalLeads > 0 ? Math.round((result.withSurgeryPlanned / result.totalLeads) * 100) : 0}%</p>
            </Card>
          </div>

          {/* Detail table */}
          {matchedDetails.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{t("business.leads.matchedLeadsDetail", "Matched Leads Detail")} ({matchedDetails.length})</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {result.totalLeads - matchedDetails.length} {t("business.leads.unmatched", "unmatched")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.name", "Name")}</TableHead>
                        <TableHead className="text-center">{t("business.leads.matchedVia", "Match")}</TableHead>
                        <TableHead className="text-center"><Calendar className="h-4 w-4 mx-auto" /></TableHead>
                        <TableHead className="text-center"><Scissors className="h-4 w-4 mx-auto" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matchedDetails.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{d.leadName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">{d.matchMethod}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {d.hasAppointment ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {d.hasSurgeryPlanned ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
