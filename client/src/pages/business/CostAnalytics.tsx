import { useTranslation } from "react-i18next";
import { formatCurrency, formatCurrencyLocale, getCurrencySymbol, formatDate, formatShortDate } from "@/lib/dateUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Loader2,
  X,
  Clock,
  User
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

const REFERRAL_COLORS: Record<string, string> = {
  social: "#3b82f6",
  search_engine: "#10b981",
  llm: "#8b5cf6",
  word_of_mouth: "#f59e0b",
  belegarzt: "#ec4899",
  other: "#6b7280",
};

const REFERRAL_LABELS: Record<string, string> = {
  social: "Social Media",
  search_engine: "Search Engine",
  llm: "AI Assistant",
  word_of_mouth: "Personal Recommendation",
  belegarzt: "Referring Doctor",
  other: "Other",
};

const REFERRAL_DETAIL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  bing: "Bing",
};

export default function CostAnalytics() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [surgeryTypeFilter, setSurgeryTypeFilter] = useState("all");
  const [activeSubTab, setActiveSubTab] = useState("surgeries");
  const [surgerySearch, setSurgerySearch] = useState("");
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [inventorySortBy, setInventorySortBy] = useState<'price' | 'stock'>('price');
  const [inventorySortOrder, setInventorySortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [showNurseHoursDialog, setShowNurseHoursDialog] = useState(false);
  const [referralFrom, setReferralFrom] = useState("");
  const [referralTo, setReferralTo] = useState("");
  const [selectedReferralSource, setSelectedReferralSource] = useState<string | null>(null);
  // Chart unit filter removed - now showing all units as separate lines

  const isManager = activeHospital?.role === 'admin' || activeHospital?.role === 'manager';

  // Redirect staff users to Administration - they cannot access Dashboard (costs/analytics)
  if (!isManager) {
    return <Redirect to="/business/administration" />;
  }

  const totalCosts = mockCostByCategory.reduce((sum, cat) => sum + cat.value, 0);

  // Fetch surgeries with cost calculations
  const { data: surgeriesData, isLoading: surgeriesLoading, isError: surgeriesError } = useQuery<{
    id: string;
    date: string;
    surgeryName: string;
    patientName: string;
    patientId: string | null;
    anesthesiaRecordId: string | null;
    surgeryDurationMinutes: number;
    staffCost: number;
    anesthesiaStaffCost: number;
    surgeryStaffCost: number;
    anesthesiaCost: number;
    surgeryCost: number;
    anesthesiaTotalCost: number;
    surgeryTotalCost: number;
    totalCost: number;
    paidAmount: number;
    difference: number;
    status: string;
  }[]>({
    queryKey: [`/api/business/${activeHospital?.id}/surgeries`],
    enabled: !!activeHospital?.id && activeSubTab === 'surgeries',
  });

  // Fetch anesthesia nurse hours by month
  const [anesthesiaNurseRate, setAnesthesiaNurseRate] = useState(100);
  const { data: nurseHoursData } = useQuery<{
    months: Array<{
      month: string;
      totalHours: number;
      surgeryDays: number;
      isPast: boolean;
    }>;
    hourlyRate: number;
  }>({
    queryKey: [`/api/business/${activeHospital?.id}/anesthesia-nurse-hours`],
    enabled: !!activeHospital?.id && activeSubTab === 'surgeries',
  });

  // Fetch detailed cost breakdown for selected surgery
  const { data: surgeryDetails, isLoading: surgeryDetailsLoading, isError: surgeryDetailsError } = useQuery<{
    surgery: {
      id: string;
      date: string;
      surgeryName: string;
      patientName: string;
      status: string;
    };
    duration: {
      minutes: number;
      hours: number;
      x1Time: number | null;
      a2Time: number | null;
    };
    staffBreakdown: Array<{
      name: string;
      role: string;
      durationHours: number;
      hourlyRate: number;
      cost: number;
    }>;
    staffTotal: number;
    anesthesiaItems: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      cost: number;
    }>;
    anesthesiaTotal: number;
    surgeryItems: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      cost: number;
    }>;
    surgeryTotal: number;
    grandTotal: number;
  }>({
    queryKey: [`/api/business/${activeHospital?.id}/surgeries/${selectedSurgeryId}/costs`],
    enabled: !!activeHospital?.id && !!selectedSurgeryId,
  });

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

  // Fetch referral source statistics
  const referralParams = new URLSearchParams();
  if (referralFrom) referralParams.set("from", referralFrom);
  if (referralTo) referralParams.set("to", referralTo);

  const { data: referralData, isLoading: referralLoading } = useQuery<{
    breakdown: Array<{ referralSource: string; referralSourceDetail: string | null; count: number }>;
    totalQuestionnaires: number;
    answeredReferral: number;
  }>({
    queryKey: [`/api/business/${activeHospital?.id}/referral-stats?${referralParams.toString()}`],
    enabled: !!activeHospital?.id && activeSubTab === 'referrals',
  });

  const referralPieData = useMemo(() => {
    if (!referralData?.breakdown) return [];
    const grouped: Record<string, number> = {};
    referralData.breakdown.forEach((r) => {
      grouped[r.referralSource] = (grouped[r.referralSource] || 0) + r.count;
    });
    return Object.entries(grouped).map(([source, count]) => ({
      name: REFERRAL_LABELS[source] || source,
      value: count,
      source,
      color: REFERRAL_COLORS[source] || "#6b7280",
    }));
  }, [referralData]);

  const referralDetailData = useMemo(() => {
    if (!referralData?.breakdown || !selectedReferralSource) return [];
    return referralData.breakdown
      .filter((r) => r.referralSource === selectedReferralSource && r.referralSourceDetail)
      .map((r) => ({
        name: REFERRAL_DETAIL_LABELS[r.referralSourceDetail!] || r.referralSourceDetail!,
        value: r.count,
      }));
  }, [referralData, selectedReferralSource]);

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
        date: formatShortDate(new Date(entry.date)),
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
  const filteredSurgeries = useMemo(() => {
    if (!surgeriesData) return [];
    const searchLower = surgerySearch.toLowerCase();
    return surgeriesData.filter(surgery => 
      (surgery.surgeryName || '').toLowerCase().includes(searchLower) ||
      (surgery.patientName || '').toLowerCase().includes(searchLower)
    );
  }, [surgeriesData, surgerySearch]);

  // Format duration for display (e.g., "2h 15min")
  const formatDuration = (minutes: number | null | undefined) => {
    if (!minutes || minutes <= 0) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
  };

  // formatDate imported from dateUtils handles both formatDate and formatBirthday
  const formatBirthday = (dateStr: string) => formatDate(dateStr);

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
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="surgeries" className="flex items-center gap-2" data-testid="tab-costs-surgeries">
            <List className="h-4 w-4" />
            {t('business.costs.surgeries')}
          </TabsTrigger>
          <TabsTrigger value="inventories" className="flex items-center gap-2" data-testid="tab-costs-inventories">
            <Package className="h-4 w-4" />
            {t('business.costs.inventories')}
          </TabsTrigger>
          <TabsTrigger value="referrals" className="flex items-center gap-2" data-testid="tab-costs-referrals">
            <Users className="h-4 w-4" />
            {t('business.costs.referrals')}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab Content */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard
              title={t('business.costs.totalSpending')}
              value={formatCurrencyLocale(totalCosts)}
              subtitle={t('business.costs.thisMonth')}
              trend={2.4}
              helpText={t('business.help.totalSpending')}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <SummaryCard
              title={t('business.costs.staffCosts')}
              value={formatCurrencyLocale(158000)}
              subtitle={`${((158000/totalCosts)*100).toFixed(1)}% ${t('business.costs.ofTotal')}`}
              trend={3.8}
              helpText={t('business.help.staffCosts')}
              icon={<Users className="h-4 w-4" />}
              iconBg="bg-purple-500/10 text-purple-500"
            />
            <SummaryCard
              title={t('business.costs.medicationCosts')}
              value={formatCurrencyLocale(94000)}
              subtitle={`${((94000/totalCosts)*100).toFixed(1)}% ${t('business.costs.ofTotal')}`}
              trend={-1.2}
              helpText={t('business.help.medicationCosts')}
              icon={<Pill className="h-4 w-4" />}
              iconBg="bg-green-500/10 text-green-500"
            />
            <SummaryCard
              title={t('business.costs.suppliesCosts')}
              value={formatCurrencyLocale(138000)}
              subtitle={`${((138000/totalCosts)*100).toFixed(1)}% ${t('business.costs.ofTotal')}`}
              trend={3.2}
              helpText={t('business.help.suppliesCosts')}
              icon={<Package className="h-4 w-4" />}
              iconBg="bg-blue-500/10 text-blue-500"
            />
            <SummaryCard
              title={t('business.costs.avgCostPerSurgery')}
              value={formatCurrencyLocale(890)}
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
                      formatter={(value: number) => [formatCurrencyLocale(value), '']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend 
                      formatter={(value, entry: any) => (
                        <span className="text-xs">{value}: {formatCurrencyLocale(entry.payload.value)}</span>
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
                      <YAxis className="text-xs" tickFormatter={(value) => `${getCurrencySymbol()} ${(value/1000).toFixed(0)}k`} />
                      <RechartsTooltip 
                        formatter={(value: number) => [formatCurrencyLocale(value), '']}
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
                  <YAxis className="text-xs" tickFormatter={(value) => `${getCurrencySymbol()} ${value}`} />
                  <RechartsTooltip 
                    formatter={(value: number) => [formatCurrencyLocale(value), '']}
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
                        <TableCell className="text-right">{formatCurrencyLocale(row.avgMaterialCost)}</TableCell>
                        <TableCell className="text-right text-purple-600 dark:text-purple-400">{formatCurrencyLocale(row.avgLaborCost)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrencyLocale(row.avgTotalCost)}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrencyLocale(row.totalCost)}</TableCell>
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
                        <TableCell className="text-right">{getCurrencySymbol()} {staff.hourlyRate}/h</TableCell>
                        <TableCell className="text-right">{staff.hoursWorked}h</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrencyLocale(staff.totalCost)}</TableCell>
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
                        <TableCell className="text-right">{formatCurrency(item.unitCost)}</TableCell>
                        <TableCell className="text-right">{item.usage}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrencyLocale(item.totalCost)}</TableCell>
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
              {surgeriesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : surgeriesError ? (
                <div className="text-center text-red-500 py-12">
                  {t('common.errorLoadingData')}
                </div>
              ) : (
                <>
                  {/* Dashboard Summary Stats */}
                  {filteredSurgeries.length > 0 && (
                    <div className="mb-6">
                      {(() => {
                        // Filter out surgeries with zero costs for statistics
                        const surgeriesWithCosts = filteredSurgeries.filter(s => (s.totalCost ?? 0) > 0);
                        return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                        {/* Total Surgeries */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border">
                          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <FileText className="h-3.5 w-3.5" />
                            {t('business.costs.totalSurgeries')}
                          </div>
                          <div className="text-xl font-bold">{surgeriesWithCosts.length}</div>
                        </div>
                        
                        {/* Total Costs */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            {t('business.costs.totalCosts', 'Total Costs')}
                          </div>
                          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            {formatCurrencyLocale(surgeriesWithCosts.reduce((sum, s) => sum + (s.totalCost ?? 0), 0))}
                          </div>
                        </div>
                        
                        {/* Total Paid */}
                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            {t('business.costs.totalPaid')}
                          </div>
                          <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                            {formatCurrencyLocale(surgeriesWithCosts.reduce((sum, s) => sum + (s.paidAmount ?? 0), 0))}
                          </div>
                        </div>
                        
                        {/* Total Difference */}
                        {(() => {
                          const totalDiff = surgeriesWithCosts.reduce((sum, s) => sum + (s.difference ?? 0), 0);
                          const isPositive = totalDiff >= 0;
                          return (
                            <div className={`rounded-lg p-3 border ${isPositive ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                {t('business.costs.totalDifference')}
                              </div>
                              <div className={`text-xl font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatCurrencyLocale(totalDiff)}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Average Duration */}
                        {(() => {
                          const validDurations = surgeriesWithCosts.filter(s => (s.surgeryDurationMinutes ?? 0) > 0);
                          const avgDuration = validDurations.length > 0 
                            ? validDurations.reduce((sum, s) => sum + (s.surgeryDurationMinutes ?? 0), 0) / validDurations.length 
                            : 0;
                          return (
                            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                <Clock className="h-3.5 w-3.5" />
                                {t('business.costs.avgDuration', 'Avg Duration')}
                              </div>
                              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                                {formatDuration(Math.round(avgDuration))}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Average Cost/Hour with Anesthesia/Surgery breakdown (materials + staff) */}
                        {(() => {
                          const costsPerHour = surgeriesWithCosts
                            .map(s => {
                              const hours = (s.surgeryDurationMinutes ?? 0) / 60;
                              return hours > 0 ? (s.totalCost ?? 0) / hours : null;
                            })
                            .filter((c): c is number => c !== null && c > 0);
                          const avgCostPerHour = costsPerHour.length > 0 
                            ? costsPerHour.reduce((sum, c) => sum + c, 0) / costsPerHour.length 
                            : 0;
                          
                          // Use anesthesiaTotalCost (materials + staff) for anesthesia breakdown
                          const anesthesiaCostsPerHour = surgeriesWithCosts
                            .map(s => {
                              const hours = (s.surgeryDurationMinutes ?? 0) / 60;
                              return hours > 0 ? (s.anesthesiaTotalCost ?? 0) / hours : null;
                            })
                            .filter((c): c is number => c !== null && c > 0);
                          const avgAnesthesiaCostPerHour = anesthesiaCostsPerHour.length > 0 
                            ? anesthesiaCostsPerHour.reduce((sum, c) => sum + c, 0) / anesthesiaCostsPerHour.length 
                            : 0;
                          
                          // Use surgeryTotalCost (materials + staff) for surgery breakdown
                          const surgeryCostsPerHour = surgeriesWithCosts
                            .map(s => {
                              const hours = (s.surgeryDurationMinutes ?? 0) / 60;
                              return hours > 0 ? (s.surgeryTotalCost ?? 0) / hours : null;
                            })
                            .filter((c): c is number => c !== null && c > 0);
                          const avgSurgeryCostPerHour = surgeryCostsPerHour.length > 0 
                            ? surgeryCostsPerHour.reduce((sum, c) => sum + c, 0) / surgeryCostsPerHour.length 
                            : 0;
                          
                          return (
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                <TrendingUp className="h-3.5 w-3.5" />
                                {t('business.costs.avgCostPerHour', 'Avg Cost/Hour')}
                              </div>
                              <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">
                                {formatCurrencyLocale(avgCostPerHour)}
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-200 dark:border-indigo-700">
                                <div className="text-center">
                                  <div className="text-[10px] text-muted-foreground">{t('business.costs.anesthesia', 'Anesthesia')}</div>
                                  <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                                    {formatCurrencyLocale(avgAnesthesiaCostPerHour)}
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-[10px] text-muted-foreground">{t('business.costs.surgery', 'Surgery')}</div>
                                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                    {formatCurrencyLocale(avgSurgeryCostPerHour)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Average Paid/Hour */}
                        {(() => {
                          const paidPerHour = surgeriesWithCosts
                            .map(s => {
                              const hours = (s.surgeryDurationMinutes ?? 0) / 60;
                              return hours > 0 ? (s.paidAmount ?? 0) / hours : null;
                            })
                            .filter((c): c is number => c !== null && c > 0);
                          const avgPaidPerHour = paidPerHour.length > 0 
                            ? paidPerHour.reduce((sum, c) => sum + c, 0) / paidPerHour.length 
                            : 0;
                          return (
                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                <TrendingUp className="h-3.5 w-3.5" />
                                {t('business.costs.avgPaidPerHour', 'Avg Paid/Hour')}
                              </div>
                              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                                {formatCurrencyLocale(avgPaidPerHour)}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Anesthesia Nurse Hours summary card */}
                  {nurseHoursData && nurseHoursData.months.length > 0 && (() => {
                    const pastMonths = nurseHoursData.months.filter(m => m.isPast);
                    const totalHours = pastMonths.reduce((sum, m) => sum + m.totalHours, 0);
                    const avgHoursPerMonth = pastMonths.length > 0 ? totalHours / pastMonths.length : 0;
                    const avgCostPerMonth = avgHoursPerMonth * anesthesiaNurseRate;
                    return (
                      <div
                        className="mb-6 bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-200 dark:border-teal-800 cursor-pointer hover:border-teal-400 dark:hover:border-teal-600 transition-colors"
                        onClick={() => setShowNurseHoursDialog(true)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Clock className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                            <div>
                              <div className="text-sm font-medium">{t('business.costs.anesthesiaNurseHours')}</div>
                              <div className="text-xs text-muted-foreground">{t('business.costs.anesthesiaNurseHoursDesc')}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Avg/Mo</div>
                              <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{avgHoursPerMonth.toFixed(1)}h</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">{t('business.costs.cost')}/mo ({anesthesiaNurseRate} {getCurrencySymbol()}/h)</div>
                              <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{formatCurrencyLocale(avgCostPerMonth)}</div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('business.costs.surgeryDate')}</TableHead>
                        <TableHead>{t('business.costs.surgeryMade')}</TableHead>
                        <TableHead>{t('business.costs.patientData')}</TableHead>
                        <TableHead className="text-center">
                          <Tooltip>
                            <TooltipTrigger className="flex items-center gap-1 mx-auto">
                              {t('business.costs.surgeryTime')}
                              <HelpCircle className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('business.costs.surgeryTimeTooltip')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="text-right">{t('business.costs.staffCostsCol')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.anesthesiaConsumables')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.surgeryConsumables')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.totalCostCol')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.costPerHour', 'Cost/Hour')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.paidCol')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.differenceCol')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSurgeries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                            {t('business.costs.noSurgeriesFound')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSurgeries.map((surgery) => (
                          <TableRow 
                            key={surgery.id} 
                            data-testid={`row-surgery-${surgery.id}`}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedSurgeryId(surgery.id)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{formatDate(surgery.date)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">{surgery.surgeryName || '-'}</span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">{surgery.patientName || '-'}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="font-medium">{formatDuration(surgery.surgeryDurationMinutes)}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{surgery.surgeryDurationMinutes ?? 0} {t('common.minutes')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-purple-600 dark:text-purple-400">
                                {formatCurrency(surgery.staffCost ?? 0)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-green-600 dark:text-green-400">
                                {formatCurrency(surgery.anesthesiaCost ?? 0)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-blue-600 dark:text-blue-400">
                                {formatCurrency(surgery.surgeryCost ?? 0)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(surgery.totalCost ?? 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(() => {
                                const hours = (surgery.surgeryDurationMinutes ?? 0) / 60;
                                const costPerHour = hours > 0 ? (surgery.totalCost ?? 0) / hours : 0;
                                return (
                                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                    {formatCurrency(costPerHour)}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-orange-600 dark:text-orange-400">
                                {formatCurrency(surgery.paidAmount ?? 0)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              <span className={(surgery.difference ?? 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                {formatCurrency(surgery.difference ?? 0)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                </>
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
                    {formatCurrency(unitInventories.reduce((sum, u) => sum + u.totalValue, 0))}
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
                              {formatCurrency(unit.totalValue)}
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
                                      ? formatCurrency(item.supplierPrice)
                                      : '-'}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {item.totalValue > 0
                                      ? <span className="text-green-600 dark:text-green-400">{formatCurrency(item.totalValue)}</span>
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
                        formatCurrency(value)
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

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4 mt-6">
          {/* Date range filter */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('business.referrals.dateRange')}:</span>
                </div>
                <Input
                  type="date"
                  value={referralFrom}
                  onChange={(e) => setReferralFrom(e.target.value)}
                  className="w-40"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="date"
                  value={referralTo}
                  onChange={(e) => setReferralTo(e.target.value)}
                  className="w-40"
                />
                {(referralFrom || referralTo) && (
                  <button
                    onClick={() => { setReferralFrom(""); setReferralTo(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sample size indicator */}
          {referralData && (
            <div className="text-sm text-muted-foreground px-1">
              {referralData.answeredReferral} {t('business.referrals.of')} {referralData.totalQuestionnaires} {t('business.referrals.questionnairesAnswered')}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Main pie chart */}
            <ChartCard
              title={t('business.referrals.sourceBreakdown')}
              helpText={t('business.referrals.sourceBreakdownHelp')}
            >
              {referralLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : referralPieData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  {t('business.referrals.noData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={referralPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      onClick={(entry) => setSelectedReferralSource(
                        selectedReferralSource === entry.source ? null : entry.source
                      )}
                      cursor="pointer"
                    >
                      {referralPieData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.color}
                          opacity={selectedReferralSource && selectedReferralSource !== entry.source ? 0.4 : 1}
                          stroke={selectedReferralSource === entry.source ? entry.color : "transparent"}
                          strokeWidth={selectedReferralSource === entry.source ? 3 : 0}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number) => [value, t('business.referrals.responses')]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Detail drill-down */}
            <ChartCard
              title={selectedReferralSource
                ? `${REFERRAL_LABELS[selectedReferralSource] || selectedReferralSource} — ${t('business.referrals.detail')}`
                : t('business.referrals.clickToExplore')
              }
              helpText={t('business.referrals.detailHelp')}
            >
              {!selectedReferralSource ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  {t('business.referrals.selectSlice')}
                </div>
              ) : referralDetailData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  {t('business.referrals.noDetail')}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {referralDetailData.map((item, i) => {
                    const total = referralDetailData.reduce((s, d) => s + d.value, 0);
                    const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{item.name}</span>
                          <span className="text-muted-foreground">{item.value} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: REFERRAL_COLORS[selectedReferralSource] || "#6b7280",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* Surgery Cost Detail Dialog */}
      <Dialog open={!!selectedSurgeryId} onOpenChange={(open) => !open && setSelectedSurgeryId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-surgery-cost-breakdown">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="dialog-title-cost-breakdown">
              <FileText className="h-5 w-5" />
              {t('business.costs.costBreakdown')}
            </DialogTitle>
            <DialogDescription data-testid="dialog-desc-surgery-name">
              {surgeryDetails?.surgery?.surgeryName || t('common.loading')}
            </DialogDescription>
          </DialogHeader>

          {surgeryDetailsLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="loading-surgery-details">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : surgeryDetailsError ? (
            <div className="text-center text-red-500 py-8" data-testid="error-surgery-details">
              {t('common.errorLoadingData')}
            </div>
          ) : surgeryDetails ? (
            <div className="space-y-6">
              {/* Surgery Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('business.costs.date')}:</span>
                  <span className="font-medium">{formatDate(surgeryDetails.surgery.date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('business.costs.patient')}:</span>
                  <span className="font-medium">{surgeryDetails.surgery.patientName || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('business.costs.duration')}:</span>
                  <span className="font-medium">{formatDuration(surgeryDetails.duration.minutes)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('common.status')}:</span>
                  <Badge variant="secondary">{surgeryDetails.surgery.status || '-'}</Badge>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm text-muted-foreground">{t('business.costs.costPerHour', 'Cost/Hour')}:</span>
                  {(() => {
                    const hours = (surgeryDetails.duration.minutes ?? 0) / 60;
                    const costPerHour = hours > 0 ? surgeryDetails.grandTotal / hours : 0;
                    return (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(costPerHour)}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Staff Costs Section */}
              <div data-testid="section-staff-costs">
                <h4 className="flex items-center gap-2 font-semibold mb-3">
                  <Users className="h-4 w-4 text-purple-600" />
                  {t('business.costs.staffCosts')}
                </h4>
                {surgeryDetails.staffBreakdown.length > 0 ? (
                  <Table data-testid="table-staff-breakdown">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.name')}</TableHead>
                        <TableHead>{t('common.role')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.hours')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.hourlyRate')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.cost')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {surgeryDetails.staffBreakdown.map((staff, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{staff.name}</TableCell>
                          <TableCell>{staff.role}</TableCell>
                          <TableCell className="text-right">{staff.durationHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(staff.hourlyRate)}</TableCell>
                          <TableCell className="text-right text-purple-600">{formatCurrency(staff.cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                        <TableCell colSpan={4}>{t('business.costs.totalStaffCosts')}</TableCell>
                        <TableCell className="text-right text-purple-600">{formatCurrency(surgeryDetails.staffTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('business.costs.noStaffData')}</p>
                )}
              </div>

              {/* Anesthesia Items Section */}
              <div data-testid="section-anesthesia-costs">
                <h4 className="flex items-center gap-2 font-semibold mb-3">
                  <Pill className="h-4 w-4 text-green-600" />
                  {t('business.costs.anesthesiaCosts')}
                </h4>
                {surgeryDetails.anesthesiaItems.length > 0 ? (
                  <Table data-testid="table-anesthesia-items">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.item')}</TableHead>
                        <TableHead className="text-right">{t('common.quantity')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.unitPrice')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.cost')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {surgeryDetails.anesthesiaItems.map((item) => (
                        <TableRow key={item.itemId}>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatCurrency(item.cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                        <TableCell colSpan={3}>{t('business.costs.totalAnesthesiaCosts')}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(surgeryDetails.anesthesiaTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('business.costs.noAnesthesiaItems')}</p>
                )}
              </div>

              {/* Surgery Items Section */}
              <div data-testid="section-surgery-costs">
                <h4 className="flex items-center gap-2 font-semibold mb-3">
                  <Scissors className="h-4 w-4 text-blue-600" />
                  {t('business.costs.surgeryCosts')}
                </h4>
                {surgeryDetails.surgeryItems.length > 0 ? (
                  <Table data-testid="table-surgery-items">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.item')}</TableHead>
                        <TableHead className="text-right">{t('common.quantity')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.unitPrice')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.cost')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {surgeryDetails.surgeryItems.map((item) => (
                        <TableRow key={item.itemId}>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right text-blue-600">{formatCurrency(item.cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                        <TableCell colSpan={3}>{t('business.costs.totalSurgeryCosts')}</TableCell>
                        <TableCell className="text-right text-blue-600">{formatCurrency(surgeryDetails.surgeryTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('business.costs.noSurgeryItems')}</p>
                )}
              </div>

              {/* Grand Total */}
              <div className="p-4 bg-primary/10 rounded-lg" data-testid="section-grand-total">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{t('business.costs.grandTotal')}</span>
                  <span className="text-2xl font-bold" data-testid="text-grand-total">{formatCurrency(surgeryDetails.grandTotal)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8" data-testid="no-surgery-details">
              {t('business.costs.noSurgeriesFound')}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Anesthesia Nurse Hours Detail Dialog */}
      <Dialog open={showNurseHoursDialog} onOpenChange={setShowNurseHoursDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('business.costs.anesthesiaNurseHours')}
            </DialogTitle>
            <DialogDescription>{t('business.costs.anesthesiaNurseHoursDesc')}</DialogDescription>
          </DialogHeader>
          {nurseHoursData && nurseHoursData.months.length > 0 && (() => {
            const pastMonths = nurseHoursData.months.filter(m => m.isPast);
            const futureMonths = nurseHoursData.months.filter(m => !m.isPast);
            const pastTotalHours = pastMonths.reduce((sum, m) => sum + m.totalHours, 0);
            const futureTotalHours = futureMonths.reduce((sum, m) => sum + m.totalHours, 0);
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            const formatMonth = (monthStr: string) => {
              const [year, month] = monthStr.split('-');
              const date = new Date(parseInt(year), parseInt(month) - 1);
              return date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
            };

            return (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-muted-foreground">{t('business.costs.hourlyRate')}:</span>
                  <Input
                    type="number"
                    value={anesthesiaNurseRate}
                    onChange={(e) => setAnesthesiaNurseRate(Number(e.target.value) || 0)}
                    className="w-20 h-8 text-right"
                  />
                  <span className="text-sm text-muted-foreground">CHF/h</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('business.costs.date')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.surgeryDays')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.hours')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.avgPerDay')}</TableHead>
                        <TableHead className="text-right">{t('business.costs.cost')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pastMonths.map((m) => (
                        <TableRow key={m.month} className={m.month === currentMonth ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                          <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                          <TableCell className="text-right">{m.surgeryDays}</TableCell>
                          <TableCell className="text-right">{m.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{m.surgeryDays > 0 ? (m.totalHours / m.surgeryDays).toFixed(1) : '0.0'}</TableCell>
                          <TableCell className="text-right">{formatCurrencyLocale(m.totalHours * anesthesiaNurseRate)}</TableCell>
                        </TableRow>
                      ))}
                      {pastMonths.length > 0 && (
                        <TableRow className="border-t-2 font-semibold">
                          <TableCell colSpan={4} className="text-right text-muted-foreground">{t('business.costs.pastTotal')}</TableCell>
                          <TableCell className="text-right">{formatCurrencyLocale(pastTotalHours * anesthesiaNurseRate)}</TableCell>
                        </TableRow>
                      )}
                      {futureMonths.length > 0 && (
                        <TableRow className="border-t-2 border-b-0 bg-muted/30">
                          <TableCell colSpan={5} className="text-center text-sm font-semibold text-muted-foreground tracking-wider py-1">
                            {t('business.costs.planned')}
                          </TableCell>
                        </TableRow>
                      )}
                      {futureMonths.map((m) => (
                        <TableRow key={m.month} className="text-muted-foreground italic">
                          <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                          <TableCell className="text-right">{m.surgeryDays}</TableCell>
                          <TableCell className="text-right">{m.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{m.surgeryDays > 0 ? (m.totalHours / m.surgeryDays).toFixed(1) : '0.0'}</TableCell>
                          <TableCell className="text-right">{formatCurrencyLocale(m.totalHours * anesthesiaNurseRate)}</TableCell>
                        </TableRow>
                      ))}
                      {futureMonths.length > 0 && (
                        <TableRow className="border-t-2 font-semibold">
                          <TableCell colSpan={4} className="text-right text-muted-foreground">{t('business.costs.plannedTotal')}</TableCell>
                          <TableCell className="text-right">{formatCurrencyLocale(futureTotalHours * anesthesiaNurseRate)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
