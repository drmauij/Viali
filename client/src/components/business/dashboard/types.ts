// Shared types and helpers for /business dashboard cards. Kept tiny to avoid
// having every card re-derive the same DTO shapes.

export interface MoneyMonthlyPoint {
  month: string;
  revenue: number;
  revenueSurgery: number;
  revenueTreatment: number;
  staffCost: number;
  materialsCost: number;
  cost: number;
  margin: number;
}

export interface MoneyPriorPoint {
  monthOfYear: string;
  monthLabel: string;
  revenue: number;
  cost: number;
  margin: number;
}

export interface MoneySummary {
  revenue: { surgery: number; treatment: number; total: number };
  cost:    { staff: number; materials: number; total: number };
  margin:  { value: number; percent: number; deltaPp_vs_prev: number };
  byMonth: MoneyMonthlyPoint[];
  byMonthPrev?: MoneyPriorPoint[];
}

export interface TopProc {
  procedure: string;
  count: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

export interface ProviderPerf {
  providerId: string;
  name: string;
  treatmentsCount: number;
  treatmentsRevenue: number;
  surgeriesPlanned: number;
  surgeriesConverted: number;
  revenuePlanned: number;
  revenueWon: number;
  utilizationPct: number | null;
}

export interface CashFlowPoint {
  month: string;
  booked: number;
  paid: number;
}

export interface InventorySummary {
  totalValue: number;
  lowStockCount: number;
  lowStockItems: Array<{
    id: string;
    name: string;
    qtyOnHand: number;
    minThreshold: number;
  }>;
}

export interface InsightItem {
  id: string;
  severity: 'critical' | 'positive' | 'negative' | 'neutral';
  message: string;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonthTick(month: string, showYear: boolean): string {
  const [y, m] = month.split("-");
  const idx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
  const label = MONTH_LABELS[idx] ?? m;
  return showYear ? `${label} ${y.slice(-2)}` : label;
}

// Recharts ships default tooltip styles tuned for a light theme — the header
// label is rendered in a very pale grey on a hard-coded white background,
// which becomes invisible against our dark theme. Use these constants on
// every dashboard chart Tooltip so the popover adapts to the active theme.
export const chartTooltipContentStyle: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
};

export const chartTooltipLabelStyle: React.CSSProperties = {
  color: "hsl(var(--popover-foreground))",
  fontWeight: 600,
  marginBottom: 4,
};

export const chartTooltipItemStyle: React.CSSProperties = {
  color: "hsl(var(--popover-foreground))",
};
