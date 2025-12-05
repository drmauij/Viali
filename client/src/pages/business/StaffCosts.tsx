import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  DollarSign,
  Clock,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  UserCheck,
  Calendar,
  Building2,
  Activity,
  Loader2,
  Shield,
  Plus,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface RoleInfo {
  role: string;
  unitId: string | null;
  unitName: string | null;
  unitType: string | null;
}

interface RoleAssignment {
  id: string;
  role: string;
  unitId: string | null;
  unitName: string | null;
  unitType: string | null;
}

interface StaffMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: RoleInfo[];
  staffType: "internal" | "external";
  hourlyRate: number | null;
  canLogin: boolean;
  createdAt: string | null;
}

interface UnitOption {
  id: string;
  name: string;
  type: string | null;
  isAnesthesiaModule: boolean;
  isSurgeryModule: boolean;
  isBusinessModule: boolean;
}

const mockCostByRole = [
  { name: "Surgeons", value: 69790, color: "#ef4444" },
  { name: "Anesthesiologists", value: 42320, color: "#3b82f6" },
  { name: "Surgery Nurses", value: 19486, color: "#10b981" },
  { name: "Anesthesia Nurses", value: 9570, color: "#f59e0b" },
  { name: "Surgical Assistants", value: 16956, color: "#8b5cf6" },
];

const mockCostTrend = [
  { month: "Jan", surgeons: 62000, anesthesiologists: 38000, nurses: 28000, assistants: 14000 },
  { month: "Feb", surgeons: 68000, anesthesiologists: 41000, nurses: 30000, assistants: 15500 },
  { month: "Mar", surgeons: 65000, anesthesiologists: 40000, nurses: 29000, assistants: 15000 },
  { month: "Apr", surgeons: 71000, anesthesiologists: 43000, nurses: 31000, assistants: 16000 },
  { month: "May", surgeons: 74000, anesthesiologists: 45000, nurses: 32000, assistants: 17000 },
  { month: "Jun", surgeons: 69790, anesthesiologists: 42320, nurses: 29056, assistants: 16956 },
];

const mockCostPerSurgery = [
  { type: "Orthopedic", avgStaffCost: 890, surgeries: 156 },
  { type: "General", avgStaffCost: 420, surgeries: 218 },
  { type: "Plastic", avgStaffCost: 680, surgeries: 89 },
  { type: "Other", avgStaffCost: 520, surgeries: 65 },
];

const mockSurgeryStaffCosts = [
  { id: 1, date: "2024-01-15", patient: "Patient A", surgery: "Hip Replacement", surgeons: 1850, anesthesia: 1280, nurses: 440, assistants: 180, total: 3750 },
  { id: 2, date: "2024-01-15", patient: "Patient B", surgery: "Knee Arthroscopy", surgeons: 920, anesthesia: 640, nurses: 220, assistants: 90, total: 1870 },
  { id: 3, date: "2024-01-14", patient: "Patient C", surgery: "Appendectomy", surgeons: 540, anesthesia: 480, nurses: 165, assistants: 85, total: 1270 },
  { id: 4, date: "2024-01-14", patient: "Patient D", surgery: "Rhinoplasty", surgeons: 1100, anesthesia: 800, nurses: 275, assistants: 110, total: 2285 },
  { id: 5, date: "2024-01-13", patient: "Patient E", surgery: "Carpal Tunnel Release", surgeons: 360, anesthesia: 320, nurses: 110, assistants: 55, total: 845 },
  { id: 6, date: "2024-01-13", patient: "Patient F", surgery: "Spinal Fusion", surgeons: 2200, anesthesia: 1600, nurses: 550, assistants: 220, total: 4570 },
  { id: 7, date: "2024-01-12", patient: "Patient G", surgery: "Hernia Repair", surgeons: 720, anesthesia: 560, nurses: 192, assistants: 90, total: 1562 },
  { id: 8, date: "2024-01-12", patient: "Patient H", surgery: "ACL Reconstruction", surgeons: 1480, anesthesia: 960, nurses: 330, assistants: 150, total: 2920 },
];

interface HelpTooltipProps {
  content: string;
}

function HelpTooltip({ content }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help ml-1" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  helpText: string;
  icon: React.ReactNode;
  iconBg?: string;
}

