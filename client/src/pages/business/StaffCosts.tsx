import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  LineChart,
  Line,
} from "recharts";

const mockStaffList = [
  { id: 1, name: "Dr. Anna Weber", role: "Surgeon", hourlyRate: 180, isAppUser: true, email: "a.weber@clinic.de", status: "active", surgeries: 42, hoursThisMonth: 142, costThisMonth: 25560 },
  { id: 2, name: "Dr. Thomas Müller", role: "Surgeon", hourlyRate: 175, isAppUser: true, email: "t.mueller@clinic.de", status: "active", surgeries: 38, hoursThisMonth: 128, costThisMonth: 22400 },
  { id: 3, name: "Dr. Klaus Schmidt", role: "Anesthesiologist", hourlyRate: 160, isAppUser: true, email: "k.schmidt@clinic.de", status: "active", surgeries: 56, hoursThisMonth: 156, costThisMonth: 24960 },
  { id: 4, name: "Maria Hoffmann", role: "Surgery Nurse", hourlyRate: 55, isAppUser: true, email: "m.hoffmann@clinic.de", status: "active", surgeries: 78, hoursThisMonth: 186, costThisMonth: 10230 },
  { id: 5, name: "Laura Fischer", role: "Surgery Nurse", hourlyRate: 52, isAppUser: false, email: null, status: "active", surgeries: 65, hoursThisMonth: 178, costThisMonth: 9256 },
  { id: 6, name: "Peter Bauer", role: "Anesthesia Nurse", hourlyRate: 58, isAppUser: true, email: "p.bauer@clinic.de", status: "active", surgeries: 52, hoursThisMonth: 165, costThisMonth: 9570 },
  { id: 7, name: "Sandra Klein", role: "Surgical Assistant", hourlyRate: 45, isAppUser: false, email: null, status: "active", surgeries: 82, hoursThisMonth: 192, costThisMonth: 8640 },
  { id: 8, name: "Michael Braun", role: "Anesthesiologist", hourlyRate: 155, isAppUser: true, email: "m.braun@clinic.de", status: "inactive", surgeries: 28, hoursThisMonth: 112, costThisMonth: 17360 },
  { id: 9, name: "Dr. Eva Schulz", role: "Surgeon", hourlyRate: 185, isAppUser: true, email: "e.schulz@clinic.de", status: "active", surgeries: 35, hoursThisMonth: 118, costThisMonth: 21830 },
  { id: 10, name: "Hans Weber", role: "Surgical Assistant", hourlyRate: 42, isAppUser: false, email: null, status: "active", surgeries: 95, hoursThisMonth: 198, costThisMonth: 8316 },
];

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

function getRoleBadgeStyle(role: string) {
  switch (role) {
    case "Surgeon":
      return "border-red-500/50 text-red-600 dark:text-red-400";
    case "Anesthesiologist":
      return "border-blue-500/50 text-blue-600 dark:text-blue-400";
    case "Surgery Nurse":
      return "border-green-500/50 text-green-600 dark:text-green-400";
    case "Anesthesia Nurse":
      return "border-orange-500/50 text-orange-600 dark:text-orange-400";
    case "Surgical Assistant":
      return "border-purple-500/50 text-purple-600 dark:text-purple-400";
    default:
      return "border-gray-500/50 text-gray-600 dark:text-gray-400";
  }
}

export default function StaffCosts() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("staff");

  const totalStaffCost = mockStaffList.reduce((sum, s) => sum + s.costThisMonth, 0);
  const totalHours = mockStaffList.reduce((sum, s) => sum + s.hoursThisMonth, 0);
  const activeStaff = mockStaffList.filter(s => s.status === "active").length;
  const appUsers = mockStaffList.filter(s => s.isAppUser).length;

  const filteredStaff = mockStaffList.filter(staff => {
    const matchesSearch = staff.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          staff.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || staff.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const uniqueRoles = Array.from(new Set(mockStaffList.map(s => s.role)));

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
          title={t('business.staff.totalStaffCost')}
          value={`€${totalStaffCost.toLocaleString()}`}
          subtitle={t('business.staff.thisMonth')}
          trend={3.8}
          helpText={t('business.help.totalStaffCost')}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <SummaryCard
          title={t('business.staff.totalHours')}
          value={`${totalHours.toLocaleString()}h`}
          subtitle={t('business.staff.allStaff')}
          trend={5.2}
          helpText={t('business.help.totalHours')}
          icon={<Clock className="h-4 w-4" />}
          iconBg="bg-blue-500/10 text-blue-500"
        />
        <SummaryCard
          title={t('business.staff.activeStaff')}
          value={activeStaff.toString()}
          subtitle={`${mockStaffList.length} ${t('business.staff.total')}`}
          helpText={t('business.help.activeStaff')}
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-green-500/10 text-green-500"
        />
        <SummaryCard
          title={t('business.staff.appUsers')}
          value={appUsers.toString()}
          subtitle={t('business.staff.linkedToApp')}
          helpText={t('business.help.appUsers')}
          icon={<UserCheck className="h-4 w-4" />}
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
                  <Button data-testid="button-add-staff">
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('business.staff.addStaff')}
                  </Button>
                </div>
              </div>
              <CardDescription>{t('business.staff.manageStaffDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('business.staff.name')}</TableHead>
                      <TableHead>{t('business.staff.role')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.hourlyRate')}</TableHead>
                      <TableHead className="text-center">{t('business.staff.appUser')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.hoursThisMonth')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.costThisMonth')}</TableHead>
                      <TableHead>{t('business.staff.status')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaff.map((staff) => (
                      <TableRow key={staff.id} data-testid={`row-staff-${staff.id}`}>
                        <TableCell className="font-medium">
                          <div>
                            {staff.name}
                            {staff.email && (
                              <div className="text-xs text-muted-foreground">{staff.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleBadgeStyle(staff.role)}>
                            {staff.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">€{staff.hourlyRate}/h</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={staff.isAppUser} disabled />
                        </TableCell>
                        <TableCell className="text-right">{staff.hoursThisMonth}h</TableCell>
                        <TableCell className="text-right font-medium">€{staff.costThisMonth.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={staff.status === "active" ? "default" : "secondary"}>
                            {staff.status === "active" ? t('business.staff.active') : t('business.staff.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" data-testid={`button-edit-staff-${staff.id}`}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-staff-${staff.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
                <CardTitle className="text-lg">{t('business.staff.staffCostPerSurgery')}</CardTitle>
                <HelpTooltip content={t('business.help.staffCostPerSurgery')} />
              </div>
              <CardDescription>{t('business.staff.staffCostPerSurgeryDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('business.staff.date')}</TableHead>
                      <TableHead>{t('business.staff.patient')}</TableHead>
                      <TableHead>{t('business.staff.surgery')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.surgeons')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.anesthesia')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.nurses')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.assistants')}</TableHead>
                      <TableHead className="text-right">{t('business.staff.totalCol')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockSurgeryStaffCosts.map((row) => (
                      <TableRow key={row.id} data-testid={`row-surgery-${row.id}`}>
                        <TableCell className="text-muted-foreground">{row.date}</TableCell>
                        <TableCell>{row.patient}</TableCell>
                        <TableCell className="font-medium">{row.surgery}</TableCell>
                        <TableCell className="text-right text-red-600 dark:text-red-400">€{row.surgeons.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-blue-600 dark:text-blue-400">€{row.anesthesia.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">€{row.nurses.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-purple-600 dark:text-purple-400">€{row.assistants.toLocaleString()}</TableCell>
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
    </div>
  );
}
