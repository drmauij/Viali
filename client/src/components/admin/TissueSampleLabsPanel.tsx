import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TISSUE_SAMPLE_TYPES,
  TISSUE_SAMPLE_TYPE_KEYS,
  type TissueSampleType,
} from "@shared/tissueSampleTypes";

interface Lab {
  id: string;
  hospitalId: string;
  name: string;
  applicableSampleTypes: string[] | null;
  contact: string | null;
  isDefault: boolean;
  isArchived: boolean;
}

const LABS_QUERY_KEY = "/api/tissue-sample-external-labs";

interface FormState {
  id: string | null;
  name: string;
  applicableSampleTypes: TissueSampleType[]; // [] = universal
  contact: string;
  isDefault: boolean;
}

const emptyForm: FormState = {
  id: null,
  name: "",
  applicableSampleTypes: [],
  contact: "",
  isDefault: false,
};

export function TissueSampleLabsPanel() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const activeHospital = useActiveHospital();
  const isAdmin =
    activeHospital?.role === "admin" || activeHospital?.role === "group_admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [archiveCandidate, setArchiveCandidate] = useState<Lab | null>(null);

  const labsQuery = useQuery<Lab[]>({
    queryKey: [LABS_QUERY_KEY],
  });

  const upsertMut = useMutation({
    mutationFn: async (payload: FormState) => {
      const body = {
        name: payload.name,
        applicableSampleTypes:
          payload.applicableSampleTypes.length === 0
            ? null
            : payload.applicableSampleTypes,
        contact: payload.contact || null,
        isDefault: payload.isDefault,
      };
      const res = payload.id
        ? await apiRequest(
            "PATCH",
            `/api/tissue-sample-external-labs/${payload.id}`,
            body,
          )
        : await apiRequest(
            "POST",
            "/api/tissue-sample-external-labs",
            body,
          );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LABS_QUERY_KEY] });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => {
      toast({
        title: t("common.error"),
        description: e?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "POST",
        `/api/tissue-sample-external-labs/${id}/archive`,
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LABS_QUERY_KEY] });
      setArchiveCandidate(null);
    },
    onError: (e: Error) => {
      toast({
        title: t("common.error"),
        description: e?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (lab: Lab) => {
    setForm({
      id: lab.id,
      name: lab.name,
      applicableSampleTypes: (lab.applicableSampleTypes ?? []) as TissueSampleType[],
      contact: lab.contact ?? "",
      isDefault: lab.isDefault,
    });
    setDialogOpen(true);
  };

  const labs = labsQuery.data ?? [];
  const langLabel = (k: TissueSampleType) =>
    TISSUE_SAMPLE_TYPES[k].label[i18n.language as "de" | "en"];

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {t("tissueSamples.labs.tabLabel")}
          </h3>
        </div>
        <Button onClick={openCreate} size="sm" disabled={!isAdmin}>
          <i className="fas fa-plus mr-2"></i>
          {t("tissueSamples.labs.add")}
        </Button>
      </div>

      {labsQuery.isLoading ? (
        <div className="text-center py-8">
          <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
        </div>
      ) : labs.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            {t("tissueSamples.labs.empty")}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("tissueSamples.labs.name")}</TableHead>
              <TableHead>{t("tissueSamples.labs.applicableTypes")}</TableHead>
              <TableHead>{t("tissueSamples.labs.contact")}</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {labs.map((lab) => {
              const types = lab.applicableSampleTypes ?? [];
              return (
                <TableRow key={lab.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={() => openEdit(lab)}
                        disabled={!isAdmin}
                        data-testid={`button-edit-lab-${lab.id}`}
                      >
                        {lab.name}
                      </button>
                      {lab.isDefault && (
                        <Badge variant="secondary">
                          {t("tissueSamples.labs.isDefault")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {types.length === 0 ? (
                      <span className="text-muted-foreground">
                        {t("tissueSamples.labs.applicableTypesAll")}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {types.map((tk) => (
                          <Badge key={tk} variant="outline">
                            {TISSUE_SAMPLE_TYPES[tk as TissueSampleType]
                              ?.label[i18n.language as "de" | "en"] ?? tk}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-pre-line">
                    {lab.contact ?? ""}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setArchiveCandidate(lab)}
                      disabled={!isAdmin}
                      data-testid={`button-archive-lab-${lab.id}`}
                    >
                      <i className="fas fa-box-archive mr-2"></i>
                      {t("tissueSamples.labs.archive")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? t("tissueSamples.labs.tabLabel")
                : t("tissueSamples.labs.add")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("tissueSamples.labs.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="input-lab-name"
              />
            </div>
            <div>
              <Label>{t("tissueSamples.labs.applicableTypes")}</Label>
              <p className="text-xs text-muted-foreground mb-2">
                {t("tissueSamples.labs.applicableTypesAll")}:{" "}
                {form.applicableSampleTypes.length === 0
                  ? "✓"
                  : ""}
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border border-border rounded-md p-2">
                {TISSUE_SAMPLE_TYPE_KEYS.map((k) => {
                  const checked = form.applicableSampleTypes.includes(k);
                  return (
                    <label
                      key={k}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          if (v) {
                            setForm({
                              ...form,
                              applicableSampleTypes: [
                                ...form.applicableSampleTypes,
                                k,
                              ],
                            });
                          } else {
                            setForm({
                              ...form,
                              applicableSampleTypes:
                                form.applicableSampleTypes.filter(
                                  (x) => x !== k,
                                ),
                            });
                          }
                        }}
                        data-testid={`checkbox-lab-type-${k}`}
                      />
                      <span>{langLabel(k)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>{t("tissueSamples.labs.contact")}</Label>
              <Textarea
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                data-testid="textarea-lab-contact"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={form.isDefault}
                onCheckedChange={(v) =>
                  setForm({ ...form, isDefault: Boolean(v) })
                }
                data-testid="checkbox-lab-default"
              />
              <span>{t("tissueSamples.labs.isDefault")}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => upsertMut.mutate(form)}
              disabled={upsertMut.isPending || !form.name.trim()}
              data-testid="button-save-lab"
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={archiveCandidate !== null}
        onOpenChange={(o) => !o && setArchiveCandidate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tissueSamples.labs.archiveConfirm")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                archiveCandidate && archiveMut.mutate(archiveCandidate.id)
              }
            >
              {t("tissueSamples.labs.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
