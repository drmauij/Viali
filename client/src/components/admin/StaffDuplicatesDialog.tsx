import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ArrowRightLeft, X, Loader2 } from "lucide-react";

interface DuplicateUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  canLogin: boolean;
  roles: Array<{ unitId: string; role: string }>;
}

interface DuplicatePair {
  user1: DuplicateUser;
  user2: DuplicateUser;
  confidence: number;
  reasons: string[];
}

interface StaffDuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  onMerge: (user1Id: string, user2Id: string) => void;
}

function confidenceLabel(confidence: number): { text: string; variant: "destructive" | "default" | "secondary" | "outline" } {
  if (confidence >= 0.9) return { text: "High", variant: "destructive" };
  if (confidence >= 0.7) return { text: "Medium", variant: "default" };
  return { text: "Low", variant: "secondary" };
}

function isDummyEmail(email: string | null): boolean {
  if (!email) return true;
  return email.endsWith("@staff.local") || email.endsWith("@internal.local");
}

function UserLabel({ user }: { user: DuplicateUser }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="font-medium text-sm truncate">
        {user.firstName} {user.lastName}
      </div>
      <div className={`text-xs truncate ${isDummyEmail(user.email) ? "text-muted-foreground italic" : "text-muted-foreground"}`}>
        {user.email || "No email"}
      </div>
      <div className="flex gap-1 mt-1 flex-wrap">
        {user.canLogin && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            Can login
          </Badge>
        )}
        {user.roles.slice(0, 2).map((r, i) => (
          <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">
            {r.role}
          </Badge>
        ))}
        {user.roles.length > 2 && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0">
            +{user.roles.length - 2}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function StaffDuplicatesDialog({
  open,
  onOpenChange,
  hospitalId,
  onMerge,
}: StaffDuplicatesDialogProps) {
  const { t } = useTranslation();
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());

  const { data: pairs = [], isLoading } = useQuery<DuplicatePair[]>({
    queryKey: [`/api/admin/${hospitalId}/staff-duplicates`],
    enabled: open && !!hospitalId,
  });

  const visiblePairs = pairs.filter((p) => {
    const key = [p.user1.id, p.user2.id].sort().join(":");
    return !dismissedPairs.has(key);
  });

  const handleDismiss = (pair: DuplicatePair) => {
    const key = [pair.user1.id, pair.user2.id].sort().join(":");
    setDismissedPairs((prev) => new Set(prev).add(key));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("admin.findDuplicates", "Find Duplicates")}
          </DialogTitle>
          <DialogDescription>
            {t("admin.findDuplicatesDescription", "Staff members with similar names that may be duplicates. Review each pair and merge if they are the same person.")}
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
                ? t("admin.allDuplicatesDismissed", "All duplicate pairs have been dismissed.")
                : t("admin.noDuplicatesFound", "No duplicate staff members found.")}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-3 pr-4">
              {visiblePairs.map((pair, idx) => {
                const badge = confidenceLabel(pair.confidence);
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
                          onClick={() => onMerge(pair.user1.id, pair.user2.id)}
                        >
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          {t("admin.merge", "Merge")}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <UserLabel user={pair.user1} />
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                      <UserLabel user={pair.user2} />
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
