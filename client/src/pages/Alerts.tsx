import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { Alert, Item, Lot } from "@shared/schema";

interface AlertWithDetails extends Alert {
  item?: Item;
  lot?: Lot;
}

export default function Alerts() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: alerts = [], isLoading } = useQuery<AlertWithDetails[]>({
    queryKey: [`/api/alerts/${activeHospital?.id}?locationId=${activeHospital?.locationId}&acknowledged=false`, activeHospital?.locationId, false], // false = unacknowledged
    enabled: !!activeHospital?.id && !!activeHospital?.locationId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiRequest("POST", `/api/alerts/${alertId}/acknowledge`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alerts/${activeHospital?.id}?locationId=${activeHospital?.locationId}&acknowledged=false`, activeHospital?.locationId, false] });
      toast({
        title: t("alerts.alertAcknowledged"),
        description: t("alerts.alertAcknowledgedSuccess"),
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t("alerts.unauthorized"),
          description: t("alerts.unauthorizedMessage"),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: t("alerts.actionFailed"),
        description: t("alerts.failedToAcknowledge"),
        variant: "destructive",
      });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({ alertId, until }: { alertId: string; until: Date }) => {
      const response = await apiRequest("POST", `/api/alerts/${alertId}/snooze`, {
        until: until.toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alerts/${activeHospital?.id}?locationId=${activeHospital?.locationId}&acknowledged=false`, activeHospital?.locationId, false] });
      toast({
        title: t("alerts.alertSnoozed"),
        description: t("alerts.alertSnoozedSuccess"),
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t("alerts.unauthorized"),
          description: t("alerts.unauthorizedMessage"),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: t("alerts.actionFailed"),
        description: t("alerts.failedToSnooze"),
        variant: "destructive",
      });
    },
  });

  const groupedAlerts = alerts.reduce((groups, alert) => {
    if (!groups[alert.type]) {
      groups[alert.type] = [];
    }
    groups[alert.type].push(alert);
    return groups;
  }, {} as Record<string, AlertWithDetails[]>);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "below_min":
        return "fas fa-arrow-down";
      case "expiring":
        return "fas fa-clock";
      case "audit_due":
        return "fas fa-shield-halved";
      case "recall":
        return "fas fa-exclamation-triangle";
      default:
        return "fas fa-bell";
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case "below_min":
        return "border-destructive";
      case "expiring":
        return "border-warning";
      case "audit_due":
        return "border-accent";
      case "recall":
        return "border-destructive";
      default:
        return "border-primary";
    }
  };

  const getAlertIconColor = (type: string) => {
    switch (type) {
      case "below_min":
        return "text-destructive";
      case "expiring":
        return "text-warning";
      case "audit_due":
        return "text-accent";
      case "recall":
        return "text-destructive";
      default:
        return "text-primary";
    }
  };

  const getSectionTitle = (type: string, count: number) => {
    switch (type) {
      case "below_min":
        return t("alerts.belowMinimum", { count });
      case "expiring":
        return t("alerts.expiringSoon", { count });
      case "audit_due":
        return t("alerts.auditDue", { count });
      case "recall":
        return t("alerts.recallNotices", { count });
      default:
        return `${type} (${count})`;
    }
  };

  const handleAcknowledge = (alertId: string) => {
    acknowledgeMutation.mutate(alertId);
  };

  const handleSnooze = (alertId: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    snoozeMutation.mutate({ alertId, until: tomorrow });
  };

  const acknowledgeAll = (alertType: string) => {
    const typeAlerts = groupedAlerts[alertType] || [];
    typeAlerts.forEach((alert) => {
      acknowledgeMutation.mutate(alert.id);
    });
  };

  const handleItemClick = (itemId?: string) => {
    if (itemId) {
      navigate(`/items/${itemId}`);
    }
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("alerts.noHospitalSelected")}</h3>
          <p className="text-muted-foreground">{t("alerts.selectHospitalToView")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("alerts.title")}</h1>
        {alerts.length > 0 && (
          <Button variant="outline" size="sm" data-testid="acknowledge-all-button">
            {t("alerts.acknowledgeAll")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
          <p className="text-muted-foreground">{t("alerts.loadingAlerts")}</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <i className="fas fa-check-circle text-4xl text-success mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("alerts.noActiveAlerts")}</h3>
          <p className="text-muted-foreground">
            {t("alerts.allItemsGood")}
          </p>
        </div>
      ) : (
        Object.entries(groupedAlerts).map(([type, typeAlerts]) => (
          <div key={type}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <i className={`${getAlertIcon(type)} ${getAlertIconColor(type)}`}></i>
                {getSectionTitle(type, typeAlerts.length)}
              </h3>
              {typeAlerts.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => acknowledgeAll(type)}
                  disabled={acknowledgeMutation.isPending}
                  data-testid={`ack-all-${type}`}
                >
                  {t("alerts.ackAll")}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {typeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-card border-l-4 ${getAlertColor(alert.type)} rounded-lg p-4 shadow-sm`}
                  data-testid={`alert-${alert.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleItemClick(alert.itemId || undefined)}
                    >
                      <h4 className="font-semibold text-foreground">{alert.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                      
                      {alert.item && (
                        <div className="mt-2 space-y-1">
                          <p className="text-sm text-foreground font-medium">
                            {alert.item.name}
                          </p>
                          {alert.lot && (
                            <p className="text-xs text-muted-foreground">
                              {t("alerts.lotInfo", { lotNumber: alert.lot.lotNumber, qty: alert.lot.qty })}
                            </p>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground mt-2">
                        {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : ''}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={acknowledgeMutation.isPending}
                        data-testid={`ack-alert-${alert.id}`}
                      >
                        <i className="fas fa-check"></i>
                      </button>
                      <button
                        className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80 transition-colors"
                        onClick={() => handleSnooze(alert.id)}
                        disabled={snoozeMutation.isPending}
                        data-testid={`snooze-alert-${alert.id}`}
                      >
                        <i className="fas fa-clock"></i>
                      </button>
                    </div>
                  </div>

                  {alert.severity === "critical" && (
                    <div className="mt-3 bg-destructive/10 rounded-lg p-2">
                      <p className="text-sm text-destructive font-medium">
                        {t("alerts.criticalAlert")}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
