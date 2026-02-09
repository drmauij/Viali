import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Key, Wand2, UserCheck, UserX, Building2, ExternalLink, Mail, Users as UsersIcon, UserCog, ArrowRightLeft, AlertTriangle, Star, Loader2, Search, ArrowUpDown, StickyNote } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Unit, UserHospitalRole, User } from "@shared/schema";

// Get available roles based on unit type
// Anesthesia/OR units: doctor, nurse, guest, admin
// Business units: manager, staff
// Logistic units: admin, staff
function getRolesForUnitType(unitType: string | null | undefined): Array<{ value: string; labelKey: string }> {
  const lowerType = (unitType || "").toLowerCase();
  
  if (lowerType === "business") {
    return [
      { value: "manager", labelKey: "admin.roleManager" },
      { value: "staff", labelKey: "admin.roleStaff" },
    ];
  }
  
  if (lowerType === "logistic") {
    return [
      { value: "admin", labelKey: "admin.roleAdmin" },
      { value: "staff", labelKey: "admin.roleStaff" },
    ];
  }
  
  // For anesthesia, OR, or any other clinical unit types
  return [
    { value: "doctor", labelKey: "admin.roleDoctor" },
    { value: "nurse", labelKey: "admin.roleNurse" },
    { value: "guest", labelKey: "admin.roleGuest" },
    { value: "admin", labelKey: "admin.roleAdmin" },
  ];
}

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
  roles: Array<{ role: string; units: Unit; roleId: string; unitId: string; isBookable?: boolean; isDefaultLogin?: boolean }>;
}

function UserNotesField({ userId, initialNotes, onSave, placeholder, label }: {
  userId: string;
  initialNotes: string;
  onSave: (userId: string, value: string) => void;
  placeholder: string;
  label: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const hasNotes = notes.trim().length > 0;

  if (!expanded && !hasNotes) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`button-add-notes-${userId}`}
      >
        <StickyNote className="h-3 w-3" />
        {label}
      </button>
    );
  }

  return (
    <div className="mt-2">
      <Textarea
        rows={2}
        placeholder={placeholder}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          onSave(userId, e.target.value);
        }}
        onBlur={() => { if (!notes.trim()) setExpanded(false); }}
        className="text-xs resize-none"
        data-testid={`textarea-admin-notes-${userId}`}
      />
    </div>
  );
}

