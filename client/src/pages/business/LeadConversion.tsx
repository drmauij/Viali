import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Upload, Users, Calendar, Scissors, CheckCircle2, XCircle, ArrowRight, AlertTriangle, Download, LinkIcon, UserCheck, UserX, Search, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LeadDetail = {
  leadName: string;
  leadStatus: string | null;
  leadDate: string | null;
  operation: string | null;
  adSource: string | null;
  matchMethod: string;
  hasAppointment: boolean;
  hasSurgeryPlanned: boolean;
};

type StatusBreakdown = {
  status: string;
  total: number;
  matched: number;
  withAppointment: number;
  withSurgery: number;
};

type ConversionResult = {
  totalLeads: number;
  matchedPatients: number;
  withAppointment: number;
  withSurgeryPlanned: number;
  backfillEligibleCount: number;
  matchedDetails: LeadDetail[];
  statusBreakdown?: StatusBreakdown[];
  operationBreakdown?: StatusBreakdown[];
  sourceBreakdown?: StatusBreakdown[];
};

type FuzzyCandidate = {
  patientId: string;
  firstName: string;
  surname: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  nextAppointmentDate: string | null;
  confidence: number;
  reasons: string[];
  missingFields: string[];
};

type FuzzyMatchResult = {
  leadIndex: number;
  lead: ParsedLead;
  candidates: FuzzyCandidate[];
};

type ApprovedMatch = {
  leadIndex: number;
  patientId: string;
  lead: ParsedLead;
  fillMissingData: boolean;
};

// Known status values from Excel lead trackers — these are NOT names
const KNOWN_STATUS_PATTERNS = [
  /^contacted\s*\d*$/i,
  /^absage$/i,
  /^sprechstunde$/i,
  /^wünscht\s+rückruf$/i,
  /^pat\.\s*(ruft\s+zurück|wird\s+überlegen)/i,
  /^op$/i,
  /^no\s*show$/i,
  /^cancelled$/i,
  /^booked$/i,
  /^pending$/i,
];

function isKnownStatus(value: string): boolean {
  return KNOWN_STATUS_PATTERNS.some(p => p.test(value.trim()));
}

// Date in DD.MM.YYYY, DD.MM.YYYY HH:MM, or YYYY-MM-DD H:MM:SS format
function isDate(value: string): boolean {
  const v = value.trim();
  return /^\d{1,2}\.\d{1,2}\.\d{4}(\s+\d{1,2}:\d{2})?$/.test(v) ||
         /^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(v);
}

// Known operation/procedure names from Meta Forms
function isOperation(value: string): boolean {
  const v = value.trim().toLowerCase();
  // Underscore-separated German procedure names, or known procedure keywords
  if (v.includes('_') && (v.includes('brust') || v.includes('augenlid') || v.includes('schamlipp') || v.includes('penis') || v.includes('po-') || v.includes('black_week') || v.includes('mommy'))) return true;
  // Known single-word/short operations
  return /^(mommy\s*makeover|augenlidstraffung|schamlippenverkleinerung|penisvergrösserung|po-vergrösserung|faltenbehandlung|filler|gesicht|hals\/dekolleté|anderes)$/i.test(v);
}

// fb/ig/gg source indicator
function isAdSource(value: string): boolean {
  return /^(fb|ig|gg)$/i.test(value.trim());
}

type ParsedLead = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
  leadDate?: string;
  operation?: string;
  adSource?: string;
  metaLeadId?: string;
  metaFormId?: string;
};

