import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  HelpCircle, 
  Activity, 
  DollarSign, 
  Clock, 
  LayoutGrid,
  Calendar,
  Users,
  AlertTriangle
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
  Legend
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const mockSurgeryTrend = [
  { month: "Jan", surgeries: 142, planned: 150 },
  { month: "Feb", surgeries: 158, planned: 155 },
  { month: "Mar", surgeries: 165, planned: 160 },
  { month: "Apr", surgeries: 148, planned: 165 },
  { month: "May", surgeries: 172, planned: 170 },
  { month: "Jun", surgeries: 168, planned: 175 },
];

const mockCostTrend = [
  { month: "Jan", costs: 285000, budget: 300000 },
  { month: "Feb", costs: 312000, budget: 310000 },
  { month: "Mar", costs: 298000, budget: 305000 },
  { month: "Apr", costs: 325000, budget: 320000 },
  { month: "May", costs: 342000, budget: 335000 },
  { month: "Jun", costs: 318000, budget: 340000 },
];

const mockStaffCostTrend = [
  { month: "Jan", staffCosts: 142000, budget: 150000 },
  { month: "Feb", staffCosts: 156000, budget: 155000 },
  { month: "Mar", staffCosts: 148000, budget: 152000 },
  { month: "Apr", staffCosts: 162000, budget: 160000 },
  { month: "May", staffCosts: 171000, budget: 165000 },
  { month: "Jun", staffCosts: 158000, budget: 168000 },
];

const mockSurgeryByType = [
  { name: "Orthopedic", value: 245, color: "#3b82f6" },
  { name: "Cardiac", value: 128, color: "#ef4444" },
  { name: "General", value: 312, color: "#10b981" },
  { name: "Neuro", value: 89, color: "#f59e0b" },
  { name: "Plastic", value: 156, color: "#8b5cf6" },
  { name: "Other", value: 123, color: "#6b7280" },
];

const mockRoomUtilization = [
  { room: "OR-1", utilization: 82, target: 80 },
  { room: "OR-2", utilization: 76, target: 80 },
  { room: "OR-3", utilization: 91, target: 80 },
  { room: "OR-4", utilization: 68, target: 80 },
  { room: "OR-5", utilization: 85, target: 80 },
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

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  trendLabel?: string;
  helpText: string;
  icon: React.ReactNode;
  warning?: boolean;
}

