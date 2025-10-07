import { useState } from "react";
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
  const [editingUser, setEditingUser] = useState<HospitalUser | null>(null);
  const [userMode, setUserMode] = useState<"search" | "create">("search");
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    locationId: "",
    role: "",
  });
  const [searchedUser, setSearchedUser] = useState<User | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<HospitalUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

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
  const searchUserMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("GET", `/api/admin/users/search?email=${encodeURIComponent(email)}`);
      return await response.json();
    },
    onSuccess: (data) => {
      setSearchedUser(data);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.userNotFound"), variant: "destructive" });
      setSearchedUser(null);
    },
  });

  const createUserRoleMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/users`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
      setUserDialogOpen(false);
      resetUserForm();
      toast({ title: t("common.success"), description: t("admin.userAssignedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToAssignUser"), variant: "destructive" });
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${id}`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
      setUserDialogOpen(false);
      resetUserForm();
      toast({ title: t("common.success"), description: t("admin.userUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateUser"), variant: "destructive" });
    },
  });

  const deleteUserRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${id}?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
      toast({ title: t("common.success"), description: t("admin.userRemovedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToRemoveUser"), variant: "destructive" });
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

  const updatePasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/password`, { 
        password, 
        hospitalId: activeHospital?.id 
      });
      return await response.json();
    },
    onSuccess: () => {
      setPasswordDialogOpen(false);
      setNewPassword("");
      setSelectedUserForPassword(null);
      toast({ title: t("common.success"), description: t("admin.passwordUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdatePassword"), variant: "destructive" });
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
    setEditingUser(null);
    setSearchedUser(null);
    setUserMode("search");
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

  const handleAddUser = () => {
    resetUserForm();
    setUserMode("search");
    setUserDialogOpen(true);
  };

  const handleCreateUser = () => {
    resetUserForm();
    setUserMode("create");
    setUserDialogOpen(true);
  };

  const handleEditUser = (user: HospitalUser) => {
    setEditingUser(user);
    setSearchedUser(user.user);
    setUserMode("search");
    setUserForm({
      email: user.user.email || "",
      password: "",
      firstName: "",
      lastName: "",
      locationId: user.locationId,
      role: user.role,
    });
    setUserDialogOpen(true);
  };

  const handleChangePassword = (user: HospitalUser) => {
    setSelectedUserForPassword(user);
    setPasswordDialogOpen(true);
  };

  const handleSavePassword = () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: t("common.error"), description: t("admin.passwordMinLength"), variant: "destructive" });
      return;
    }
    if (selectedUserForPassword) {
      updatePasswordMutation.mutate({ 
        userId: selectedUserForPassword.user.id, 
        password: newPassword 
      });
    }
  };

  const handleDeleteUser = (user: HospitalUser) => {
    if (window.confirm(t("admin.deleteUserConfirm", { firstName: user.user.firstName, lastName: user.user.lastName }))) {
      deleteUserMutation.mutate(user.user.id);
    }
  };

  const handleSearchUser = () => {
    if (!userForm.email) {
      toast({ title: t("common.error"), description: t("admin.emailRequired"), variant: "destructive" });
      return;
    }
    searchUserMutation.mutate(userForm.email);
  };

  const handleSaveUser = () => {
    if (userMode === "create") {
      if (!userForm.email || !userForm.password || !userForm.firstName || !userForm.lastName || !userForm.locationId || !userForm.role) {
        toast({ title: t("common.error"), description: t("admin.allFieldsRequired"), variant: "destructive" });
        return;
      }
      if (userForm.password.length < 6) {
        toast({ title: t("common.error"), description: t("admin.passwordMinLength"), variant: "destructive" });
        return;
      }
      createUserMutation.mutate(userForm);
    } else {
      if (!searchedUser) {
        toast({ title: t("common.error"), description: t("admin.pleaseSearchFirst"), variant: "destructive" });
        return;
      }
      if (!userForm.locationId || !userForm.role) {
        toast({ title: t("common.error"), description: t("admin.locationAndRoleRequired"), variant: "destructive" });
        return;
      }

      const data = {
        userId: searchedUser.id,
        locationId: userForm.locationId,
        role: userForm.role,
      };

      if (editingUser) {
        updateUserRoleMutation.mutate({ id: editingUser.id, data });
      } else {
        createUserRoleMutation.mutate(data);
      }
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
            <div className="flex gap-2">
              <Button onClick={handleCreateUser} size="sm" data-testid="button-create-user">
                <i className="fas fa-user-plus mr-2"></i>
                {t("admin.createNewUser")}
              </Button>
              <Button onClick={handleAddUser} size="sm" variant="outline" data-testid="button-add-user">
                <i className="fas fa-plus mr-2"></i>
                {t("admin.assignExisting")}
              </Button>
            </div>
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
              <Button onClick={handleAddUser} size="sm">
                <i className="fas fa-plus mr-2"></i>
                {t("admin.addUser")}
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
                        title={t("admin.editRoleAndLocation")}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleChangePassword(user)}
                        data-testid={`button-change-password-${user.id}`}
                        title={t("admin.changePasswordTitle")}
                      >
                        <i className="fas fa-key"></i>
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

      {/* User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? t("admin.editUser") : userMode === "create" ? t("admin.createNewUser") : t("admin.assignExistingUser")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {userMode === "create" && !editingUser ? (
              <>
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
              </>
            ) : !editingUser ? (
              <div>
                <Label htmlFor="user-email">{t("admin.userEmail")} *</Label>
                <div className="flex gap-2">
                  <Input
                    id="user-email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder={t("admin.emailPlaceholder")}
                    data-testid="input-user-email"
                  />
                  <Button
                    onClick={handleSearchUser}
                    disabled={searchUserMutation.isPending}
                    data-testid="button-search-user"
                  >
                    {t("admin.searchUser")}
                  </Button>
                </div>
                {searchedUser && (
                  <p className="text-sm text-success mt-2">
                    {t("admin.userFound", { firstName: searchedUser.firstName, lastName: searchedUser.lastName })}
                  </p>
                )}
              </div>
            ) : null}
            {(editingUser || searchedUser || userMode === "create") && (
              <>
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
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveUser}
                disabled={createUserRoleMutation.isPending || updateUserRoleMutation.isPending || createUserMutation.isPending}
                data-testid="button-save-user"
              >
                {editingUser ? t("common.edit") : userMode === "create" ? t("common.save") : t("admin.assign")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.changePassword")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedUserForPassword && (
              <p className="text-sm text-muted-foreground">
                {t("admin.changingPasswordFor", { firstName: selectedUserForPassword.user.firstName, lastName: selectedUserForPassword.user.lastName })}
              </p>
            )}
            <div>
              <Label htmlFor="new-password">{t("admin.newPassword")} *</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("admin.passwordPlaceholder")}
                data-testid="input-new-password"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setPasswordDialogOpen(false);
                setNewPassword("");
              }}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSavePassword}
                disabled={updatePasswordMutation.isPending}
                data-testid="button-save-password"
              >
                {updatePasswordMutation.isPending ? t("admin.updating") : t("admin.updatePassword")}
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
