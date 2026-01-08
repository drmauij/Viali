import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Trash2, Settings, Share2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ClinicService } from "@shared/schema";

interface ServiceWithUnit extends ClinicService {
  unitName?: string;
}

export default function ClinicServices() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceWithUnit | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceWithUnit | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    durationMinutes: "",
    isShared: false,
  });

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    return userHospitals[0];
  }, [user]);

  const hospitalId = activeHospital?.id;
  const unitId = activeHospital?.unitId;

  const { data: services = [], isLoading } = useQuery<ServiceWithUnit[]>({
    queryKey: ['/api/clinic', hospitalId, 'services', unitId],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/services?unitId=${unitId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch services');
      return res.json();
    },
    enabled: !!hospitalId && !!unitId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; price: string | null; durationMinutes: number | null; isShared: boolean }) => {
      return apiRequest('POST', `/api/clinic/${hospitalId}/services`, { ...data, unitId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setDialogOpen(false);
      resetForm();
      toast({ title: t('clinic.services.created') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description: string; price: string | null; durationMinutes: number | null; isShared: boolean }) => {
      return apiRequest('PATCH', `/api/clinic/${hospitalId}/services/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setDialogOpen(false);
      setEditingService(null);
      resetForm();
      toast({ title: t('clinic.services.updated') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      return apiRequest('DELETE', `/api/clinic/${hospitalId}/services/${serviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
      toast({ title: t('clinic.services.deleted') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", price: "", durationMinutes: "", isShared: false });
  };

  const handleOpenCreate = () => {
    setEditingService(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (service: ServiceWithUnit) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      price: service.price || "",
      durationMinutes: service.durationMinutes?.toString() || "",
      isShared: service.isShared || false,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: t('clinic.services.requiredFields'), variant: "destructive" });
      return;
    }

    const durationMinutes = formData.durationMinutes ? parseInt(formData.durationMinutes, 10) : null;
    const price = formData.price ? formData.price : null;

    if (editingService) {
      updateMutation.mutate({
        id: editingService.id,
        name: formData.name,
        description: formData.description,
        price,
        durationMinutes,
        isShared: formData.isShared,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        description: formData.description,
        price,
        durationMinutes,
        isShared: formData.isShared,
      });
    }
  };

  const handleConfirmDelete = () => {
    if (serviceToDelete) {
      deleteMutation.mutate(serviceToDelete.id);
    }
  };

  const filteredServices = useMemo(() => {
    return services.filter(service => 
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (service.description?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [services, searchTerm]);

  const formatPrice = (price: string | null) => {
    if (!price) return "-";
    return `CHF ${parseFloat(price).toFixed(2)}`;
  };

  if (!hospitalId) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('common.noHospitalSelected')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('clinic.services.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-services"
          />
        </div>
        <Button onClick={handleOpenCreate} data-testid="button-create-service">
          <Plus className="h-4 w-4 mr-2" />
          {t('clinic.services.create')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredServices.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {searchTerm ? t('clinic.services.noResults') : t('clinic.services.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredServices.map((service) => (
            <Card key={service.id} data-testid={`card-service-${service.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{service.name}</h3>
                      {service.isShared && (
                        <Badge variant="secondary" className="text-xs">
                          <Share2 className="h-3 w-3 mr-1" />
                          {t('clinic.services.shared')}
                        </Badge>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-lg font-semibold text-primary">
                        {formatPrice(service.price)}
                      </p>
                      {service.durationMinutes && (
                        <Badge variant="outline" className="text-xs">
                          {service.durationMinutes} min
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(service)}
                      data-testid={`button-edit-service-${service.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setServiceToDelete(service);
                        setDeleteDialogOpen(true);
                      }}
                      data-testid={`button-delete-service-${service.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingService ? t('clinic.services.edit') : t('clinic.services.create')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('clinic.services.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('clinic.services.namePlaceholder')}
                data-testid="input-service-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('clinic.services.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('clinic.services.descriptionPlaceholder')}
                rows={3}
                data-testid="input-service-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">{t('clinic.services.price')}</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-service-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">{t('clinic.services.duration', 'Duration (min)')}</Label>
                <Input
                  id="durationMinutes"
                  type="number"
                  min="1"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                  placeholder={t('clinic.services.durationPlaceholder', 'Optional')}
                  data-testid="input-service-duration"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isShared">{t('clinic.services.shareWithOtherUnits')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('clinic.services.shareDescription')}
                </p>
              </div>
              <Switch
                id="isShared"
                checked={formData.isShared}
                onCheckedChange={(checked) => setFormData({ ...formData, isShared: checked })}
                data-testid="switch-service-shared"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-service"
            >
              {editingService ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clinic.services.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('clinic.services.deleteConfirmDescription', { name: serviceToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-service"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
