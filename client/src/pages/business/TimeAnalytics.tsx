import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { 
  HelpCircle, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Timer,
  Users,
  Activity,
  Calendar,
  ArrowRight,
  CheckCircle,
  XCircle
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Area,
  Cell
} from "recharts";

const mockDurationTrend = [
  { month: "Jan", planned: 125, actual: 132, variance: 7 },
  { month: "Feb", planned: 128, actual: 135, variance: 7 },
  { month: "Mar", planned: 130, actual: 128, variance: -2 },
  { month: "Apr", planned: 125, actual: 130, variance: 5 },
  { month: "May", planned: 128, actual: 125, variance: -3 },
  { month: "Jun", planned: 130, actual: 127, variance: -3 },
];

const mockTurnoverTimes = [
  { month: "Jan", turnover: 38, target: 30 },
  { month: "Feb", turnover: 35, target: 30 },
  { month: "Mar", turnover: 33, target: 30 },
  { month: "Apr", turnover: 34, target: 30 },
  { month: "May", turnover: 31, target: 30 },
  { month: "Jun", turnover: 32, target: 30 },
];

const mockRoomUtilization = [
  { room: "OR-1", morning: 92, afternoon: 78, evening: 45, avgUtilization: 72 },
  { room: "OR-2", morning: 88, afternoon: 82, evening: 38, avgUtilization: 69 },
  { room: "OR-3", morning: 95, afternoon: 91, evening: 68, avgUtilization: 85 },
  { room: "OR-4", morning: 75, afternoon: 68, evening: 25, avgUtilization: 56 },
  { room: "OR-5", morning: 90, afternoon: 85, evening: 52, avgUtilization: 76 },
];

const mockSurgeonEfficiency = [
  { name: "Dr. Mueller", surgeries: 48, avgDuration: 118, plannedDuration: 125, efficiency: 106, onTime: 92 },
  { name: "Dr. Schmidt", surgeries: 42, avgDuration: 135, plannedDuration: 130, efficiency: 96, onTime: 85 },
  { name: "Dr. Weber", surgeries: 56, avgDuration: 95, plannedDuration: 100, efficiency: 105, onTime: 88 },
  { name: "Dr. Fischer", surgeries: 38, avgDuration: 142, plannedDuration: 135, efficiency: 95, onTime: 78 },
  { name: "Dr. Wagner", surgeries: 52, avgDuration: 108, plannedDuration: 110, efficiency: 102, onTime: 91 },
];

const mockWeeklyPattern = [
  { day: "Mon", surgeries: 42, avgDuration: 128 },
  { day: "Tue", surgeries: 48, avgDuration: 125 },
  { day: "Wed", surgeries: 45, avgDuration: 132 },
  { day: "Thu", surgeries: 52, avgDuration: 122 },
  { day: "Fri", surgeries: 38, avgDuration: 118 },
];

const mockTimeMarkers = [
  { phase: "Patient Arrival → Anesthesia Start", avgTime: 18, target: 15, color: "#3b82f6" },
  { phase: "Anesthesia Start → Surgery Start", avgTime: 12, target: 10, color: "#10b981" },
  { phase: "Surgery Duration", avgTime: 95, target: 90, color: "#f59e0b" },
  { phase: "Surgery End → Patient Out", avgTime: 15, target: 12, color: "#8b5cf6" },
  { phase: "Room Turnover", avgTime: 32, target: 30, color: "#ef4444" },
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
  trendInverted?: boolean;
}