function ListToolbar({ search, onSearchChange, sortAsc, onToggleSort, staffTypeFilter, onStaffTypeFilterChange, searchPlaceholder, totalCount, filteredCount }: {
  search: string;
  onSearchChange: (v: string) => void;
  sortAsc: boolean;
  onToggleSort: () => void;
  staffTypeFilter: "all" | "internal" | "external";
  onStaffTypeFilterChange: (v: "all" | "internal" | "external") => void;
  searchPlaceholder: string;
  totalCount: number;
  filteredCount: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 mb-3">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 h-9"
            data-testid="input-search-users"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleSort}
          className="h-9 whitespace-nowrap"
          data-testid="button-toggle-sort"
          title={sortAsc ? t("admin.sortAZ") : t("admin.sortZA")}
        >
          <ArrowUpDown className="h-4 w-4 mr-1" />
          {sortAsc ? t("admin.sortAZ") : t("admin.sortZA")}
        </Button>
      </div>
      <div className="flex gap-1 items-center">
        {(["all", "internal", "external"] as const).map((val) => (
          <Button
            key={val}
            variant={staffTypeFilter === val ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onStaffTypeFilterChange(val)}
            data-testid={`filter-staff-type-${val}`}
          >
            {val === "all" ? t("admin.filterAll") : val === "internal" ? t("admin.filterInternal") : t("admin.filterExternal")}
          </Button>
        ))}
        {filteredCount !== totalCount && (
          <span className="text-xs text-muted-foreground ml-2">
            {filteredCount} / {totalCount}
          </span>
        )}
      </div>
    </div>
  );
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
    phone: "",
    unitId: "",
    role: "",
  });
  const [roleLocationPairs, setRoleLocationPairs] = useState<Array<{ id?: string; role: string; unitId: string; isBookable?: boolean; isDefaultLogin?: boolean }>>([]);
  const [newPair, setNewPair] = useState({ role: "", unitId: "" });
  
  // Change password states
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [changePasswordUser, setChangePasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Existing user confirmation states
  const [existingUserDialogOpen, setExistingUserDialogOpen] = useState(false);
  const [existingUserInfo, setExistingUserInfo] = useState<User | null>(null);
  const [existingUserAlreadyInHospital, setExistingUserAlreadyInHospital] = useState(false);

  // Real-time email check states
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [detectedExistingUser, setDetectedExistingUser] = useState<User | null>(null);
  const [detectedUserAlreadyInHospital, setDetectedUserAlreadyInHospital] = useState(false);

  // Last role warning dialog state
  const [lastRoleWarningOpen, setLastRoleWarningOpen] = useState(false);
  const [pendingRemoveRoleId, setPendingRemoveRoleId] = useState<string | null>(null);

  // Archive user confirmation dialog state (double confirmation)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveDialogStep, setArchiveDialogStep] = useState<1 | 2>(1);
  const [userToArchive, setUserToArchive] = useState<HospitalUser | null>(null);

  // Tab state for user types
  const [activeTab, setActiveTab] = useState<"appUsers" | "staffMembers">("appUsers");

  // Search, sort, and filter states
  const [appUserSearch, setAppUserSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [appUserSortAsc, setAppUserSortAsc] = useState(true);
  const [staffSortAsc, setStaffSortAsc] = useState(true);
  const [appUserStaffTypeFilter, setAppUserStaffTypeFilter] = useState<"all" | "internal" | "external">("all");
  const [staffStaffTypeFilter, setStaffStaffTypeFilter] = useState<"all" | "internal" | "external">("all");

  // Staff member dialog states
  const [staffMemberDialogOpen, setStaffMemberDialogOpen] = useState(false);
  const [staffMemberForm, setStaffMemberForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    unitId: "",
    role: "",
  });

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
            unitId: userRole.unitId,
            isBookable: (userRole as any).isBookable ?? false,
            isDefaultLogin: (userRole as any).isDefaultLogin ?? false
          }]
        });
      } else {
        const existing = grouped.get(userId)!;
        existing.roles.push({
          role: userRole.role,
          units: userRole.units,
          roleId: userRole.id,
          unitId: userRole.unitId,
          isBookable: (userRole as any).isBookable ?? false,
          isDefaultLogin: (userRole as any).isDefaultLogin ?? false
        });
      }
    });
    
    return Array.from(grouped.values());
  }, [rawUsers]);

  // Filter users into app users and staff members based on canLogin
  const appUsersRaw = useMemo(() => {
    return users.filter(u => u.user.canLogin);
  }, [users]);

  const staffMembersRaw = useMemo(() => {
    return users.filter(u => !u.user.canLogin);
  }, [users]);

  // Helper: filter and sort a user list
  const filterAndSortUsers = useCallback((
    list: GroupedHospitalUser[],
    search: string,
    sortAsc: boolean,
    staffTypeFilter: "all" | "internal" | "external",
    includeEmail: boolean
  ) => {
    let result = list;
    if (staffTypeFilter !== "all") {
      result = result.filter(u => (u.user.staffType || "internal") === staffTypeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(u => {
        const first = (u.user.firstName || "").toLowerCase();
        const last = (u.user.lastName || "").toLowerCase();
        const email = includeEmail ? (u.user.email || "").toLowerCase() : "";
        return first.includes(q) || last.includes(q) || email.includes(q);
      });
    }
    result = [...result].sort((a, b) => {
      const nameA = `${a.user.lastName || ""} ${a.user.firstName || ""}`.toLowerCase();
      const nameB = `${b.user.lastName || ""} ${b.user.firstName || ""}`.toLowerCase();
      return sortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });
    return result;
  }, []);

  const appUsers = useMemo(() => filterAndSortUsers(appUsersRaw, appUserSearch, appUserSortAsc, appUserStaffTypeFilter, true),
    [appUsersRaw, appUserSearch, appUserSortAsc, appUserStaffTypeFilter, filterAndSortUsers]);

  const staffMembers = useMemo(() => filterAndSortUsers(staffMembersRaw, staffSearch, staffSortAsc, staffStaffTypeFilter, false),
    [staffMembersRaw, staffSearch, staffSortAsc, staffStaffTypeFilter, filterAndSortUsers]);

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
      const result = await response.json();
      if (!response.ok) {
        throw { ...result, status: response.status };
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      setUserDialogOpen(false);
      resetUserForm();
      toast({ title: t("common.success"), description: t("admin.userCreatedSuccess") });
    },
    onError: (error: any) => {
      if (error.status === 409 && error.code === "USER_EXISTS") {
        setExistingUserInfo(error.existingUser);
        setExistingUserAlreadyInHospital(error.alreadyInHospital);
        setExistingUserDialogOpen(true);
      } else {
        toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateUser"), variant: "destructive" });
      }
    },
  });

  const addExistingUserMutation = useMutation({
    mutationFn: async (data: { userId: string; unitId: string; role: string }) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/users/add-existing`, data);
      const result = await response.json();
      if (!response.ok) {
        throw { ...result, status: response.status };
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setExistingUserDialogOpen(false);
      setUserDialogOpen(false);
      setExistingUserInfo(null);
      resetUserForm();
      toast({ title: t("common.success"), description: t("admin.existingUserAdded") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToAddExistingUser"), variant: "destructive" });
    },
  });

  const updateUserDetailsMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { firstName: string; lastName: string; phone?: string } }) => {
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

  // Update user role bookable status mutation
  const updateRoleBookableMutation = useMutation({
    mutationFn: async ({ roleId, isBookable }: { roleId: string; isBookable: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/user-roles/${roleId}/bookable`, {
        isBookable,
        hospitalId: activeHospital?.id,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.bookableStatusUpdated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateBookable"), variant: "destructive" });
    },
  });

  // Update user role default login status mutation
  const updateRoleDefaultLoginMutation = useMutation({
    mutationFn: async ({ roleId, isDefaultLogin }: { roleId: string; isDefaultLogin: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/user-roles/${roleId}/default-login`, {
        isDefaultLogin,
        hospitalId: activeHospital?.id,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.defaultLoginStatusUpdated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateDefaultLogin"), variant: "destructive" });
    },
  });

  // Update user email mutation
  const updateUserEmailMutation = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/email`, {
        email,
        hospitalId: activeHospital?.id,
      });
      const result = await response.json();
      if (!response.ok) {
        throw { ...result, status: response.status };
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.emailUpdatedSuccess") });
    },
    onError: (error: any) => {
      if (error.code === "EMAIL_EXISTS") {
        toast({ title: t("common.error"), description: t("admin.emailAlreadyExists"), variant: "destructive" });
      } else {
        toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateEmail"), variant: "destructive" });
      }
    },
  });

  // Create staff member mutation (auto-generated credentials, no login access)
  const createStaffMemberMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone?: string; unitId: string; role: string }) => {
      const dummyEmail = `staff_${crypto.randomUUID()}@internal.local`;
      const dummyPassword = generateSecurePassword(16);
      
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/users/create`, {
        email: dummyEmail,
        password: dummyPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || undefined,
        unitId: data.unitId,
        role: data.role,
        canLogin: false,
      });
      const result = await response.json();
      if (!response.ok) {
        throw { ...result, status: response.status };
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      setStaffMemberDialogOpen(false);
      setStaffMemberForm({ firstName: "", lastName: "", phone: "", unitId: "", role: "" });
      toast({ title: t("common.success"), description: t("admin.staffMemberCreated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateUser"), variant: "destructive" });
    },
  });

  // Convert user between app user and staff member (toggle canLogin)
  const convertUserTypeMutation = useMutation({
    mutationFn: async ({ userId, canLogin }: { userId: string; canLogin: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/access`, {
        canLogin,
        hospitalId: activeHospital?.id,
      });
      return await response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ 
        title: t("common.success"), 
        description: variables.canLogin ? t("admin.convertedToAppUser") : t("admin.convertedToStaffMember") 
      });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateAccess"), variant: "destructive" });
    },
  });

  // Update admin notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async ({ userId, adminNotes }: { userId: string; adminNotes: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/notes`, {
        adminNotes,
        hospitalId: activeHospital?.id,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/users`] });
      toast({ title: t("common.success"), description: t("admin.adminNotesSaved") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.adminNotesSaveError"), variant: "destructive" });
    },
  });

  // Debounced notes save
  const notesTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const handleNotesChange = useCallback((userId: string, value: string) => {
    if (notesTimerRef.current[userId]) {
      clearTimeout(notesTimerRef.current[userId]);
    }
    notesTimerRef.current[userId] = setTimeout(() => {
      updateNotesMutation.mutate({ userId, adminNotes: value });
    }, 800);
  }, [updateNotesMutation]);

  const resetUserForm = () => {
    setUserForm({ email: "", password: "", firstName: "", lastName: "", phone: "", unitId: "", role: "" });
    setDetectedExistingUser(null);
    setDetectedUserAlreadyInHospital(false);
    setIsCheckingEmail(false);
  };

  // Real-time email check with debounce
  useEffect(() => {
    if (!userDialogOpen || !activeHospital?.id) return;
    
    const email = userForm.email.trim();
    if (!email || email.length < 5 || !email.includes('@')) {
      setDetectedExistingUser(null);
      setDetectedUserAlreadyInHospital(false);
      return;
    }

    setIsCheckingEmail(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/${activeHospital.id}/check-email?email=${encodeURIComponent(email)}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          if (data.exists) {
            setDetectedExistingUser(data.user);
            setDetectedUserAlreadyInHospital(data.alreadyInHospital);
          } else {
            setDetectedExistingUser(null);
            setDetectedUserAlreadyInHospital(false);
          }
        }
      } catch (error) {
        console.error('Email check failed:', error);
      } finally {
        setIsCheckingEmail(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [userForm.email, userDialogOpen, activeHospital?.id]);

  const handleCreateUser = () => {
    resetUserForm();
    setUserDialogOpen(true);
  };

  const handleCreateStaffMember = () => {
    setStaffMemberForm({ firstName: "", lastName: "", phone: "", unitId: "", role: "" });
    setStaffMemberDialogOpen(true);
  };

  const handleSaveStaffMember = () => {
    if (!staffMemberForm.firstName || !staffMemberForm.lastName || !staffMemberForm.unitId || !staffMemberForm.role) {
      toast({ title: t("common.error"), description: t("admin.allFieldsRequired"), variant: "destructive" });
      return;
    }
    createStaffMemberMutation.mutate(staffMemberForm);
  };

  const handleConvertUser = (user: GroupedHospitalUser) => {
    const newCanLogin = !user.user.canLogin;
    const confirmMessage = newCanLogin 
      ? t("admin.confirmConvertToAppUser", { name: `${user.user.firstName} ${user.user.lastName}` })
      : t("admin.confirmConvertToStaffMember", { name: `${user.user.firstName} ${user.user.lastName}` });
    
    if (window.confirm(confirmMessage)) {
      convertUserTypeMutation.mutate({
        userId: user.user.id,
        canLogin: newCanLogin,
      });
    }
  };

  const [editEmail, setEditEmail] = useState("");

  const handleEditUser = (user: GroupedHospitalUser) => {
    const userPairs = user.roles?.map((r: any) => ({ 
      id: r.roleId, 
      role: r.role, 
      unitId: r.unitId,
      isBookable: r.isBookable ?? false,
      isDefaultLogin: r.isDefaultLogin ?? false
    })) || [];
    
    setEditingUserDetails(user.user);
    setEditEmail(user.user.email || "");
    setUserForm({
      ...userForm,
      firstName: user.user.firstName || "",
      lastName: user.user.lastName || "",
      phone: user.user.phone || "",
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
          unitId: r.unitId,
          isBookable: r.isBookable ?? false,
          isDefaultLogin: r.isDefaultLogin ?? false
        })) || [];
        setRoleLocationPairs(userPairs);
      }
    }
  }, [users, editingUserDetails]);

  const handleDeleteUser = (user: HospitalUser) => {
    setUserToArchive(user);
    setArchiveDialogStep(1);
    setArchiveDialogOpen(true);
  };

  const handleArchiveConfirmStep1 = () => {
    setArchiveDialogStep(2);
  };

  const handleArchiveConfirmStep2 = () => {
    if (userToArchive) {
      deleteUserMutation.mutate(userToArchive.user.id);
    }
    setArchiveDialogOpen(false);
    setUserToArchive(null);
    setArchiveDialogStep(1);
  };

  const handleArchiveCancel = () => {
    setArchiveDialogOpen(false);
    setUserToArchive(null);
    setArchiveDialogStep(1);
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

    if (!editEmail.trim()) {
      toast({ title: t("common.error"), description: t("admin.emailRequired"), variant: "destructive" });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail.trim())) {
      toast({ title: t("common.error"), description: t("admin.invalidEmailFormat"), variant: "destructive" });
      return;
    }

    try {
      await updateUserDetailsMutation.mutateAsync({
        userId: editingUserDetails.id,
        data: {
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          phone: userForm.phone || undefined,
        }
      });
    } catch (error) {
      return;
    }

    const emailChanged = editEmail.trim().toLowerCase() !== (editingUserDetails.email || "").toLowerCase();
    if (emailChanged) {
      try {
        await updateUserEmailMutation.mutateAsync({
          userId: editingUserDetails.id,
          email: editEmail.trim(),
        });
      } catch (error) {
        return;
      }
    }

    setEditUserDialogOpen(false);
    setEditingUserDetails(null);
    setEditEmail("");
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

    // Check if this is the last role
    if (roleLocationPairs.length === 1) {
      setPendingRemoveRoleId(pairId);
      setLastRoleWarningOpen(true);
      return;
    }

    if (window.confirm(t("admin.removeRoleLocationConfirm"))) {
      await deleteUserRoleMutation.mutateAsync(pairId);
    }
  };

  const confirmRemoveLastRole = async () => {
    if (!pendingRemoveRoleId) return;
    try {
      await deleteUserRoleMutation.mutateAsync(pendingRemoveRoleId);
      setLastRoleWarningOpen(false);
      setPendingRemoveRoleId(null);
      setEditUserDialogOpen(false);
    } catch (error) {
      setLastRoleWarningOpen(false);
      setPendingRemoveRoleId(null);
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

  const renderUserCard = (user: GroupedHospitalUser, isStaffMember: boolean) => (
    <div key={user.user.id} className="bg-card border border-border rounded-lg p-4" data-testid={`user-${user.user.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">
              {user.user.firstName} {user.user.lastName}
            </h3>
            {!isStaffMember && (
              <>
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
              </>
            )}
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
          {!isStaffMember && (
            <p className="text-sm text-muted-foreground">{user.user.email}</p>
          )}
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
            onClick={() => handleConvertUser(user)}
            data-testid={`button-convert-user-${user.user.id}`}
            title={isStaffMember ? t("admin.convertToAppUser") : t("admin.convertToStaffMember")}
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
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
      <UserNotesField
        userId={user.user.id}
        initialNotes={user.user.adminNotes || ""}
        onSave={handleNotesChange}
        placeholder={t("admin.adminNotesPlaceholder")}
        label={t("admin.adminNotes")}
      />
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">{t("admin.usersAndRoles")}</h1>
      </div>

      {usersLoading ? (
        <div className="text-center py-8">
          <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "appUsers" | "staffMembers")} className="w-full">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="appUsers" className="flex items-center gap-2" data-testid="tab-app-users">
                <UsersIcon className="h-4 w-4" />
                {t("admin.appUsers")} ({appUsersRaw.length})
              </TabsTrigger>
              <TabsTrigger value="staffMembers" className="flex items-center gap-2" data-testid="tab-staff-members">
                <UserCog className="h-4 w-4" />
                {t("admin.staffMembers")} ({staffMembersRaw.length})
              </TabsTrigger>
            </TabsList>
            {activeTab === "appUsers" ? (
              <Button onClick={handleCreateUser} size="sm" data-testid="button-create-user">
                <i className="fas fa-user-plus mr-2"></i>
                {t("admin.createNewUser")}
              </Button>
            ) : (
              <Button onClick={handleCreateStaffMember} size="sm" data-testid="button-create-staff-member">
                <UserCog className="mr-2 h-4 w-4" />
                {t("admin.createStaffMember")}
              </Button>
            )}
          </div>

          <TabsContent value="appUsers">
            {appUsersRaw.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noUsers")}</h3>
                <p className="text-muted-foreground mb-4">{t("admin.noUsersMessage")}</p>
                <Button onClick={handleCreateUser} size="sm">
                  <i className="fas fa-user-plus mr-2"></i>
                  {t("admin.createNewUser")}
                </Button>
              </div>
            ) : (
              <>
                <ListToolbar
                  search={appUserSearch}
                  onSearchChange={setAppUserSearch}
                  sortAsc={appUserSortAsc}
                  onToggleSort={() => setAppUserSortAsc(v => !v)}
                  staffTypeFilter={appUserStaffTypeFilter}
                  onStaffTypeFilterChange={setAppUserStaffTypeFilter}
                  searchPlaceholder={t("admin.searchUsers")}
                  totalCount={appUsersRaw.length}
                  filteredCount={appUsers.length}
                />
                <div className="space-y-2">
                  {appUsers.map((user) => renderUserCard(user, false))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="staffMembers">
            <p className="text-sm text-muted-foreground mb-4">{t("admin.staffMemberDescription")}</p>
            {staffMembersRaw.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <UserCog className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noStaffMembers")}</h3>
                <p className="text-muted-foreground mb-4">{t("admin.noStaffMembersMessage")}</p>
                <Button onClick={handleCreateStaffMember} size="sm">
                  <UserCog className="mr-2 h-4 w-4" />
                  {t("admin.createStaffMember")}
                </Button>
              </div>
            ) : (
              <>
                <ListToolbar
                  search={staffSearch}
                  onSearchChange={setStaffSearch}
                  sortAsc={staffSortAsc}
                  onToggleSort={() => setStaffSortAsc(v => !v)}
                  staffTypeFilter={staffStaffTypeFilter}
                  onStaffTypeFilterChange={setStaffStaffTypeFilter}
                  searchPlaceholder={t("admin.searchStaff")}
                  totalCount={staffMembersRaw.length}
                  filteredCount={staffMembers.length}
                />
                <div className="space-y-2">
                  {staffMembers.map((user) => renderUserCard(user, true))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Create User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-[92vw] sm:max-w-md max-h-[85dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle>{t("admin.createNewUser")}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            <div>
              <Label htmlFor="user-email">{t("admin.email")} *</Label>
              <div className="relative">
                <Input
                  id="user-email"
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder={t("admin.emailPlaceholder")}
                  data-testid="input-user-email"
                />
                {isCheckingEmail && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* Existing user detected alert */}
            {detectedExistingUser && (
              <Alert className={detectedUserAlreadyInHospital ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}>
                <UserCheck className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {detectedUserAlreadyInHospital ? (
                    <span className="text-red-700">{t("admin.userAlreadyInHospital")}</span>
                  ) : (
                    <span className="text-blue-700">
                      <strong>{t("admin.existingUserDetected")}</strong>: {detectedExistingUser.firstName} {detectedExistingUser.lastName}. {t("admin.existingUserWillBeAdded")}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label htmlFor="user-password">{t("admin.password")} {!detectedExistingUser && "*"}</Label>
              <div className="flex gap-2">
                <Input
                  id="user-password"
                  type="text"
                  value={detectedExistingUser ? "" : userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder={detectedExistingUser ? "(using existing password)" : t("admin.passwordPlaceholder")}
                  data-testid="input-user-password"
                  className="flex-1"
                  disabled={!!detectedExistingUser}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setUserForm({ ...userForm, password: generateSecurePassword() })}
                  title={t("admin.generatePassword")}
                  data-testid="button-generate-password"
                  disabled={!!detectedExistingUser}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="user-first-name">{t("admin.firstName")} {!detectedExistingUser && "*"}</Label>
                <Input
                  id="user-first-name"
                  value={detectedExistingUser ? detectedExistingUser.firstName || "" : userForm.firstName}
                  onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                  placeholder={t("admin.firstNamePlaceholder")}
                  data-testid="input-user-first-name"
                  disabled={!!detectedExistingUser}
                />
              </div>
              <div>
                <Label htmlFor="user-last-name">{t("admin.lastName")} {!detectedExistingUser && "*"}</Label>
                <Input
                  id="user-last-name"
                  value={detectedExistingUser ? detectedExistingUser.lastName || "" : userForm.lastName}
                  onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                  placeholder={t("admin.lastNamePlaceholder")}
                  data-testid="input-user-last-name"
                  disabled={!!detectedExistingUser}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="user-phone">{t("admin.phone")}</Label>
              <PhoneInputWithCountry
                id="user-phone"
                value={detectedExistingUser ? detectedExistingUser.phone || "" : userForm.phone}
                onChange={(value) => setUserForm({ ...userForm, phone: value })}
                placeholder={t("admin.phonePlaceholder")}
                data-testid="input-user-phone"
                disabled={!!detectedExistingUser}
              />
            </div>
            <div>
              <Label htmlFor="user-units">{t("admin.units")} *</Label>
              <Select
                value={userForm.unitId}
                onValueChange={(value) => {
                  const selectedUnit = units.find(u => u.id === value);
                  const availableRoles = getRolesForUnitType(selectedUnit?.type);
                  const currentRoleValid = availableRoles.some(r => r.value === userForm.role);
                  setUserForm({ 
                    ...userForm, 
                    unitId: value,
                    role: currentRoleValid ? userForm.role : ""
                  });
                }}
              >
                <SelectTrigger data-testid="select-user-units">
                  <SelectValue placeholder={t("admin.selectLocation")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
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
                disabled={!userForm.unitId}
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue placeholder={userForm.unitId ? t("admin.selectRole") : t("admin.selectUnitFirst")} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const selectedUnit = units.find(u => u.id === userForm.unitId);
                    return getRolesForUnitType(selectedUnit?.type).map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {t(role.labelKey)}
                      </SelectItem>
                    ));
                  })()}
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

      {/* Create Staff Member Dialog */}
      <Dialog open={staffMemberDialogOpen} onOpenChange={setStaffMemberDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.createStaffMember")}</DialogTitle>
            <DialogDescription>
              {t("admin.staffMemberDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="staff-first-name">{t("admin.firstName")} *</Label>
                <Input
                  id="staff-first-name"
                  value={staffMemberForm.firstName}
                  onChange={(e) => setStaffMemberForm({ ...staffMemberForm, firstName: e.target.value })}
                  placeholder={t("admin.firstNamePlaceholder")}
                  data-testid="input-staff-first-name"
                />
              </div>
              <div>
                <Label htmlFor="staff-last-name">{t("admin.lastName")} *</Label>
                <Input
                  id="staff-last-name"
                  value={staffMemberForm.lastName}
                  onChange={(e) => setStaffMemberForm({ ...staffMemberForm, lastName: e.target.value })}
                  placeholder={t("admin.lastNamePlaceholder")}
                  data-testid="input-staff-last-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="staff-phone">{t("admin.phone")}</Label>
              <PhoneInputWithCountry
                id="staff-phone"
                value={staffMemberForm.phone}
                onChange={(value) => setStaffMemberForm({ ...staffMemberForm, phone: value })}
                placeholder={t("admin.phonePlaceholder")}
                data-testid="input-staff-phone"
              />
            </div>
            <div>
              <Label htmlFor="staff-units">{t("admin.units")} *</Label>
              <Select
                value={staffMemberForm.unitId}
                onValueChange={(value) => {
                  const selectedUnit = units.find(u => u.id === value);
                  const availableRoles = getRolesForUnitType(selectedUnit?.type);
                  const currentRoleValid = availableRoles.some(r => r.value === staffMemberForm.role);
                  setStaffMemberForm({ 
                    ...staffMemberForm, 
                    unitId: value,
                    role: currentRoleValid ? staffMemberForm.role : ""
                  });
                }}
              >
                <SelectTrigger data-testid="select-staff-units">
                  <SelectValue placeholder={t("admin.selectLocation")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="staff-role">{t("admin.role")} *</Label>
              <Select
                value={staffMemberForm.role}
                onValueChange={(value) => setStaffMemberForm({ ...staffMemberForm, role: value })}
                disabled={!staffMemberForm.unitId}
              >
                <SelectTrigger data-testid="select-staff-role">
                  <SelectValue placeholder={staffMemberForm.unitId ? t("admin.selectRole") : t("admin.selectUnitFirst")} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const selectedUnit = units.find(u => u.id === staffMemberForm.unitId);
                    return getRolesForUnitType(selectedUnit?.type).map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {t(role.labelKey)}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStaffMemberDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveStaffMember}
                disabled={createStaffMemberMutation.isPending}
                data-testid="button-save-staff-member"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="max-w-[92vw] sm:max-w-2xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle>{t("admin.editUser")}</DialogTitle>
            <DialogDescription>
              {t("admin.editUserDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            <div className="space-y-4 py-1">
              {/* Email field */}
              <div>
                <Label htmlFor="edit-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {t("admin.email")} *
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder={t("admin.emailPlaceholder")}
                  data-testid="input-edit-email"
                />
                <p className="text-xs text-muted-foreground mt-1">{t("admin.emailChangeHint")}</p>
              </div>
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
              
              {/* Phone field */}
              <div>
                <Label htmlFor="edit-phone">{t("admin.phone")}</Label>
                <PhoneInputWithCountry
                  id="edit-phone"
                  value={userForm.phone}
                  onChange={(value) => setUserForm({ ...userForm, phone: value })}
                  placeholder={t("admin.phonePlaceholder")}
                  data-testid="input-edit-phone"
                />
              </div>

              {/* Admin Notes */}
              <div>
                <Label htmlFor="edit-admin-notes" className="flex items-center gap-2 mb-2">
                  <StickyNote className="h-4 w-4" />
                  {t("admin.adminNotes")}
                </Label>
                <Textarea
                  id="edit-admin-notes"
                  rows={3}
                  value={editingUserDetails?.adminNotes || ""}
                  onChange={(e) => {
                    if (editingUserDetails) {
                      setEditingUserDetails({ ...editingUserDetails, adminNotes: e.target.value });
                      handleNotesChange(editingUserDetails.id, e.target.value);
                    }
                  }}
                  placeholder={t("admin.adminNotesPlaceholder")}
                  className="text-sm resize-none"
                  data-testid="textarea-edit-admin-notes"
                />
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
                    const showBookable = !!unit && unit.showAppointments === true;
                    return (
                      <div key={pair.id} className="flex items-center justify-between bg-muted p-2 rounded-md gap-2">
                        <div className="inline-flex items-center bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                          <span className="text-xs font-medium text-primary">{getRoleName(pair.role)}</span>
                          <span className="text-xs text-primary/60 mx-1.5">@</span>
                          <span className="text-xs text-primary/80">{unit?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {pair.id && (
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor={`default-${pair.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                                {t("admin.defaultLogin")}
                              </Label>
                              <Switch
                                id={`default-${pair.id}`}
                                checked={pair.isDefaultLogin ?? false}
                                onCheckedChange={(checked) => {
                                  updateRoleDefaultLoginMutation.mutate({
                                    roleId: pair.id!,
                                    isDefaultLogin: checked,
                                  });
                                }}
                                disabled={updateRoleDefaultLoginMutation.isPending}
                                data-testid={`switch-default-${pair.id}`}
                              />
                            </div>
                          )}
                          {showBookable && pair.id && (
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor={`bookable-${pair.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                                {t("admin.bookable")}
                              </Label>
                              <Switch
                                id={`bookable-${pair.id}`}
                                checked={pair.isBookable ?? false}
                                onCheckedChange={(checked) => {
                                  updateRoleBookableMutation.mutate({
                                    roleId: pair.id!,
                                    isBookable: checked,
                                  });
                                }}
                                disabled={updateRoleBookableMutation.isPending}
                                data-testid={`switch-bookable-${pair.id}`}
                              />
                            </div>
                          )}
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
                    value={newPair.unitId}
                    onValueChange={(value) => {
                      const selectedUnit = units.find(u => u.id === value);
                      const availableRoles = getRolesForUnitType(selectedUnit?.type);
                      const currentRoleValid = availableRoles.some(r => r.value === newPair.role);
                      setNewPair({ 
                        ...newPair, 
                        unitId: value,
                        role: currentRoleValid ? newPair.role : ""
                      });
                    }}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-new-units">
                      <SelectValue placeholder={t("admin.selectLocation")} />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={newPair.role}
                    onValueChange={(value) => setNewPair({ ...newPair, role: value })}
                    disabled={!newPair.unitId}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-new-role">
                      <SelectValue placeholder={newPair.unitId ? t("admin.selectRole") : t("admin.selectUnitFirst")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const selectedUnit = units.find(u => u.id === newPair.unitId);
                        return getRolesForUnitType(selectedUnit?.type).map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {t(role.labelKey)}
                          </SelectItem>
                        ));
                      })()}
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
              disabled={updateUserDetailsMutation.isPending || updateUserEmailMutation.isPending}
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

      {/* Existing User Confirmation Dialog */}
      <Dialog open={existingUserDialogOpen} onOpenChange={(open) => {
        setExistingUserDialogOpen(open);
        if (!open) {
          setExistingUserInfo(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.existingUserFound")}</DialogTitle>
            <DialogDescription>
              {existingUserAlreadyInHospital 
                ? t("admin.userAlreadyInHospital")
                : t("admin.existingUserDescription")}
            </DialogDescription>
          </DialogHeader>
          {existingUserInfo && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium">{existingUserInfo.firstName} {existingUserInfo.lastName}</p>
                <p className="text-sm text-muted-foreground">{existingUserInfo.email}</p>
              </div>
              
              {existingUserAlreadyInHospital ? (
                <p className="text-sm text-muted-foreground">
                  {t("admin.userAlreadyMemberMessage")}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("admin.addExistingUserMessage")}
                </p>
              )}
              
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setExistingUserDialogOpen(false);
                    setExistingUserInfo(null);
                  }}
                  data-testid="button-cancel-existing-user"
                >
                  {t("common.cancel")}
                </Button>
                {!existingUserAlreadyInHospital && (
                  <Button
                    onClick={() => {
                      if (existingUserInfo) {
                        addExistingUserMutation.mutate({
                          userId: existingUserInfo.id,
                          unitId: userForm.unitId,
                          role: userForm.role,
                        });
                      }
                    }}
                    disabled={addExistingUserMutation.isPending}
                    data-testid="button-add-existing-user"
                  >
                    {addExistingUserMutation.isPending ? t("common.adding") : t("admin.addToHospital")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Last Role Warning Dialog */}
      <Dialog open={lastRoleWarningOpen} onOpenChange={(open) => {
        setLastRoleWarningOpen(open);
        if (!open) {
          setPendingRemoveRoleId(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              {t("admin.lastRoleWarningTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.lastRoleWarningMessage")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button 
              variant="outline" 
              onClick={() => {
                setLastRoleWarningOpen(false);
                setPendingRemoveRoleId(null);
              }}
              data-testid="button-cancel-remove-last-role"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemoveLastRole}
              disabled={deleteUserRoleMutation.isPending}
              data-testid="button-confirm-remove-last-role"
            >
              {deleteUserRoleMutation.isPending ? t("common.removing") : t("admin.removeFromHospital")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive User Confirmation Dialog (Double Confirmation) */}
      <Dialog open={archiveDialogOpen} onOpenChange={(open) => {
        if (!open) handleArchiveCancel();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {archiveDialogStep === 1 
                ? t("admin.archiveUserTitle", "Archive User") 
                : t("admin.archiveUserConfirmTitle", "Confirm Archive")}
            </DialogTitle>
            <DialogDescription>
              {archiveDialogStep === 1 
                ? t("admin.archiveUserStep1", {
                    firstName: userToArchive?.user.firstName || '',
                    lastName: userToArchive?.user.lastName || '',
                    defaultValue: `Are you sure you want to archive ${userToArchive?.user.firstName} ${userToArchive?.user.lastName}? They will be removed from this hospital.`
                  })
                : t("admin.archiveUserStep2", {
                    firstName: userToArchive?.user.firstName || '',
                    lastName: userToArchive?.user.lastName || '',
                    defaultValue: `This action cannot be easily undone. ${userToArchive?.user.firstName} ${userToArchive?.user.lastName} will lose access to the system. Please confirm.`
                  })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button 
              variant="outline" 
              onClick={handleArchiveCancel}
              data-testid="button-cancel-archive-user"
            >
              {t("common.cancel")}
            </Button>
            {archiveDialogStep === 1 ? (
              <Button
                variant="destructive"
                onClick={handleArchiveConfirmStep1}
                data-testid="button-archive-user-step1"
              >
                {t("common.continue", "Continue")}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleArchiveConfirmStep2}
                disabled={deleteUserMutation.isPending}
                data-testid="button-archive-user-step2"
              >
                {deleteUserMutation.isPending ? t("common.archiving", "Archiving...") : t("admin.archiveUser", "Archive User")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