function parseLeads(text: string): ParsedLead[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const leads: ParsedLead[] = [];

  for (const line of lines) {
    const parts = line.split(/[,;\t]+/).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) continue;

    const lead: ParsedLead = {};

    for (const part of parts) {
      if (isDate(part)) {
        lead.leadDate = part.trim();
      } else if (isAdSource(part)) {
        lead.adSource = part.trim().toLowerCase();
      } else if (isOperation(part)) {
        lead.operation = part.trim();
      } else if (isKnownStatus(part)) {
        lead.status = part.trim();
      } else if (part.includes('@') && part.includes('.')) {
        lead.email = part;
      } else if (/^[\+0][\d\s\-\(\)\.]{6,}$/.test(part) || /^4[19]\d{8,11}$/.test(part)) {
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

    // Detect Meta Lead ID and Form ID: long numeric strings (15+ digits)
    // First match = Lead ID, second = Form ID (position-independent)
    const metaIds = parts.filter(p => /^\d{15,}$/.test(p.trim()));
    if (metaIds[0]) lead.metaLeadId = metaIds[0].trim();
    if (metaIds[1]) lead.metaFormId = metaIds[1].trim();

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
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillDone, setBackfillDone] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [fuzzyMatches, setFuzzyMatches] = useState<FuzzyMatchResult[]>([]);
  const [isFuzzyLoading, setIsFuzzyLoading] = useState(false);
  const [matchDecisions, setMatchDecisions] = useState<Map<number, string>>(new Map());

  const handleAnalyze = async () => {
    if (!hospitalId || !rawText.trim()) return;

    const leads = parseLeads(rawText);
    if (leads.length === 0) {
      toast({ title: "No valid leads found", description: "Paste leads as: name, surname, email, phone (one per line)", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setBackfillDone(false);
    setFuzzyMatches([]);
    setMatchDecisions(new Map());
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

  const handleFuzzyMatch = async () => {
    if (!hospitalId || !rawText.trim()) return;

    const leads = parseLeads(rawText);
    if (leads.length === 0) return;

    setIsFuzzyLoading(true);
    try {
      const res = await apiRequest("POST", `/api/business/${hospitalId}/lead-conversion/fuzzy-match`, { leads });
      const data = await res.json();
      setFuzzyMatches(data.matches || []);
      setMatchDecisions(new Map());
    } catch (error: any) {
      toast({ title: "Fuzzy match failed", description: error.message || "Could not find matches", variant: "destructive" });
    } finally {
      setIsFuzzyLoading(false);
    }
  };

  const handleBackfillReferrals = async () => {
    if (!hospitalId) return;

    const approvedMatches: ApprovedMatch[] = [];
    for (const [leadIndex, decision] of matchDecisions.entries()) {
      if (decision === "declined") continue;
      const match = fuzzyMatches.find(m => m.leadIndex === leadIndex);
      if (!match) continue;
      const candidate = match.candidates.find(c => c.patientId === decision);
      if (!candidate) continue;
      approvedMatches.push({
        leadIndex,
        patientId: decision,
        lead: match.lead,
        fillMissingData: candidate.missingFields.length > 0,
      });
    }

    if (approvedMatches.length === 0) return;

    setIsBackfilling(true);
    try {
      const res = await apiRequest("POST", `/api/business/${hospitalId}/lead-conversion/backfill-referrals`, { approvedMatches });
      const data = await res.json();
      setBackfillDone(true);
      const parts: string[] = [];
      if (data.created > 0) parts.push(`${data.created} referral events created`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.patientUpdates > 0) parts.push(`${data.patientUpdates} patient records enriched`);
      toast({
        title: t("business.leads.referralsBackfilled", "Referrals Backfilled"),
        description: parts.join(", ") + ". Check the Referrals tab to see the updated data.",
      });
      if (result) {
        setResult({ ...result, backfillEligibleCount: 0 });
      }
    } catch (error: any) {
      toast({ title: "Backfill failed", description: error.message || "Could not backfill referrals", variant: "destructive" });
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleMatchDecision = (leadIndex: number, value: string) => {
    setMatchDecisions(prev => {
      const next = new Map(prev);
      if (value === "") {
        next.delete(leadIndex);
      } else {
        next.set(leadIndex, value);
      }
      return next;
    });
  };

  const handleApproveAllHighConfidence = () => {
    setMatchDecisions(prev => {
      const next = new Map(prev);
      for (const match of fuzzyMatches) {
        if (match.candidates.length > 0 && match.candidates[0].confidence >= 0.90) {
          next.set(match.leadIndex, match.candidates[0].patientId);
        }
      }
      return next;
    });
  };

  const approvedCount = useMemo(() => {
    let count = 0;
    for (const decision of matchDecisions.values()) {
      if (decision !== "declined") count++;
    }
    return count;
  }, [matchDecisions]);

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
            placeholder={"F\tOperation\tE-mail\tPhone\tVorname\tNachname\tSource\tStatus\t...\tLead ID\tForm ID\n01.03.2026\tBrust_OP\tjane@email.ch\t+41 79 123 45 67\tJane\tSmith\tfb\tContacted\t...\t1234567890123456\t9876543210123456"}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("business.leads.leadFormatHint", "One lead per line — paste directly from Excel (tab-separated). Lead ID and Form ID are detected automatically from long numeric values.")}
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t("business.leads.conversionFunnel", "Conversion Funnel")}</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const exportData = {
                      exportDate: new Date().toISOString().slice(0, 10),
                      summary: {
                        totalLeads: result.totalLeads,
                        matchedAsPatient: result.matchedPatients,
                        matchRate: result.totalLeads > 0 ? Math.round((result.matchedPatients / result.totalLeads) * 1000) / 10 : 0,
                        hadAppointment: result.withAppointment,
                        appointmentRate: result.matchedPatients > 0 ? Math.round((result.withAppointment / result.matchedPatients) * 1000) / 10 : 0,
                        surgeryPlanned: result.withSurgeryPlanned,
                        surgeryRate: result.totalLeads > 0 ? Math.round((result.withSurgeryPlanned / result.totalLeads) * 1000) / 10 : 0,
                      },
                      statusBreakdown: result.statusBreakdown || [],
                      operationBreakdown: result.operationBreakdown || [],
                      sourceBreakdown: result.sourceBreakdown || [],
                      matchedDetails: result.matchedDetails.map(d => ({
                        name: d.leadName,
                        date: d.leadDate || null,
                        operation: d.operation || null,
                        adSource: d.adSource || null,
                        status: d.leadStatus || null,
                        matchMethod: d.matchMethod,
                        hasAppointment: d.hasAppointment,
                        hasSurgeryPlanned: d.hasSurgeryPlanned,
                      })),
                    };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `lead-analysis-${exportData.exportDate}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  {t("business.leads.downloadAnalysis", "Download Analysis")}
                </Button>
              </div>
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

          {/* Find Matches */}
          {result.backfillEligibleCount > 0 && !backfillDone && fuzzyMatches.length === 0 && (
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="py-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Search className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {t("business.leads.fuzzyMatchTitle", "{{count}} leads eligible for referral backfill", { count: result.backfillEligibleCount })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("business.leads.fuzzyMatchDesc", "Find matching patients using fuzzy name matching, phone, and email. You'll review each match before backfilling.")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleFuzzyMatch}
                  disabled={isFuzzyLoading}
                  className="shrink-0"
                >
                  {isFuzzyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-1" />
                      {t("business.leads.findMatches", "Find Matches")}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Review Matches */}
          {fuzzyMatches.length > 0 && !backfillDone && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">
                    {t("business.leads.reviewMatches", "Review Matches")} ({fuzzyMatches.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleApproveAllHighConfidence}
                    >
                      <Zap className="h-4 w-4 mr-1" />
                      {t("business.leads.autoApprove", "Auto-approve >=90%")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleBackfillReferrals}
                      disabled={approvedCount === 0 || isBackfilling}
                    >
                      {isBackfilling ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <UserCheck className="h-4 w-4 mr-1" />
                      )}
                      {t("business.leads.backfillApproved", "Backfill Approved ({{count}})", { count: approvedCount })}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-3">
                    {fuzzyMatches.map((match) => {
                      const decision = matchDecisions.get(match.leadIndex);
                      const isDeclined = decision === "declined";
                      const isApproved = decision && decision !== "declined";
                      const leadName = [match.lead.firstName, match.lead.lastName].filter(Boolean).join(" ") || "Unknown";

                      return (
                        <div
                          key={match.leadIndex}
                          className={`border rounded-lg p-3 transition-colors ${
                            isDeclined ? "opacity-50 bg-muted/30" :
                            isApproved ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20" :
                            ""
                          }`}
                        >
                          {/* Match header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground font-mono">#{match.leadIndex + 1}</span>
                              <span className="text-sm font-medium">{leadName}</span>
                              {match.lead.adSource && (
                                <Badge variant="outline" className="text-xs">
                                  {match.lead.adSource === "fb" ? "Facebook" : match.lead.adSource === "ig" ? "Instagram" : match.lead.adSource === "gg" ? "Google Ads" : match.lead.adSource}
                                </Badge>
                              )}
                              {match.lead.leadDate && (
                                <span className="text-xs text-muted-foreground">{match.lead.leadDate}</span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMatchDecision(match.leadIndex, isDeclined ? "" : "declined")}
                              className="text-xs shrink-0"
                            >
                              {isDeclined ? (
                                <>Undo</>
                              ) : (
                                <>
                                  <UserX className="h-3 w-3 mr-1" />
                                  Decline all
                                </>
                              )}
                            </Button>
                          </div>

                          {/* Candidates */}
                          {!isDeclined && (
                            <RadioGroup
                              value={decision || ""}
                              onValueChange={(val) => handleMatchDecision(match.leadIndex, val)}
                              className="space-y-2"
                            >
                              {match.candidates.map((candidate) => {
                                const confPct = Math.round(candidate.confidence * 100);
                                const confColor = confPct >= 90
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : confPct >= 70
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";

                                return (
                                  <Label
                                    key={candidate.patientId}
                                    className="flex items-start gap-3 p-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
                                  >
                                    <RadioGroupItem value={candidate.patientId} className="mt-1 shrink-0" />
                                    <div className="flex-1 min-w-0 space-y-2">
                                      {/* Confidence + reasons */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${confColor}`}>
                                          {confPct}%
                                        </span>
                                        {candidate.reasons.map((reason, ri) => (
                                          <span key={ri} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                            {reason}
                                          </span>
                                        ))}
                                      </div>

                                      {/* Side-by-side comparison */}
                                      <div className="grid grid-cols-2 gap-4 text-xs">
                                        <div>
                                          <p className="font-medium text-muted-foreground mb-1">From Excel</p>
                                          <p>{leadName}</p>
                                          <p className="text-muted-foreground">{match.lead.phone || "\u2014"}</p>
                                          <p className="text-muted-foreground">{match.lead.email || "\u2014"}</p>
                                          <p className="text-muted-foreground">{match.lead.leadDate || "\u2014"}</p>
                                          {match.lead.metaLeadId && (
                                            <p className="text-muted-foreground truncate">Meta: {match.lead.metaLeadId}</p>
                                          )}
                                        </div>
                                        <div>
                                          <p className="font-medium text-muted-foreground mb-1">Patient in App</p>
                                          <p>{candidate.firstName} {candidate.surname}</p>
                                          <p className="text-muted-foreground">{candidate.phone || "\u2014"}</p>
                                          <p className="text-muted-foreground">{candidate.email || "\u2014"}</p>
                                          <p className="text-muted-foreground">{candidate.dateOfBirth || "\u2014"}</p>
                                          {candidate.nextAppointmentDate && (
                                            <p className="text-muted-foreground">Appt: {candidate.nextAppointmentDate}</p>
                                          )}
                                        </div>
                                      </div>

                                      {/* Missing fields note */}
                                      {candidate.missingFields.length > 0 && (
                                        <p className="text-[11px] text-blue-600 dark:text-blue-400">
                                          Will add from Excel: {candidate.missingFields.join(", ")}
                                        </p>
                                      )}
                                    </div>
                                  </Label>
                                );
                              })}
                            </RadioGroup>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {backfillDone && (
            <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="py-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  {t("business.leads.backfillComplete", "Referral sources backfilled successfully. Check the Referrals tab to see the updated data.")}
                </p>
              </CardContent>
            </Card>
          )}

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

          {/* Status breakdown */}
          {result.statusBreakdown && result.statusBreakdown.length > 0 && result.statusBreakdown.some(s => s.status !== '(no status)') && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("business.leads.statusBreakdown", "Lead Status Breakdown")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("business.leads.status", "Status")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.totalLeads", "Total Leads")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.matchedAsPatient", "Matched")}</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">{t("business.leads.hadAppointment", "Appointment")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.surgeryPlanned", "Surgery")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.statusBreakdown.filter(s => s.status !== '(no status)').map((s) => (
                        <TableRow key={s.status}>
                          <TableCell className="font-medium">{s.status}</TableCell>
                          <TableCell className="text-right">{s.total}</TableCell>
                          <TableCell className="text-right">{s.matched}</TableCell>
                          <TableCell className="text-right">{s.total > 0 ? Math.round((s.matched / s.total) * 100) : 0}%</TableCell>
                          <TableCell className="text-right">{s.withAppointment}</TableCell>
                          <TableCell className="text-right">{s.withSurgery}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Operation breakdown */}
          {result.operationBreakdown && result.operationBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("business.leads.operationBreakdown", "Operation Breakdown")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("business.leads.operation", "Operation")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.totalLeads", "Total Leads")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.matchedAsPatient", "Matched")}</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">{t("business.leads.hadAppointment", "Appointment")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.surgeryPlanned", "Surgery")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.operationBreakdown.map((s) => (
                        <TableRow key={s.status}>
                          <TableCell className="font-medium">{s.status}</TableCell>
                          <TableCell className="text-right">{s.total}</TableCell>
                          <TableCell className="text-right">{s.matched}</TableCell>
                          <TableCell className="text-right">{s.total > 0 ? Math.round((s.matched / s.total) * 100) : 0}%</TableCell>
                          <TableCell className="text-right">{s.withAppointment}</TableCell>
                          <TableCell className="text-right">{s.withSurgery}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ad Source breakdown (fb/ig) */}
          {result.sourceBreakdown && result.sourceBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("business.leads.sourceBreakdown", "Ad Source Breakdown")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("business.leads.source", "Source")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.totalLeads", "Total Leads")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.matchedAsPatient", "Matched")}</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">{t("business.leads.hadAppointment", "Appointment")}</TableHead>
                        <TableHead className="text-right">{t("business.leads.surgeryPlanned", "Surgery")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.sourceBreakdown.map((s) => (
                        <TableRow key={s.status}>
                          <TableCell className="font-medium">{s.status === 'fb' ? 'Facebook' : s.status === 'ig' ? 'Instagram' : s.status === 'gg' ? 'Google Ads' : s.status}</TableCell>
                          <TableCell className="text-right">{s.total}</TableCell>
                          <TableCell className="text-right">{s.matched}</TableCell>
                          <TableCell className="text-right">{s.total > 0 ? Math.round((s.matched / s.total) * 100) : 0}%</TableCell>
                          <TableCell className="text-right">{s.withAppointment}</TableCell>
                          <TableCell className="text-right">{s.withSurgery}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

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
                        <TableHead>{t("business.leads.operation", "Operation")}</TableHead>
                        <TableHead>{t("business.leads.source", "Source")}</TableHead>
                        <TableHead>{t("business.leads.status", "Status")}</TableHead>
                        <TableHead className="text-center">{t("business.leads.matchedVia", "Match")}</TableHead>
                        <TableHead className="text-center"><Calendar className="h-4 w-4 mx-auto" /></TableHead>
                        <TableHead className="text-center"><Scissors className="h-4 w-4 mx-auto" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matchedDetails.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{d.leadName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.operation || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.adSource === 'fb' ? 'Facebook' : d.adSource === 'ig' ? 'Instagram' : d.adSource === 'gg' ? 'Google Ads' : d.adSource || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.leadStatus || "\u2014"}</TableCell>
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
