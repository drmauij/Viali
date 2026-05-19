import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { getCurrencySymbol } from "@/lib/dateUtils";
import { Redirect } from "wouter";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Users,
  Clock,
  HelpCircle,
  UserPlus,
  Search,
  Edit2,
  Building2,
  Loader2,
  Eye,
  UserCheck,
  X,
  Send,
  MailCheck,
} from "lucide-react";
import StaffTimeOffTab from "@/components/business/StaffTimeOffTab";
import { StammblattStatusBadge, type StammblattStatus } from "@/components/stammblatt/StammblattStatusBadge";

interface RoleInfo {
  role: string;
  unitId: string | null;
  unitName: string | null;
  unitType: string | null;
}

interface WorkerPortalData {
  firstName: string | null;
  lastName: string | null;
  profession: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  dateOfBirth: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  religion: string | null;
  mobile: string | null;
  ahvNumber: string | null;
  hasChildBenefits: boolean | null;
  numberOfChildren: number | null;
  childBenefitsRecipient: string | null;
  childBenefitsRegistration: string | null;
  hasResidencePermit: boolean | null;
  residencePermitType: string | null;
  residencePermitValidUntil: string | null;
  bankName: string | null;
  bankAddress: string | null;
  bankAccount: string | null;
  hasOwnVehicle: boolean | null;
  lastAccessedAt: string | null;
}

interface StaffMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: RoleInfo[];
  staffType: "internal" | "external";
  hourlyRate: number | null;
  weeklyTargetHours: number | null;
  overtimeBalanceMinutes: number | null;
  annualVacationDays: number | null;
  canLogin: boolean;
  createdAt: string | null;
  workerPortal: WorkerPortalData | null;
  stammblatt: StammblattStatus;
}

interface UnitOption {
  id: string;
  name: string;
  type: string | null;
}

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
  helpText: string;
  icon: React.ReactNode;
  iconBg?: string;
}