function SummaryCard({ title, value, subtitle, trend, helpText, icon, iconBg = "bg-primary/10 text-primary", trendInverted }: SummaryCardProps) {
  const isPositive = trendInverted ? (trend && trend < 0) : (trend && trend > 0);
  const isNegative = trendInverted ? (trend && trend > 0) : (trend && trend < 0);
  
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
            {trend < 0 ? (
              <TrendingDown className={`h-4 w-4 mr-1 ${trendInverted ? "text-green-500" : "text-red-500"}`} />
            ) : trend > 0 ? (
              <TrendingUp className={`h-4 w-4 mr-1 ${trendInverted ? "text-red-500" : "text-green-500"}`} />
            ) : null}
            <span className={`text-xs ${isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground"}`}>
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

export default function TimeAnalytics() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-time-analytics-title">
            {t('business.time.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('business.time.subtitle')}
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
          title={t('business.time.avgDuration')}
          value="127 min"
          subtitle={t('business.time.perSurgery')}
          trend={-5.1}
          helpText={t('business.help.avgDuration')}
          icon={<Clock className="h-4 w-4" />}
          trendInverted
        />
        <SummaryCard
          title={t('business.time.turnoverTime')}
          value="32 min"
          subtitle={t('business.time.betweenCases')}
          trend={-8.5}
          helpText={t('business.help.turnoverTime')}
          icon={<Timer className="h-4 w-4" />}
          iconBg="bg-green-500/10 text-green-500"
          trendInverted
        />
        <SummaryCard
          title={t('business.time.onTimeStart')}
          value="84.2%"
          subtitle={t('business.time.within15min')}
          trend={2.1}
          helpText={t('business.help.onTimeStart')}
          icon={<CheckCircle className="h-4 w-4" />}
          iconBg="bg-blue-500/10 text-blue-500"
        />
        <SummaryCard
          title={t('business.time.orUtilization')}
          value="78.4%"
          subtitle={t('business.time.avgAcrossRooms')}
          trend={3.2}
          helpText={t('business.help.orUtilization')}
          icon={<Activity className="h-4 w-4" />}
          iconBg="bg-purple-500/10 text-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={t('business.time.durationTrend')}
          description={t('business.time.durationTrendDesc')}
          helpText={t('business.help.durationTrend')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mockDurationTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" domain={[100, 150]} tickFormatter={(v) => `${v}m`} />
                <RechartsTooltip 
                  formatter={(value: number, name: string) => [`${value} min`, name]}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="planned" fill="#94a3b8" name={t('business.time.planned')} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={3} name={t('business.time.actual')} dot={{ fill: '#3b82f6', r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('business.time.turnoverTrend')}
          description={t('business.time.turnoverTrendDesc')}
          helpText={t('business.help.turnoverTrend')}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockTurnoverTimes}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" domain={[0, 50]} tickFormatter={(v) => `${v}m`} />
                <RechartsTooltip 
                  formatter={(value: number) => [`${value} min`, '']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="turnover" name={t('business.time.turnover')} radius={[4, 4, 0, 0]}>
                  {mockTurnoverTimes.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.turnover <= entry.target ? '#10b981' : '#f59e0b'} 
                    />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="target" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" name={t('business.time.target')} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('business.time.phaseBreakdown')}</CardTitle>
            <HelpTooltip content={t('business.help.phaseBreakdown')} />
          </div>
          <CardDescription>{t('business.time.phaseBreakdownDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockTimeMarkers.map((phase, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: phase.color }} />
                    <span className="text-sm font-medium">{phase.phase}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {t('business.time.target')}: {phase.target} min
                    </span>
                    <span className={`text-sm font-medium ${phase.avgTime > phase.target ? 'text-amber-500' : 'text-green-500'}`}>
                      {t('business.time.actual')}: {phase.avgTime} min
                    </span>
                    {phase.avgTime <= phase.target ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                </div>
                <Progress 
                  value={(phase.avgTime / (phase.target * 1.5)) * 100} 
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ChartCard
        title={t('business.time.roomUtilization')}
        description={t('business.time.roomUtilizationDesc')}
        helpText={t('business.help.roomUtilizationDetail')}
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
              <Legend />
              <Bar dataKey="morning" fill="#3b82f6" name={t('business.time.morning')} radius={[0, 4, 4, 0]} />
              <Bar dataKey="afternoon" fill="#10b981" name={t('business.time.afternoon')} radius={[0, 4, 4, 0]} />
              <Bar dataKey="evening" fill="#f59e0b" name={t('business.time.evening')} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('business.time.surgeonEfficiency')}</CardTitle>
            <HelpTooltip content={t('business.help.surgeonEfficiency')} />
          </div>
          <CardDescription>{t('business.time.surgeonEfficiencyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.time.surgeon')}</TableHead>
                  <TableHead className="text-right">{t('business.time.surgeries')}</TableHead>
                  <TableHead className="text-right">{t('business.time.avgDurationShort')}</TableHead>
                  <TableHead className="text-right">{t('business.time.plannedDuration')}</TableHead>
                  <TableHead className="text-right">{t('business.time.efficiency')}</TableHead>
                  <TableHead className="text-right">{t('business.time.onTimeRate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockSurgeonEfficiency.map((surgeon) => (
                  <TableRow key={surgeon.name}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {surgeon.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{surgeon.surgeries}</TableCell>
                    <TableCell className="text-right">{surgeon.avgDuration} min</TableCell>
                    <TableCell className="text-right text-muted-foreground">{surgeon.plannedDuration} min</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={surgeon.efficiency >= 100 ? "default" : "secondary"}>
                        {surgeon.efficiency}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress value={surgeon.onTime} className="w-16 h-2" />
                        <span className={surgeon.onTime >= 85 ? "text-green-500" : surgeon.onTime >= 75 ? "text-amber-500" : "text-red-500"}>
                          {surgeon.onTime}%
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

      <ChartCard
        title={t('business.time.weeklyPattern')}
        description={t('business.time.weeklyPatternDesc')}
        helpText={t('business.help.weeklyPattern')}
      >
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={mockWeeklyPattern}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis yAxisId="left" className="text-xs" />
              <YAxis yAxisId="right" orientation="right" className="text-xs" tickFormatter={(v) => `${v}m`} />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="surgeries" fill="#3b82f6" name={t('business.time.surgeryCount')} radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="avgDuration" stroke="#f59e0b" strokeWidth={2} name={t('business.time.avgDuration')} dot={{ fill: '#f59e0b', r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
