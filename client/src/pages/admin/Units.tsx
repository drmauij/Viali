import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Unit, Hospital } from "@shared/schema";

interface HospitalForm {
  name: string;
  companyName: string;
  companyStreet: string;
  companyPostalCode: string;
  companyCity: string;
  companyPhone: string;
  companyFax: string;
  companyEmail: string;
  companyLogoUrl: string;
}

const defaultHospitalForm: HospitalForm = {
  name: "",
  companyName: "",
  companyStreet: "",
  companyPostalCode: "",
  companyCity: "",
  companyPhone: "",
  companyFax: "",
  companyEmail: "",
  companyLogoUrl: "",
};

export default function Units() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Hospital form states
  const [hospitalDialogOpen, setHospitalDialogOpen] = useState(false);
  const [hospitalForm, setHospitalForm] = useState<HospitalForm>(defaultHospitalForm);

  // Unit states
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState({
    name: "",
    type: "",
  });

  // Check if user is admin
  const isAdmin = activeHospital?.role === "admin";

  // Fetch units
  const { data: units = [], isLoading: unitsLoading } = useQuery<Unit[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/units`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Unit mutations
  const createUnitMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/units`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      setUnitDialogOpen(false);
      resetUnitForm();
      toast({ title: t("common.success"), description: t("admin.unitCreatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateUnit"), variant: "destructive" });
    },
  });

  const updateUnitMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/units/${id}`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      setUnitDialogOpen(false);
      resetUnitForm();
      toast({ title: t("common.success"), description: t("admin.unitUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateUnit"), variant: "destructive" });
    },
  });

  const deleteUnitMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/units/${id}?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      toast({ title: t("common.success"), description: t("admin.unitDeletedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToDeleteUnit"), variant: "destructive" });
    },
  });

  // Fetch hospital data for edit dialog
  const { data: hospitalData, refetch: refetchHospital } = useQuery<Hospital>({
    queryKey: ['/api/admin', activeHospital?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/${activeHospital?.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch hospital');
      return res.json();
    },
    enabled: !!activeHospital?.id && isAdmin && hospitalDialogOpen,
  });

  // Update form when hospital data is loaded
  useEffect(() => {
    if (hospitalData && hospitalDialogOpen) {
      setHospitalForm({
        name: hospitalData.name || "",
        companyName: (hospitalData as any).companyName || "",
        companyStreet: (hospitalData as any).companyStreet || "",
        companyPostalCode: (hospitalData as any).companyPostalCode || "",
        companyCity: (hospitalData as any).companyCity || "",
        companyPhone: (hospitalData as any).companyPhone || "",
        companyFax: (hospitalData as any).companyFax || "",
        companyEmail: (hospitalData as any).companyEmail || "",
        companyLogoUrl: (hospitalData as any).companyLogoUrl || "",
      });
    }
  }, [hospitalData, hospitalDialogOpen]);

  // Hospital mutation
  const updateHospitalMutation = useMutation({
    mutationFn: async (formData: HospitalForm) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, formData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin', activeHospital?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', activeHospital?.id, 'company-data'] });
      setHospitalDialogOpen(false);
      toast({ title: t("common.success"), description: t("admin.hospitalUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateHospital"), variant: "destructive" });
    },
  });

  const resetUnitForm = () => {
    setUnitForm({ name: "", type: "" });
    setEditingUnit(null);
  };

  const handleAddUnit = () => {
    resetUnitForm();
    setUnitDialogOpen(true);
  };

  const handleEditUnit = (unit: Unit) => {
    setEditingUnit(unit);
    setUnitForm({
      name: unit.name,
      type: unit.type || "",
    });
    setUnitDialogOpen(true);
  };

  const handleSaveUnit = () => {
    if (!unitForm.name) {
      toast({ title: t("common.error"), description: t("admin.unitNameRequired"), variant: "destructive" });
      return;
    }

    const data = {
      name: unitForm.name,
      type: unitForm.type || null,
    };

    if (editingUnit) {
      updateUnitMutation.mutate({ id: editingUnit.id, data });
    } else {
      createUnitMutation.mutate(data);
    }
  };

  const handleEditHospital = () => {
    setHospitalForm({
      name: activeHospital?.name || "",
      companyName: "",
      companyStreet: "",
      companyPostalCode: "",
      companyCity: "",
      companyPhone: "",
      companyFax: "",
      companyEmail: "",
      companyLogoUrl: "",
    });
    setHospitalDialogOpen(true);
  };

  const handleSaveHospital = () => {
    if (!hospitalForm.name.trim()) {
      toast({ title: t("common.error"), description: t("admin.hospitalNameRequired"), variant: "destructive" });
      return;
    }
    updateHospitalMutation.mutate(hospitalForm);
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noHospitalSelected")}</h3>
          <p className="text-muted-foreground">{t("admin.selectHospitalFirst")}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-lock text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.adminAccessRequired")}</h3>
          <p className="text-muted-foreground">{t("admin.adminPrivilegesNeeded")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("admin.units")}</h1>
      </div>

      {/* Hospital Info Card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg">{activeHospital?.name}</h3>
            <p className="text-sm text-muted-foreground">{t("admin.hospitalName")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEditHospital}
            data-testid="button-edit-hospital"
          >
            <i className="fas fa-edit mr-2"></i>
            {t("admin.edit")}
          </Button>
        </div>
      </div>

      {/* Units Content */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-foreground">{t("admin.units")}</h2>
          <Button onClick={handleAddUnit} size="sm" data-testid="button-add-unit">
            <i className="fas fa-plus mr-2"></i>
            {t("admin.addUnit")}
          </Button>
        </div>

        {unitsLoading ? (
          <div className="text-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
          </div>
        ) : units.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <i className="fas fa-location-dot text-4xl text-muted-foreground mb-4"></i>
            <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noUnits")}</h3>
            <p className="text-muted-foreground mb-4">{t("admin.noUnitsMessage")}</p>
            <Button onClick={handleAddUnit} size="sm">
              <i className="fas fa-plus mr-2"></i>
              {t("admin.addUnit")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {units.map((unit) => (
              <div key={unit.id} className="bg-card border border-border rounded-lg p-4" data-testid={`unit-${unit.id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{unit.name}</h3>
                    {unit.type && (
                      <p className="text-sm text-muted-foreground">{unit.type}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUnit(unit)}
                      data-testid={`button-edit-unit-${unit.id}`}
                    >
                      <i className="fas fa-edit"></i>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(t("admin.deleteUnitConfirm"))) {
                          deleteUnitMutation.mutate(unit.id);
                        }
                      }}
                      data-testid={`button-delete-unit-${unit.id}`}
                    >
                      <i className="fas fa-trash text-destructive"></i>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unit Dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? t("admin.editUnit") : t("admin.addUnit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="unit-name">{t("admin.unitName")} *</Label>
              <Input
                id="unit-name"
                value={unitForm.name}
                onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                placeholder={t("admin.unitPlaceholder")}
                data-testid="input-unit-name"
              />
            </div>
            <div>
              <Label htmlFor="unit-type">{t("admin.type")}</Label>
              <Input
                id="unit-type"
                value={unitForm.type}
                onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })}
                placeholder={t("admin.typePlaceholder")}
                data-testid="input-unit-type"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveUnit}
                disabled={createUnitMutation.isPending || updateUnitMutation.isPending}
                data-testid="button-save-unit"
              >
                {editingUnit ? t("common.edit") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hospital Edit Dialog */}
      <Dialog open={hospitalDialogOpen} onOpenChange={setHospitalDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("admin.editHospital")}</DialogTitle>
            <DialogDescription>{t("admin.editHospitalDescription")}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="hospital-name">{t("admin.hospitalNameLabel")} *</Label>
                <Input
                  id="hospital-name"
                  value={hospitalForm.name}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, name: e.target.value })}
                  placeholder={t("admin.hospitalNamePlaceholder")}
                  data-testid="input-hospital-name"
                />
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-3">
                  {t("admin.invoiceData")}
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="company-name">{t("admin.companyName")}</Label>
                    <Input
                      id="company-name"
                      value={hospitalForm.companyName}
                      onChange={(e) => setHospitalForm({ ...hospitalForm, companyName: e.target.value })}
                      placeholder={t("admin.companyNamePlaceholder")}
                      data-testid="input-company-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="company-street">{t("admin.street")}</Label>
                    <Input
                      id="company-street"
                      value={hospitalForm.companyStreet}
                      onChange={(e) => setHospitalForm({ ...hospitalForm, companyStreet: e.target.value })}
                      data-testid="input-company-street"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="company-postal">{t("admin.postalCode")}</Label>
                      <Input
                        id="company-postal"
                        value={hospitalForm.companyPostalCode}
                        onChange={(e) => setHospitalForm({ ...hospitalForm, companyPostalCode: e.target.value })}
                        data-testid="input-company-postal"
                      />
                    </div>
                    <div>
                      <Label htmlFor="company-city">{t("admin.city")}</Label>
                      <Input
                        id="company-city"
                        value={hospitalForm.companyCity}
                        onChange={(e) => setHospitalForm({ ...hospitalForm, companyCity: e.target.value })}
                        data-testid="input-company-city"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="company-phone">{t("admin.phone")}</Label>
                      <Input
                        id="company-phone"
                        value={hospitalForm.companyPhone}
                        onChange={(e) => setHospitalForm({ ...hospitalForm, companyPhone: e.target.value })}
                        data-testid="input-company-phone"
                      />
                    </div>
                    <div>
                      <Label htmlFor="company-fax">{t("admin.fax")}</Label>
                      <Input
                        id="company-fax"
                        value={hospitalForm.companyFax}
                        onChange={(e) => setHospitalForm({ ...hospitalForm, companyFax: e.target.value })}
                        data-testid="input-company-fax"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="company-email">{t("admin.email")}</Label>
                    <Input
                      id="company-email"
                      type="email"
                      value={hospitalForm.companyEmail}
                      onChange={(e) => setHospitalForm({ ...hospitalForm, companyEmail: e.target.value })}
                      data-testid="input-company-email"
                    />
                  </div>

                  <div>
                    <Label htmlFor="company-logo">{t("admin.logoUrl")}</Label>
                    <Input
                      id="company-logo"
                      value={hospitalForm.companyLogoUrl}
                      onChange={(e) => setHospitalForm({ ...hospitalForm, companyLogoUrl: e.target.value })}
                      placeholder="https://..."
                      data-testid="input-company-logo"
                    />
                    {hospitalForm.companyLogoUrl && (
                      <div className="mt-2 p-2 border rounded">
                        <img 
                          src={hospitalForm.companyLogoUrl} 
                          alt="Logo preview" 
                          className="max-h-16 object-contain"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setHospitalDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveHospital}
              disabled={updateHospitalMutation.isPending}
              data-testid="button-save-hospital"
            >
              {updateHospitalMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
