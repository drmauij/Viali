import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Archive } from "lucide-react";

type ClinicKind = "aesthetic" | "surgical" | "mixed";
type LicenseType = "free" | "basic" | "test";

interface Location {
  hospitalId: string;
  hospitalName: string;
  address: string | null;
  timezone: string | null;
  currency: string | null;
  licenseType: LicenseType;
  pricePerRecord: string | null;
  clinicKind: ClinicKind;
}

interface LocationsResponse {
  locations: Location[];
  groupDefaults: {
    defaultLicenseType: LicenseType | null;
    defaultPricePerRecord: string | null;
  };
}

export default function ChainLocations() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const groupId = activeHospital?.groupId ?? null;

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [archiving, setArchiving] = useState<Location | null>(null);

  const { data, isLoading } = useQuery<LocationsResponse>({
    queryKey: [`/api/chain/${groupId}/locations`],
    enabled: !!groupId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/chain/${groupId}/locations`] });
  };

  const drillInto = (hospitalId: string) => {
    sessionStorage.setItem("chain.drilledInto", "true");
    const userHospitals = (user as any)?.hospitals ?? [];
    const match = userHospitals.find((h: any) => h.id === hospitalId && h.role === "admin")
      ?? userHospitals.find((h: any) => h.id === hospitalId);
    if (match) {
      localStorage.setItem("activeHospital", `${match.id}-${match.unitId}-${match.role}`);
    }
    navigate("/business");
    setTimeout(() => window.location.reload(), 20);
  };

  if (!groupId) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="chain-locations-no-group">
        {t("chain.locations.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="chain-locations">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">{t("chain.locations.title", "Locations")}</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-location">
              <Plus className="h-4 w-4 mr-2" />
              {t("chain.locations.add", "Add clinic")}
            </Button>
          </DialogTrigger>
          <AddLocationDialog
            groupId={groupId}
            defaultTimezone={activeHospital?.timezone ?? "Europe/Zurich"}
            defaultCurrency={activeHospital?.currency ?? "CHF"}
            onClose={() => setAddOpen(false)}
            onSuccess={() => {
              setAddOpen(false);
              invalidate();
              toast({ title: t("chain.locations.addedToast", "Clinic added") });
            }}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">{t("common.loading", "Loading...")}</div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("chain.locations.tableTitle", "Locations in this chain")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("chain.locations.name", "Name")}</TableHead>
                    <TableHead>{t("chain.locations.address", "Address")}</TableHead>
                    <TableHead>{t("chain.locations.kind", "Kind")}</TableHead>
                    <TableHead>{t("chain.locations.plan", "Plan")}</TableHead>
                    <TableHead>{t("chain.locations.pricePerRecord", "Price / record")}</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.locations ?? []).map((loc) => (
                    <TableRow
                      key={loc.hospitalId}
                      className="cursor-pointer hover:bg-muted/50"
                      data-testid={`row-location-${loc.hospitalId}`}
                    >
                      <TableCell className="font-medium" onClick={() => drillInto(loc.hospitalId)}>{loc.hospitalName}</TableCell>
                      <TableCell className="text-muted-foreground" onClick={() => drillInto(loc.hospitalId)}>{loc.address ?? "—"}</TableCell>
                      <TableCell onClick={() => drillInto(loc.hospitalId)}>{loc.clinicKind}</TableCell>
                      <TableCell onClick={() => drillInto(loc.hospitalId)}>{loc.licenseType}</TableCell>
                      <TableCell onClick={() => drillInto(loc.hospitalId)}>{loc.pricePerRecord ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); setEditing(loc); }}
                          data-testid={`edit-location-${loc.hospitalId}`}
                          title={t("common.edit", "Edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={(e) => { e.stopPropagation(); setArchiving(loc); }}
                          data-testid={`archive-location-${loc.hospitalId}`}
                          title={t("chain.locations.archive", "Archive")}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <GroupPlanPanel
            groupId={groupId}
            defaults={data?.groupDefaults ?? { defaultLicenseType: null, defaultPricePerRecord: null }}
            onSaved={invalidate}
          />
        </>
      )}

      {editing && (
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <EditLocationDialog
            groupId={groupId}
            location={editing}
            onClose={() => setEditing(null)}
            onSuccess={() => {
              setEditing(null);
              invalidate();
              toast({ title: t("chain.locations.savedToast", "Saved") });
            }}
          />
        </Dialog>
      )}

      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chain.locations.archiveTitle", "Archive clinic?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "chain.locations.archiveBody",
                "{{name}} will be detached from the chain. The clinic data stays intact but you'll lose chain admin access there.",
                { name: archiving?.hospitalName ?? "" }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!archiving) return;
                try {
                  await apiRequest("DELETE", `/api/chain/${groupId}/locations/${archiving.hospitalId}`);
                  invalidate();
                  toast({ title: t("chain.locations.archivedToast", "Clinic archived") });
                } catch (e: any) {
                  toast({ title: t("common.error", "Error"), description: e?.message, variant: "destructive" });
                }
                setArchiving(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-archive-location"
            >
              {t("chain.locations.archive", "Archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddLocationDialog({
  groupId,
  defaultTimezone,
  defaultCurrency,
  onClose,
  onSuccess,
}: {
  groupId: string;
  defaultTimezone: string;
  defaultCurrency: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    address: "",
    timezone: defaultTimezone,
    currency: defaultCurrency,
    clinicKind: "mixed" as ClinicKind,
  });
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/chain/${groupId}/locations`, form).then((r) => r.json()),
    onSuccess,
    onError: (e: any) =>
      toast({ title: t("common.error", "Error"), description: e?.message, variant: "destructive" }),
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("chain.locations.addTitle", "Add clinic")}</DialogTitle>
        <DialogDescription>{t("chain.locations.addDescription", "Create a new clinic in this chain.")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>{t("chain.locations.name", "Name")}</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-location-name" />
        </div>
        <div>
          <Label>{t("chain.locations.address", "Address")}</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <Label>{t("chain.locations.timezone", "Timezone")}</Label>
          <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        </div>
        <div>
          <Label>{t("chain.locations.currency", "Currency")}</Label>
          <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </div>
        <div>
          <Label>{t("chain.locations.kind", "Clinic kind")}</Label>
          <Select value={form.clinicKind} onValueChange={(v) => setForm({ ...form, clinicKind: v as ClinicKind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aesthetic">{t("admin.clinicKindAesthetic", "Aesthetic (treatments only)")}</SelectItem>
              <SelectItem value="surgical">{t("admin.clinicKindSurgical", "Surgical (surgeries only)")}</SelectItem>
              <SelectItem value="mixed">{t("admin.clinicKindMixed", "Mixed (both)")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!form.name.trim() || mutation.isPending}
          data-testid="button-submit-add-location"
        >
          {t("chain.locations.create", "Create")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditLocationDialog({ groupId, location, onClose, onSuccess }: { groupId: string; location: Location; onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: location.hospitalName,
    address: location.address ?? "",
    clinicKind: location.clinicKind,
    licenseType: location.licenseType,
    pricePerRecord: location.pricePerRecord ?? "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/chain/${groupId}/locations/${location.hospitalId}`, {
        name: form.name,
        address: form.address || null,
        clinicKind: form.clinicKind,
        licenseType: form.licenseType,
        pricePerRecord: form.pricePerRecord || null,
      }).then((r) => r.json()),
    onSuccess,
    onError: (e: any) =>
      toast({ title: t("common.error", "Error"), description: e?.message, variant: "destructive" }),
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("chain.locations.editTitle", "Edit clinic")}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>{t("chain.locations.name", "Name")}</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>{t("chain.locations.address", "Address")}</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <Label>{t("chain.locations.kind", "Clinic kind")}</Label>
          <Select value={form.clinicKind} onValueChange={(v) => setForm({ ...form, clinicKind: v as ClinicKind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aesthetic">{t("admin.clinicKindAesthetic", "Aesthetic (treatments only)")}</SelectItem>
              <SelectItem value="surgical">{t("admin.clinicKindSurgical", "Surgical (surgeries only)")}</SelectItem>
              <SelectItem value="mixed">{t("admin.clinicKindMixed", "Mixed (both)")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("chain.locations.plan", "Plan")}</Label>
          <Select value={form.licenseType} onValueChange={(v) => setForm({ ...form, licenseType: v as LicenseType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="free">free</SelectItem>
              <SelectItem value="basic">basic</SelectItem>
              <SelectItem value="test">test</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("chain.locations.pricePerRecord", "Price / record")}</Label>
          <Input value={form.pricePerRecord} onChange={(e) => setForm({ ...form, pricePerRecord: e.target.value })} placeholder="e.g. 5.00" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!form.name.trim() || mutation.isPending}
        >
          {t("common.save", "Save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function GroupPlanPanel({
  groupId,
  defaults,
  onSaved,
}: {
  groupId: string;
  defaults: LocationsResponse["groupDefaults"];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [licenseType, setLicenseType] = useState<LicenseType>(defaults.defaultLicenseType ?? "test");
  const [pricePerRecord, setPricePerRecord] = useState(defaults.defaultPricePerRecord ?? "");
  const [cascade, setCascade] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/chain/${groupId}/billing`, {
        defaultLicenseType: licenseType,
        defaultPricePerRecord: pricePerRecord || null,
        cascade,
      }),
    onSuccess: () => {
      onSaved();
      toast({ title: t("chain.locations.planSavedToast", "Plan defaults saved") });
    },
    onError: (e: any) =>
      toast({ title: t("common.error", "Error"), description: e?.message, variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("chain.locations.groupPlanTitle", "Group plan defaults")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("chain.locations.groupPlanHelp", "Defaults used for new clinics. Toggle Cascade to also overwrite all existing members.")}
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label>{t("chain.locations.defaultPlan", "Default plan")}</Label>
            <Select value={licenseType} onValueChange={(v) => setLicenseType(v as LicenseType)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">free</SelectItem>
                <SelectItem value="basic">basic</SelectItem>
                <SelectItem value="test">test</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("chain.locations.defaultPrice", "Default price / record")}</Label>
            <Input className="w-[160px]" value={pricePerRecord} onChange={(e) => setPricePerRecord(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              id="cascade"
              checked={cascade}
              onChange={(e) => setCascade(e.target.checked)}
              data-testid="checkbox-cascade"
            />
            <Label htmlFor="cascade" className="cursor-pointer">{t("chain.locations.cascade", "Cascade to existing clinics")}</Label>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-plan">
            {t("common.save", "Save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
