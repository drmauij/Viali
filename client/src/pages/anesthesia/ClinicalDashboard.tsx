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
  ThermometerSun,
  Clock,
  Heart,
  AlertTriangle,
  Stethoscope,
  Pill,
  BedDouble,
  CheckCircle2,
  XCircle,
  Timer
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
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const mockPonvTrend = [
  { month: "Jan", rate: 28, target: 25 },
  { month: "Feb", rate: 26, target: 25 },
  { month: "Mar", rate: 24, target: 25 },
  { month: "Apr", rate: 22, target: 25 },
  { month: "May", rate: 21, target: 25 },
  { month: "Jun", rate: 19, target: 25 },
];

const mockPainScoreTrend = [
  { month: "Jan", avgScore: 3.8, target: 3.0 },
  { month: "Feb", avgScore: 3.5, target: 3.0 },
  { month: "Mar", avgScore: 3.2, target: 3.0 },
  { month: "Apr", avgScore: 3.1, target: 3.0 },
  { month: "May", avgScore: 2.9, target: 3.0 },
  { month: "Jun", avgScore: 2.8, target: 3.0 },
];

const mockPacuDurationTrend = [
  { month: "Jan", duration: 68, target: 60 },
  { month: "Feb", duration: 65, target: 60 },
  { month: "Mar", duration: 62, target: 60 },
  { month: "Apr", duration: 58, target: 60 },
  { month: "May", duration: 55, target: 60 },
  { month: "Jun", duration: 52, target: 60 },
];

const mockAldreteTimeTrend = [
  { month: "Jan", time: 48, target: 45 },
  { month: "Feb", time: 45, target: 45 },
  { month: "Mar", time: 42, target: 45 },
  { month: "Apr", time: 40, target: 45 },
  { month: "May", time: 38, target: 45 },
  { month: "Jun", time: 36, target: 45 },
];

const mockNormothermiaTrend = [
  { month: "Jan", rate: 92, target: 95 },
  { month: "Feb", rate: 93, target: 95 },
  { month: "Mar", rate: 94, target: 95 },
  { month: "Apr", rate: 95, target: 95 },
  { month: "May", rate: 96, target: 95 },
  { month: "Jun", rate: 97, target: 95 },
];

const mockAnesthesiaTechniqueDistribution = [
  { name: "General", value: 412, color: "#3b82f6" },
  { name: "Spinal", value: 186, color: "#10b981" },
  { name: "Epidural", value: 124, color: "#f59e0b" },
  { name: "Regional Block", value: 98, color: "#8b5cf6" },
  { name: "Sedation", value: 76, color: "#ec4899" },
];

const mockAsaDistribution = [
  { asa: "ASA I", count: 245, color: "#10b981" },
  { asa: "ASA II", count: 412, color: "#3b82f6" },
  { asa: "ASA III", count: 186, color: "#f59e0b" },
  { asa: "ASA IV", count: 48, color: "#ef4444" },
  { asa: "ASA V", count: 5, color: "#7f1d1d" },
];

const mockComplicationsByType = [
  { type: "Hypotension", count: 42 },
  { type: "Bradycardia", count: 28 },
  { type: "Hypothermia", count: 18 },
  { type: "Difficult Airway", count: 12 },
  { type: "PONV", count: 156 },
  { type: "Desaturation", count: 8 },
];

const mockRegionalAnesthesiaRate = [
  { month: "Jan", rate: 32 },
  { month: "Feb", rate: 35 },
  { month: "Mar", rate: 38 },
  { month: "Apr", rate: 42 },
  { month: "May", rate: 45 },
  { month: "Jun", rate: 48 },
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
  success?: boolean;
}

