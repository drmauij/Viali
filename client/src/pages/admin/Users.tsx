import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

export default function Users() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Hospital name states
  const [hospitalDialogOpen, setHospitalDialogOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState(activeHospital?.name || "");

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
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/locations`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Fetch users
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

  // Hospital mutation
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

  const resetUserForm = () => {
    setUserForm({ email: "", password: "", firstName: "", lastName: "", locationId: "", role: "" });
  };

  const handleCreateUser = () => {
    resetUserForm();
    setUserDialogOpen(true);
  };

  const handleEditUser = (user: GroupedHospitalUser) => {
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
    if (createUserRoleMutation.isPending) return;

    if (!newPair.role || !newPair.locationId) {
      toast({ title: t("common.error"), description: t("admin.roleAndLocationRequired"), variant: "destructive" });
      return;
    }

    const isDuplicate = roleLocationPairs.some(
      pair => pair.role === newPair.role && pair.locationId === newPair.locationId
    );

    if (isDuplicate) {
      toast({ title: t("common.error"), description: t("admin.duplicateRoleLocation"), variant: "destructive" });
      return;
    }

    if (!editingUserDetails) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticPair = { id: tempId, role: newPair.role, locationId: newPair.locationId };
    setRoleLocationPairs([...roleLocationPairs, optimisticPair]);

    try {
      await createUserRoleMutation.mutateAsync({
        userId: editingUserDetails.id,
        role: newPair.role,
        locationId: newPair.locationId,
      });

      setNewPair({ role: "", locationId: "" });
    } catch (error) {
      setRoleLocationPairs(prev => prev.filter(p => p.id !== tempId));
    }
  };

  const handleRemoveRoleLocation = async (pairId: string) => {
    if (deleteUserRoleMutation.isPending) return;

    if (window.confirm(t("admin.removeRoleLocationConfirm"))) {
      await deleteUserRoleMutation.mutateAsync(pairId);
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">{t("admin.usersAndRoles")}</h1>
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
                      <div key={idx} className="inline-flex items-center bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                        <span className="text-xs font-medium text-primary">{getRoleName(roleInfo.role)}</span>
                        <span className="text-xs text-primary/60 mx-1.5">@</span>
                        <span className="text-xs text-primary/80">{roleInfo.location.name}</span>
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
                      <div className="inline-flex items-center bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                        <span className="text-xs font-medium text-primary">{getRoleName(pair.role)}</span>
                        <span className="text-xs text-primary/60 mx-1.5">@</span>
                        <span className="text-xs text-primary/80">{location?.name}</span>
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