function SummaryCard({ title, value, subtitle, trend, helpText, icon, iconBg = "bg-primary/10 text-primary" }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <HelpTooltip content={helpText} />
        </div>
        <div className={`p-2 rounded-lg ${iconBg}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend !== undefined && (
            <div className={`flex items-center text-xs ${trend >= 0 ? "text-red-500" : "text-green-500"}`}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {trend >= 0 ? "+" : ""}{trend}%
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ChartCardProps {
  title: string;
  description?: string;
  helpText?: string;
  children: React.ReactNode;
}

function ChartCard({ title, description, helpText, children }: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <CardTitle className="text-lg">{title}</CardTitle>
          {helpText && <HelpTooltip content={helpText} />}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function getRoleLabel(role: string, unitType: string | null): string {
  if (role === 'doctor') {
    if (unitType === 'anesthesia') return 'Anesthesiologist';
    if (unitType === 'surgery') return 'Surgeon';
    return 'Doctor';
  }
  if (role === 'nurse') {
    if (unitType === 'anesthesia') return 'Anesthesia Nurse';
    if (unitType === 'surgery') return 'Surgery Nurse';
    return 'Nurse';
  }
  if (role === 'manager') return 'Manager';
  return role;
}

function getRoleBadgeStyle(role: string, unitType: string | null) {
  const label = getRoleLabel(role, unitType);
  switch (label) {
    case "Surgeon":
      return "border-red-500/50 text-red-600 dark:text-red-400";
    case "Anesthesiologist":
      return "border-blue-500/50 text-blue-600 dark:text-blue-400";
    case "Surgery Nurse":
      return "border-green-500/50 text-green-600 dark:text-green-400";
    case "Anesthesia Nurse":
      return "border-orange-500/50 text-orange-600 dark:text-orange-400";
    case "Manager":
      return "border-purple-500/50 text-purple-600 dark:text-purple-400";
    default:
      return "border-gray-500/50 text-gray-600 dark:text-gray-400";
  }
}

function getDisplayName(staff: StaffMember): string {
  const firstName = staff.firstName || '';
  const lastName = staff.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  
  if (!fullName) return staff.email || 'Unknown';
  
  // Check if any of the user's roles is 'doctor'
  const isDoctor = staff.roles?.some(r => r.role === 'doctor');
  if (isDoctor) {
    return `Dr. ${fullName}`;
  }
  
  return fullName;
}

export default function StaffCosts() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const [period, setPeriod] = useState("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("staff");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRolesDialogOpen, setIsRolesDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [managingRolesStaff, setManagingRolesStaff] = useState<StaffMember | null>(null);
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'nurse',
    unitId: '',
    hourlyRate: '',
    staffType: 'internal' as 'internal' | 'external',
  });
  
  const [newRoleData, setNewRoleData] = useState({
    role: 'nurse',
    unitId: '',
  });

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: [`/api/business/${activeHospital?.id}/staff`],
    enabled: !!activeHospital?.id,
  });

  const { data: hospitalUnits = [] } = useQuery<UnitOption[]>({
    queryKey: [`/api/business/${activeHospital?.id}/units`],
    enabled: !!activeHospital?.id,
  });

  const { data: userRoles = [], isLoading: isLoadingRoles } = useQuery<RoleAssignment[]>({
    queryKey: ['/api/business', activeHospital?.id, 'staff', managingRolesStaff?.id, 'roles'],
    queryFn: async () => {
      const res = await fetch(`/api/business/${activeHospital?.id}/staff/${managingRolesStaff?.id}/roles`);
      if (!res.ok) throw new Error('Failed to fetch roles');
      return res.json();
    },
    enabled: !!activeHospital?.id && !!managingRolesStaff?.id && isRolesDialogOpen,
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('POST', `/api/business/${activeHospital?.id}/staff`, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        role: data.role,
        unitId: data.unitId,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
        staffType: data.staffType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/staff`] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({
        title: t('common.success'),
        description: t('business.staff.createSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('business.staff.createError'),
        variant: 'destructive',
      });
    },
  });

  const updateStaffMutation = useMutation({
    mutationFn: async (data: { userId: string } & typeof formData) => {
      return apiRequest('PATCH', `/api/business/${activeHospital?.id}/staff/${data.userId}`, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        role: data.role,
        unitId: data.unitId,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : null,
        staffType: data.staffType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/staff`] });
      setIsEditDialogOpen(false);
      setEditingStaff(null);
      resetForm();
      toast({
        title: t('common.success'),
        description: t('business.staff.updateSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('business.staff.updateError'),
        variant: 'destructive',
      });
    },
  });

  const updateStaffTypeMutation = useMutation({
    mutationFn: async ({ userId, staffType }: { userId: string; staffType: 'internal' | 'external' }) => {
      return apiRequest('PATCH', `/api/business/${activeHospital?.id}/staff/${userId}/type`, { staffType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/staff`] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('business.staff.updateError'),
        variant: 'destructive',
      });
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role, unitId }: { userId: string; role: string; unitId: string }) => {
      return apiRequest('POST', `/api/business/${activeHospital?.id}/staff/${userId}/roles`, { role, unitId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/business', activeHospital?.id, 'staff', managingRolesStaff?.id, 'roles'] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/staff`] });
      setNewRoleData({ role: 'nurse', unitId: '' });
      toast({
        title: t('common.success'),
        description: t('business.staff.roleAddSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('business.staff.roleAddError'),
        variant: 'destructive',
      });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      return apiRequest('DELETE', `/api/business/${activeHospital?.id}/staff/${userId}/roles/${roleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/business', activeHospital?.id, 'staff', managingRolesStaff?.id, 'roles'] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/staff`] });
      toast({
        title: t('common.success'),
        description: t('business.staff.roleDeleteSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('business.staff.roleDeleteError'),
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      role: 'nurse',
      unitId: '',
      hourlyRate: '',
      staffType: 'internal',
    });
  };

  const handleAddStaff = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEditStaff = (staff: StaffMember) => {
    setEditingStaff(staff);
    // Use the first role for editing (user may have multiple roles)
    const primaryRole = staff.roles?.[0];
    setFormData({
      firstName: staff.firstName || '',
      lastName: staff.lastName || '',
      email: staff.email || '',
      role: primaryRole?.role || 'nurse',
      unitId: primaryRole?.unitId || '',
      hourlyRate: staff.hourlyRate?.toString() || '',
      staffType: staff.staffType,
    });
    setIsEditDialogOpen(true);
  };

  const handleSubmitCreate = () => {
    if (!formData.firstName || !formData.lastName || !formData.unitId) {
      toast({
        title: t('common.error'),
        description: t('business.staff.requiredFields'),
        variant: 'destructive',
      });
      return;
    }
    createStaffMutation.mutate(formData);
  };

  const handleSubmitEdit = () => {
    if (!editingStaff || !formData.firstName || !formData.lastName) {
      toast({
        title: t('common.error'),
        description: t('business.staff.requiredFields'),
        variant: 'destructive',
      });
      return;
    }
    updateStaffMutation.mutate({ userId: editingStaff.id, ...formData });
  };

  const handleManageRoles = (staff: StaffMember) => {
    setManagingRolesStaff(staff);
    setNewRoleData({ role: 'nurse', unitId: '' });
    setIsRolesDialogOpen(true);
  };

  const handleAddRole = () => {
    if (!managingRolesStaff || !newRoleData.unitId) {
      toast({
        title: t('common.error'),
        description: t('business.staff.requiredFields'),
        variant: 'destructive',
      });
      return;
    }
    addRoleMutation.mutate({
      userId: managingRolesStaff.id,
      role: newRoleData.role,
      unitId: newRoleData.unitId,
    });
  };

  const handleDeleteRole = (roleId: string) => {
    if (!managingRolesStaff) return;
    deleteRoleMutation.mutate({
      userId: managingRolesStaff.id,
      roleId,
    });
  };

  const handleToggleStaffType = (staff: StaffMember) => {
    const newType = staff.staffType === 'internal' ? 'external' : 'internal';
    updateStaffTypeMutation.mutate({ userId: staff.id, staffType: newType });
  };

  const filteredStaff = useMemo(() => {
    return staffList.filter(staff => {
      const name = getDisplayName(staff).toLowerCase();
      // Get all role labels for this staff member
      const roleLabels = staff.roles?.map(r => getRoleLabel(r.role, r.unitType).toLowerCase()) || [];
      const matchesSearch = name.includes(searchQuery.toLowerCase()) ||
                            roleLabels.some(label => label.includes(searchQuery.toLowerCase()));
      // Check if any of the user's roles matches the filter
      const matchesRole = roleFilter === "all" || staff.roles?.some(r => r.role === roleFilter);
      return matchesSearch && matchesRole;
    });
  }, [staffList, searchQuery, roleFilter]);

  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    staffList.forEach(s => {
      s.roles?.forEach(r => roles.add(r.role));
    });
    return Array.from(roles);
  }, [staffList]);

  const totalStaff = staffList.length;
  const appUsers = staffList.filter(s => s.canLogin).length;
  const internalStaff = staffList.filter(s => s.staffType === 'internal').length;
  const externalStaff = staffList.filter(s => s.staffType === 'external').length;

  if (!activeHospital?.id) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center">
        <p className="text-muted-foreground">{t('common.selectHospital')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-staff-costs-title">
            {t('business.staff.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('business.staff.subtitle')}
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">{t('business.periods.week')}</SelectItem>
            <SelectItem value="month">{t('business.periods.month')}</SelectItem>
            <SelectItem value="quarter">{t('business.periods.quarter')}</SelectItem>
            <SelectItem value="year">{t('business.periods.year')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title={t('business.staff.totalStaff')}
          value={totalStaff.toString()}
          subtitle={`${internalStaff} ${t('business.staff.internal')}, ${externalStaff} ${t('business.staff.external')}`}
          helpText={t('business.help.totalStaff')}
          icon={<Users className="h-4 w-4" />}
        />
        <SummaryCard
          title={t('business.staff.appUsers')}
          value={appUsers.toString()}
          subtitle={t('business.staff.linkedToApp')}
          helpText={t('business.help.appUsers')}
          icon={<UserCheck className="h-4 w-4" />}
          iconBg="bg-blue-500/10 text-blue-500"
        />
        <SummaryCard
          title={t('business.staff.internalStaff')}
          value={internalStaff.toString()}
          subtitle={t('business.staff.clinicEmployees')}
          helpText={t('business.help.internalStaff')}
          icon={<Building2 className="h-4 w-4" />}
          iconBg="bg-green-500/10 text-green-500"
        />
        <SummaryCard
          title={t('business.staff.externalStaff')}
          value={externalStaff.toString()}
          subtitle={t('business.staff.rentedTemp')}
          helpText={t('business.help.externalStaff')}
          icon={<Clock className="h-4 w-4" />}
          iconBg="bg-purple-500/10 text-purple-500"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="staff" data-testid="tab-staff">
            <Users className="h-4 w-4 mr-2" />
            {t('business.staff.staffList')}
          </TabsTrigger>
          <TabsTrigger value="breakdown" data-testid="tab-breakdown">
            <Activity className="h-4 w-4 mr-2" />
            {t('business.staff.costBreakdown')}
          </TabsTrigger>
          <TabsTrigger value="surgeries" data-testid="tab-surgeries">
            <Calendar className="h-4 w-4 mr-2" />
            {t('business.staff.perSurgery')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center">
                  <CardTitle className="text-lg">{t('business.staff.manageStaff')}</CardTitle>
                  <HelpTooltip content={t('business.help.manageStaff')} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('business.staff.searchStaff')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-[200px]"
                      data-testid="input-search-staff"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[160px]" data-testid="select-role-filter">
                      <SelectValue placeholder={t('business.staff.filterByRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('business.staff.allRoles')}</SelectItem>
                      {uniqueRoles.map(role => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddStaff} data-testid="button-add-staff">
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('business.staff.addStaff')}
                  </Button>
                </div>
              </div>
              <CardDescription>{t('business.staff.manageStaffDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">{t('business.staff.noStaffFound')}</p>
                  <Button variant="outline" className="mt-4" onClick={handleAddStaff}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('business.staff.addFirstStaff')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('business.staff.name')}</TableHead>
                        <TableHead>{t('business.staff.role')}</TableHead>
                        <TableHead className="text-right">{t('business.staff.hourlyRate')}</TableHead>
                        <TableHead className="text-center">{t('business.staff.staffTypeLabel')}</TableHead>
                        <TableHead className="text-center">{t('business.staff.appUser')}</TableHead>
                        <TableHead className="text-right">{t('business.staff.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStaff.map((staff) => (
                        <TableRow key={staff.id} data-testid={`row-staff-${staff.id}`}>
                          <TableCell className="font-medium">
                            <div>
                              {getDisplayName(staff)}
                              {staff.email && (
                                <div className="text-xs text-muted-foreground">{staff.email}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {staff.roles?.map((role, idx) => (
                                <Badge 
                                  key={`${staff.id}-${role.role}-${role.unitId || idx}`}
                                  variant="outline" 
                                  className={getRoleBadgeStyle(role.role, role.unitType)}
                                >
                                  {getRoleLabel(role.role, role.unitType)}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {staff.hourlyRate ? `€${staff.hourlyRate}/h` : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className={`text-xs ${staff.staffType === 'internal' ? 'text-green-600' : 'text-muted-foreground'}`}>
                                {t('business.staff.internal')}
                              </span>
                              <Switch
                                checked={staff.staffType === 'external'}
                                onCheckedChange={() => handleToggleStaffType(staff)}
                                data-testid={`switch-staff-type-${staff.id}`}
                              />
                              <span className={`text-xs ${staff.staffType === 'external' ? 'text-purple-600' : 'text-muted-foreground'}`}>
                                {t('business.staff.external')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={staff.canLogin ? "default" : "secondary"}>
                              {staff.canLogin ? t('common.yes') : t('common.no')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleManageRoles(staff)}
                                    data-testid={`button-manage-roles-${staff.id}`}
                                  >
                                    <Shield className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('business.staff.manageRoles')}</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditStaff(staff)}
                                    data-testid={`button-edit-staff-${staff.id}`}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('common.edit')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard
              title={t('business.staff.costByRole')}
              description={t('business.staff.costByRoleDesc')}
              helpText={t('business.help.costByRole')}
            >
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mockCostByRole}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {mockCostByRole.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: number) => [`€${value.toLocaleString()}`, '']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend 
                      formatter={(value, entry: any) => (
                        <span className="text-xs">{value}: €{entry.payload.value.toLocaleString()}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className="lg:col-span-2">
              <ChartCard
                title={t('business.staff.costTrend')}
                description={t('business.staff.costTrendDesc')}
                helpText={t('business.help.staffCostTrend')}
              >
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockCostTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={(value) => `€${(value/1000).toFixed(0)}k`} />
                      <RechartsTooltip 
                        formatter={(value: number) => [`€${value.toLocaleString()}`, '']}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="surgeons" stackId="a" fill="#ef4444" name={t('business.staff.surgeons')} />
                      <Bar dataKey="anesthesiologists" stackId="a" fill="#3b82f6" name={t('business.staff.anesthesiologists')} />
                      <Bar dataKey="nurses" stackId="a" fill="#10b981" name={t('business.staff.nurses')} />
                      <Bar dataKey="assistants" stackId="a" fill="#8b5cf6" name={t('business.staff.assistants')} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center">
                <CardTitle className="text-lg">{t('business.staff.avgCostBySurgeryType')}</CardTitle>
                <HelpTooltip content={t('business.help.avgCostBySurgeryType')} />
              </div>
              <CardDescription>{t('business.staff.avgCostBySurgeryTypeDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('business.staff.surgeryType')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.avgStaffCost')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.surgeryCount')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.totalStaffCostCol')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockCostPerSurgery.map((row) => (
                      <TableRow key={row.type}>
                        <TableCell className="font-medium">{row.type}</TableCell>
                        <TableCell className="text-right">€{row.avgStaffCost.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.surgeries}</TableCell>
                        <TableCell className="text-right font-medium">
                          €{(row.avgStaffCost * row.surgeries).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="surgeries" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <CardTitle className="text-lg">{t('business.staff.surgeryStaffCosts')}</CardTitle>
                <HelpTooltip content={t('business.help.surgeryStaffCosts')} />
              </div>
              <CardDescription>{t('business.staff.surgeryStaffCostsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('business.staff.date')}</TableHead>
                      <TableHead>{t('business.staff.surgery')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.surgeons')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.anesthesia')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.nurses')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.assistants')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.totalCost')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockSurgeryStaffCosts.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell className="font-medium">{row.surgery}</TableCell>
                        <TableCell className="text-right">€{row.surgeons.toLocaleString()}</TableCell>
                        <TableCell className="text-right">€{row.anesthesia.toLocaleString()}</TableCell>
                        <TableCell className="text-right">€{row.nurses.toLocaleString()}</TableCell>
                        <TableCell className="text-right">€{row.assistants.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">€{row.total.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Staff Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('business.staff.addStaff')}</DialogTitle>
            <DialogDescription>{t('business.staff.addStaffDesc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('business.staff.firstName')} *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder={t('business.staff.firstNamePlaceholder')}
                  data-testid="input-staff-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('business.staff.lastName')} *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder={t('business.staff.lastNamePlaceholder')}
                  data-testid="input-staff-lastname"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('business.staff.email')} ({t('common.optional')})</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={t('business.staff.emailPlaceholder')}
                data-testid="input-staff-email"
              />
              <p className="text-xs text-muted-foreground">{t('business.staff.emailHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">{t('business.staff.role')} *</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger data-testid="select-staff-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">{t('business.staff.roleDoctor')}</SelectItem>
                    <SelectItem value="nurse">{t('business.staff.roleNurse')}</SelectItem>
                    <SelectItem value="manager">{t('business.staff.roleManager')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">{t('business.staff.unit')} *</Label>
                <Select value={formData.unitId} onValueChange={(value) => setFormData({ ...formData, unitId: value })}>
                  <SelectTrigger data-testid="select-staff-unit">
                    <SelectValue placeholder={t('business.staff.selectUnit')} />
                  </SelectTrigger>
                  <SelectContent>
                    {hospitalUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hourlyRate">{t('business.staff.hourlyRate')} (€)</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-staff-hourlyrate"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('business.staff.staffTypeLabel')}</Label>
                <Select
                  value={formData.staffType}
                  onValueChange={(value: 'internal' | 'external') => setFormData({ ...formData, staffType: value })}
                >
                  <SelectTrigger data-testid="select-staff-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">{t('business.staff.internal')}</SelectItem>
                    <SelectItem value="external">{t('business.staff.external')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmitCreate} disabled={createStaffMutation.isPending}>
              {createStaffMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog - User-level fields only */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('business.staff.editStaff')}</DialogTitle>
            <DialogDescription>{t('business.staff.editStaffDesc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">{t('business.staff.firstName')} *</Label>
                <Input
                  id="edit-firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  data-testid="input-edit-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">{t('business.staff.lastName')} *</Label>
                <Input
                  id="edit-lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  data-testid="input-edit-lastname"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">{t('business.staff.email')}</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-hourlyRate">{t('business.staff.hourlyRate')} (€)</Label>
                <Input
                  id="edit-hourlyRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-edit-hourlyrate"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('business.staff.staffTypeLabel')}</Label>
                <Select
                  value={formData.staffType}
                  onValueChange={(value: 'internal' | 'external') => setFormData({ ...formData, staffType: value })}
                >
                  <SelectTrigger data-testid="select-edit-stafftype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">{t('business.staff.internal')}</SelectItem>
                    <SelectItem value="external">{t('business.staff.external')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('business.staff.editRolesHint')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmitEdit} disabled={updateStaffMutation.isPending}>
              {updateStaffMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Roles Dialog */}
      <Dialog open={isRolesDialogOpen} onOpenChange={(open) => {
        setIsRolesDialogOpen(open);
        if (!open) setManagingRolesStaff(null);
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{t('business.staff.manageRoles')}</DialogTitle>
            <DialogDescription>
              {managingRolesStaff && getDisplayName(managingRolesStaff)} - {t('business.staff.manageRolesDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Current Roles List */}
            <div className="space-y-2">
              <Label>{t('business.staff.currentRoles')}</Label>
              {isLoadingRoles ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : userRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t('business.staff.noRoles')}</p>
              ) : (
                <div className="space-y-2">
                  {userRoles.map((roleAssignment) => (
                    <div 
                      key={roleAssignment.id} 
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      data-testid={`role-item-${roleAssignment.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={getRoleBadgeStyle(roleAssignment.role, roleAssignment.unitType)}
                        >
                          {getRoleLabel(roleAssignment.role, roleAssignment.unitType)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {t('common.in')} {roleAssignment.unitName || t('business.staff.unknownUnit')}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteRole(roleAssignment.id)}
                        disabled={deleteRoleMutation.isPending || userRoles.length <= 1}
                        data-testid={`button-delete-role-${roleAssignment.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Role */}
            <div className="space-y-2 pt-4 border-t">
              <Label>{t('business.staff.addNewRole')}</Label>
              <div className="flex gap-2">
                <Select 
                  value={newRoleData.role} 
                  onValueChange={(value) => setNewRoleData({ ...newRoleData, role: value })}
                >
                  <SelectTrigger className="w-[140px]" data-testid="select-new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">{t('business.staff.roleDoctor')}</SelectItem>
                    <SelectItem value="nurse">{t('business.staff.roleNurse')}</SelectItem>
                    <SelectItem value="manager">{t('business.staff.roleManager')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select 
                  value={newRoleData.unitId} 
                  onValueChange={(value) => setNewRoleData({ ...newRoleData, unitId: value })}
                >
                  <SelectTrigger className="flex-1" data-testid="select-new-unit">
                    <SelectValue placeholder={t('business.staff.selectUnit')} />
                  </SelectTrigger>
                  <SelectContent>
                    {hospitalUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleAddRole}
                  disabled={!newRoleData.unitId || addRoleMutation.isPending}
                  data-testid="button-add-role"
                >
                  {addRoleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRolesDialogOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