function KPICard({ title, value, subtitle, trend, trendLabel, helpText, icon, warning }: KPICardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;
  
  return (
    <Card className={warning ? "border-amber-500/50 bg-amber-500/5" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <HelpTooltip content={helpText} />
        </div>
        <div className={`p-2 rounded-lg ${warning ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend !== undefined && (
          <div className="flex items-center mt-2">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            ) : isNegative ? (
              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
            ) : null}
            <span className={`text-xs ${isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground"}`}>
              {isPositive ? "+" : ""}{trend}% {trendLabel}
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

export default function BusinessDashboard() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-dashboard-title">
            {t('business.dashboard.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('business.dashboard.subtitle')}
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]" data-testid="select-period">
            <SelectValue placeholder={t('business.dashboard.selectPeriod')} />
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
        <KPICard
          title={t('business.kpi.totalSurgeries')}
          value="1,053"
          subtitle={t('business.kpi.thisMonth')}
          trend={8.2}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.totalSurgeries')}
          icon={<Activity className="h-4 w-4" />}
        />
        <KPICard
          title={t('business.kpi.totalCosts')}
          value="€318,450"
          subtitle={t('business.kpi.materialsAndSupplies')}
          trend={-2.4}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.totalCosts')}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title={t('business.kpi.avgDuration')}
          value="127 min"
          subtitle={t('business.kpi.perSurgery')}
          trend={-5.1}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.avgDuration')}
          icon={<Clock className="h-4 w-4" />}
        />
        <KPICard
          title={t('business.kpi.orUtilization')}
          value="78.4%"
          subtitle={t('business.kpi.acrossAllRooms')}
          trend={3.2}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.orUtilization')}
          icon={<LayoutGrid className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title={t('business.kpi.staffCosts')}
          value="€158,000"
          subtitle={t('business.kpi.hourlyStaffThisMonth')}
          trend={3.8}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.staffCosts')}
          icon={<Users className="h-4 w-4" />}
        />
        <KPICard
          title={t('business.kpi.costPerSurgery')}
          value="€302"
          subtitle={t('business.kpi.averageMaterialCost')}
          trend={-1.8}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.costPerSurgery')}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title={t('business.kpi.turnoverTime')}
          value="32 min"
          subtitle={t('business.kpi.betweenSurgeries')}
          trend={-8.5}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.turnoverTime')}
          icon={<Clock className="h-4 w-4" />}
        />
        <KPICard
          title={t('business.kpi.onTimeStart')}
          value="84.2%"
          subtitle={t('business.kpi.startedWithin15min')}
          trend={2.1}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.onTimeStart')}
          icon={<Calendar className="h-4 w-4" />}
        />
        <KPICard
          title={t('business.kpi.cancellationRate')}
          value="4.8%"
          subtitle={t('business.kpi.ofPlannedSurgeries')}
          trend={1.2}
          trendLabel={t('business.kpi.vsLastMonth')}
          helpText={t('business.help.cancellationRate')}
          icon={<AlertTriangle className="h-4 w-4" />}
          warning
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('business.charts.surgeryTrend')}
          description={t('business.charts.surgeryTrendDesc')}
          helpText={t('business.help.surgeryTrend')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockSurgeryTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="surgeries" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name={t('business.charts.actual')}
                  dot={{ fill: '#3b82f6' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="planned" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('business.charts.planned')}
                  dot={{ fill: '#94a3b8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('business.charts.costTrend')}
          description={t('business.charts.costTrendDesc')}
          helpText={t('business.help.costTrend')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockCostTrend}>
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
                <Line 
                  type="monotone" 
                  dataKey="costs" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  name={t('business.charts.actualCosts')}
                  dot={{ fill: '#10b981' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="budget" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('business.charts.budget')}
                  dot={{ fill: '#f59e0b' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('business.charts.staffCostTrend')}
          description={t('business.charts.staffCostTrendDesc')}
          helpText={t('business.help.staffCostTrend')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockStaffCostTrend}>
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
                <Line 
                  type="monotone" 
                  dataKey="staffCosts" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  name={t('business.charts.actualStaffCosts')}
                  dot={{ fill: '#8b5cf6' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="budget" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('business.charts.budget')}
                  dot={{ fill: '#94a3b8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('business.charts.roomUtilization')}
          description={t('business.charts.roomUtilizationDesc')}
          helpText={t('business.help.roomUtilization')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockRoomUtilization} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" domain={[0, 100]} className="text-xs" tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="room" className="text-xs" width={50} />
                <RechartsTooltip 
                  formatter={(value: number) => [`${value}%`, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar 
                  dataKey="utilization" 
                  fill="#3b82f6" 
                  radius={[0, 4, 4, 0]}
                  name={t('business.charts.utilization')}
                />
                <Bar 
                  dataKey="target" 
                  fill="#e2e8f0" 
                  radius={[0, 4, 4, 0]}
                  name={t('business.charts.target')}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('business.charts.surgeryByType')}
          description={t('business.charts.surgeryByTypeDesc')}
          helpText={t('business.help.surgeryByType')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mockSurgeryByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {mockSurgeryByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('business.charts.staffCostByRole')}
          description={t('business.charts.staffCostByRoleDesc')}
          helpText={t('business.help.staffCostByRole')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Surgeons", value: 68000, color: "#ef4444" },
                    { name: "Anesthesiologists", value: 42000, color: "#3b82f6" },
                    { name: "Surgery Nurses", value: 28000, color: "#10b981" },
                    { name: "Anesthesia Nurses", value: 12000, color: "#f59e0b" },
                    { name: "Assistants", value: 8000, color: "#8b5cf6" },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {[
                    { name: "Surgeons", value: 68000, color: "#ef4444" },
                    { name: "Anesthesiologists", value: 42000, color: "#3b82f6" },
                    { name: "Surgery Nurses", value: 28000, color: "#10b981" },
                    { name: "Anesthesia Nurses", value: 12000, color: "#f59e0b" },
                    { name: "Assistants", value: 8000, color: "#8b5cf6" },
                  ].map((entry, index) => (
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
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('business.alerts.title')}</CardTitle>
            <HelpTooltip content={t('business.help.alerts')} />
          </div>
          <CardDescription>{t('business.alerts.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('business.alerts.highCancellation')}</p>
                <p className="text-xs text-muted-foreground">{t('business.alerts.highCancellationDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Activity className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('business.alerts.or3Overload')}</p>
                <p className="text-xs text-muted-foreground">{t('business.alerts.or3OverloadDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <TrendingUp className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('business.alerts.turnoverImproved')}</p>
                <p className="text-xs text-muted-foreground">{t('business.alerts.turnoverImprovedDesc')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