function SummaryCard({ title, value, subtitle, helpText, icon, iconBg = "bg-primary/10 text-primary" }: SummaryCardProps) {
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
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function getRoleLabel(role: string, roleInfo: RoleInfo): string {
  const { unitType, unitName } = roleInfo;
  
  if (role === 'doctor') {
    if (unitType === 'anesthesia') return 'Anesthesiologist';
    if (unitType === 'or') return 'Surgeon';
    return 'Doctor';
  }
  if (role === 'nurse') {
    if (unitType === 'anesthesia') return 'Anesthesia Nurse';
    if (unitType === 'or') return 'OR Nurse';
    return 'Nurse';
  }
  if (role === 'manager') return 'Manager';
  const capitalizedRole = role.charAt(0).toUpperCase() + role.slice(1);
  if (unitName) {
    return `${capitalizedRole} @ ${unitName}`;
  }
  return capitalizedRole;
}

function getRoleBadgeStyle(role: string, roleInfo: RoleInfo) {
  const { unitType } = roleInfo;
  
  if (role === 'doctor' && unitType === 'or') {
    return "border-red-500/50 text-red-600 dark:text-red-400";
  }
  if (role === 'doctor' && unitType === 'anesthesia') {
    return "border-blue-500/50 text-blue-600 dark:text-blue-400";
  }
  if (role === 'doctor') {
    return "border-blue-500/50 text-blue-600 dark:text-blue-400";
  }
  if (role === 'nurse' && unitType === 'or') {
    return "border-green-500/50 text-green-600 dark:text-green-400";
  }
  if (role === 'nurse' && unitType === 'anesthesia') {
    return "border-orange-500/50 text-orange-600 dark:text-orange-400";
  }
  if (role === 'nurse') {
    return "border-teal-500/50 text-teal-600 dark:text-teal-400";
  }
  if (role === 'manager') {
    return "border-purple-500/50 text-purple-600 dark:text-purple-400";
  }
  return "border-gray-500/50 text-gray-600 dark:text-gray-400";
}

function getDisplayName(staff: StaffMember): string {
  const firstName = staff.firstName || '';
  const lastName = staff.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  
  if (!fullName) return staff.email || 'Unknown';
  
  const isDoctor = staff.roles?.some(r => r.role === 'doctor');
  if (isDoctor) {
    return `Dr. ${fullName}`;
  }
  
  return fullName;
}

export default function SimplifiedStaff() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [viewingStaff, setViewingStaff] = useState<StaffMember | null>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'nurse',
    unitId: '',
    hourlyRate: '',
    staffType: 'internal' as 'internal' | 'external',
    weeklyTargetHours: '',
    overtimeBalanceHours: '',
    annualVacationDays: '',
  });

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: [`/api/business/${activeHospital?.id}/staff`],
    enabled: !!activeHospital?.id,
  });

  const { data: hospitalUnits = [] } = useQuery<UnitOption[]>({
    queryKey: [`/api/business/${activeHospital?.id}/units`],
    enabled: !!activeHospital?.id,
  });

  const { data: pendingTimeOffData } = useQuery<{ count: number }>({
    queryKey: [`/api/business/${activeHospital?.id}/time-off/pending-count`],
    enabled: !!activeHospital?.id,
    refetchInterval: 30000,
  });
  const pendingTimeOffCount = pendingTimeOffData?.count || 0;

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
        weeklyTargetHours: data.weeklyTargetHours ? parseFloat(data.weeklyTargetHours) : null,
        overtimeBalanceMinutes: data.overtimeBalanceHours ? Math.round(parseFloat(data.overtimeBalanceHours) * 60) : null,
        annualVacationDays: data.annualVacationDays ? parseInt(data.annualVacationDays) : null,
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

  const inviteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/business/${activeHospital!.id}/staff/${userId}/stammblatt-invite`)
        .then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/staff`] });
      toast({ title: "Einladung verschickt" });
    },
    onError: () => {
      toast({ title: "Fehler beim Versenden", variant: "destructive" });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/business/${activeHospital!.id}/staff/stammblatt-invite/bulk`, { scope: 'all_incomplete' })
        .then(r => r.json()),
    onSuccess: (res: { sent: number; skipped: Array<{ userId: string; reason: string }> }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/staff`] });
      toast({
        title: `${res.sent} Einladungen verschickt`,
        description: res.skipped.length > 0 ? `${res.skipped.length} übersprungen` : undefined,
      });
      setIsBulkConfirmOpen(false);
    },
    onError: () => {
      toast({ title: "Fehler beim Massenversand", variant: "destructive" });
      setIsBulkConfirmOpen(false);
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
      weeklyTargetHours: '',
      overtimeBalanceHours: '',
      annualVacationDays: '',
    });
  };

  const handleAddStaff = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEditStaff = (staff: StaffMember) => {
    setEditingStaff(staff);
    const primaryRole = staff.roles?.[0];
    setFormData({
      firstName: staff.firstName || '',
      lastName: staff.lastName || '',
      email: staff.email || '',
      role: primaryRole?.role || 'nurse',
      unitId: primaryRole?.unitId || '',
      hourlyRate: staff.hourlyRate?.toString() || '',
      staffType: staff.staffType,
      weeklyTargetHours: staff.weeklyTargetHours?.toString() || '',
      overtimeBalanceHours: staff.overtimeBalanceMinutes != null ? (staff.overtimeBalanceMinutes / 60).toString() : '',
      annualVacationDays: staff.annualVacationDays?.toString() || '',
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

  const handleViewDetails = (staff: StaffMember) => {
    setViewingStaff(staff);
    setIsDetailsDialogOpen(true);
  };

  const filteredStaff = useMemo(() => {
    return staffList.filter(staff => {
      const name = getDisplayName(staff).toLowerCase();
      const roleLabels = staff.roles?.map(r => getRoleLabel(r.role, r).toLowerCase()) || [];
      const matchesSearch = name.includes(searchQuery.toLowerCase()) ||
                            roleLabels.some(label => label.includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === "all" || staff.roles?.some(r => r.role === roleFilter);
      const matchesIncomplete = !onlyIncomplete || staff.stammblatt?.status !== 'submitted';
      return matchesSearch && matchesRole && matchesIncomplete;
    });
  }, [staffList, searchQuery, roleFilter, onlyIncomplete]);

  const eligibleBulkCount = useMemo(() => {
    return staffList.filter(s =>
      s.stammblatt?.status !== 'submitted' &&
      s.email &&
      !s.email.endsWith('@staff.local') &&
      !s.email.endsWith('@internal.local')
    ).length;
  }, [staffList]);

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

  const isManager = activeHospital?.role === 'admin' || activeHospital?.role === 'manager';
  const stammblattEnabled = !!activeHospital?.addonPersonalstammblatt && isManager;

  // Redirect staff users to dashboard - they can only access Dashboard tab
  if (!isManager) {
    return <Redirect to="/business" />;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-staff-title">
          {t('business.staff.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('business.staff.subtitle')}
        </p>
      </div>

      <Tabs defaultValue="costs">
        <div className="overflow-x-auto scrollbar-hide">
          <TabsList className="inline-flex w-auto min-w-full">
            <TabsTrigger value="costs" className="whitespace-nowrap">{t('business.staff.staffCosts')}</TabsTrigger>
            <TabsTrigger value="timeoff" className="whitespace-nowrap">
              {t('business.staff.timeOff')}
              {pendingTimeOffCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 min-w-[20px] px-1.5 text-[10px]">
                  {pendingTimeOffCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="costs" className="space-y-6 mt-4">
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
          {stammblattEnabled && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => setOnlyIncomplete(v => !v)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${onlyIncomplete ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                Nur unvollständig anzeigen
              </button>
              <button
                onClick={() => setIsBulkConfirmOpen(true)}
                disabled={eligibleBulkCount === 0}
                className="px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="flex items-center gap-1">
                  <Send className="h-3 w-3" />
                  Alle einladen ({eligibleBulkCount})
                </span>
              </button>
            </div>
          )}
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
                    <TableHead>{t('business.costs.role')}</TableHead>
                    <TableHead className="text-right">{t('business.staff.hourlyRate')}</TableHead>
                    <TableHead>{t('business.staff.staffTypeLabel')}</TableHead>
                    {stammblattEnabled && <TableHead>Personalstammblatt</TableHead>}
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
                              className={getRoleBadgeStyle(role.role, role)}
                            >
                              {getRoleLabel(role.role, role)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {staff.hourlyRate ? `${getCurrencySymbol()} ${staff.hourlyRate}/h` : '-'}
                      </TableCell>
                      <TableCell>
                        <span className={staff.staffType === 'internal' ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}>
                          {staff.staffType === 'internal' ? t('business.staff.internal') : t('business.staff.external')}
                        </span>
                      </TableCell>
                      {stammblattEnabled && (
                        <TableCell>
                          <StammblattStatusBadge value={staff.stammblatt} />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewDetails(staff)}
                                data-testid={`button-view-staff-${staff.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('business.staff.viewDetails')}</p>
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
                          {stammblattEnabled && (() => {
                            const sb = staff.stammblatt;
                            const hasInvalidEmail = !staff.email || (staff.email.endsWith('@staff.local') || staff.email.endsWith('@internal.local'));
                            if (sb.status === 'submitted') {
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleViewDetails(staff)}
                                      data-testid={`button-stammblatt-view-${staff.id}`}
                                    >
                                      <MailCheck className="h-4 w-4 text-green-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p>Stammblatt anzeigen</p></TooltipContent>
                                </Tooltip>
                              );
                            }
                            const label = sb.status === 'missing' ? "Einladung senden" : "Erneut senden";
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={hasInvalidEmail || inviteMutation.isPending}
                                      onClick={() => inviteMutation.mutate(staff.id)}
                                      data-testid={`button-stammblatt-invite-${staff.id}`}
                                    >
                                      {inviteMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Send className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{hasInvalidEmail ? "Keine gültige E-Mail-Adresse hinterlegt" : label}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
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
                <Label htmlFor="hourlyRate">{t('business.staff.hourlyRate')} ({getCurrencySymbol()})</Label>
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

      {/* Edit Staff Dialog */}
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
                readOnly
                disabled
                className="bg-muted cursor-not-allowed"
                data-testid="input-edit-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-hourlyRate">{t('business.staff.hourlyRate')} ({getCurrencySymbol()})</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-weeklyTargetHours">{t('business.staff.weeklyTargetHours')}</Label>
                <Input
                  id="edit-weeklyTargetHours"
                  type="number"
                  step="0.5"
                  min="0"
                  max="168"
                  value={formData.weeklyTargetHours}
                  onChange={(e) => setFormData({ ...formData, weeklyTargetHours: e.target.value })}
                  placeholder={t('business.staff.weeklyTargetHoursPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-overtimeBalance">{t('business.staff.overtimeBalance')}</Label>
                <Input
                  id="edit-overtimeBalance"
                  type="number"
                  step="0.25"
                  value={formData.overtimeBalanceHours}
                  onChange={(e) => setFormData({ ...formData, overtimeBalanceHours: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">{t('business.staff.overtimeBalanceHint')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-annualVacationDays">{t('business.staff.annualVacationDays')}</Label>
                <Input
                  id="edit-annualVacationDays"
                  type="number"
                  step="1"
                  min="0"
                  max="365"
                  value={formData.annualVacationDays}
                  onChange={(e) => setFormData({ ...formData, annualVacationDays: e.target.value })}
                  placeholder={t('business.staff.annualVacationDaysPlaceholder')}
                />
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

      {/* Staff Details Dialog (read-only). Surfaces the worker-portal data
          submitted via /worklog/:token when present, plus the basic staff
          info we already track. */}
      <StaffDetailsDialog
        open={isDetailsDialogOpen}
        onOpenChange={(open) => {
          setIsDetailsDialogOpen(open);
          if (!open) setViewingStaff(null);
        }}
        staff={viewingStaff}
      />

      {/* Bulk invite confirm dialog */}
      {stammblattEnabled && (
        <Dialog open={isBulkConfirmOpen} onOpenChange={setIsBulkConfirmOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Masseneinladung senden</DialogTitle>
              <DialogDescription>
                Es werden Einladungen an <strong>{eligibleBulkCount}</strong> Mitarbeitende ohne vollständiges Stammblatt versandt. Fortfahren?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsBulkConfirmOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending}
              >
                {bulkMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Jetzt senden
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
        </TabsContent>

        <TabsContent value="timeoff" className="mt-4">
          <StaffTimeOffTab hospitalId={activeHospital.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Read-only Staff Details Dialog ──────────────────────────────────────
// Surfaces the data captured by external workers via /worklog/:token plus
// the standard staff profile fields. All values render as plain text; nothing
// in this dialog is editable.

interface StaffDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember | null;
}

function StaffDetailsDialog({ open, onOpenChange, staff }: StaffDetailsDialogProps) {
  const { t } = useTranslation();
  if (!staff) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]" />
      </Dialog>
    );
  }

  const wp = staff.workerPortal;
  const fullName = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim() || staff.email || '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fullName}</DialogTitle>
          <DialogDescription>{staff.email || t('business.staff.viewDetails')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-sm">
          {/* Always-visible profile basics */}
          <DetailSection title={t('business.staff.detailsProfile')}>
            <DetailRow label={t('business.staff.staffTypeLabel')} value={staff.staffType === 'internal' ? t('business.staff.internal') : t('business.staff.external')} />
            <DetailRow label={t('business.staff.hourlyRate')} value={staff.hourlyRate != null ? `${staff.hourlyRate}/h` : '—'} />
            {wp?.profession && <DetailRow label={t('business.staff.detailsProfession')} value={wp.profession} />}
            {wp?.dateOfBirth && <DetailRow label={t('business.staff.detailsDateOfBirth')} value={wp.dateOfBirth} />}
            {wp?.nationality && <DetailRow label={t('business.staff.detailsNationality')} value={wp.nationality} />}
            {wp?.maritalStatus && <DetailRow label={t('business.staff.detailsMaritalStatus')} value={wp.maritalStatus} />}
            {wp?.religion && <DetailRow label={t('business.staff.detailsReligion')} value={wp.religion} />}
            {wp?.mobile && <DetailRow label={t('business.staff.detailsMobile')} value={wp.mobile} />}
          </DetailSection>

          {wp && (wp.address || wp.city || wp.zip) && (
            <DetailSection title={t('business.staff.detailsAddress')}>
              {wp.address && <DetailRow label={t('business.staff.detailsStreet')} value={wp.address} />}
              {(wp.zip || wp.city) && (
                <DetailRow label={t('business.staff.detailsCity')} value={[wp.zip, wp.city].filter(Boolean).join(' ')} />
              )}
            </DetailSection>
          )}

          {wp?.ahvNumber && (
            <DetailSection title={t('business.staff.detailsTax')}>
              <DetailRow label={t('business.staff.detailsAhv')} value={wp.ahvNumber} />
            </DetailSection>
          )}

          {wp && (wp.bankName || wp.bankAccount || wp.bankAddress) && (
            <DetailSection title={t('business.staff.detailsBank')}>
              {wp.bankName && <DetailRow label={t('business.staff.detailsBankName')} value={wp.bankName} />}
              {wp.bankAccount && <DetailRow label={t('business.staff.detailsBankAccount')} value={wp.bankAccount} mono />}
              {wp.bankAddress && <DetailRow label={t('business.staff.detailsBankAddress')} value={wp.bankAddress} />}
            </DetailSection>
          )}

          {wp?.hasResidencePermit !== null && wp?.hasResidencePermit !== undefined && (
            <DetailSection title={t('business.staff.detailsResidencePermit')}>
              {wp.hasResidencePermit ? (
                <>
                  {wp.residencePermitType && <DetailRow label={t('business.staff.detailsPermitType')} value={wp.residencePermitType} />}
                  {wp.residencePermitValidUntil && <DetailRow label={t('business.staff.detailsPermitValidUntil')} value={wp.residencePermitValidUntil} />}
                </>
              ) : (
                <p className="text-muted-foreground">{t('business.staff.detailsNoPermit')}</p>
              )}
            </DetailSection>
          )}

          {wp?.hasChildBenefits && (
            <DetailSection title={t('business.staff.detailsChildBenefits')}>
              {wp.numberOfChildren != null && <DetailRow label={t('business.staff.detailsNumChildren')} value={String(wp.numberOfChildren)} />}
              {wp.childBenefitsRecipient && <DetailRow label={t('business.staff.detailsBenefitsRecipient')} value={wp.childBenefitsRecipient} />}
              {wp.childBenefitsRegistration && <DetailRow label={t('business.staff.detailsBenefitsRegistration')} value={wp.childBenefitsRegistration} />}
            </DetailSection>
          )}

          {wp?.hasOwnVehicle !== null && wp?.hasOwnVehicle !== undefined && (
            <DetailSection title={t('business.staff.detailsMobility')}>
              <DetailRow label={t('business.staff.detailsOwnVehicle')} value={wp.hasOwnVehicle ? t('common.yes') : t('common.no')} />
            </DetailSection>
          )}

          {!wp && staff.staffType === 'external' && (
            <p className="text-sm text-muted-foreground italic">{t('business.staff.detailsNoPortalData')}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      <div className="space-y-1.5 border rounded-lg p-3 bg-muted/40">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs text-muted-foreground min-w-[140px]">{label}</span>
      <span className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</span>
    </div>
  );
}
