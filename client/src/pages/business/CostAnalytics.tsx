import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { 
  HelpCircle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Package,
  Pill,
  Scissors,
  Activity,
  Users
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area
} from "recharts";

const mockMonthlyCosts = [
  { month: "Jan", medications: 85000, supplies: 120000, equipment: 45000, staff: 142000, other: 35000 },
  { month: "Feb", medications: 92000, supplies: 135000, equipment: 48000, staff: 156000, other: 37000 },
  { month: "Mar", medications: 88000, supplies: 125000, equipment: 46000, staff: 148000, other: 39000 },
  { month: "Apr", medications: 95000, supplies: 142000, equipment: 50000, staff: 162000, other: 38000 },
  { month: "May", medications: 102000, supplies: 148000, equipment: 52000, staff: 171000, other: 40000 },
  { month: "Jun", medications: 94000, supplies: 138000, equipment: 49000, staff: 158000, other: 37000 },
];

const mockCostByCategory = [
  { name: "Staff Labor", value: 158000, color: "#8b5cf6", icon: "users" },
  { name: "Surgical Supplies", value: 138000, color: "#3b82f6", icon: "scissors" },
  { name: "Medications", value: 94000, color: "#10b981", icon: "pill" },
  { name: "Equipment", value: 49000, color: "#f59e0b", icon: "cog" },
  { name: "Sterile Goods", value: 28000, color: "#ec4899", icon: "package" },
  { name: "Other", value: 9450, color: "#6b7280", icon: "box" },
];

const mockStaffCostBreakdown = [
  { id: 1, name: "Dr. Anna Weber", role: "Surgeon", hourlyRate: 180, hoursWorked: 142, totalCost: 25560, trend: 5.2 },
  { id: 2, name: "Dr. Thomas Müller", role: "Surgeon", hourlyRate: 175, hoursWorked: 128, totalCost: 22400, trend: -2.1 },
  { id: 3, name: "Dr. Klaus Schmidt", role: "Anesthesiologist", hourlyRate: 160, hoursWorked: 156, totalCost: 24960, trend: 8.5 },
  { id: 4, name: "Maria Hoffmann", role: "Surgery Nurse", hourlyRate: 55, hoursWorked: 186, totalCost: 10230, trend: 3.1 },
  { id: 5, name: "Laura Fischer", role: "Surgery Nurse", hourlyRate: 52, hoursWorked: 178, totalCost: 9256, trend: -1.5 },
  { id: 6, name: "Peter Bauer", role: "Anesthesia Nurse", hourlyRate: 58, hoursWorked: 165, totalCost: 9570, trend: 4.2 },
  { id: 7, name: "Sandra Klein", role: "Surgical Assistant", hourlyRate: 45, hoursWorked: 192, totalCost: 8640, trend: 0 },
  { id: 8, name: "Michael Braun", role: "Anesthesiologist", hourlyRate: 155, hoursWorked: 112, totalCost: 17360, trend: -3.8 },
];

const mockCostBySurgeryType = [
  { type: "Orthopedic", avgMaterialCost: 680, avgLaborCost: 890, avgTotalCost: 1570, count: 156, totalCost: 244920, trend: -2.1 },
  { type: "General", avgMaterialCost: 245, avgLaborCost: 420, avgTotalCost: 665, count: 218, totalCost: 144970, trend: -1.8 },
  { type: "Plastic", avgMaterialCost: 520, avgLaborCost: 680, avgTotalCost: 1200, count: 89, totalCost: 106800, trend: 0.5 },
  { type: "Other", avgMaterialCost: 380, avgLaborCost: 520, avgTotalCost: 900, count: 65, totalCost: 58500, trend: 1.2 },
];

const mockTopItems = [
  { id: 1, name: "Surgical Sutures Set", category: "Supplies", unitCost: 45, usage: 312, totalCost: 14040, trend: 12 },
  { id: 2, name: "Propofol 200mg", category: "Medication", unitCost: 28, usage: 486, totalCost: 13608, trend: -3 },
  { id: 3, name: "Sterile Drape Kit", category: "Sterile", unitCost: 35, usage: 380, totalCost: 13300, trend: 5 },
  { id: 4, name: "Fentanyl 100mcg", category: "Medication", unitCost: 18, usage: 652, totalCost: 11736, trend: 2 },
  { id: 5, name: "Surgical Gloves Box", category: "Supplies", unitCost: 22, usage: 520, totalCost: 11440, trend: -1 },
  { id: 6, name: "Rocuronium 50mg", category: "Medication", unitCost: 42, usage: 248, totalCost: 10416, trend: 8 },
  { id: 7, name: "IV Cannula 18G", category: "Supplies", unitCost: 8, usage: 1250, totalCost: 10000, trend: 0 },
  { id: 8, name: "Sevoflurane 250ml", category: "Medication", unitCost: 125, usage: 78, totalCost: 9750, trend: -5 },
];

