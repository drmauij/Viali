import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCanWrite } from "@/hooks/useCanWrite";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Copy, Link2, RotateCcw, Trash2 } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dateUtils";
import type { TissueSample, TissueSampleStatusHistory } from "@shared/schema";
import { TISSUE_SAMPLE_TYPES } from "@shared/tissueSampleTypes";
import { UpdateStatusDialog } from "./UpdateStatusDialog";
import { EditExtractionSurgeryDialog } from "./EditExtractionSurgeryDialog";

interface Props {
  sample: TissueSample;
  onClickSurgery?: (surgeryId: string) => void;
}

export function TissueSampleCard({ sample, onClickSurgery }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editExtractionOpen, setEditExtractionOpen] = useState(false);

  const typeConfig =
    TISSUE_SAMPLE_TYPES[sample.sampleType as keyof typeof TISSUE_SAMPLE_TYPES];
  const typeLabel =
    typeConfig?.label[i18n.language as "de" | "en"] ?? sample.sampleType;

  const { data: detail } = useQuery<{
    sample: TissueSample;
    history: TissueSampleStatusHistory[];
  }>({
    queryKey: ["tissue-sample", sample.id],
    queryFn: () =>
      apiRequest("GET", `/api/tissue-samples/${sample.id}`).then((r) => r.json()),
    enabled: open,
  });

  const destroyMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/tissue-samples/${sample.id}/status`, {
        toStatus: "Vernichtet",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tissue-samples", sample.patientId],
      });
      queryClient.invalidateQueries({ queryKey: ["tissue-sample", sample.id] });
      toast({
        title: t("common.success"),
        description: t("tissueSamples.destroy"),
      });
    },
    onError: (e: any) =>
      toast({
        title: t("common.error"),
        description: e?.message ?? "",
        variant: "destructive",
      }),
  });

  const copyCode = async () => {
    await navigator.clipboard.writeText(sample.code);
    toast({ title: t("tissueSamples.codeCopied") });
  };

  return (
    <Card data-testid={`tissue-sample-card-${sample.id}`}>
      <CardHeader className="flex flex-row items-center gap-2">
        <Badge variant="outline">{typeLabel}</Badge>
        <button
          type="button"
          onClick={copyCode}
          className="font-mono text-sm hover:underline"
          data-testid={`tissue-sample-code-${sample.id}`}
        >
          {sample.code}
        </button>
        <Copy className="h-3 w-3 text-muted-foreground" aria-hidden />
        <Badge>{sample.status}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDate(sample.statusDate)}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {sample.notes && <p className="text-sm">{sample.notes}</p>}
        <div className="flex flex-wrap gap-2 text-xs">
          {sample.extractionSurgeryId && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() =>
                onClickSurgery?.(sample.extractionSurgeryId as string)
              }
              data-testid={`tissue-sample-extraction-${sample.id}`}
            >
              {t("tissueSamples.extractionSurgery")}
            </Badge>
          )}
          {sample.reimplantSurgeryId && (
            <Badge
              variant="secondary"
              className="cursor-pointer"
              onClick={() =>
                onClickSurgery?.(sample.reimplantSurgeryId as string)
              }
              data-testid={`tissue-sample-reimplant-${sample.id}`}
            >
              {t("tissueSamples.reimplantSurgery")}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusDialogOpen(true)}
              data-testid={`tissue-sample-update-status-${sample.id}`}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {t("tissueSamples.status")}
            </Button>
          )}
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditExtractionOpen(true)}
              data-testid={`tissue-sample-edit-extraction-${sample.id}`}
            >
              <Link2 className="h-3 w-3 mr-1" />
              {t("tissueSamples.editExtractionSurgery")}
            </Button>
          )}
          {canWrite && sample.status !== "Vernichtet" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 className="h-3 w-3 mr-1" />
                  {t("tissueSamples.destroy")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("tissueSamples.destroyConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("tissueSamples.destroyConfirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => destroyMutation.mutate()}
                    data-testid={`tissue-sample-destroy-confirm-${sample.id}`}
                  >
                    {t("tissueSamples.destroy")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`tissue-sample-history-toggle-${sample.id}`}
            >
              <ChevronDown
                className={`h-3 w-3 mr-1 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {t("tissueSamples.history.title")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {detail?.history?.map((h) => (
              <div
                key={h.id}
                className="text-xs text-muted-foreground border-l-2 pl-2"
                data-testid={`tissue-sample-history-row-${h.id}`}
              >
                <div>
                  {formatDateTime(h.changedAt)} —{" "}
                  {h.fromStatus
                    ? `${h.fromStatus} → ${h.toStatus}`
                    : h.toStatus}
                </div>
                {h.note && <div className="italic">{h.note}</div>}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <UpdateStatusDialog
        sample={sample}
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
      />
      <EditExtractionSurgeryDialog
        sample={sample}
        open={editExtractionOpen}
        onOpenChange={setEditExtractionOpen}
      />
    </Card>
  );
}
