import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface KPIData {
  belowMin: number;
  expiringSoon: number;
  pendingOrders: number;
  auditDue: number;
}

interface Activity {
  id: string;
  action: string;
  timestamp: string;
  user: {
    firstName?: string;
    lastName?: string;
  };
  item?: {
    name: string;
  };
  delta?: number;
  notes?: string;
}

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeHospital, setActiveHospital] = useState<any>(null);

  useEffect(() => {
    const userHospitals = (user as any)?.hospitals;
    if (userHospitals && userHospitals.length > 0) {
      setActiveHospital(userHospitals[0]);
    }
  }, [user]);

  const { data: kpis } = useQuery<KPIData>({
    queryKey: ["/api/dashboard/kpis", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/activities", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Just now";
    if (diffInHours === 1) return "1 hour ago";
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    return "Yesterday";
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case "receive":
        return "fas fa-plus";
      case "dispense":
        return "fas fa-shield-halved";
      case "count":
        return "fas fa-calculator";
      default:
        return "fas fa-file-invoice";
    }
  };

  const getActivityColor = (action: string) => {
    switch (action) {
      case "receive":
        return "bg-success/10 text-success";
      case "dispense":
        return "bg-accent/10 text-accent";
      case "count":
        return "bg-primary/10 text-primary";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const hasCriticalAlerts = (kpis?.belowMin || 0) > 0;

  return (
    <div className="p-4 space-y-6">
      {/* Critical Alert Banner */}
      {hasCriticalAlerts && (
        <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-3 rounded-lg">
          <i className="fas fa-exclamation-triangle text-xl"></i>
          <div className="flex-1">
            <p className="font-semibold">
              {kpis?.belowMin} Critical Items Below Minimum
            </p>
            <p className="text-sm opacity-90">Immediate attention required</p>
          </div>
          <button
            className="px-4 py-2 bg-white/20 rounded-lg text-sm font-medium"
            onClick={() => navigate("/alerts")}
            data-testid="view-critical-alerts"
          >
            View
          </button>
        </div>
      )}

      {/* Welcome Section */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {getGreeting()}, <span data-testid="user-name">{(user as any)?.firstName || "User"}</span>
        </h2>
        <p className="text-muted-foreground mt-1">Today's Overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Below Min */}
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <i className="fas fa-arrow-down text-lg text-destructive"></i>
            </div>
            <span className="text-xs text-muted-foreground">Critical</span>
          </div>
          <h3 className="text-3xl font-bold text-foreground" data-testid="kpi-below-min">
            {kpis?.belowMin || 0}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Below Min</p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-destructive font-medium">
              {kpis?.belowMin ? `↑ ${Math.min(3, kpis.belowMin)}` : "—"}
            </span>
            <span className="text-muted-foreground">from yesterday</span>
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <i className="fas fa-clock text-lg text-warning"></i>
            </div>
            <span className="text-xs text-muted-foreground">≤30 days</span>
          </div>
          <h3 className="text-3xl font-bold text-foreground" data-testid="kpi-expiring-soon">
            {kpis?.expiringSoon || 0}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Expiring Soon</p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-warning font-medium">
              {kpis?.expiringSoon ? `${Math.min(2, kpis.expiringSoon)} lots` : "No lots"}
            </span>
            <span className="text-muted-foreground">need rotation</span>
          </div>
        </div>

        {/* Pending Orders */}
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <i className="fas fa-file-invoice text-lg text-primary"></i>
            </div>
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
          <h3 className="text-3xl font-bold text-foreground" data-testid="kpi-pending-orders">
            {kpis?.pendingOrders || 0}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Pending Orders</p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-primary font-medium">
              {kpis?.pendingOrders ? `${Math.min(2, kpis.pendingOrders)} receiving` : "None"}
            </span>
            <span className="text-muted-foreground">today</span>
          </div>
        </div>

        {/* Controlled Audit */}
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <i className="fas fa-shield-halved text-lg text-accent"></i>
            </div>
            <span className="text-xs text-muted-foreground">Monthly</span>
          </div>
          <h3 className="text-3xl font-bold text-foreground" data-testid="kpi-audit-due">
            {kpis?.auditDue || 0}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Audit Due</p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-accent font-medium">Due in 3 days</span>
          </div>
        </div>
      </div>

      {/* Usage Trend */}
      <div className="kpi-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">7-Day Usage Trend</h3>
          <span className="text-xs text-muted-foreground">Items dispensed</span>
        </div>
        <div className="sparkline">
          {[40, 65, 50, 85, 70, 60, 90].map((height, index) => (
            <div
              key={index}
              className="sparkline-bar"
              style={{ height: `${height}%` }}
            ></div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-3">
          <button
            className="action-button btn-primary justify-start"
            onClick={() => navigate("/scan")}
            data-testid="start-daily-count"
          >
            <i className="fas fa-barcode"></i>
            <span>Start Daily Count</span>
          </button>

          <button
            className="action-button btn-outline justify-start"
            data-testid="receive-delivery"
          >
            <i className="fas fa-truck-loading"></i>
            <span>Receive Delivery</span>
          </button>

          <button
            className="action-button btn-outline justify-start"
            data-testid="new-transfer"
          >
            <i className="fas fa-exchange-alt"></i>
            <span>New Transfer</span>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Recent Activity</h3>
          <button 
            className="text-sm text-primary"
            onClick={() => navigate("/activities")}
            data-testid="view-all-activities"
          >
            View All
          </button>
        </div>

        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <i className="fas fa-clipboard-list text-3xl text-muted-foreground mb-2"></i>
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          ) : (
            activities.slice(0, 3).map((activity) => (
              <div key={activity.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getActivityColor(activity.action)}`}>
                    <i className={getActivityIcon(activity.action)}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">
                      {activity.action === "receive" && "Stock Received"}
                      {activity.action === "dispense" && "Controlled Dispensed"}
                      {activity.action === "count" && "Stock Counted"}
                      {activity.action === "order" && "Order Submitted"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {activity.item?.name || "Unknown item"} - {Math.abs(activity.delta || 0)} units
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTimeAgo(activity.timestamp)} • {activity.user.firstName} {activity.user.lastName}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
