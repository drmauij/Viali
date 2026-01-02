import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertCircle, AlertTriangle, CheckCircle, Package, TrendingDown, Clock, XCircle, HelpCircle, ArrowRight, Mail, Loader2 } from "lucide-react";
import type { Alert, Item, Lot } from "@shared/schema";

interface AlertWithDetails extends Alert {
  item?: Item;
  lot?: Lot;
}

interface RunwayItem {
  itemId: string;
  itemName: string;
  currentUnits: number;
  packsOnHand: number;
  unitsPerPack: number;
  trackExactQuantity: boolean;
  dailyUsage: number;
  runwayDays: number | null;
  status: 'critical' | 'warning' | 'ok' | 'no_data' | 'stockout';
  usageDataAvailable: boolean;
  totalAdministrations: number;
  minThreshold: number | null;
  folderId: string | null;
}

interface RunwayResponse {
  items: RunwayItem[];
  summary: {
    total: number;
    stockout: number;
    critical: number;
    warning: number;
    noData: number;
    ok: number;
  };
  lookbackDays: number;
  targetRunway: number;
}

export default function Alerts() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("runway");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  // Traditional alerts query
  const { data: alerts = [], isLoading: alertsLoading } = useQuery<AlertWithDetails[]>({
    queryKey: [`/api/alerts/${activeHospital?.id}?unitId=${activeHospital?.unitId}&acknowledged=false`, activeHospital?.unitId, false],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
  });

  // Runway data query
  const { data: runwayData, isLoading: runwayLoading } = useQuery<RunwayResponse>({
    queryKey: [`/api/items/${activeHospital?.id}/runway?unitId=${activeHospital?.unitId}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiRequest("POST", `/api/alerts/${alertId}/acknowledge`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alerts/${activeHospital?.id}?unitId=${activeHospital?.unitId}&acknowledged=false`, activeHospital?.unitId, false] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/alerts/${activeHospital?.id}?unitId=${activeHospital?.unitId}&acknowledged=false`, activeHospital?.unitId, false] });
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

  const sendEmailMutation = useMutation({
    mutationFn: async (overrideEmail?: string) => {
      const response = await apiRequest("POST", `/api/items/${activeHospital?.id}/send-stock-alerts`, {
        language: navigator.language.startsWith('de') ? 'de' : 'en',
        email: overrideEmail,
      });
      const data = await response.json();
      if (!response.ok) {
        throw { ...data, status: response.status };
      }
      return data;
    },
    onSuccess: (data) => {
      setShowEmailDialog(false);
      setEmailInput("");
      if (data.itemsCount === 0) {
        toast({
          title: t("alerts.runway.email.noItemsTitle"),
          description: t("alerts.runway.email.noItemsDescription"),
        });
      } else {
        toast({
          title: t("alerts.runway.email.successTitle"),
          description: t("alerts.runway.email.successDescription", { count: data.itemsCount }),
        });
      }
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t("alerts.unauthorized"),
          description: t("alerts.unauthorizedMessage"),
          variant: "destructive",
        });
        return;
      }
      
      // Handle case where email is needed
      if (error.needsEmail) {
        setShowEmailDialog(true);
        return;
      }
      
      toast({
        title: t("alerts.runway.email.errorTitle"),
        description: t("alerts.runway.email.errorDescription"),
        variant: "destructive",
      });
    },
  });

  const handleSendEmail = () => {
    sendEmailMutation.mutate(undefined);
  };

  const handleSendEmailWithAddress = () => {
    if (emailInput && emailInput.includes('@')) {
      sendEmailMutation.mutate(emailInput);
    }
  };

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
      navigate(`/inventory/items`);
    }
  };

  // Runway helpers
  const getStatusIcon = (status: RunwayItem['status']) => {
    switch (status) {
      case 'stockout':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'no_data':
        return <HelpCircle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: RunwayItem['status']) => {
    switch (status) {
      case 'stockout':
        return <Badge variant="destructive">{t('alerts.runway.stockout')}</Badge>;
      case 'critical':
        return <Badge variant="destructive">{t('alerts.runway.critical')}</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">{t('alerts.runway.warning')}</Badge>;
      case 'ok':
        return <Badge className="bg-green-500 hover:bg-green-600">{t('alerts.runway.ok')}</Badge>;
      case 'no_data':
        return <Badge variant="secondary">{t('alerts.runway.noData')}</Badge>;
    }
  };

  const getRunwayProgress = (item: RunwayItem) => {
    if (item.runwayDays === null) return 0;
    const target = runwayData?.targetRunway || 14;
    return Math.min(100, (item.runwayDays / target) * 100);
  };

  const getProgressColor = (status: RunwayItem['status']) => {
    switch (status) {
      case 'stockout':
      case 'critical':
        return 'bg-destructive';
      case 'warning':
        return 'bg-yellow-500';
      case 'ok':
        return 'bg-green-500';
      default:
        return 'bg-muted';
    }
  };

  // Filter runway items needing attention
  const needsAttention = runwayData?.items.filter(i => 
    i.status === 'stockout' || i.status === 'critical' || i.status === 'warning'
  ) || [];

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
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="runway" className="flex items-center gap-2" data-testid="tab-runway">
            <TrendingDown className="w-4 h-4" />
            {t('alerts.runway.title')}
            {needsAttention.length > 0 && (
              <Badge variant="destructive" className="ml-1">{needsAttention.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="traditional" className="flex items-center gap-2" data-testid="tab-traditional">
            <Clock className="w-4 h-4" />
            {t('alerts.traditional.title')}
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-1">{alerts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Stock Runway Tab */}
        <TabsContent value="runway" className="space-y-4 mt-4">
          {runwayLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
              <p className="text-muted-foreground">{t('alerts.runway.loading')}</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span className="text-2xl font-bold text-destructive">{runwayData?.summary.stockout || 0}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('alerts.runway.stockout')}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span className="text-2xl font-bold text-destructive">{runwayData?.summary.critical || 0}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('alerts.runway.critical')}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-2xl font-bold text-yellow-600">{runwayData?.summary.warning || 0}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('alerts.runway.warning')}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-2xl font-bold text-green-600">{runwayData?.summary.ok || 0}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('alerts.runway.ok')}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">{runwayData?.summary.noData || 0}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('alerts.runway.noData')}</p>
                </div>
              </div>

              {/* Info box and actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                  <p className="text-blue-800 dark:text-blue-200">
                    <strong>{t('alerts.runway.howItWorks')}:</strong> {t('alerts.runway.explanation', { 
                      lookback: runwayData?.lookbackDays || 30, 
                      target: runwayData?.targetRunway || 14 
                    })}
                  </p>
                </div>
                {needsAttention.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleSendEmail}
                    disabled={sendEmailMutation.isPending}
                    className="flex items-center gap-2 whitespace-nowrap"
                    data-testid="send-email-alert-button"
                  >
                    {sendEmailMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    {t('alerts.runway.sendEmail')}
                  </Button>
                )}
              </div>

              {/* Items needing attention */}
              {needsAttention.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    {t('alerts.runway.needsAttention')} ({needsAttention.length})
                  </h3>
                  
                  {needsAttention.map((item) => (
                    <div
                      key={item.itemId}
                      className="bg-card border border-border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleItemClick(item.itemId)}
                      data-testid={`runway-item-${item.itemId}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {getStatusIcon(item.status)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-foreground truncate">{item.itemName}</h4>
                              {getStatusBadge(item.status)}
                            </div>
                            
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  {item.trackExactQuantity 
                                    ? `${item.currentUnits} ${t('alerts.runway.units')}`
                                    : `${item.packsOnHand} ${t('alerts.runway.packs')}`
                                  }
                                </span>
                                {item.usageDataAvailable && (
                                  <span className="flex items-center gap-1">
                                    <TrendingDown className="w-3 h-3" />
                                    {item.dailyUsage.toFixed(1)}/{t('alerts.runway.day')}
                                  </span>
                                )}
                              </div>
                              
                              {/* Runway progress bar */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="w-full">
                                      <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-muted-foreground">
                                          {item.runwayDays !== null 
                                            ? t('alerts.runway.daysRemaining', { days: item.runwayDays })
                                            : t('alerts.runway.noUsageData')
                                          }
                                        </span>
                                        <span className="text-muted-foreground">
                                          {t('alerts.runway.target')}: {runwayData?.targetRunway || 14}d
                                        </span>
                                      </div>
                                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                        <div 
                                          className={`h-full transition-all ${getProgressColor(item.status)}`}
                                          style={{ width: `${getRunwayProgress(item)}%` }}
                                        />
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('alerts.runway.tooltipExplanation', { 
                                      units: item.currentUnits, 
                                      usage: item.dailyUsage.toFixed(2),
                                      days: item.runwayDays 
                                    })}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                        
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">{t('alerts.runway.allGood')}</h3>
                  <p className="text-muted-foreground">{t('alerts.runway.noItemsNeedAttention')}</p>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Traditional Alerts Tab */}
        <TabsContent value="traditional" className="space-y-4 mt-4">
          {canWrite && alerts.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" data-testid="acknowledge-all-button">
                {t("alerts.acknowledgeAll")}
              </Button>
            </div>
          )}

          {alertsLoading ? (
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
                  {canWrite && typeAlerts.length > 1 && (
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
                            {alert.createdAt ? formatDateTime(alert.createdAt) : ''}
                          </p>
                        </div>

                        {canWrite && (
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
                        )}
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
        </TabsContent>
      </Tabs>

      {/* Email input dialog for users without email in profile */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('alerts.runway.email.enterEmailTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {t('alerts.runway.email.enterEmailDescription')}
            </p>
            <Input
              type="email"
              placeholder={t('alerts.runway.email.emailPlaceholder')}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              data-testid="email-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSendEmailWithAddress}
              disabled={!emailInput.includes('@') || sendEmailMutation.isPending}
              data-testid="send-email-confirm-button"
            >
              {sendEmailMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              {t('alerts.runway.sendEmail')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
