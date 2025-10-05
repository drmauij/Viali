import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
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
      toast({ title: "Success", description: "Location created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create location", variant: "destructive" });
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
      toast({ title: "Success", description: "Location updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update location", variant: "destructive" });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/locations/${id}?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "locations"] });
      toast({ title: "Success", description: "Location deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete location", variant: "destructive" });
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
      toast({ title: "Error", description: error.message || "User not found", variant: "destructive" });
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
      toast({ title: "Success", description: "User assigned successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to assign user", variant: "destructive" });
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
      toast({ title: "Success", description: "User updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
    },
  });

  const deleteUserRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${id}?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
      toast({ title: "Success", description: "User removed successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove user", variant: "destructive" });
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
      toast({ title: "Success", description: "User created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" });
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
      toast({ title: "Success", description: "Password updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update password", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}/delete?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin", activeHospital?.id, "users"] });
      toast({ title: "Success", description: "User deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" });
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
      toast({ title: "Success", description: "Hospital name updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update hospital name", variant: "destructive" });
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
      toast({ title: "Error", description: "Location name is required", variant: "destructive" });
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
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
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
    if (window.confirm(`Are you sure you want to permanently delete ${user.user.firstName} ${user.user.lastName}? This cannot be undone.`)) {
      deleteUserMutation.mutate(user.user.id);
    }
  };

  const handleSearchUser = () => {
    if (!userForm.email) {
      toast({ title: "Error", description: "Email is required", variant: "destructive" });
      return;
    }
    searchUserMutation.mutate(userForm.email);
  };

  const handleSaveUser = () => {
    if (userMode === "create") {
      if (!userForm.email || !userForm.password || !userForm.firstName || !userForm.lastName || !userForm.locationId || !userForm.role) {
        toast({ title: "Error", description: "All fields are required", variant: "destructive" });
        return;
      }
      if (userForm.password.length < 6) {
        toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
        return;
      }
      createUserMutation.mutate(userForm);
    } else {
      if (!searchedUser) {
        toast({ title: "Error", description: "Please search for a user first", variant: "destructive" });
        return;
      }
      if (!userForm.locationId || !userForm.role) {
        toast({ title: "Error", description: "Location and role are required", variant: "destructive" });
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
      case "admin": return "Admin";
      case "doctor": return "Doctor";
      case "nurse": return "Nurse";
      default: return role;
    }
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Hospital Selected</h3>
          <p className="text-muted-foreground">Please select a hospital first.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-lock text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">Admin Access Required</h3>
          <p className="text-muted-foreground">You need administrator privileges to access this page.</p>
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
      toast({ title: "Error", description: "Hospital name is required", variant: "destructive" });
      return;
    }
    updateHospitalMutation.mutate(hospitalName);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
      </div>

      {/* Hospital Info Card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg">{activeHospital?.name}</h3>
            <p className="text-sm text-muted-foreground">Hospital Name</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEditHospitalName}
            data-testid="button-edit-hospital"
          >
            <i className="fas fa-edit mr-2"></i>
            Edit Name
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
          Locations
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
          Users & Roles
        </button>
      </div>

      {/* Locations Tab */}
      {activeTab === "locations" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">Locations</h2>
            <Button onClick={handleAddLocation} size="sm" data-testid="button-add-location">
              <i className="fas fa-plus mr-2"></i>
              Add Location
            </Button>
          </div>

          {locationsLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : locations.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-location-dot text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Locations</h3>
              <p className="text-muted-foreground mb-4">Get started by adding your first location.</p>
              <Button onClick={handleAddLocation} size="sm">
                <i className="fas fa-plus mr-2"></i>
                Add Location
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
                          if (confirm("Are you sure you want to delete this location?")) {
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
            <h2 className="text-lg font-semibold text-foreground">Users & Roles</h2>
            <div className="flex gap-2">
              <Button onClick={handleCreateUser} size="sm" data-testid="button-create-user">
                <i className="fas fa-user-plus mr-2"></i>
                Create New User
              </Button>
              <Button onClick={handleAddUser} size="sm" variant="outline" data-testid="button-add-user">
                <i className="fas fa-plus mr-2"></i>
                Assign Existing
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
              <h3 className="text-lg font-semibold text-foreground mb-2">No Users</h3>
              <p className="text-muted-foreground mb-4">Assign users to this hospital.</p>
              <Button onClick={handleAddUser} size="sm">
                <i className="fas fa-plus mr-2"></i>
                Assign User
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
                        title="Edit role and location"
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleChangePassword(user)}
                        data-testid={`button-change-password-${user.id}`}
                        title="Change password"
                      >
                        <i className="fas fa-key"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to remove this user from the hospital?")) {
                            deleteUserRoleMutation.mutate(user.id);
                          }
                        }}
                        data-testid={`button-remove-user-${user.id}`}
                        title="Remove from hospital"
                      >
                        <i className="fas fa-user-minus text-warning"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteUser(user)}
                        data-testid={`button-delete-user-${user.id}`}
                        title="Delete user permanently"
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
            <DialogTitle>{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="location-name">Location Name *</Label>
              <Input
                id="location-name"
                value={locationForm.name}
                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                placeholder="e.g., OR 1, ICU, Pharmacy"
                data-testid="input-location-name"
              />
            </div>
            <div>
              <Label htmlFor="location-type">Type</Label>
              <Input
                id="location-type"
                value={locationForm.type}
                onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value })}
                placeholder="e.g., Operating Room, Storage"
                data-testid="input-location-type"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveLocation}
                disabled={createLocationMutation.isPending || updateLocationMutation.isPending}
                data-testid="button-save-location"
              >
                {editingLocation ? "Update" : "Create"}
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
              {editingUser ? "Edit User Assignment" : userMode === "create" ? "Create New User" : "Assign Existing User"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {userMode === "create" && !editingUser ? (
              <>
                <div>
                  <Label htmlFor="user-email">Email *</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder="user@example.com"
                    data-testid="input-user-email"
                  />
                </div>
                <div>
                  <Label htmlFor="user-password">Password *</Label>
                  <Input
                    id="user-password"
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                    data-testid="input-user-password"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="user-first-name">First Name *</Label>
                    <Input
                      id="user-first-name"
                      value={userForm.firstName}
                      onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                      placeholder="John"
                      data-testid="input-user-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="user-last-name">Last Name *</Label>
                    <Input
                      id="user-last-name"
                      value={userForm.lastName}
                      onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                      placeholder="Doe"
                      data-testid="input-user-last-name"
                    />
                  </div>
                </div>
              </>
            ) : !editingUser ? (
              <div>
                <Label htmlFor="user-email">User Email *</Label>
                <div className="flex gap-2">
                  <Input
                    id="user-email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder="user@example.com"
                    data-testid="input-user-email"
                  />
                  <Button
                    onClick={handleSearchUser}
                    disabled={searchUserMutation.isPending}
                    data-testid="button-search-user"
                  >
                    Search
                  </Button>
                </div>
                {searchedUser && (
                  <p className="text-sm text-success mt-2">
                    Found: {searchedUser.firstName} {searchedUser.lastName}
                  </p>
                )}
              </div>
            ) : null}
            {(editingUser || searchedUser || userMode === "create") && (
              <>
                <div>
                  <Label htmlFor="user-location">Location *</Label>
                  <Select
                    value={userForm.locationId}
                    onValueChange={(value) => setUserForm({ ...userForm, locationId: value })}
                  >
                    <SelectTrigger data-testid="select-user-location">
                      <SelectValue placeholder="Select location" />
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
                  <Label htmlFor="user-role">Role *</Label>
                  <Select
                    value={userForm.role}
                    onValueChange={(value) => setUserForm({ ...userForm, role: value })}
                  >
                    <SelectTrigger data-testid="select-user-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="doctor">Doctor</SelectItem>
                      <SelectItem value="nurse">Nurse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUserDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveUser}
                disabled={createUserRoleMutation.isPending || updateUserRoleMutation.isPending || createUserMutation.isPending}
                data-testid="button-save-user"
              >
                {editingUser ? "Update" : userMode === "create" ? "Create" : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedUserForPassword && (
              <p className="text-sm text-muted-foreground">
                Changing password for: {selectedUserForPassword.user.firstName} {selectedUserForPassword.user.lastName}
              </p>
            )}
            <div>
              <Label htmlFor="new-password">New Password *</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                data-testid="input-new-password"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setPasswordDialogOpen(false);
                setNewPassword("");
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleSavePassword}
                disabled={updatePasswordMutation.isPending}
                data-testid="button-save-password"
              >
                {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hospital Name Dialog */}
      <Dialog open={hospitalDialogOpen} onOpenChange={setHospitalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Hospital Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hospital-name">Hospital Name *</Label>
              <Input
                id="hospital-name"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="e.g., City General Hospital"
                data-testid="input-hospital-name"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setHospitalDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveHospitalName}
                disabled={updateHospitalMutation.isPending}
                data-testid="button-save-hospital"
              >
                Update
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
