import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Redirect } from "wouter";
import { 
  HelpCircle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Package,
  Pill,
  Scissors,
  Activity,
  Users,
  Search,
  Calendar,
  FileText,
  BarChart3,
  List,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Building2,
  Loader2
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

// Mock surgery list data for the new tab
const mockSurgeryList = [
  { 
    id: 1, 
    date: "2024-12-05", 
    surgeryName: "Knee Arthroscopy", 
    patientFirstName: "Hans", 
    patientLastName: "Müller", 
    patientBirthday: "1965-03-15",
    staffCost: 1250,
    materialDrugsCost: 680,
    totalCost: 1930,
    amountPaid: 1930
  },
  { 
    id: 2, 
    date: "2024-12-05", 
    surgeryName: "Rhinoplasty", 
    patientFirstName: "Anna", 
    patientLastName: "Schmidt", 
    patientBirthday: "1988-07-22",
    staffCost: 1680,
    materialDrugsCost: 520,
    totalCost: 2200,
    amountPaid: 2200
  },
  { 
    id: 3, 
    date: "2024-12-04", 
    surgeryName: "Appendectomy", 
    patientFirstName: "Peter", 
    patientLastName: "Weber", 
    patientBirthday: "1972-11-08",
    staffCost: 890,
    materialDrugsCost: 245,
    totalCost: 1135,
    amountPaid: 1135
  },
  { 
    id: 4, 
    date: "2024-12-04", 
    surgeryName: "Hip Replacement", 
    patientFirstName: "Maria", 
    patientLastName: "Fischer", 
    patientBirthday: "1955-01-30",
    staffCost: 2450,
    materialDrugsCost: 1850,
    totalCost: 4300,
    amountPaid: 3500
  },
  { 
    id: 5, 
    date: "2024-12-03", 
    surgeryName: "Carpal Tunnel Release", 
    patientFirstName: "Klaus", 
    patientLastName: "Bauer", 
    patientBirthday: "1980-05-12",
    staffCost: 580,
    materialDrugsCost: 120,
    totalCost: 700,
    amountPaid: 700
  },
  { 
    id: 6, 
    date: "2024-12-03", 
    surgeryName: "Breast Augmentation", 
    patientFirstName: "Laura", 
    patientLastName: "Klein", 
    patientBirthday: "1992-09-18",
    staffCost: 1890,
    materialDrugsCost: 2100,
    totalCost: 3990,
    amountPaid: 3990
  },
  { 
    id: 7, 
    date: "2024-12-02", 
    surgeryName: "Cholecystectomy", 
    patientFirstName: "Thomas", 
    patientLastName: "Hoffmann", 
    patientBirthday: "1968-04-25",
    staffCost: 1120,
    materialDrugsCost: 380,
    totalCost: 1500,
    amountPaid: 1200
  },
  { 
    id: 8, 
    date: "2024-12-02", 
    surgeryName: "ACL Reconstruction", 
    patientFirstName: "Sandra", 
    patientLastName: "Braun", 
    patientBirthday: "1995-12-03",
    staffCost: 1780,
    materialDrugsCost: 920,
    totalCost: 2700,
    amountPaid: 2700
  },
  { 
    id: 9, 
    date: "2024-12-01", 
    surgeryName: "Hernia Repair", 
    patientFirstName: "Michael", 
    patientLastName: "Schneider", 
    patientBirthday: "1975-08-14",
    staffCost: 750,
    materialDrugsCost: 290,
    totalCost: 1040,
    amountPaid: 1040
  },
  { 
    id: 10, 
    date: "2024-12-01", 
    surgeryName: "Liposuction", 
    patientFirstName: "Julia", 
    patientLastName: "Wolf", 
    patientBirthday: "1985-06-27",
    staffCost: 1450,
    materialDrugsCost: 680,
    totalCost: 2130,
    amountPaid: 2130
  },
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
  const activeHospital = useActiveHospital();
  const [surgeryTypeFilter, setSurgeryTypeFilter] = useState("all");
  const [activeSubTab, setActiveSubTab] = useState("surgeries");
  const [surgerySearch, setSurgerySearch] = useState("");
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [inventorySortBy, setInventorySortBy] = useState<'price' | 'stock'>('price');
  const [inventorySortOrder, setInventorySortOrder] = useState<'asc' | 'desc'>('desc');
  // Chart unit filter removed - now showing all units as separate lines

  const isManager = activeHospital?.role === 'admin' || activeHospital?.role === 'manager';

  // Redirect staff users to Administration - they cannot access Dashboard (costs/analytics)
  if (!isManager) {
    return <Redirect to="/business/administration" />;
  }

  const totalCosts = mockCostByCategory.reduce((sum, cat) => sum + cat.value, 0);

  // Fetch aggregated inventory data from all clinics for business module
  const { data: inventoryOverview, isLoading: inventoryLoading } = useQuery<{
    units: any[];
    items: any[];
    supplierCodes: any[];
  }>({
    queryKey: [`/api/business/${activeHospital?.id}/inventory-overview`],
    enabled: !!activeHospital?.id && activeSubTab === 'inventories',
  });

  // Extract data from the aggregated response
  const unitsData = inventoryOverview?.units;
  const itemsData = inventoryOverview?.items;
  const supplierCodesData = inventoryOverview?.supplierCodes;
  const unitsLoading = inventoryLoading;
  const itemsLoading = inventoryLoading;

  // Fetch aggregated inventory snapshots from all clinics for historical chart
  const { data: snapshotsData, isLoading: snapshotsLoading } = useQuery<any[]>({
    queryKey: [`/api/business/${activeHospital?.id}/inventory-snapshots?days=30`],
    enabled: !!activeHospital?.id && activeSubTab === 'inventories',
  });

  // Calculate inventory values per unit
  interface ItemWithValue {
    id: string;
    name: string;
    unitId: string;
    stockLevel: number;
    packSize: number;
    supplierPrice: number;
    totalValue: number;
  }

  interface UnitInventory {
    id: string;
    name: string;
    type: string;
    totalValue: number;
    itemCount: number;
    items: ItemWithValue[];
  }

  const unitInventories = useMemo<UnitInventory[]>(() => {
    if (!unitsData || !itemsData) return [];

    // Create a map of item prices from supplier codes
    const itemPrices: Record<string, number> = {};
    if (supplierCodesData) {
      supplierCodesData.forEach((sc: any) => {
        if (sc.isPreferred && sc.basispreis) {
          itemPrices[sc.itemId] = parseFloat(sc.basispreis);
        } else if (!itemPrices[sc.itemId] && sc.basispreis) {
          itemPrices[sc.itemId] = parseFloat(sc.basispreis);
        }
      });
    }

    // Filter to only units that can have inventory (not special modules)
    const inventoryUnits = unitsData.filter((u: any) => 
      !u.isBusinessModule && !u.isLogisticModule && u.showInventory !== false
    );

    return inventoryUnits.map((unit: any) => {
      // Filter out service items from inventory value calculations
      const unitItems = itemsData.filter((item: any) => item.unitId === unit.id && !item.isService);
      
      const itemsWithValues: ItemWithValue[] = unitItems.map((item: any) => {
        // IMPORTANT: Always use stockLevel.qtyOnHand (actual stock/packs), NOT currentUnits
        // currentUnits is the total individual units across all packs, not the pack count
        // supplierPrice is price per pack, so we multiply by pack count (stockLevel)
        const stockLevel = item.stockLevel?.qtyOnHand || 0;
        const packSize = item.packSize || 1;
        const supplierPrice = itemPrices[item.id] || 0;
        const totalValue = stockLevel * supplierPrice;

        return {
          id: item.id,
          name: item.name,
          unitId: unit.id,
          stockLevel,
          packSize,
          supplierPrice,
          totalValue,
        };
      });

      const totalValue = itemsWithValues.reduce((sum, item) => sum + item.totalValue, 0);

      return {
        id: unit.id,
        name: unit.name,
        type: unit.type || 'storage',
        totalValue,
        itemCount: itemsWithValues.length,
        items: itemsWithValues,
      };
    }).filter((u: UnitInventory) => u.itemCount > 0);
  }, [unitsData, itemsData, supplierCodesData]);

  // Toggle unit expansion
  const toggleUnitExpansion = (unitId: string) => {
    const newExpanded = new Set(expandedUnits);
    if (newExpanded.has(unitId)) {
      newExpanded.delete(unitId);
    } else {
      newExpanded.add(unitId);
    }
    setExpandedUnits(newExpanded);
  };

  // Sort items within expanded units
  const getSortedItems = (items: ItemWithValue[]) => {
    return [...items].sort((a, b) => {
      const aValue = inventorySortBy === 'price' ? a.totalValue : a.stockLevel;
      const bValue = inventorySortBy === 'price' ? b.totalValue : b.stockLevel;
      return inventorySortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });
  };

  // Process snapshots data for chart
  const chartData = useMemo(() => {
    if (!snapshotsData || snapshotsData.length === 0) return [];
    
    // Group snapshots by date and aggregate total value
    const dateMap = new Map<string, { date: string; totalValue: number; unitBreakdown: Record<string, number> }>();
    
    snapshotsData.forEach((snapshot: any) => {
      const date = snapshot.snapshotDate;
      const value = parseFloat(snapshot.totalValue) || 0;
      const unitName = snapshot.unitName || 'Unknown';
      
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, totalValue: 0, unitBreakdown: {} });
      }
      
      const entry = dateMap.get(date)!;
      entry.totalValue += value;
      entry.unitBreakdown[unitName] = (entry.unitBreakdown[unitName] || 0) + value;
    });
    
    // Sort by date ascending and format
    return Array.from(dateMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(entry => ({
        date: new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        totalValue: entry.totalValue,
        ...entry.unitBreakdown,
      }));
  }, [snapshotsData]);

  // Toggle sort order
  const toggleSort = (sortBy: 'price' | 'stock') => {
    if (inventorySortBy === sortBy) {
      setInventorySortOrder(inventorySortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setInventorySortBy(sortBy);
      setInventorySortOrder('desc');
    }
  };

  // Filter surgeries based on search
  const filteredSurgeries = mockSurgeryList.filter(surgery => {
    const searchLower = surgerySearch.toLowerCase();
    return (
      surgery.surgeryName.toLowerCase().includes(searchLower) ||
      surgery.patientFirstName.toLowerCase().includes(searchLower) ||
      surgery.patientLastName.toLowerCase().includes(searchLower)
    );
  });

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Format birthday for display
  const formatBirthday = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

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
      </div>

      {/* Subtabs for Surgeries and Inventories */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="surgeries" className="flex items-center gap-2" data-testid="tab-costs-surgeries">
            <List className="h-4 w-4" />
            {t('business.costs.surgeries')}
          </TabsTrigger>
          <TabsTrigger value="inventories" className="flex items-center gap-2" data-testid="tab-costs-inventories">
            <Package className="h-4 w-4" />
            {t('business.costs.inventories')}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab Content */}
        <TabsContent value="overview" className="space-y-6 mt-6">
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
        </TabsContent>

        {/* Surgery List Tab Content */}
        <TabsContent value="surgeries" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t('business.costs.surgeryListTitle')}
                  </CardTitle>
                  <CardDescription>{t('business.costs.surgeryListDesc')}</CardDescription>
                </div>
                <div className="relative w-full md:w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('business.costs.searchSurgeries')}
                    value={surgerySearch}
                    onChange={(e) => setSurgerySearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-surgeries"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('business.costs.surgeryDate')}</TableHead>
                      <TableHead>{t('business.costs.surgeryMade')}</TableHead>
                      <TableHead>{t('business.costs.patientData')}</TableHead>
                      <TableHead className="text-right">{t('business.costs.staffCostsCol')}</TableHead>
                      <TableHead className="text-right">{t('business.costs.materialDrugsCosts')}</TableHead>
                      <TableHead className="text-right">{t('business.costs.totalCostCol')}</TableHead>
                      <TableHead className="text-right">{t('business.costs.amountPaid')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSurgeries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {t('business.costs.noSurgeriesFound')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSurgeries.map((surgery) => (
                        <TableRow key={surgery.id} data-testid={`row-surgery-${surgery.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{formatDate(surgery.date)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{surgery.surgeryName}</span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium">{surgery.patientLastName}, {surgery.patientFirstName}</span>
                              <div className="text-xs text-muted-foreground">
                                {t('business.costs.born')}: {formatBirthday(surgery.patientBirthday)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-purple-600 dark:text-purple-400">€{surgery.staffCost.toLocaleString()}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-blue-600 dark:text-blue-400">€{surgery.materialDrugsCost.toLocaleString()}</span>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            €{surgery.totalCost.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span className={surgery.amountPaid >= surgery.totalCost ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}>
                                €{surgery.amountPaid.toLocaleString()}
                              </span>
                              {surgery.amountPaid < surgery.totalCost && (
                                <span className="text-xs text-muted-foreground">
                                  ({t('business.costs.open')}: €{(surgery.totalCost - surgery.amountPaid).toLocaleString()})
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Summary row */}
              {filteredSurgeries.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex flex-wrap gap-4 justify-end text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('business.costs.totalSurgeries')}:</span>
                      <Badge variant="secondary">{filteredSurgeries.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('business.costs.totalStaffCosts')}:</span>
                      <span className="text-purple-600 dark:text-purple-400 font-medium">
                        €{filteredSurgeries.reduce((sum, s) => sum + s.staffCost, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('business.costs.totalMaterialDrugs')}:</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        €{filteredSurgeries.reduce((sum, s) => sum + s.materialDrugsCost, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('business.costs.grandTotal')}:</span>
                      <span className="font-bold">
                        €{filteredSurgeries.reduce((sum, s) => sum + s.totalCost, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('business.costs.totalPaid')}:</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        €{filteredSurgeries.reduce((sum, s) => sum + s.amountPaid, 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventories Tab Content */}
        <TabsContent value="inventories" className="space-y-6 mt-6">
          {/* Current Inventory Values */}
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {t('business.costs.inventoriesTitle')}
                  </CardTitle>
                  <CardDescription>{t('business.costs.inventoriesDesc')}</CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t('business.costs.totalInventoryValue')}</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    CHF {unitInventories.reduce((sum, u) => sum + u.totalValue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(unitsLoading || itemsLoading) ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : unitInventories.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  {t('business.costs.noInventoryData')}
                </div>
              ) : (
                <div className="space-y-2">
                  {unitInventories.map((unit) => (
                    <div key={unit.id} className="border rounded-lg overflow-hidden">
                      {/* Unit Header Row */}
                      <div 
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleUnitExpansion(unit.id)}
                        data-testid={`row-unit-inventory-${unit.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {expandedUnits.has(unit.id) ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <Building2 className="h-5 w-5 text-primary" />
                          <div>
                            <span className="font-medium">{unit.name}</span>
                            <Badge variant="outline" className="ml-2 capitalize">
                              {unit.type}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{t('business.costs.itemsCount')}</p>
                            <p className="font-medium">{unit.itemCount}</p>
                          </div>
                          <div className="text-right min-w-[120px]">
                            <p className="text-xs text-muted-foreground">{t('business.costs.unitValue')}</p>
                            <p className="font-semibold text-green-600 dark:text-green-400">
                              CHF {unit.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Items List */}
                      {expandedUnits.has(unit.id) && (
                        <div className="border-t bg-muted/20">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('business.costs.itemName')}</TableHead>
                                <TableHead 
                                  className="text-right cursor-pointer hover:bg-muted/50"
                                  onClick={(e) => { e.stopPropagation(); toggleSort('stock'); }}
                                >
                                  <div className="flex items-center justify-end gap-1">
                                    {t('business.costs.stockLevel')}
                                    <ArrowUpDown className={`h-4 w-4 ${inventorySortBy === 'stock' ? 'text-primary' : 'text-muted-foreground'}`} />
                                  </div>
                                </TableHead>
                                <TableHead className="text-right">{t('business.costs.supplierPrice')}</TableHead>
                                <TableHead 
                                  className="text-right cursor-pointer hover:bg-muted/50"
                                  onClick={(e) => { e.stopPropagation(); toggleSort('price'); }}
                                >
                                  <div className="flex items-center justify-end gap-1">
                                    {t('business.costs.itemValue')}
                                    <ArrowUpDown className={`h-4 w-4 ${inventorySortBy === 'price' ? 'text-primary' : 'text-muted-foreground'}`} />
                                  </div>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getSortedItems(unit.items).map((item) => (
                                <TableRow key={item.id} data-testid={`row-inventory-item-${item.id}`}>
                                  <TableCell className="font-medium">{item.name}</TableCell>
                                  <TableCell className="text-right">
                                    {item.stockLevel}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {item.supplierPrice > 0 
                                      ? `CHF ${item.supplierPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : '-'}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {item.totalValue > 0 
                                      ? <span className="text-green-600 dark:text-green-400">CHF {item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historical Inventory Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('business.costs.inventoryHistory')}
              </CardTitle>
              <CardDescription>{t('business.costs.inventoryHistoryDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {snapshotsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : chartData.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <p>{t('business.costs.noHistoricalData')}</p>
                  <p className="text-sm mt-2">{t('business.costs.dataCollectionStarted')}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                    <YAxis 
                      className="text-muted-foreground" 
                      fontSize={12}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [
                        `CHF ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="totalValue"
                      name={t('business.costs.totalValue')}
                      stroke="#111827"
                      strokeWidth={3}
                      dot={false}
                    />
                    {unitInventories.map((unit, index) => {
                      const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
                      return (
                        <Line
                          key={unit.id}
                          type="monotone"
                          dataKey={unit.name}
                          name={unit.name}
                          stroke={colors[index % colors.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