const mockCostPerSurgeryTrend = [
  { month: "Jan", orthopedic: 650, general: 235, plastic: 485, other: 365 },
  { month: "Feb", orthopedic: 680, general: 248, plastic: 510, other: 378 },
  { month: "Mar", orthopedic: 665, general: 242, plastic: 498, other: 362 },
  { month: "Apr", orthopedic: 695, general: 238, plastic: 525, other: 388 },
  { month: "May", orthopedic: 670, general: 250, plastic: 515, other: 375 },
  { month: "Jun", orthopedic: 680, general: 245, plastic: 520, other: 380 },
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
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend !== undefined && (
          <div className="flex items-center mt-2">
            {trend > 0 ? (
              <TrendingUp className="h-4 w-4 text-red-500 mr-1" />
            ) : trend < 0 ? (
              <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
            ) : null}
            <span className={`text-xs ${trend > 0 ? "text-red-500" : trend < 0 ? "text-green-500" : "text-muted-foreground"}`}>
              {trend > 0 ? "+" : ""}{trend}% vs last month
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ChartCardProps {
  title: string;
  description?: string;
  helpText: string;
  children: React.ReactNode;
}

function ChartCard({ title, description, helpText, children }: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <CardTitle className="text-lg">{title}</CardTitle>
          <HelpTooltip content={helpText} />
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}

export default function CostAnalytics() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");
  const [surgeryTypeFilter, setSurgeryTypeFilter] = useState("all");

  const totalCosts = mockCostByCategory.reduce((sum, cat) => sum + cat.value, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-cost-analytics-title">
            {t('business.costs.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('business.costs.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard
          title={t('business.costs.totalSpending')}
          value={`€${totalCosts.toLocaleString()}`}
          subtitle={t('business.costs.thisMonth')}
          trend={2.4}
          helpText={t('business.help.totalSpending')}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <SummaryCard
          title={t('business.costs.staffCosts')}
          value="€158,000"
          subtitle={`${((158000/totalCosts)*100).toFixed(1)}% ${t('business.costs.ofTotal')}`}
          trend={3.8}
          helpText={t('business.help.staffCosts')}
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-purple-500/10 text-purple-500"
        />
        <SummaryCard
          title={t('business.costs.medicationCosts')}
          value="€94,000"
          subtitle={`${((94000/totalCosts)*100).toFixed(1)}% ${t('business.costs.ofTotal')}`}
          trend={-1.2}
          helpText={t('business.help.medicationCosts')}
          icon={<Pill className="h-4 w-4" />}
          iconBg="bg-green-500/10 text-green-500"
        />
        <SummaryCard
          title={t('business.costs.suppliesCosts')}
          value="€138,000"
          subtitle={`${((138000/totalCosts)*100).toFixed(1)}% ${t('business.costs.ofTotal')}`}
          trend={3.2}
          helpText={t('business.help.suppliesCosts')}
          icon={<Package className="h-4 w-4" />}
          iconBg="bg-blue-500/10 text-blue-500"
        />
        <SummaryCard
          title={t('business.costs.avgCostPerSurgery')}
          value="€890"
          subtitle={t('business.costs.inclLabor')}
          trend={-1.8}
          helpText={t('business.help.avgCostPerSurgeryInclLabor')}
          icon={<Scissors className="h-4 w-4" />}
          iconBg="bg-orange-500/10 text-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title={t('business.costs.costByCategory')}
          description={t('business.costs.costByCategoryDesc')}
          helpText={t('business.help.costByCategory')}
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mockCostByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {mockCostByCategory.map((entry, index) => (
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
            title={t('business.costs.monthlyBreakdown')}
            description={t('business.costs.monthlyBreakdownDesc')}
            helpText={t('business.help.monthlyBreakdown')}
          >
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockMonthlyCosts}>
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
                  <Area type="monotone" dataKey="staff" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name={t('business.costs.staffLabel')} />
                  <Area type="monotone" dataKey="supplies" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name={t('business.costs.supplies')} />
                  <Area type="monotone" dataKey="medications" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name={t('business.costs.medications')} />
                  <Area type="monotone" dataKey="equipment" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name={t('business.costs.equipment')} />
                  <Area type="monotone" dataKey="other" stackId="1" stroke="#6b7280" fill="#6b7280" fillOpacity={0.6} name={t('business.costs.other')} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      <ChartCard
        title={t('business.costs.costPerSurgeryType')}
        description={t('business.costs.costPerSurgeryTypeDesc')}
        helpText={t('business.help.costPerSurgeryType')}
      >
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockCostPerSurgeryTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(value) => `€${value}`} />
              <RechartsTooltip 
                formatter={(value: number) => [`€${value}`, '']}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="orthopedic" stroke="#3b82f6" strokeWidth={2} name={t('business.surgeryTypes.orthopedic')} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="general" stroke="#10b981" strokeWidth={2} name={t('business.surgeryTypes.general')} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="plastic" stroke="#8b5cf6" strokeWidth={2} name={t('business.surgeryTypes.plastic')} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="other" stroke="#6b7280" strokeWidth={2} name={t('business.surgeryTypes.other')} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CardTitle className="text-lg">{t('business.costs.costBySurgeryType')}</CardTitle>
              <HelpTooltip content={t('business.help.costBySurgeryType')} />
            </div>
          </div>
          <CardDescription>{t('business.costs.costBySurgeryTypeDescWithLabor')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.costs.surgeryType')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.avgMaterialCost')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.avgLaborCost')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.avgTotalCost')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.surgeryCount')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.totalCost')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.trend')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockCostBySurgeryType.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="font-medium">{row.type}</TableCell>
                    <TableCell className="text-right">€{row.avgMaterialCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-purple-600 dark:text-purple-400">€{row.avgLaborCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">€{row.avgTotalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right font-medium">€{row.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end">
                        {row.trend > 0 ? (
                          <TrendingUp className="h-4 w-4 text-red-500 mr-1" />
                        ) : row.trend < 0 ? (
                          <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
                        ) : null}
                        <span className={row.trend > 0 ? "text-red-500" : row.trend < 0 ? "text-green-500" : ""}>
                          {row.trend > 0 ? "+" : ""}{row.trend}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('business.costs.staffCostBreakdown')}</CardTitle>
            <HelpTooltip content={t('business.help.staffCostBreakdown')} />
          </div>
          <CardDescription>{t('business.costs.staffCostBreakdownDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.costs.staffMember')}</TableHead>
                  <TableHead>{t('business.costs.role')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.hourlyRate')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.hoursWorked')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.totalCost')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.trend')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockStaffCostBreakdown.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell className="font-medium">{staff.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        staff.role === "Surgeon" ? "border-red-500/50 text-red-600 dark:text-red-400" :
                        staff.role === "Anesthesiologist" ? "border-blue-500/50 text-blue-600 dark:text-blue-400" :
                        staff.role === "Surgery Nurse" ? "border-green-500/50 text-green-600 dark:text-green-400" :
                        staff.role === "Anesthesia Nurse" ? "border-orange-500/50 text-orange-600 dark:text-orange-400" :
                        "border-purple-500/50 text-purple-600 dark:text-purple-400"
                      }>{staff.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right">€{staff.hourlyRate}/h</TableCell>
                    <TableCell className="text-right">{staff.hoursWorked}h</TableCell>
                    <TableCell className="text-right font-medium">€{staff.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end">
                        {staff.trend > 0 ? (
                          <TrendingUp className="h-4 w-4 text-red-500 mr-1" />
                        ) : staff.trend < 0 ? (
                          <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <Activity className="h-4 w-4 text-muted-foreground mr-1" />
                        )}
                        <span className={staff.trend > 0 ? "text-red-500" : staff.trend < 0 ? "text-green-500" : "text-muted-foreground"}>
                          {staff.trend > 0 ? "+" : ""}{staff.trend}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('business.costs.topItems')}</CardTitle>
            <HelpTooltip content={t('business.help.topItems')} />
          </div>
          <CardDescription>{t('business.costs.topItemsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.costs.itemName')}</TableHead>
                  <TableHead>{t('business.costs.category')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.unitCost')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.usage')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.totalCost')}</TableHead>
                  <TableHead className="text-right">{t('business.costs.trend')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockTopItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right">€{item.unitCost}</TableCell>
                    <TableCell className="text-right">{item.usage}</TableCell>
                    <TableCell className="text-right font-medium">€{item.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end">
                        {item.trend > 0 ? (
                          <TrendingUp className="h-4 w-4 text-red-500 mr-1" />
                        ) : item.trend < 0 ? (
                          <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <Activity className="h-4 w-4 text-muted-foreground mr-1" />
                        )}
                        <span className={item.trend > 0 ? "text-red-500" : item.trend < 0 ? "text-green-500" : "text-muted-foreground"}>
                          {item.trend > 0 ? "+" : ""}{item.trend}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