function KPICard({ title, value, subtitle, trend, trendLabel, helpText, icon, warning, success }: KPICardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;
  
  return (
    <Card className={warning ? "border-amber-500/50 bg-amber-500/5" : success ? "border-green-500/50 bg-green-500/5" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <HelpTooltip content={helpText} />
        </div>
        <div className={`p-2 rounded-lg ${warning ? "bg-amber-500/10 text-amber-600" : success ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"}`}>
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

export default function ClinicalDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState("month");

  const canAccess = activeHospital?.isAnesthesiaModule && 
    (activeHospital?.role === "admin" || activeHospital?.role === "doctor");

  if (!canAccess) {
    return (
      <div className="p-4 md:p-6 space-y-6 pb-24">
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <div>
                <h3 className="font-semibold">{t('clinical.accessDenied')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('clinical.accessDeniedDescription')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-clinical-dashboard-title">
            {t('clinical.dashboard.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('clinical.dashboard.subtitle')}
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]" data-testid="select-clinical-period">
            <SelectValue placeholder={t('clinical.dashboard.selectPeriod')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">{t('clinical.periods.week')}</SelectItem>
            <SelectItem value="month">{t('clinical.periods.month')}</SelectItem>
            <SelectItem value="quarter">{t('clinical.periods.quarter')}</SelectItem>
            <SelectItem value="year">{t('clinical.periods.year')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={t('clinical.kpi.ponvRate')}
          value="19.2%"
          subtitle={t('clinical.kpi.below25Target')}
          trend={-8.5}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.ponvRate')}
          icon={<Pill className="h-4 w-4" />}
          success
        />
        <KPICard
          title={t('clinical.kpi.avgPainScore')}
          value="2.8"
          subtitle={t('clinical.kpi.atPacuDischarge')}
          trend={-12.5}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.avgPainScore')}
          icon={<Activity className="h-4 w-4" />}
          success
        />
        <KPICard
          title={t('clinical.kpi.normothermia')}
          value="97.2%"
          subtitle={t('clinical.kpi.temperatureCompliance')}
          trend={2.1}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.normothermia')}
          icon={<ThermometerSun className="h-4 w-4" />}
          success
        />
        <KPICard
          title={t('clinical.kpi.avgPacuDuration')}
          value="52 min"
          subtitle={t('clinical.kpi.allPatients')}
          trend={-5.5}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.avgPacuDuration')}
          icon={<BedDouble className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title={t('clinical.kpi.aldreteTime')}
          value="36 min"
          subtitle={t('clinical.kpi.toScore9')}
          trend={-5.0}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.aldreteTime')}
          icon={<Timer className="h-4 w-4" />}
        />
        <KPICard
          title={t('clinical.kpi.regionalRate')}
          value="48%"
          subtitle={t('clinical.kpi.ofEligibleCases')}
          trend={6.7}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.regionalRate')}
          icon={<Stethoscope className="h-4 w-4" />}
          success
        />
        <KPICard
          title={t('clinical.kpi.unplannedIcu')}
          value="0.8%"
          subtitle={t('clinical.kpi.fromPacu')}
          trend={-0.3}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.unplannedIcu')}
          icon={<Heart className="h-4 w-4" />}
          success
        />
        <KPICard
          title={t('clinical.kpi.whoCompliance')}
          value="99.2%"
          subtitle={t('clinical.kpi.checklistCompletion')}
          trend={0.5}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.whoCompliance')}
          icon={<CheckCircle2 className="h-4 w-4" />}
          success
        />
        <KPICard
          title={t('clinical.kpi.delayedDischarge')}
          value="3.2%"
          subtitle={t('clinical.kpi.pacuStayOver2x')}
          trend={0.8}
          trendLabel={t('clinical.kpi.vsLastMonth')}
          helpText={t('clinical.help.delayedDischarge')}
          icon={<Clock className="h-4 w-4" />}
          warning
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('clinical.charts.ponvTrend')}
          description={t('clinical.charts.ponvTrendDesc')}
          helpText={t('clinical.help.ponvTrendChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockPonvTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `${v}%`} />
                <RechartsTooltip 
                  formatter={(value: number) => [`${value}%`, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="rate" 
                  stroke="#10b981" 
                  fill="#10b98130"
                  strokeWidth={2}
                  name={t('clinical.charts.actualRate')}
                />
                <Line 
                  type="monotone" 
                  dataKey="target" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('clinical.charts.targetRate')}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('clinical.charts.painScoreTrend')}
          description={t('clinical.charts.painScoreTrendDesc')}
          helpText={t('clinical.help.painScoreChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockPainScoreTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" domain={[0, 5]} />
                <RechartsTooltip 
                  formatter={(value: number) => [value.toFixed(1), '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="avgScore" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name={t('clinical.charts.avgPainScore')}
                  dot={{ fill: '#3b82f6' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="target" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('clinical.charts.targetScore')}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('clinical.charts.pacuDurationTrend')}
          description={t('clinical.charts.pacuDurationTrendDesc')}
          helpText={t('clinical.help.pacuDurationChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockPacuDurationTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `${v}min`} />
                <RechartsTooltip 
                  formatter={(value: number) => [`${value} min`, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="duration" 
                  stroke="#8b5cf6" 
                  fill="#8b5cf630"
                  strokeWidth={2}
                  name={t('clinical.charts.avgDuration')}
                />
                <Line 
                  type="monotone" 
                  dataKey="target" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('clinical.charts.targetDuration')}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('clinical.charts.normothermiaTrend')}
          description={t('clinical.charts.normothermiaTrendDesc')}
          helpText={t('clinical.help.normothermiaChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockNormothermiaTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" domain={[85, 100]} tickFormatter={(v) => `${v}%`} />
                <RechartsTooltip 
                  formatter={(value: number) => [`${value}%`, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="rate" 
                  stroke="#f59e0b" 
                  fill="#f59e0b30"
                  strokeWidth={2}
                  name={t('clinical.charts.complianceRate')}
                />
                <Line 
                  type="monotone" 
                  dataKey="target" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('clinical.charts.targetRate')}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('clinical.charts.anesthesiaTechniques')}
          description={t('clinical.charts.anesthesiaTechniquesDesc')}
          helpText={t('clinical.help.techniquesChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mockAnesthesiaTechniqueDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {mockAnesthesiaTechniqueDistribution.map((entry, index) => (
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
          title={t('clinical.charts.asaDistribution')}
          description={t('clinical.charts.asaDistributionDesc')}
          helpText={t('clinical.help.asaChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockAsaDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="asa" className="text-xs" />
                <YAxis className="text-xs" />
                <RechartsTooltip 
                  formatter={(value: number) => [value, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar 
                  dataKey="count" 
                  radius={[4, 4, 0, 0]}
                  name={t('clinical.charts.patientCount')}
                >
                  {mockAsaDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('clinical.charts.complicationsByType')}
          description={t('clinical.charts.complicationsByTypeDesc')}
          helpText={t('clinical.help.complicationsChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockComplicationsByType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="type" className="text-xs" width={100} />
                <RechartsTooltip 
                  formatter={(value: number) => [value, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar 
                  dataKey="count" 
                  fill="#ef4444" 
                  radius={[0, 4, 4, 0]}
                  name={t('clinical.charts.incidentCount')}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('clinical.charts.regionalAnesthesiaRate')}
          description={t('clinical.charts.regionalAnesthesiaRateDesc')}
          helpText={t('clinical.help.regionalRateChart')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockRegionalAnesthesiaRate}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `${v}%`} />
                <RechartsTooltip 
                  formatter={(value: number) => [`${value}%`, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="rate" 
                  stroke="#10b981" 
                  fill="#10b98130"
                  strokeWidth={2}
                  name={t('clinical.charts.utilizationRate')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('clinical.alerts.title')}</CardTitle>
            <HelpTooltip content={t('clinical.help.alerts')} />
          </div>
          <CardDescription>{t('clinical.alerts.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('clinical.alerts.ponvImproved')}</p>
                <p className="text-xs text-muted-foreground">{t('clinical.alerts.ponvImprovedDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <TrendingUp className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('clinical.alerts.regionalIncreased')}</p>
                <p className="text-xs text-muted-foreground">{t('clinical.alerts.regionalIncreasedDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('clinical.alerts.delayedDischargeUp')}</p>
                <p className="text-xs text-muted-foreground">{t('clinical.alerts.delayedDischargeUpDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Activity className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('clinical.alerts.painManagement')}</p>
                <p className="text-xs text-muted-foreground">{t('clinical.alerts.painManagementDesc')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
