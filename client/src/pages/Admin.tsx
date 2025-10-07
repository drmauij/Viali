import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
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

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeHospital] = useState(() => (user as any)?.hospitals?.[0]);
  const [activeTab, setActiveTab] = useState<"locations" | "users">("locations");
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

  // Check if user is admin
  const isAdmin = activeHospital?.role === "admin";

  // Fetch locations
  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/admin", activeHospital?.id, "locations"],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Fetch users
  const { data: users = [], isLoading: usersLoading } = useQuery<HospitalUser[]>({
    queryKey: ["/api/admin", activeHospital?.id, "users"],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Location mutations
  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/locations`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "locations"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "locations"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "locations"] });
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
      await queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
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
      await queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
      toast({ title: t("common.success"), description: t("admin.userDetailsUpdated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateUserDetails"), variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}/delete?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
      toast({ title: t("common.success"), description: t("admin.userDeletedSuccess") });
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

  const resetLocationForm = () => {
    setLocationForm({ name: "", type: "" });
    setEditingLocation(null);
  };

  const resetUserForm = () => {
    setUserForm({ email: "", password: "", firstName: "", lastName: "", locationId: "", role: "" });
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

  const handleEditUser = (user: HospitalUser) => {
    // Get all role/location pairs for this user
    const userPairs = users
      .filter(u => u.user.id === user.user.id)
      .map(u => ({ id: u.id, role: u.role, locationId: u.locationId }));
    
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
      const userPairs = users
        .filter(u => u.user.id === editingUserDetails.id)
        .map(u => ({ id: u.id, role: u.role, locationId: u.locationId }));
      setRoleLocationPairs(userPairs);
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
                <div key={user.id} className="bg-card border border-border rounded-lg p-4" data-testid={`user-${user.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {user.user.firstName} {user.user.lastName}
                      </h3>
                      <p className="text-sm text-muted-foreground">{user.user.email}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="status-chip chip-primary text-xs">{getRoleName(user.role)}</span>
                        <span className="status-chip chip-muted text-xs">{user.location.name}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditUser(user)}
                        data-testid={`button-edit-user-${user.id}`}
                        title={t("admin.editUser")}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(t("admin.removeUserConfirm"))) {
                            deleteUserRoleMutation.mutate(user.id);
                          }
                        }}
                        data-testid={`button-remove-user-${user.id}`}
                        title={t("admin.removeFromHospital")}
                      >
                        <i className="fas fa-user-minus text-warning"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteUser(user)}
                        data-testid={`button-delete-user-${user.id}`}
                        title={t("admin.deleteUserPermanently")}
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
    </div>
  );
}
