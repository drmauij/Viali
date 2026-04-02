import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import type { Lead, LeadContact } from "@shared/schema";
import { setDraggedLead } from "./useLeadDrag";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Phone,
  Mail,
  Clock,
  MessageSquare,
  X,
  GripVertical,
  Instagram,
  User,
  CheckCircle2,
  Globe,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

interface LeadWithSummary extends Lead {
  contactCount: number;
  lastContactOutcome: string | null;
  lastContactAt: string | null;
}

interface LeadDetail extends Lead {
  contacts: LeadContact[];
}

interface FuzzyMatchCandidate {
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  confidence: number;
  phoneMatch: boolean;
  emailMatch: boolean;
}

// ── Facebook SVG Icon ────────────────────────────────────────────────────

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      width="16"
      height="16"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

// ── Outcome labels ───────────────────────────────────────────────────────

const OUTCOME_LABELS: Record<string, string> = {
  reached: "Erreicht",
  no_answer: "Nicht erreicht",
  wants_callback: "Wünscht Rückruf",
  will_call_back: "Ruft zurück",
  needs_time: "Braucht Zeit",
};

// ── Status dot colors ────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "bg-blue-500",
    in_progress: "bg-amber-500",
    converted: "bg-green-500",
    closed: "bg-gray-400",
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] ?? "bg-gray-400"}`}
    />
  );
}

// ── Source icon ───────────────────────────────────────────────────────────

function SourceIcon({ source }: { source: string }) {
  if (source === "ig") {
    return <Instagram className="h-4 w-4 text-pink-500" />;
  }
  if (source === "fb") {
    return <FacebookIcon className="h-4 w-4 text-blue-600" />;
  }
  return <Globe className="h-4 w-4 text-green-600" />;
}

function sourceLabel(source: string): string {
  switch (source) {
    case "fb": return "Facebook";
    case "ig": return "Instagram";
    case "website": return "Website";
    case "email": return "E-Mail";
    default: return source;
  }
}

// ── Contact summary text ─────────────────────────────────────────────────

function contactSummary(lead: LeadWithSummary): string | null {
  if (lead.contactCount === 0) return null;
  const prefix = `${lead.contactCount}x kontaktiert`;
  if (lead.lastContactOutcome) {
    const label = OUTCOME_LABELS[lead.lastContactOutcome];
    if (label) return `${prefix} — ${label.toLowerCase()}`;
  }
  return prefix;
}

// ═══════════════════════════════════════════════════════════════════════════
// LeadsBadge (renamed from MetaLeadsBadge)
// ═══════════════════════════════════════════════════════════════════════════

export function LeadsBadge() {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;

  const { data } = useQuery<{ count: number }>({
    queryKey: [`/api/business/${hospitalId}/leads-count`],
    enabled: !!hospitalId,
    refetchInterval: 30_000,
  });

  if (!data || data.count === 0) return null;

  return (
    <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0.5">
      {data.count}
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ContactLogDialog (internal)
// ═══════════════════════════════════════════════════════════════════════════

function ContactLogDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: LeadWithSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [outcome, setOutcome] = useState<string>("");
  const [note, setNote] = useState("");

  const detailUrl = `/api/business/${hospitalId}/leads/${lead.id}`;

  const { data: detail } = useQuery<LeadDetail>({
    queryKey: [detailUrl],
    enabled: open && !!hospitalId,
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "POST",
        `/api/business/${hospitalId}/leads/${lead.id}/contacts`,
        { outcome, note: note || null },
      );
    },
    onSuccess: () => {
      toast({ title: "Kontakt protokolliert" });
      setOutcome("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: [detailUrl] });
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${hospitalId}/leads`],
        exact: false,
      });
    },
    onError: () => {
      toast({ title: "Fehler beim Protokollieren", variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "PATCH",
        `/api/business/${hospitalId}/leads/${lead.id}`,
        { status: "closed" },
      );
    },
    onSuccess: () => {
      toast({ title: "Lead geschlossen" });
      onOpenChange(false);
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${hospitalId}/leads`],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${hospitalId}/leads-count`],
      });
    },
    onError: () => {
      toast({ title: "Fehler beim Schliessen", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kontakt — {lead.firstName} {lead.lastName}</DialogTitle>
          <DialogDescription>
            Kontakt protokollieren und Verlauf einsehen
          </DialogDescription>
        </DialogHeader>

        {/* Lead info */}
        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <SourceIcon source={lead.source} />
            <span>{lead.operation}</span>
          </div>
          {lead.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" />
              <span>{lead.email}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground/70">
            Lead ID: {lead.metaLeadId}
          </div>
          {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
            <div className="space-y-1 text-xs text-muted-foreground border-t pt-2 mt-2">
              {lead.utmSource && <p>Quelle: {lead.utmSource}</p>}
              {lead.utmMedium && <p>Medium: {lead.utmMedium}</p>}
              {lead.utmCampaign && <p>Kampagne: {lead.utmCampaign}</p>}
              {lead.utmTerm && <p>Suchbegriff: {lead.utmTerm}</p>}
              {lead.gclid && <p>Google Click ID: {lead.gclid.slice(0, 12)}...</p>}
            </div>
          )}
        </div>

        {/* Log contact form */}
        <div className="space-y-3 pt-2">
          <div>
            <Label>Ergebnis</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger>
                <SelectValue placeholder="Ergebnis wählen..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notiz</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optionale Notiz..."
              rows={2}
            />
          </div>
          <Button
            onClick={() => logMutation.mutate()}
            disabled={!outcome || logMutation.isPending}
            className="w-full"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Kontakt protokollieren
          </Button>
        </div>

        {/* Contact history */}
        {detail?.contacts && detail.contacts.length > 0 && (
          <div className="space-y-2 pt-2">
            <Label className="text-xs text-muted-foreground">Verlauf</Label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {detail.contacts.map((c) => (
                <div
                  key={c.id}
                  className="text-sm border rounded-md p-2 space-y-0.5"
                >
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {OUTCOME_LABELS[c.outcome] ?? c.outcome}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.createdAt), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </span>
                  </div>
                  {c.note && (
                    <p className="text-xs text-muted-foreground">{c.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending || lead.status === "closed" || lead.status === "converted"}
          >
            <X className="h-4 w-4 mr-1" />
            Lead schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LeadsPanel (renamed from MetaLeadsPanel)
// ═══════════════════════════════════════════════════════════════════════════

export function LeadsPanel({
  mode = "inline",
  selectedLeadId = null,
  initialLeadId = null,
  onLeadTap,
}: {
  mode?: "inline" | "sheet";
  selectedLeadId?: string | null;
  initialLeadId?: string | null;
  onLeadTap?: (lead: Lead | null) => void;
}) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;

  const [filter, setFilter] = useState<string>(initialLeadId ? "all" : "active");
  const [contactLead, setContactLead] = useState<LeadWithSummary | null>(null);
  const [initialLeadHandled, setInitialLeadHandled] = useState(false);

  const { data: allLeads, isLoading } = useQuery<LeadWithSummary[]>({
    queryKey: [`/api/business/${hospitalId}/leads?limit=50`],
    enabled: !!hospitalId,
    refetchInterval: 30_000,
  });

  // Auto-select lead from deep link
  useEffect(() => {
    if (initialLeadId && allLeads && !initialLeadHandled) {
      const lead = allLeads.find((l) => l.id === initialLeadId);
      if (lead) {
        onLeadTap?.(lead);
        // Scroll into view after render
        setTimeout(() => {
          document.getElementById(`lead-${lead.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
      setInitialLeadHandled(true);
    }
  }, [initialLeadId, allLeads, initialLeadHandled, onLeadTap]);

  // Client-side filtering
  const leads = (allLeads ?? []).filter((lead) => {
    if (filter === "active") return lead.status === "new" || lead.status === "in_progress";
    if (filter === "new") return lead.status === "new";
    return true; // "all"
  });

  const isDraggable = (lead: LeadWithSummary) =>
    mode === "inline" && lead.status !== "converted" && lead.status !== "closed";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <h3 className="font-semibold text-sm">Leads</h3>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v)}
          className="justify-start"
          size="sm"
        >
          <ToggleGroupItem value="active" className="text-xs px-2.5">
            Aktiv
          </ToggleGroupItem>
          <ToggleGroupItem value="new" className="text-xs px-2.5">
            Neu
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="text-xs px-2.5">
            Alle
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Selected lead hint */}
      {selectedLeadId && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/40 border-b text-xs text-blue-700 dark:text-blue-300">
          Tippe auf einen Kalender-Slot, um diesen Lead zu planen
        </div>
      )}

      {/* Lead cards */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Laden...
            </p>
          )}
          {!isLoading && leads.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine Leads
            </p>
          )}
          {leads.map((lead) => {
            const isSelected = lead.id === selectedLeadId;
            const isNew = lead.status === "new";
            const draggable = isDraggable(lead);
            const summary = contactSummary(lead);

            return (
              <Card
                id={`lead-${lead.id}`}
                key={lead.id}
                draggable={draggable}
                onDragStart={(e) => {
                  if (!draggable) return;
                  setDraggedLead(lead);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDraggedLead(null)}
                onClick={() => onLeadTap?.(isSelected ? null : lead)}
                className={`p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? "ring-2 ring-blue-500 bg-blue-50/80 dark:bg-blue-950/50"
                    : isNew
                      ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30"
                      : ""
                } ${draggable ? "hover:shadow-md" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {/* Drag handle */}
                  {draggable && (
                    <GripVertical className="h-4 w-4 mt-0.5 text-muted-foreground/40 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Name + status */}
                    <div className="flex items-center gap-2">
                      <StatusDot status={lead.status} />
                      <span className="font-medium text-sm truncate">
                        {lead.firstName} {lead.lastName}
                      </span>
                    </div>

                    {/* Operation/message */}
                    {(lead.operation || lead.message) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.operation || (lead.message && lead.message.length > 60 ? lead.message.slice(0, 60) + "..." : lead.message)}
                      </p>
                    )}

                    {/* Source + time */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <SourceIcon source={lead.source} />
                      <span className="text-[10px] text-muted-foreground">{sourceLabel(lead.source)}</span>
                      <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(lead.createdAt), {
                          addSuffix: false,
                          locale: de,
                        })}
                      </span>
                    </div>

                    {/* Contact summary */}
                    {summary && (
                      <p className="text-xs text-muted-foreground/80 truncate">
                        {summary}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-1 mt-2 pt-1.5 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setContactLead(lead);
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Kontakt
                  </Button>
                  {lead.phone && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`tel:${lead.phone}`);
                      }}
                    >
                      <Phone className="h-3.5 w-3.5 mr-1" />
                      Anrufen
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Contact log dialog */}
      {contactLead && (
        <ContactLogDialog
          lead={contactLead}
          open={!!contactLead}
          onOpenChange={(open) => {
            if (!open) setContactLead(null);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ScheduleLeadDialog (renamed from ScheduleMetaLeadDialog)
// ═══════════════════════════════════════════════════════════════════════════

export function ScheduleLeadDialog({
  lead,
  open,
  onOpenChange,
  dropData,
  unitId,
  providerId,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dropData: { date: string; time: string; roomId?: string } | null;
  unitId?: string;
  providerId?: string;
}) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [duration, setDuration] = useState("30");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);

  // Fuzzy match
  const [candidates, setCandidates] = useState<FuzzyMatchCandidate[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchDone, setMatchDone] = useState(false);

  // Reset state when dialog opens with a new lead
  useEffect(() => {
    if (open && lead) {
      setDuration("30");
      setSelectedPatientId(null);
      setCreateNew(false);
      setCandidates([]);
      setMatchDone(false);

      // Run fuzzy match
      setMatchLoading(true);
      apiRequest("POST", `/api/business/${hospitalId}/leads/fuzzy-match`, {
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        email: lead.email,
      })
        .then((res) => res.json())
        .then((data: { candidates: FuzzyMatchCandidate[] }) => {
          setCandidates(data.candidates ?? []);
          if (!data.candidates || data.candidates.length === 0) {
            setCreateNew(true);
          }
          setMatchDone(true);
        })
        .catch(() => {
          setCandidates([]);
          setCreateNew(true);
          setMatchDone(true);
        })
        .finally(() => setMatchLoading(false));
    }
  }, [open, lead, hospitalId]);

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!lead || !dropData) return;
      const body: Record<string, unknown> = {
        appointmentDate: dropData.date,
        appointmentTime: dropData.time,
        duration: parseInt(duration, 10),
        unitId: unitId ?? null,
        providerId: providerId ?? null,
      };
      if (selectedPatientId) {
        body.patientId = selectedPatientId;
      } else {
        body.patient = {
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.phone,
          email: lead.email,
        };
      }
      await apiRequest(
        "POST",
        `/api/business/${hospitalId}/leads/${lead.id}/convert`,
        body,
      );
    },
    onSuccess: () => {
      toast({ title: "Lead konvertiert und Termin erstellt" });
      onOpenChange(false);
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${hospitalId}/leads`],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/business/${hospitalId}/leads-count`],
      });
      // Invalidate appointments/calendar queries
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-appointments"], exact: false });
    },
    onError: () => {
      toast({ title: "Fehler bei der Konvertierung", variant: "destructive" });
    },
  });

  if (!lead || !dropData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lead einplanen</DialogTitle>
          <DialogDescription>
            Termin erstellen und Lead konvertieren
          </DialogDescription>
        </DialogHeader>

        {/* Lead info */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <p className="font-medium">
              {lead.firstName} {lead.lastName}
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Operation</Label>
            <p>{lead.operation}</p>
          </div>
          {lead.phone && (
            <div className="flex items-center gap-1 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {lead.phone}
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              {lead.email}
            </div>
          )}
        </div>

        {/* Appointment details */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div>
            <Label className="text-xs">Datum</Label>
            <Input value={dropData.date} disabled className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">Zeit</Label>
            <Input value={dropData.time} disabled className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">Dauer</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Patient matching */}
        <div className="space-y-2 pt-2">
          <Label className="text-xs text-muted-foreground">
            Patienten-Zuordnung
          </Label>

          {matchLoading && (
            <p className="text-sm text-muted-foreground py-2">
              Suche nach passenden Patienten...
            </p>
          )}

          {matchDone && candidates.length > 0 && !createNew && (
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <Card
                  key={c.patientId}
                  onClick={() => {
                    setSelectedPatientId(c.patientId);
                    setCreateNew(false);
                  }}
                  className={`p-2.5 cursor-pointer transition-colors ${
                    selectedPatientId === c.patientId
                      ? "ring-2 ring-blue-500 bg-blue-50/80 dark:bg-blue-950/50"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {c.firstName} {c.lastName}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {Math.round(c.confidence * 100)}%
                    </Badge>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {c.phone && (
                      <span
                        className={
                          c.phoneMatch
                            ? "text-green-600 dark:text-green-400 font-medium"
                            : ""
                        }
                      >
                        <Phone className="h-3 w-3 inline mr-0.5" />
                        {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span
                        className={
                          c.emailMatch
                            ? "text-green-600 dark:text-green-400 font-medium"
                            : ""
                        }
                      >
                        <Mail className="h-3 w-3 inline mr-0.5" />
                        {c.email}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setSelectedPatientId(null);
                  setCreateNew(true);
                }}
              >
                Keiner davon — neuen Patienten anlegen
              </Button>
            </div>
          )}

          {matchDone && (candidates.length === 0 || createNew) && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                <span>
                  Neuer Patient wird erstellt: {lead.firstName} {lead.lastName}
                </span>
              </div>
              {candidates.length > 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs p-0 h-auto mt-1"
                  onClick={() => setCreateNew(false)}
                >
                  Bestehende Patienten nochmal anzeigen
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => convertMutation.mutate()}
            disabled={
              convertMutation.isPending ||
              (!selectedPatientId && !createNew) ||
              !matchDone
            }
          >
            {convertMutation.isPending ? "Wird konvertiert..." : "Konvertieren & Einplanen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
