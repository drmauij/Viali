import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Key, Wand2, UserCheck, UserX, Building2, ExternalLink } from "lucide-react";
import type { Unit, UserHospitalRole, User } from "@shared/schema";

// Generate a secure random password
function generateSecurePassword(length: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%&*';
  
  const allChars = lowercase + uppercase + numbers + symbols;
  
  // Ensure at least one of each type
  let password = '';
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

interface HospitalUser extends UserHospitalRole {
  user: User;
  units: Unit;
}

interface GroupedHospitalUser extends HospitalUser {
  roles: Array<{ role: string; units: Unit; roleId: string; unitId: string }>;
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
    unitId: "",
    role: "",
  });
  const [roleLocationPairs, setRoleLocationPairs] = useState<Array<{ id?: string; role: string; unitId: string }>>([]);
  const [newPair, setNewPair] = useState({ role: "", unitId: "" });
  
  // Change password states
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [changePasswordUser, setChangePasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Check if user is admin
  const isAdmin = activeHospital?.role === "admin";

  // Fetch units
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/units`],
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
            units: userRole.units,
            roleId: userRole.id,
            unitId: userRole.unitId
          }]
        });
      } else {
        const existing = grouped.get(userId)!;
        existing.roles.push({
          role: userRole.role,
          units: userRole.units,
          roleId: userRole.id,
          unitId: userRole.unitId
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
      // Refresh current user's auth data to update hospital switcher
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
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
      // Refresh current user's auth data to update hospital switcher
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
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

  // Change password mutation (admin reset)
  const changePasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`, {
        newPassword,
        hospitalId: activeHospital?.id,
      });
      return await response.json();
    },
    onSuccess: () => {
      setChangePasswordDialogOpen(false);
      setChangePasswordUser(null);
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: t("common.success"), description: t("admin.passwordResetSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.passwordResetError"), variant: "destructive" });
    },
  });

  // Update user access settings mutation
  const updateUserAccessMutation = useMutation({
    mutationFn: async ({ userId, canLogin, staffType }: { userId: string; canLogin?: boolean; staffType?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/access`, {
        canLogin,
        staffType,
        hospitalId: activeHospital?.id,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.userAccessUpdated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateAccess"), variant: "destructive" });
    },
  });

  const resetUserForm = () => {
    setUserForm({ email: "", password: "", firstName: "", lastName: "", unitId: "", role: "" });
  };

  const handleCreateUser = () => {
    resetUserForm();
    setUserDialogOpen(true);
  };

  const handleEditUser = (user: GroupedHospitalUser) => {
    const userPairs = user.roles?.map((r: any) => ({ 
      id: r.roleId, 
      role: r.role, 
      unitId: r.unitId 
    })) || [];
    
    setEditingUserDetails(user.user);
    setUserForm({
      ...userForm,
      firstName: user.user.firstName || "",
      lastName: user.user.lastName || "",
    });
    setRoleLocationPairs(userPairs);
    setNewPair({ role: "", unitId: "" });
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
          unitId: r.unitId 
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

  const handleOpenChangePassword = (user: User) => {
    setChangePasswordUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setChangePasswordDialogOpen(true);
  };

  const handleChangePassword = () => {
    if (!changePasswordUser) return;
    
    if (!newPassword || !confirmPassword) {
      toast({ title: t("common.error"), description: t("admin.allFieldsRequired"), variant: "destructive" });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({ title: t("common.error"), description: t("auth.passwordMismatch"), variant: "destructive" });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({ title: t("common.error"), description: t("auth.passwordTooShort"), variant: "destructive" });
      return;
    }
    
    changePasswordMutation.mutate({
      userId: changePasswordUser.id,
      newPassword,
    });
  };

  const handleSaveUser = () => {
    if (!userForm.email || !userForm.password || !userForm.firstName || !userForm.lastName || !userForm.unitId || !userForm.role) {
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

    if (!newPair.role || !newPair.unitId) {
      toast({ title: t("common.error"), description: t("admin.roleAndLocationRequired"), variant: "destructive" });
      return;
    }

    const isDuplicate = roleLocationPairs.some(
      pair => pair.role === newPair.role && pair.unitId === newPair.unitId
    );

    if (isDuplicate) {
      toast({ title: t("common.error"), description: t("admin.duplicateRoleLocation"), variant: "destructive" });
      return;
    }

    if (!editingUserDetails) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticPair = { id: tempId, role: newPair.role, unitId: newPair.unitId };
    setRoleLocationPairs([...roleLocationPairs, optimisticPair]);

    try {
      await createUserRoleMutation.mutateAsync({
        userId: editingUserDetails.id,
        role: newPair.role,
        unitId: newPair.unitId,
      });

      setNewPair({ role: "", unitId: "" });
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
      case "guest": return t("admin.roleGuest");
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">
                      {user.user.firstName} {user.user.lastName}
                    </h3>
                    {/* Quick status badges */}
                    <button
                      onClick={() => updateUserAccessMutation.mutate({
                        userId: user.user.id,
                        canLogin: user.user.canLogin === false,
                      })}
                      disabled={updateUserAccessMutation.isPending}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        user.user.canLogin !== false
                          ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                      title={user.user.canLogin !== false ? t("admin.clickToDisableLogin") : t("admin.clickToEnableLogin")}
                      data-testid={`badge-can-login-${user.user.id}`}
                    >
                      {user.user.canLogin !== false ? (
                        <><UserCheck className="h-3 w-3" />{t("admin.canLoginEnabled")}</>
                      ) : (
                        <><UserX className="h-3 w-3" />{t("admin.canLoginDisabled")}</>
                      )}
                    </button>
                    <button
                      onClick={() => updateUserAccessMutation.mutate({
                        userId: user.user.id,
                        staffType: user.user.staffType === 'external' ? 'internal' : 'external',
                      })}
                      disabled={updateUserAccessMutation.isPending}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        user.user.staffType === 'external'
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}
                      title={user.user.staffType === 'external' ? t("admin.clickToSetInternal") : t("admin.clickToSetExternal")}
                      data-testid={`badge-staff-type-${user.user.id}`}
                    >
                      {user.user.staffType === 'external' ? (
                        <><ExternalLink className="h-3 w-3" />{t("admin.staffTypeExternal")}</>
                      ) : (
                        <><Building2 className="h-3 w-3" />{t("admin.staffTypeInternal")}</>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">{user.user.email}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {user.roles.map((roleInfo, idx) => (
                      <div key={idx} className="inline-flex items-center bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                        <span className="text-xs font-medium text-primary">{getRoleName(roleInfo.role)}</span>
                        <span className="text-xs text-primary/60 mx-1.5">@</span>
                        <span className="text-xs text-primary/80">{roleInfo.units?.name || 'N/A'}</span>
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
              <div className="flex gap-2">
                <Input
                  id="user-password"
                  type="text"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder={t("admin.passwordPlaceholder")}
                  data-testid="input-user-password"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setUserForm({ ...userForm, password: generateSecurePassword() })}
                  title={t("admin.generatePassword")}
                  data-testid="button-generate-password"
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
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
              <Label htmlFor="user-units">{t("admin.units")} *</Label>
              <Select
                value={userForm.unitId}
                onValueChange={(value) => setUserForm({ ...userForm, unitId: value })}
              >
                <SelectTrigger data-testid="select-user-units">
                  <SelectValue placeholder={t("admin.selectLocation")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((units) => (
                    <SelectItem key={units.id} value={units.id}>
                      {units.name}
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
                  <SelectItem value="manager">{t("admin.roleManager")}</SelectItem>
                  <SelectItem value="doctor">{t("admin.roleDoctor")}</SelectItem>
                  <SelectItem value="nurse">{t("admin.roleNurse")}</SelectItem>
                  <SelectItem value="guest">{t("admin.roleGuest")}</SelectItem>
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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>{t("admin.editUser")}</DialogTitle>
            <DialogDescription>
              {editingUserDetails?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-2" style={{ maxHeight: 'calc(85vh - 160px)' }}>
            <div className="space-y-4 py-1">
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

              {/* Change Password Button */}
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => editingUserDetails && handleOpenChangePassword(editingUserDetails)}
                  className="w-full sm:w-auto"
                  data-testid="button-open-change-password"
                >
                  <Key className="h-4 w-4 mr-2" />
                  {t("auth.changePassword")}
                </Button>
              </div>

              {/* Access Settings */}
              <div className="border-t pt-4">
                <Label className="text-base font-semibold mb-3 block">{t("admin.accessSettings")}</Label>
                <div className="space-y-4">
                  {/* Can Login Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editingUserDetails?.canLogin !== false ? (
                        <UserCheck className="h-4 w-4 text-green-600" />
                      ) : (
                        <UserX className="h-4 w-4 text-destructive" />
                      )}
                      <Label htmlFor="can-login" className="text-sm font-normal">
                        {t("admin.canLogin")}
                      </Label>
                    </div>
                    <Switch
                      id="can-login"
                      checked={editingUserDetails?.canLogin !== false}
                      onCheckedChange={(checked) => {
                        if (editingUserDetails) {
                          updateUserAccessMutation.mutate({
                            userId: editingUserDetails.id,
                            canLogin: checked,
                          });
                        }
                      }}
                      disabled={updateUserAccessMutation.isPending}
                      data-testid="switch-can-login"
                    />
                  </div>
                  
                  {/* Staff Type Dropdown */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editingUserDetails?.staffType === 'external' ? (
                        <ExternalLink className="h-4 w-4 text-orange-600" />
                      ) : (
                        <Building2 className="h-4 w-4 text-blue-600" />
                      )}
                      <Label htmlFor="staff-type" className="text-sm font-normal">
                        {t("admin.staffType")}
                      </Label>
                    </div>
                    <Select
                      value={editingUserDetails?.staffType || 'internal'}
                      onValueChange={(value) => {
                        if (editingUserDetails) {
                          updateUserAccessMutation.mutate({
                            userId: editingUserDetails.id,
                            staffType: value,
                          });
                        }
                      }}
                      disabled={updateUserAccessMutation.isPending}
                    >
                      <SelectTrigger className="w-36" data-testid="select-staff-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">{t("admin.staffTypeInternal")}</SelectItem>
                        <SelectItem value="external">{t("admin.staffTypeExternal")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Role/Unit Pairs */}
              <div className="border-t pt-4">
                <Label className="text-base font-semibold">{t("admin.roleLocationPairs")}</Label>
                <div className="space-y-2 mt-3">
                  {roleLocationPairs.map((pair) => {
                    const unit = units.find(l => l.id === pair.unitId);
                    return (
                      <div key={pair.id} className="flex items-center justify-between bg-muted p-2 rounded-md">
                        <div className="inline-flex items-center bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                          <span className="text-xs font-medium text-primary">{getRoleName(pair.role)}</span>
                          <span className="text-xs text-primary/60 mx-1.5">@</span>
                          <span className="text-xs text-primary/80">{unit?.name}</span>
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
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select
                    value={newPair.role}
                    onValueChange={(value) => setNewPair({ ...newPair, role: value })}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-new-role">
                      <SelectValue placeholder={t("admin.selectRole")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t("admin.roleAdmin")}</SelectItem>
                      <SelectItem value="manager">{t("admin.roleManager")}</SelectItem>
                      <SelectItem value="doctor">{t("admin.roleDoctor")}</SelectItem>
                      <SelectItem value="nurse">{t("admin.roleNurse")}</SelectItem>
                      <SelectItem value="guest">{t("admin.roleGuest")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={newPair.unitId}
                    onValueChange={(value) => setNewPair({ ...newPair, unitId: value })}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-new-units">
                      <SelectValue placeholder={t("admin.selectLocation")} />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((units) => (
                        <SelectItem key={units.id} value={units.id}>
                          {units.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddRoleLocation}
                    disabled={createUserRoleMutation.isPending}
                    data-testid="button-add-pair"
                    className="shrink-0"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    {t("admin.add")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end border-t pt-4 px-6 pb-6 shrink-0 bg-background">
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

      {/* Change Password Dialog */}
      <Dialog open={changePasswordDialogOpen} onOpenChange={setChangePasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.changePassword")}</DialogTitle>
            <DialogDescription>
              {changePasswordUser?.firstName} {changePasswordUser?.lastName} ({changePasswordUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-password">{t("admin.newPassword")} *</Label>
              <div className="flex gap-2">
                <Input
                  id="new-password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("admin.passwordPlaceholder")}
                  data-testid="input-new-password"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const generated = generateSecurePassword();
                    setNewPassword(generated);
                    setConfirmPassword(generated);
                  }}
                  title={t("admin.generatePassword")}
                  data-testid="button-generate-new-password"
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="confirm-password">{t("admin.confirmPassword")} *</Label>
              <Input
                id="confirm-password"
                type="text"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("admin.confirmPasswordPlaceholder")}
                data-testid="input-confirm-password"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setChangePasswordDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
                data-testid="button-save-password"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
