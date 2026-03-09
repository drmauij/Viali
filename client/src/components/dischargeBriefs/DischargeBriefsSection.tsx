import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { FileText, Plus, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DischargeBriefCard } from "./DischargeBriefCard";
import { DischargeBriefWizard } from "./DischargeBriefWizard";
import { DischargeBriefEditor } from "./DischargeBriefEditor";

interface DischargeBrief {
  id: string;
  briefType: string;
  language: string;
  content: string | null;
  isLocked: boolean;
  signature: string | null;
  signedBy: string | null;
  signedAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  creator: { firstName: string | null; lastName: string | null };
  signer: { firstName: string | null; lastName: string | null } | null;
}

interface DischargeBriefsSectionProps {
  patientId: string;
  hospitalId: string;
  canWrite?: boolean;
  isAdmin?: boolean;
  surgeries?: Array<{
    id: string;
    plannedSurgery: string | null;
    plannedDate: Date | string;
    status: string;
  }>;
  userId?: string;
  userUnitIds?: string[];
  units?: Array<{ id: string; name: string }>;
}

export function DischargeBriefsSection({
  patientId,
  hospitalId,
  canWrite = false,
  isAdmin = false,
  surgeries = [],
  userId,
  userUnitIds = [],
  units: unitsList = [],
}: DischargeBriefsSectionProps) {
  const { t } = useTranslation();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingBriefId, setEditingBriefId] = useState<string | null>(null);
  const [auditBriefId, setAuditBriefId] = useState<string | null>(null);

  // Lazy-load audit dialog
  const [AuditDialog, setAuditDialog] = useState<React.ComponentType<{
    briefId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }> | null>(null);

  const { data: briefs = [], isLoading } = useQuery<DischargeBrief[]>({
    queryKey: [`/api/patients/${patientId}/discharge-briefs`],
    enabled: !!patientId,
  });

  const handleAudit = (briefId: string) => {
    setAuditBriefId(briefId);
    if (!AuditDialog) {
      import("./DischargeBriefAuditDialog").then((mod) => {
        setAuditDialog(() => mod.DischargeBriefAuditDialog);
      });
    }
  };

  const hasBriefs = briefs.length > 0;

  return (
    <>
      <Card className={hasBriefs ? "border-blue-400 dark:border-blue-600" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between w-full">
            <CardTitle className={`text-lg flex items-center gap-2 ${hasBriefs ? "text-blue-600 dark:text-blue-400" : ""}`}>
              <FileText className="h-5 w-5" />
              {t("dischargeBriefs.title", "Discharge Briefs")}
              {hasBriefs && (
                <Badge variant="outline" className="ml-1">
                  {briefs.length}
                </Badge>
              )}
            </CardTitle>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWizardOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("dischargeBriefs.create", "Create Brief")}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "dischargeBriefs.description",
              "AI-generated discharge briefs with full anonymization and audit trail.",
            )}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : briefs.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {t("dischargeBriefs.noBriefs", "No discharge briefs yet")}
              </p>
              {canWrite && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setWizardOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t("dischargeBriefs.createFirst", "Create your first brief")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {briefs.map((brief) => (
                <DischargeBriefCard
                  key={brief.id}
                  brief={brief}
                  patientId={patientId}
                  canWrite={canWrite}
                  isAdmin={isAdmin}
                  onEdit={setEditingBriefId}
                  onAudit={handleAudit}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wizard dialog */}
      {wizardOpen && (
        <DischargeBriefWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          patientId={patientId}
          hospitalId={hospitalId}
          surgeries={surgeries}
          isAdmin={isAdmin}
          userId={userId}
          userUnitIds={userUnitIds}
          units={unitsList}
          onCreated={(briefId) => {
            setWizardOpen(false);
            setEditingBriefId(briefId);
          }}
        />
      )}

      {/* Editor dialog */}
      <Dialog
        open={!!editingBriefId}
        onOpenChange={(open) => {
          if (!open) setEditingBriefId(null);
        }}
      >
        <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col [&>button.absolute]:hidden">
          {editingBriefId && (
            <DischargeBriefEditor
              briefId={editingBriefId}
              onClose={() => setEditingBriefId(null)}
              isAdmin={isAdmin}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Audit dialog */}
      {AuditDialog && auditBriefId && (
        <AuditDialog
          briefId={auditBriefId}
          open={!!auditBriefId}
          onOpenChange={(open) => {
            if (!open) setAuditBriefId(null);
          }}
        />
      )}
    </>
  );
}
