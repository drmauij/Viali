import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Location, UserHospitalRole, User } from "@shared/schema";

interface HospitalUser extends UserHospitalRole {
  user: User;
  location: Location;
}

interface GroupedHospitalUser extends HospitalUser {
  roles: Array<{ role: string; location: Location; roleId: string; locationId: string }>;
}

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  
  console.log('[Admin] Active hospital:', activeHospital);
  
  const [activeTab, setActiveTab] = useState<"locations" | "users" | "checklists">("locations");
  const { toast } = useToast();

  // Hospital name states
  const [hospitalDialogOpen, setHospitalDialogOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState(activeHospital?.name || "");

  // Location states
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locationForm, setLocationForm] = useState({
    name: "",
    type: "",
  });

  // User states
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUserDetails, setEditingUserDetails] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    locationId: "",
    role: "",
  });
  const [roleLocationPairs, setRoleLocationPairs] = useState<Array<{ id?: string; role: string; locationId: string }>>([]);
  const [newPair, setNewPair] = useState({ role: "", locationId: "" });

  // Checklist template states
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    recurrency: "",
    items: [] as string[],
    locationId: "",
    role: "",
    startDate: new Date().toISOString().split('T')[0],
  });
  const [newTemplateItem, setNewTemplateItem] = useState("");

  // Check if user is admin
  const isAdmin = activeHospital?.role === "admin";

  // Fetch locations - hospital-wide, not filtered by location
  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/locations`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Fetch users - hospital-wide, not filtered by location
  const { data: rawUsers = [], isLoading: usersLoading } = useQuery<HospitalUser[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/users`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Group users by user ID to show each user only once with all their roles
  const users = useMemo(() => {
    const grouped = new Map<string, GroupedHospitalUser>();
    
    rawUsers.forEach(userRole => {
      const userId = userRole.user.id;
      if (!grouped.has(userId)) {
        grouped.set(userId, {
          ...userRole,
          roles: [{
            role: userRole.role,
            location: userRole.location,
            roleId: userRole.id,
            locationId: userRole.locationId
          }]
        });
      } else {
        const existing = grouped.get(userId)!;
        existing.roles.push({
          role: userRole.role,
          location: userRole.location,
          roleId: userRole.id,
          locationId: userRole.locationId
        });
      }
    });
    
    return Array.from(grouped.values());
  }, [rawUsers]);

  // Location mutations
  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/locations`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/locations`] });
      setLocationDialogOpen(false);
      resetLocationForm();
      toast({ title: t("common.success"), description: t("admin.locationCreatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateLocation"), variant: "destructive" });
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/locations/${id}`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/locations`] });
      setLocationDialogOpen(false);
      resetLocationForm();
      toast({ title: t("common.success"), description: t("admin.locationUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateLocation"), variant: "destructive" });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/locations/${id}?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/locations`] });
      toast({ title: t("common.success"), description: t("admin.locationDeletedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToDeleteLocation"), variant: "destructive" });
    },
  });

  // User mutations
  const createUserRoleMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/users`, data);
      return await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.roleLocationAdded") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToAddRoleLocation"), variant: "destructive" });
    },
  });

  const deleteUserRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${id}?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.roleLocationRemoved") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToRemoveRoleLocation"), variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/users/create`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      setUserDialogOpen(false);
      resetUserForm();
      toast({ title: t("common.success"), description: t("admin.userCreatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateUser"), variant: "destructive" });
    },
  });

  const updateUserDetailsMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { firstName: string; lastName: string } }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/details`, { 
        ...data,
        hospitalId: activeHospital?.id 
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.userDetailsUpdated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateUserDetails"), variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!activeHospital?.id) {
        throw new Error("No active hospital selected");
      }
      console.log('[Admin] Deleting user:', userId, 'for hospital:', activeHospital.id);
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}/delete?hospitalId=${activeHospital.id}`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ 
        title: t("common.success"), 
        description: data.message || t("admin.userDeletedSuccess")
      });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToDeleteUser"), variant: "destructive" });
    },
  });

  // Hospital mutations
  const updateHospitalMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { name });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setHospitalDialogOpen(false);
      toast({ title: t("common.success"), description: t("admin.hospitalNameUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateHospitalName"), variant: "destructive" });
    },
  });

  // Fetch checklist templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: [`/api/checklists/templates/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Template mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/checklists/templates`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/templates/${activeHospital?.id}`] });
      setTemplateDialogOpen(false);
      resetTemplateForm();
      toast({ title: t("common.success"), description: t("admin.templateCreatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateTemplate"), variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/checklists/templates/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/templates/${activeHospital?.id}`] });
      setTemplateDialogOpen(false);
      resetTemplateForm();
      toast({ title: t("common.success"), description: t("admin.templateUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateTemplate"), variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/checklists/templates/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/templates/${activeHospital?.id}`] });
      toast({ title: t("common.success"), description: t("admin.templateDeletedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToDeleteTemplate"), variant: "destructive" });
    },
  });

  const resetLocationForm = () => {
    setLocationForm({ name: "", type: "" });
    setEditingLocation(null);
  };

  const resetUserForm = () => {
    setUserForm({ email: "", password: "", firstName: "", lastName: "", locationId: "", role: "" });
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: "",
      recurrency: "",
      items: [],
      locationId: "",
      role: "",
      startDate: new Date().toISOString().split('T')[0],
    });
    setNewTemplateItem("");
    setEditingTemplate(null);
  };

  const handleAddLocation = () => {
    resetLocationForm();
    setLocationDialogOpen(true);
  };

  const handleEditLocation = (location: Location) => {
    setEditingLocation(location);
    setLocationForm({
      name: location.name,
      type: location.type || "",
    });
    setLocationDialogOpen(true);
  };

  const handleSaveLocation = () => {
    if (!locationForm.name) {
      toast({ title: t("common.error"), description: t("admin.locationNameRequired"), variant: "destructive" });
      return;
    }

    const data = {
      name: locationForm.name,
      type: locationForm.type || null,
    };

    if (editingLocation) {
      updateLocationMutation.mutate({ id: editingLocation.id, data });
    } else {
      createLocationMutation.mutate(data);
    }
  };

  const handleCreateUser = () => {
    resetUserForm();
    setUserDialogOpen(true);
  };

  const handleEditUser = (user: GroupedHospitalUser) => {
    // For grouped users, use the roles array directly
    const userPairs = user.roles?.map((r: any) => ({ 
      id: r.roleId, 
      role: r.role, 
      locationId: r.locationId 
    })) || [];
    
    setEditingUserDetails(user.user);
    setUserForm({
      ...userForm,
      firstName: user.user.firstName || "",
      lastName: user.user.lastName || "",
    });
    setRoleLocationPairs(userPairs);
    setNewPair({ role: "", locationId: "" });
    setEditUserDialogOpen(true);
  };

  // Sync roleLocationPairs when users query updates (after mutations)
  useEffect(() => {
    if (editingUserDetails && users) {
      const user = users.find(u => u.user.id === editingUserDetails.id);
      if (user) {
        const userPairs = user.roles?.map((r: any) => ({ 
          id: r.roleId, 
          role: r.role, 
          locationId: r.locationId 
        })) || [];
        setRoleLocationPairs(userPairs);
      }
    }
  }, [users, editingUserDetails]);

  const handleDeleteUser = (user: HospitalUser) => {
    if (window.confirm(t("admin.deleteUserConfirm", { firstName: user.user.firstName, lastName: user.user.lastName }))) {
      deleteUserMutation.mutate(user.user.id);
    }
  };

  const handleSaveUser = () => {
    if (!userForm.email || !userForm.password || !userForm.firstName || !userForm.lastName || !userForm.locationId || !userForm.role) {
      toast({ title: t("common.error"), description: t("admin.allFieldsRequired"), variant: "destructive" });
      return;
    }
    if (userForm.password.length < 6) {
      toast({ title: t("common.error"), description: t("admin.passwordMinLength"), variant: "destructive" });
      return;
    }
    createUserMutation.mutate(userForm);
  };

  const handleSaveUserDetails = async () => {
    if (!editingUserDetails) return;
    
    if (!userForm.firstName.trim() || !userForm.lastName.trim()) {
      toast({ title: t("common.error"), description: t("admin.nameRequired"), variant: "destructive" });
      return;
    }

    // Update user details
    await updateUserDetailsMutation.mutateAsync({
      userId: editingUserDetails.id,
      data: {
        firstName: userForm.firstName,
        lastName: userForm.lastName,
      }
    });

    setEditUserDialogOpen(false);
    setEditingUserDetails(null);
    setRoleLocationPairs([]);
  };

  const handleAddRoleLocation = async () => {
    // Prevent double-clicks while mutation is pending
    if (createUserRoleMutation.isPending) return;

    if (!newPair.role || !newPair.locationId) {
      toast({ title: t("common.error"), description: t("admin.roleAndLocationRequired"), variant: "destructive" });
      return;
    }

    // Check for duplicates
    const isDuplicate = roleLocationPairs.some(
      pair => pair.role === newPair.role && pair.locationId === newPair.locationId
    );

    if (isDuplicate) {
      toast({ title: t("common.error"), description: t("admin.duplicateRoleLocation"), variant: "destructive" });
      return;
    }

    if (!editingUserDetails) return;

    // Optimistically add to local state with temporary ID
    const tempId = `temp-${Date.now()}`;
    const optimisticPair = { id: tempId, role: newPair.role, locationId: newPair.locationId };
    setRoleLocationPairs([...roleLocationPairs, optimisticPair]);

    try {
      await createUserRoleMutation.mutateAsync({
        userId: editingUserDetails.id,
        role: newPair.role,
        locationId: newPair.locationId,
      });

      // Reset new pair (useEffect will replace temp ID with real ID when query refetches)
      setNewPair({ role: "", locationId: "" });
    } catch (error) {
      // Roll back optimistic update on error using current state
      setRoleLocationPairs(prev => prev.filter(p => p.id !== tempId));
    }
  };

  const handleRemoveRoleLocation = async (pairId: string) => {
    // Prevent double-clicks while mutation is pending
    if (deleteUserRoleMutation.isPending) return;

    if (window.confirm(t("admin.removeRoleLocationConfirm"))) {
      await deleteUserRoleMutation.mutateAsync(pairId);
      // useEffect will update roleLocationPairs when query refetches
    }
  };

  // Template handlers
  const handleAddTemplate = () => {
    resetTemplateForm();
    setTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      recurrency: template.recurrency,
      items: template.items || [],
      locationId: template.locationId || "",
      role: template.role || "",
      startDate: template.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
    });
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!templateForm.name.trim()) {
      toast({ title: t("common.error"), description: t("admin.templateNameRequired"), variant: "destructive" });
      return;
    }
    if (!templateForm.recurrency) {
      toast({ title: t("common.error"), description: t("admin.recurrencyRequired"), variant: "destructive" });
      return;
    }
    if (templateForm.items.length === 0) {
      toast({ title: t("common.error"), description: t("admin.atLeastOneItem"), variant: "destructive" });
      return;
    }

    const data = {
      name: templateForm.name,
      recurrency: templateForm.recurrency,
      items: templateForm.items,
      locationId: templateForm.locationId || null,
      role: templateForm.role || null,
      startDate: templateForm.startDate,
    };

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleAddTemplateItem = () => {
    if (!newTemplateItem.trim()) {
      toast({ title: t("common.error"), description: t("admin.itemRequired"), variant: "destructive" });
      return;
    }
    setTemplateForm({
      ...templateForm,
      items: [...templateForm.items, newTemplateItem.trim()],
    });
    setNewTemplateItem("");
  };

  const handleRemoveTemplateItem = (index: number) => {
    setTemplateForm({
      ...templateForm,
      items: templateForm.items.filter((_, i) => i !== index),
    });
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case "admin": return t("admin.roleAdmin");
      case "doctor": return t("admin.roleDoctor");
      case "nurse": return t("admin.roleNurse");
      default: return role;
    }
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

  const handleEditHospitalName = () => {
    setHospitalName(activeHospital?.name || "");
    setHospitalDialogOpen(true);
  };

  const handleSaveHospitalName = () => {
    if (!hospitalName.trim()) {
      toast({ title: t("common.error"), description: t("admin.hospitalNameRequired"), variant: "destructive" });
      return;
    }
    updateHospitalMutation.mutate(hospitalName);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("admin.adminPanel")}</h1>
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
            onClick={handleEditHospitalName}
            data-testid="button-edit-hospital"
          >
            <i className="fas fa-edit mr-2"></i>
            {t("admin.editName")}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "locations"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setActiveTab("locations")}
          data-testid="tab-locations"
        >
          <i className="fas fa-location-dot mr-2"></i>
          {t("admin.locations")}
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "users"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setActiveTab("users")}
          data-testid="tab-users"
        >
          <i className="fas fa-users mr-2"></i>
          {t("admin.usersAndRoles")}
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "checklists"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setActiveTab("checklists")}
          data-testid="tab-checklists"
        >
          <i className="fas fa-clipboard-check mr-2"></i>
          {t("admin.checklists")}
        </button>
      </div>

      {/* Locations Tab */}
      {activeTab === "locations" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">{t("admin.locations")}</h2>
            <Button onClick={handleAddLocation} size="sm" data-testid="button-add-location">
              <i className="fas fa-plus mr-2"></i>
              {t("admin.addLocation")}
            </Button>
          </div>

          {locationsLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : locations.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-location-dot text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noLocations")}</h3>
              <p className="text-muted-foreground mb-4">{t("admin.noLocationsMessage")}</p>
              <Button onClick={handleAddLocation} size="sm">
                <i className="fas fa-plus mr-2"></i>
                {t("admin.addLocation")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map((location) => (
                <div key={location.id} className="bg-card border border-border rounded-lg p-4" data-testid={`location-${location.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{location.name}</h3>
                      {location.type && (
                        <p className="text-sm text-muted-foreground">{location.type}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditLocation(location)}
                        data-testid={`button-edit-location-${location.id}`}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(t("admin.deleteLocationConfirm"))) {
                            deleteLocationMutation.mutate(location.id);
                          }
                        }}
                        data-testid={`button-delete-location-${location.id}`}
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
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">{t("admin.usersAndRoles")}</h2>
            <Button onClick={handleCreateUser} size="sm" data-testid="button-create-user">
              <i className="fas fa-user-plus mr-2"></i>
              {t("admin.createNewUser")}
            </Button>
          </div>

          {usersLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-users text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noUsers")}</h3>
              <p className="text-muted-foreground mb-4">{t("admin.noUsersMessage")}</p>
              <Button onClick={handleCreateUser} size="sm">
                <i className="fas fa-user-plus mr-2"></i>
                {t("admin.createNewUser")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.user.id} className="bg-card border border-border rounded-lg p-4" data-testid={`user-${user.user.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">
                        {user.user.firstName} {user.user.lastName}
                      </h3>
                      <p className="text-sm text-muted-foreground">{user.user.email}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {user.roles.map((roleInfo, idx) => (
                          <div key={idx} className="flex gap-1 items-center">
                            <span className="status-chip chip-primary text-xs">{getRoleName(roleInfo.role)}</span>
                            <span className="status-chip chip-muted text-xs">{roleInfo.location.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditUser(user)}
                        data-testid={`button-edit-user-${user.user.id}`}
                        title={t("admin.editUser")}
                      >
                        <i className="fas fa-user-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteUser(user)}
                        data-testid={`button-delete-user-${user.user.id}`}
                        title={t("admin.deleteUser")}
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
      )}

      {/* Checklists Tab */}
      {activeTab === "checklists" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">{t("admin.checklists")}</h2>
            <Button onClick={handleAddTemplate} size="sm" data-testid="button-add-template">
              <i className="fas fa-plus mr-2"></i>
              {t("admin.addTemplate")}
            </Button>
          </div>

          {templatesLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-clipboard-check text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noTemplates")}</h3>
              <p className="text-muted-foreground mb-4">{t("admin.noTemplatesMessage")}</p>
              <Button onClick={handleAddTemplate} size="sm">
                <i className="fas fa-plus mr-2"></i>
                {t("admin.addTemplate")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="bg-card border border-border rounded-lg p-4" data-testid={`template-${template.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{template.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-2 text-sm text-muted-foreground">
                        <span className="status-chip chip-primary text-xs">
                          {t(`checklists.recurrency.${template.recurrency}`)}
                        </span>
                        {template.role && (
                          <span className="status-chip chip-muted text-xs">
                            {t(`checklists.role.${template.role}`)}
                          </span>
                        )}
                        {template.location && (
                          <span className="status-chip chip-muted text-xs">
                            {template.location.name}
                          </span>
                        )}
                        <span className="text-xs">
                          {template.items?.length || 0} {t("checklists.items")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditTemplate(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(t("admin.deleteTemplateConfirm"))) {
                            deleteTemplateMutation.mutate(template.id);
                          }
                        }}
                        data-testid={`button-delete-template-${template.id}`}
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
      )}

      {/* Location Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLocation ? t("admin.editLocation") : t("admin.addLocation")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="location-name">{t("admin.locationName")} *</Label>
              <Input
                id="location-name"
                value={locationForm.name}
                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                placeholder={t("admin.locationPlaceholder")}
                data-testid="input-location-name"
              />
            </div>
            <div>
              <Label htmlFor="location-type">{t("admin.type")}</Label>
              <Input
                id="location-type"
                value={locationForm.type}
                onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value })}
                placeholder={t("admin.typePlaceholder")}
                data-testid="input-location-type"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveLocation}
                disabled={createLocationMutation.isPending || updateLocationMutation.isPending}
                data-testid="button-save-location"
              >
                {editingLocation ? t("common.edit") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.createNewUser")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-email">{t("admin.email")} *</Label>
              <Input
                id="user-email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                placeholder={t("admin.emailPlaceholder")}
                data-testid="input-user-email"
              />
            </div>
            <div>
              <Label htmlFor="user-password">{t("admin.password")} *</Label>
              <Input
                id="user-password"
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder={t("admin.passwordPlaceholder")}
                data-testid="input-user-password"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="user-first-name">{t("admin.firstName")} *</Label>
                <Input
                  id="user-first-name"
                  value={userForm.firstName}
                  onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                  placeholder={t("admin.firstNamePlaceholder")}
                  data-testid="input-user-first-name"
                />
              </div>
              <div>
                <Label htmlFor="user-last-name">{t("admin.lastName")} *</Label>
                <Input
                  id="user-last-name"
                  value={userForm.lastName}
                  onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                  placeholder={t("admin.lastNamePlaceholder")}
                  data-testid="input-user-last-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="user-location">{t("admin.location")} *</Label>
              <Select
                value={userForm.locationId}
                onValueChange={(value) => setUserForm({ ...userForm, locationId: value })}
              >
                <SelectTrigger data-testid="select-user-location">
                  <SelectValue placeholder={t("admin.selectLocation")} />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="user-role">{t("admin.role")} *</Label>
              <Select
                value={userForm.role}
                onValueChange={(value) => setUserForm({ ...userForm, role: value })}
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue placeholder={t("admin.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("admin.roleAdmin")}</SelectItem>
                  <SelectItem value="doctor">{t("admin.roleDoctor")}</SelectItem>
                  <SelectItem value="nurse">{t("admin.roleNurse")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveUser}
                disabled={createUserMutation.isPending}
                data-testid="button-save-user"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.editUser")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="edit-first-name">{t("admin.firstName")} *</Label>
                <Input
                  id="edit-first-name"
                  value={userForm.firstName}
                  onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                  placeholder={t("admin.firstNamePlaceholder")}
                  data-testid="input-edit-first-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-last-name">{t("admin.lastName")} *</Label>
                <Input
                  id="edit-last-name"
                  value={userForm.lastName}
                  onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                  placeholder={t("admin.lastNamePlaceholder")}
                  data-testid="input-edit-last-name"
                />
              </div>
            </div>

            {/* Role/Location Pairs */}
            <div className="border-t pt-4">
              <Label className="text-base font-semibold">{t("admin.roleLocationPairs")}</Label>
              <div className="space-y-2 mt-3">
                {roleLocationPairs.map((pair) => {
                  const location = locations.find(l => l.id === pair.locationId);
                  return (
                    <div key={pair.id} className="flex items-center justify-between bg-muted p-2 rounded-md">
                      <div className="flex gap-2">
                        <span className="status-chip chip-primary text-xs">{getRoleName(pair.role)}</span>
                        <span className="status-chip chip-muted text-xs">{location?.name}</span>
                      </div>
                      {pair.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRoleLocation(pair.id!)}
                          data-testid={`button-remove-pair-${pair.id}`}
                        >
                          <i className="fas fa-times text-destructive"></i>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add New Pair */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">{t("admin.addRoleLocation")}</Label>
              <div className="flex gap-2">
                <Select
                  value={newPair.role}
                  onValueChange={(value) => setNewPair({ ...newPair, role: value })}
                >
                  <SelectTrigger className="flex-1" data-testid="select-new-role">
                    <SelectValue placeholder={t("admin.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("admin.roleAdmin")}</SelectItem>
                    <SelectItem value="doctor">{t("admin.roleDoctor")}</SelectItem>
                    <SelectItem value="nurse">{t("admin.roleNurse")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={newPair.locationId}
                  onValueChange={(value) => setNewPair({ ...newPair, locationId: value })}
                >
                  <SelectTrigger className="flex-1" data-testid="select-new-location">
                    <SelectValue placeholder={t("admin.selectLocation")} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddRoleLocation}
                  disabled={createUserRoleMutation.isPending}
                  data-testid="button-add-pair"
                >
                  <i className="fas fa-plus mr-2"></i>
                  {t("admin.add")}
                </Button>
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-4">
              <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveUserDetails}
                disabled={updateUserDetailsMutation.isPending}
                data-testid="button-save-user-details"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hospital Name Dialog */}
      <Dialog open={hospitalDialogOpen} onOpenChange={setHospitalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.editHospitalName")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hospital-name">{t("admin.hospitalNameLabel")} *</Label>
              <Input
                id="hospital-name"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder={t("admin.hospitalNamePlaceholder")}
                data-testid="input-hospital-name"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setHospitalDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveHospitalName}
                disabled={updateHospitalMutation.isPending}
                data-testid="button-save-hospital"
              >
                {t("common.edit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? t("admin.editTemplate") : t("admin.addTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">{t("admin.templateName")} *</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder={t("admin.templateNamePlaceholder")}
                data-testid="input-template-name"
              />
            </div>
            <div>
              <Label htmlFor="template-recurrency">{t("admin.recurrency")} *</Label>
              <Select
                value={templateForm.recurrency}
                onValueChange={(value) => setTemplateForm({ ...templateForm, recurrency: value })}
              >
                <SelectTrigger data-testid="select-template-recurrency">
                  <SelectValue placeholder={t("admin.selectRecurrency")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("checklists.recurrency.daily")}</SelectItem>
                  <SelectItem value="weekly">{t("checklists.recurrency.weekly")}</SelectItem>
                  <SelectItem value="monthly">{t("checklists.recurrency.monthly")}</SelectItem>
                  <SelectItem value="yearly">{t("checklists.recurrency.yearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="template-location">{t("admin.location")} ({t("checklists.optional")})</Label>
                <Select
                  value={templateForm.locationId}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, locationId: value })}
                >
                  <SelectTrigger data-testid="select-template-location">
                    <SelectValue placeholder={t("admin.selectLocation")} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="template-role">{t("admin.role")} ({t("checklists.optional")})</Label>
                <Select
                  value={templateForm.role}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, role: value })}
                >
                  <SelectTrigger data-testid="select-template-role">
                    <SelectValue placeholder={t("admin.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("checklists.role.admin")}</SelectItem>
                    <SelectItem value="staff">{t("checklists.role.staff")}</SelectItem>
                    <SelectItem value="nurse">{t("checklists.role.nurse")}</SelectItem>
                    <SelectItem value="doctor">{t("checklists.role.doctor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="template-start-date">{t("admin.startDate")} *</Label>
              <Input
                id="template-start-date"
                type="date"
                value={templateForm.startDate}
                onChange={(e) => setTemplateForm({ ...templateForm, startDate: e.target.value })}
                data-testid="input-template-start-date"
              />
            </div>
            <div>
              <Label>{t("admin.checklistItems")} *</Label>
              <div className="space-y-2">
                {templateForm.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input value={item} disabled className="flex-1" data-testid={`item-${index}`} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveTemplateItem(index)}
                      data-testid={`button-remove-item-${index}`}
                    >
                      <i className="fas fa-trash text-destructive"></i>
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newTemplateItem}
                    onChange={(e) => setNewTemplateItem(e.target.value)}
                    placeholder={t("admin.addItemPlaceholder")}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTemplateItem();
                      }
                    }}
                    data-testid="input-new-item"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTemplateItem}
                    data-testid="button-add-item"
                  >
                    <i className="fas fa-plus"></i>
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                data-testid="button-save-template"
              >
                {editingTemplate ? t("common.edit") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
