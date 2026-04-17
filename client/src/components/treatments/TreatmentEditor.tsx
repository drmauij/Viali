import { useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TreatmentLineDialog } from "./TreatmentLineDialog";
import { TreatmentPalette } from "./TreatmentPalette";
import { TreatmentItemConfigDialog } from "./TreatmentItemConfigDialog";
import { HistorySummaryCard } from "./HistorySummaryCard";
import SignaturePad from "@/components/SignaturePad";
import type { Treatment, TreatmentLine, TreatmentItemConfig } from "@shared/schema";

interface Props {
  patientId: string;
  hospitalId: string;
  unitId?: string | null;
  appointmentId?: string | null;
  existing?: Treatment & { lines: TreatmentLine[] };
  onSaved: () => void;
  onCancel: () => void;
}

export function TreatmentEditor({
  patientId,
  hospitalId,
  unitId,
  appointmentId,
  existing,
  onSaved,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Form state
  const [performedAt, setPerformedAt] = useState<Date>(
    existing?.performedAt ? new Date(existing.performedAt) : new Date(),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [lines, setLines] = useState<Partial<TreatmentLine>[]>(
    existing?.lines ?? [],
  );

  // Dialog state
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingLine, setEditingLine] = useState<
    Partial<TreatmentLine> | undefined
  >(undefined);

  // Palette config dialog
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  // Signature pad state
  const [signPadOpen, setSignPadOpen] = useState(false);

  // ---- Data fetching ----

  const { data: services = [] } = useQuery<
    { id: string; name: string; price?: string | null }[]
  >({
    queryKey: ["clinic-services", hospitalId],
    queryFn: () =>
      apiRequest("GET", `/api/clinic/${hospitalId}/services`).then((r) =>
        r.json(),
      ),
    enabled: !!hospitalId,
  });

  const { data: items = [] } = useQuery<
    { id: string; name: string; patientPrice?: string | null }[]
  >({
    queryKey: [`/api/items/${hospitalId}?module=treatment`],
    enabled: !!hospitalId,
  });

  const { data: configs = [] } = useQuery<TreatmentItemConfig[]>({
    queryKey: ["treatment-configs", hospitalId, unitId ?? null],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/treatments/configs/list?hospitalId=${hospitalId}${unitId ? `&unitId=${unitId}` : ""}`,
      ).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const { data: history = [] } = useQuery<
    (Treatment & { lines: TreatmentLine[] })[]
  >({
    queryKey: ["treatments", patientId],
    queryFn: () =>
      apiRequest("GET", `/api/treatments?patientId=${patientId}`).then((r) =>
        r.json(),
      ),
    enabled: !!patientId,
  });

  // Fetch lots per item as needed (one query per item that has lots)
  const uniqueItemIds = useMemo(
    () => [...new Set(lines.map((l) => l.itemId).filter(Boolean) as string[])],
    [lines],
  );

  // We collect lots for all items used in lines + all items in the picker
  const allItemIds = useMemo(() => {
    const fromLines = lines.map((l) => l.itemId).filter(Boolean) as string[];
    const fromItems = items.map((i) => i.id);
    return [...new Set([...fromLines, ...fromItems])];
  }, [lines, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch lots for the currently opened line item (lazy approach: we pass lotsByItem built from separate queries)
  // For simplicity, we expose a lotsByItem record built on demand when the dialog opens.
  // Each item's lots are fetched individually via a query keyed by itemId.
  const lotQueriesEnabled = uniqueItemIds.length > 0;
  const lotsQuery = useQuery<
    { itemId: string; lots: { id: string; lotNumber: string; expiryDate?: string | null; qty?: number | null }[] }[]
  >({
    queryKey: ["lots-for-items", uniqueItemIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        uniqueItemIds.map((itemId) =>
          apiRequest("GET", `/api/items/${itemId}/lots`)
            .then((r) => r.json())
            .then((lots: any[]) => ({ itemId, lots })),
        ),
      );
      return results;
    },
    enabled: lotQueriesEnabled,
  });

  // Also fetch lots for item chosen in dialog when opened
  const [dialogItemId, setDialogItemId] = useState<string | null>(null);
  const dialogLotsQuery = useQuery<
    { id: string; lotNumber: string; expiryDate?: string | null; qty?: number | null }[]
  >({
    queryKey: ["lots-for-item", dialogItemId],
    queryFn: () =>
      apiRequest("GET", `/api/items/${dialogItemId}/lots`).then((r) =>
        r.json(),
      ),
    enabled: !!dialogItemId,
  });

  const lotsByItem = useMemo(() => {
    const map: Record<
      string,
      { id: string; lotNumber: string; expiryDate?: string | null; qty?: number | null }[]
    > = {};
    for (const entry of lotsQuery.data ?? []) {
      map[entry.itemId] = entry.lots;
    }
    if (dialogItemId && dialogLotsQuery.data) {
      map[dialogItemId] = dialogLotsQuery.data;
    }
    return map;
  }, [lotsQuery.data, dialogItemId, dialogLotsQuery.data]);

  const itemsMap = useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, i])),
    [items],
  );
  const servicesMap = useMemo(
    () => Object.fromEntries(services.map((s) => [s.id, s])),
    [services],
  );

  const zoneSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of history) {
      for (const l of t.lines ?? []) {
        for (const z of (l.zones as string[]) ?? []) {
          set.add(z);
        }
      }
    }
    return Array.from(set);
  }, [history]);

  const total = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + parseFloat((l.total as string) ?? "0"),
        0,
      ),
    [lines],
  );

  // ---- Mutations ----

  const saveMutation = useMutation({
    mutationFn: async (payload: { lines: Partial<TreatmentLine>[]; notes: string; performedAt: Date }) => {
      const body = {
        hospitalId,
        unitId: unitId ?? null,
        patientId,
        appointmentId: appointmentId ?? null,
        performedAt: payload.performedAt.toISOString(),
        notes: payload.notes,
        lines: payload.lines,
      };
      const res = existing
        ? await apiRequest("PUT", `/api/treatments/${existing.id}`, body)
        : await apiRequest("POST", "/api/treatments", body);
      return res.json() as Promise<Treatment & { lines: TreatmentLine[] }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treatments", patientId] });
      toast({
        title: t("treatments.savedDraft", "Draft saved"),
      });
      onSaved();
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: t("treatments.saveFailed", "Save failed"),
        description: err.message,
      });
    },
  });

  const signMutation = useMutation({
    mutationFn: async (signature: string) => {
      // Save first, then sign
      const body = {
        hospitalId,
        unitId: unitId ?? null,
        patientId,
        appointmentId: appointmentId ?? null,
        performedAt: performedAt.toISOString(),
        notes,
        lines,
      };
      let treatmentId = existing?.id;
      if (!treatmentId) {
        const created = await apiRequest(
          "POST",
          "/api/treatments",
          body,
        ).then((r) => r.json() as Promise<Treatment>);
        treatmentId = created.id;
      } else {
        await apiRequest("PUT", `/api/treatments/${treatmentId}`, body);
      }
      return apiRequest("POST", `/api/treatments/${treatmentId}/sign`, {
        signature,
      }).then((r) => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treatments", patientId] });
      toast({
        title: t("treatments.signed", "Treatment signed and locked"),
      });
      onSaved();
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: t("treatments.signFailed", "Sign failed"),
        description: err.message,
      });
    },
  });

  // ---- Line management ----

  const openNewLine = () => {
    setEditingIndex(null);
    setEditingLine(undefined);
    setDialogItemId(null);
    setLineDialogOpen(true);
  };

  const openEditLine = (index: number) => {
    const line = lines[index];
    setEditingIndex(index);
    setEditingLine(line);
    setDialogItemId(line.itemId ?? null);
    setLineDialogOpen(true);
  };

  const upsertLine = (line: Partial<TreatmentLine>) => {
    setLines((prev) => {
      if (editingIndex === null) {
        return [...prev, { ...line, lineOrder: prev.length }];
      }
      const next = [...prev];
      next[editingIndex] = { ...next[editingIndex], ...line };
      return next;
    });
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const applyConfig = (c: TreatmentItemConfig) => {
    setLines((prev) => [
      ...prev,
      {
        itemId: c.itemId,
        serviceId: c.defaultServiceId ?? undefined,
        dose: c.defaultDose ?? undefined,
        doseUnit: c.defaultDoseUnit ?? undefined,
        zones: (c.defaultZones as string[]) ?? [],
        lineOrder: prev.length,
      },
    ]);
  };

  const copyLinesFromHistory = (src: TreatmentLine[]) => {
    setLines(
      src.map((l, i) => ({
        serviceId: l.serviceId ?? undefined,
        itemId: l.itemId ?? undefined,
        dose: l.dose ?? undefined,
        doseUnit: l.doseUnit ?? undefined,
        zones: (l.zones as string[]) ?? [],
        notes: l.notes ?? undefined,
        unitPrice: l.unitPrice ?? undefined,
        total: l.total ?? undefined,
        lineOrder: i,
      })),
    );
    toast({
      title: t("treatments.linesCopied", "Lines copied — review and adjust before signing"),
    });
  };

  const isLocked =
    existing?.status === "signed" || existing?.status === "invoiced";

  return (
    <div className="space-y-4">
      {/* History summary */}
      {history.length > 0 && (
        <HistorySummaryCard
          sessions={history.filter((h) => h.id !== existing?.id)}
          servicesMap={servicesMap}
          itemsMap={itemsMap}
          onCopyLines={copyLinesFromHistory}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {existing
              ? t("treatments.editTreatment", "Edit Treatment")
              : t("treatments.newTreatment", "New Treatment")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("treatments.dateTime", "Date / time")}</Label>
              <Input
                type="datetime-local"
                value={performedAt.toISOString().slice(0, 16)}
                onChange={(e) => setPerformedAt(new Date(e.target.value))}
                disabled={isLocked}
              />
            </div>
            <div>
              <Label>{t("treatments.sessionNotes", "Session notes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={isLocked}
              />
            </div>
          </div>

          {/* Palette */}
          {!isLocked && (
            <TreatmentPalette
              configs={configs}
              itemsMap={itemsMap}
              onPick={applyConfig}
              onConfigure={() => setConfigDialogOpen(true)}
            />
          )}

          {/* Lines list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t("treatments.lines", "Lines")}
              </span>
              {!isLocked && (
                <Button size="sm" variant="outline" onClick={openNewLine}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("treatments.addLine", "Add line")}
                </Button>
              )}
            </div>

            {lines.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                {t("treatments.noLines", "No lines yet. Use the palette or Add line button.")}
              </p>
            )}

            {lines.map((line, index) => {
              const service = line.serviceId
                ? servicesMap[line.serviceId]
                : null;
              const item = line.itemId ? itemsMap[line.itemId] : null;
              const zoneList = (line.zones as string[]) ?? [];
              return (
                <div
                  key={index}
                  className="flex items-start gap-2 border rounded p-2 text-sm"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {service && (
                        <span className="font-medium">{service.name}</span>
                      )}
                      {item && (
                        <span className={service ? "text-muted-foreground" : "font-medium"}>
                          {service ? "· " : ""}{item.name}
                        </span>
                      )}
                      {(line.dose || line.doseUnit) && (
                        <Badge variant="outline" className="text-xs">
                          {line.dose}
                          {line.doseUnit ? " " + line.doseUnit : ""}
                        </Badge>
                      )}
                      {zoneList.map((z) => (
                        <Badge
                          key={z}
                          variant="secondary"
                          className="text-xs"
                        >
                          {z}
                        </Badge>
                      ))}
                    </div>
                    {line.notes && (
                      <p className="text-xs text-muted-foreground">
                        {line.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {line.total && (
                      <span className="text-sm font-medium mr-2">
                        €{line.total as string}
                      </span>
                    )}
                    {!isLocked && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEditLine(index)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeLine(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {lines.length > 0 && (
              <div className="flex justify-end text-sm font-medium pt-1">
                {t("treatments.total", "Total")}: €{total.toFixed(2)}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="outline" onClick={onCancel}>
              {t("common.cancel", "Cancel")}
            </Button>
            {!isLocked && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={
                    lines.length === 0 || saveMutation.isPending
                  }
                  onClick={() =>
                    saveMutation.mutate({ lines, notes, performedAt })
                  }
                >
                  {saveMutation.isPending
                    ? t("treatments.saving", "Saving…")
                    : t("treatments.saveDraft", "Save Draft")}
                </Button>
                <Button
                  disabled={lines.length === 0 || signMutation.isPending}
                  onClick={() => setSignPadOpen(true)}
                >
                  <PenLine className="h-4 w-4 mr-1" />
                  {signMutation.isPending
                    ? t("treatments.signing", "Signing…")
                    : t("treatments.signLock", "Sign & Lock")}
                </Button>
              </div>
            )}
            {isLocked && (
              <Badge variant="secondary">
                {t("treatments.locked", "Locked — use Amend to edit")}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Line dialog */}
      <TreatmentLineDialog
        open={lineDialogOpen}
        onOpenChange={setLineDialogOpen}
        initial={editingLine}
        services={services}
        items={items}
        lotsByItem={lotsByItem}
        zoneSuggestions={zoneSuggestions}
        onSave={upsertLine}
      />

      {/* Signature pad */}
      <SignaturePad
        isOpen={signPadOpen}
        onClose={() => setSignPadOpen(false)}
        onSave={(sig) => {
          setSignPadOpen(false);
          signMutation.mutate(sig);
        }}
        title={t("treatments.signatureTitle", "Provider Signature")}
      />

      {/* Treatment palette config dialog */}
      <TreatmentItemConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        hospitalId={hospitalId}
        unitId={unitId}
      />
    </div>
  );
}
