import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ArrowRightLeft, X, Loader2, Star } from "lucide-react";

interface DuplicatePatient {
  id: string;
  surname: string;
  firstName: string;
  birthday: string | null;
  patientNumber: string | null;
  email: string | null;
  phone: string | null;
}

interface DuplicatePair {
  patient1: DuplicatePatient;
  patient2: DuplicatePatient;
  confidence: number;
  reasons: string[];
  patient1Score: number;
  patient2Score: number;
}

interface PatientDuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  onMerge: (patient1Id: string, patient2Id: string) => void;
}

function confidenceLabel(confidence: number): { text: string; variant: "destructive" | "default" | "secondary" | "outline" } {
  if (confidence >= 0.9) return { text: "High", variant: "destructive" };
  if (confidence >= 0.7) return { text: "Medium", variant: "default" };
  return { text: "Low", variant: "secondary" };
}

function formatBirthday(birthday: string | null): string {
  if (!birthday) return "-";
  try {
    return new Date(birthday).toLocaleDateString();
  } catch {
    return birthday;
  }
}

function PatientLabel({ patient, isPrimary }: { patient: DuplicatePatient; isPrimary: boolean }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="font-medium text-sm truncate flex items-center gap-1">
        {patient.surname} {patient.firstName}
        {isPrimary && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-amber-400 text-amber-600">
            <Star className="h-2.5 w-2.5 mr-0.5 fill-amber-400" />
            Primary
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {formatBirthday(patient.birthday)}
        {patient.patientNumber && ` \u00B7 #${patient.patientNumber}`}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {patient.phone || patient.email || "No contact info"}
      </div>
    </div>
  );
}

export default function PatientDuplicatesDialog({
  open,
  onOpenChange,
  hospitalId,
  onMerge,
}: PatientDuplicatesDialogProps) {
  const { t } = useTranslation();
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());

  const { data: pairs = [], isLoading } = useQuery<DuplicatePair[]>({
    queryKey: [`/api/admin/${hospitalId}/patient-duplicates`],
    enabled: open && !!hospitalId,
  });

  const visiblePairs = pairs.filter((p) => {
    const key = [p.patient1.id, p.patient2.id].sort().join(":");
    return !dismissedPairs.has(key);
  });

  const handleDismiss = (pair: DuplicatePair) => {
    const key = [pair.patient1.id, pair.patient2.id].sort().join(":");
    setDismissedPairs((prev) => new Set(prev).add(key));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("admin.findPatientDuplicates", "Find Patient Duplicates")}
          </DialogTitle>
          <DialogDescription>
            {t("admin.findPatientDuplicatesDescription", "Patients with similar names or details that may be duplicates. Review each pair and merge if they are the same person.")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visiblePairs.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {pairs.length > 0
                ? t("admin.allPatientDuplicatesDismissed", "All duplicate pairs have been dismissed.")
                : t("admin.noPatientDuplicatesFound", "No duplicate patients found.")}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-3 pr-4">
              {visiblePairs.map((pair, idx) => {
                const badge = confidenceLabel(pair.confidence);
                const patient1IsPrimary = pair.patient1Score >= pair.patient2Score;
                return (
                  <div
                    key={idx}
                    className="border rounded-lg p-3 bg-card"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={badge.variant}>{badge.text}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(pair.confidence * 100)}%
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleDismiss(pair)}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("admin.dismiss", "Dismiss")}
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onMerge(pair.patient1.id, pair.patient2.id)}
                        >
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          {t("admin.merge", "Merge")}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <PatientLabel patient={pair.patient1} isPrimary={patient1IsPrimary} />
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                      <PatientLabel patient={pair.patient2} isPrimary={!patient1IsPrimary} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pair.reasons.map((r, i) => (
                        <span key={i} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
