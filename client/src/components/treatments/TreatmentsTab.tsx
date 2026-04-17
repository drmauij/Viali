import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, FileText, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TreatmentEditor } from "./TreatmentEditor";
import { TodayAppointmentDialog, type TodayAppointmentRow } from "./TodayAppointmentDialog";
import {
  filterLinkableAppointments,
  todayLocalDateString,
  normalizeApptRow,
  type ApiAppointment,
  APPOINTMENT_FETCH_STALE_MS,
} from "./appointmentLinkHelpers";
import type { Treatment, TreatmentLine } from "@shared/schema";

type TreatmentWithLines = Treatment & { lines: TreatmentLine[] };

interface Props {
  patientId: string;
  hospitalId: string;
  unitId?: string | null;
  defaultOpenForAppointmentId?: string;
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  signed: "default",
  invoiced: "outline",
  amended: "destructive",
};

export function TreatmentsTab({ patientId, hospitalId, unitId, defaultOpenForAppointmentId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<TreatmentWithLines | null | "new">(
    null,
  );
  // Appointment to pre-link when opening a new treatment from the Appointments tab
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | undefined>();
  const [todayDialogOpen, setTodayDialogOpen] = useState(false);
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointmentRow[]>([]);
  const [fetchingAppointments, setFetchingAppointments] = useState(false);

  useEffect(() => {
    if (defaultOpenForAppointmentId) {
      setPendingAppointmentId(defaultOpenForAppointmentId);
      setEditing("new");
    }
  }, [defaultOpenForAppointmentId]);

  const { data: treatments = [], isLoading } = useQuery<TreatmentWithLines[]>({
    queryKey: ["treatments", patientId],
    queryFn: () =>
      apiRequest("GET", `/api/treatments?patientId=${patientId}`).then((r) =>
        r.json(),
      ),
    enabled: !!patientId,
  });

  const amendMutation = useMutation({
    mutationFn: (treatmentId: string) =>
      apiRequest("POST", `/api/treatments/${treatmentId}/amend`).then((r) =>
        r.json(),
      ),
    onSuccess: (amended: TreatmentWithLines) => {
      qc.invalidateQueries({ queryKey: ["treatments", patientId] });
      setEditing(amended);
      toast({ title: t("treatments.amendStarted", "Amendment started — re-sign when done") });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: t("treatments.amendFailed", "Amend failed"),
        description: err.message,
      });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: (treatmentId: string) =>
      apiRequest("POST", `/api/treatments/${treatmentId}/invoice-draft`).then(
        (r) => r.json(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treatments", patientId] });
      toast({
        title: t("treatments.invoiceCreated", "Invoice draft created"),
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: t("treatments.invoiceFailed", "Invoice creation failed"),
        description: err.message,
      });
    },
  });

  // Collect service/item name maps from the treatment list itself for the summary chips
  const { servicesMap, itemsMap } = useMemo(() => {
    const svc: Record<string, { name: string }> = {};
    const itm: Record<string, { name: string }> = {};
    for (const treatment of treatments) {
      for (const line of treatment.lines ?? []) {
        // Names won't be available here unless the API includes them.
        // The summary chips fall back to IDs if names are absent — acceptable for now.
        if (line.serviceId) svc[line.serviceId] = svc[line.serviceId] ?? { name: line.serviceId };
        if (line.itemId) itm[line.itemId] = itm[line.itemId] ?? { name: line.itemId };
      }
    }
    return { servicesMap: svc, itemsMap: itm };
  }, [treatments]);

  const handleNewTreatment = async () => {
    if (fetchingAppointments) return;
    setFetchingAppointments(true);
    const today = todayLocalDateString();
    try {
      const raw = await qc.fetchQuery<ApiAppointment[]>({
        queryKey: ["today-appts-for-link", hospitalId, patientId, today],
        queryFn: () =>
          apiRequest(
            "GET",
            `/api/clinic/${hospitalId}/appointments?patientId=${patientId}&startDate=${today}&endDate=${today}`,
          ).then((r) => r.json()),
        staleTime: APPOINTMENT_FETCH_STALE_MS,
      });

      const linkable = filterLinkableAppointments(raw).map(normalizeApptRow);

      if (linkable.length === 0) {
        setPendingAppointmentId(undefined);
        setEditing("new");
        return;
      }

      setTodayAppointments(linkable);
      setTodayDialogOpen(true);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("treatments.loadAppointmentsFailed", "Could not load appointments"),
        description: err?.message ?? "",
      });
      setPendingAppointmentId(undefined);
      setEditing("new");
    } finally {
      setFetchingAppointments(false);
    }
  };

  if (editing !== null) {
    const existingTreatment =
      editing === "new" ? undefined : (editing as TreatmentWithLines);
    return (
      <TreatmentEditor
        patientId={patientId}
        hospitalId={hospitalId}
        unitId={unitId}
        appointmentId={editing === "new" ? pendingAppointmentId : undefined}
        existing={existingTreatment}
        onSaved={() => { setEditing(null); setPendingAppointmentId(undefined); }}
        onCancel={() => { setEditing(null); setPendingAppointmentId(undefined); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("treatments.title", "Treatments")}
        </h3>
        <Button onClick={handleNewTreatment} disabled={fetchingAppointments} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t("treatments.newTreatment", "New Treatment")}
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">
          {t("common.loading", "Loading…")}
        </p>
      )}

      {!isLoading && treatments.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("treatments.noTreatments", "No treatments recorded yet.")}
        </p>
      )}

      {treatments.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("treatments.date", "Date")}</TableHead>
              <TableHead>{t("treatments.lines", "Lines")}</TableHead>
              <TableHead className="text-right">
                {t("treatments.total", "Total")}
              </TableHead>
              <TableHead>{t("treatments.status", "Status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {treatments.map((treatment) => {
              const lineTotal = (treatment.lines ?? []).reduce(
                (sum, l) => sum + parseFloat((l.total as string) ?? "0"),
                0,
              );
              const lineLabels = (treatment.lines ?? [])
                .slice(0, 3)
                .map(
                  (l) =>
                    (l.serviceId ? servicesMap[l.serviceId]?.name : null) ??
                    (l.itemId ? itemsMap[l.itemId]?.name : null) ??
                    "",
                )
                .filter(Boolean);
              const extra = (treatment.lines ?? []).length - lineLabels.length;

              return (
                <TableRow key={treatment.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(treatment.performedAt), "d MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {lineLabels.map((lbl) => (
                        <Badge key={lbl} variant="secondary" className="text-xs">
                          {lbl}
                        </Badge>
                      ))}
                      {extra > 0 && (
                        <Badge variant="outline" className="text-xs">
                          +{extra}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    €{lineTotal.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[treatment.status] ?? "secondary"}>
                      {t(
                        `treatments.status.${treatment.status}`,
                        treatment.status.charAt(0).toUpperCase() +
                          treatment.status.slice(1),
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {/* View / Edit (draft or amended) */}
                      {(treatment.status === "draft" ||
                        treatment.status === "amended") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(treatment)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          {t("common.edit", "Edit")}
                        </Button>
                      )}

                      {/* View read-only for signed/invoiced */}
                      {(treatment.status === "signed" ||
                        treatment.status === "invoiced") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(treatment)}
                        >
                          {t("common.view", "View")}
                        </Button>
                      )}

                      {/* Create invoice (signed only) */}
                      {treatment.status === "signed" &&
                        !treatment.invoiceId && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={invoiceMutation.isPending}
                            onClick={() =>
                              invoiceMutation.mutate(treatment.id)
                            }
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {t("treatments.createInvoice", "Create Invoice Draft")}
                          </Button>
                        )}

                      {/* Amend (signed or invoiced) */}
                      {(treatment.status === "signed" ||
                        treatment.status === "invoiced") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={amendMutation.isPending}
                          onClick={() => amendMutation.mutate(treatment.id)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {t("treatments.amend", "Amend")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <TodayAppointmentDialog
        open={todayDialogOpen}
        onOpenChange={setTodayDialogOpen}
        appointments={todayAppointments}
        onLink={(id) => {
          setTodayDialogOpen(false);
          setPendingAppointmentId(id);
          setEditing("new");
        }}
        onSkip={() => {
          setTodayDialogOpen(false);
          setPendingAppointmentId(undefined);
          setEditing("new");
        }}
      />
    </div>
  );
}
