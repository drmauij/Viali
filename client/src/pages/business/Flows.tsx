import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  Send, Users, BarChart3, CalendarCheck, Plus, Trash2, Loader2, Tag,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Flows() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const hospitalId = activeHospital?.id;

  const DUMMY_STATS = [
    { label: t("flows.dashboard.campaigns", "Campaigns This Month"), value: "12", icon: Send, color: "text-purple-400" },
    { label: t("flows.dashboard.reached", "Recipients Reached"), value: "384", icon: Users, color: "text-blue-400" },
    { label: t("flows.dashboard.openRate", "Avg. Open Rate"), value: "34%", icon: BarChart3, color: "text-green-400" },
    { label: t("flows.dashboard.bookings", "Bookings"), value: "28", icon: CalendarCheck, color: "text-orange-400" },
  ];

  const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: t("flows.status.draft", "Draft"), variant: "outline" },
    sending: { label: t("flows.status.sending", "Sending..."), variant: "secondary" },
    sent: { label: t("flows.status.sent", "Sent"), variant: "default" },
    failed: { label: t("flows.status.failed", "Failed"), variant: "destructive" },
  };

  const CHANNEL_LABEL: Record<string, string> = {
    sms: "SMS",
    email: "Email",
    html_email: t("flows.channel.newsletter", "Newsletter"),
  };

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["flows", hospitalId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/flows`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const deleteMutation = useMutation({
    mutationFn: (flowId: string) =>
      apiRequest("DELETE", `/api/business/${hospitalId}/flows/${flowId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flows", hospitalId] }),
  });

  // Promo codes
  const { data: promoCodes = [] } = useQuery({
    queryKey: ["promo-codes", hospitalId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/promo-codes`).then(r => r.json()),
    enabled: !!hospitalId,
  });

  const deletePromoMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/business/${hospitalId}/promo-codes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promo-codes", hospitalId] }),
  });

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Flows</h1>
          <p className="text-sm text-muted-foreground">{t("flows.subtitle", "Manage Marketing Campaigns")}</p>
        </div>
        <Button onClick={() => navigate("/business/flows/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("flows.newCampaign", "New Campaign")}
        </Button>
      </div>

      {/* Dashboard cards (dummy) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {DUMMY_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Campaigns | Promo Codes */}
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-2">
            <Send className="h-4 w-4" />
            {t("flows.tabs.campaigns", "Campaigns")}
            {(campaigns as any[]).length > 0 && <Badge variant="secondary" className="ml-1">{(campaigns as any[]).length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="promos" className="gap-2">
            <Tag className="h-4 w-4" />
            {t("flows.tabs.promoCodes", "Promo Codes")}
            {(promoCodes as any[]).length > 0 && <Badge variant="secondary" className="ml-1">{(promoCodes as any[]).length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (campaigns as any[]).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Send className="h-12 w-12 opacity-20 mb-4" />
                <p className="text-lg font-medium mb-1">{t("flows.empty.title", "No campaigns yet")}</p>
                <p className="text-sm opacity-60 mb-4">{t("flows.empty.subtitle", "Create your first marketing campaign")}</p>
                <Button onClick={() => navigate("/business/flows/new")} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> {t("flows.empty.createFirst", "Create First Campaign")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name", "Name")}</TableHead>
                    <TableHead>{t("common.status", "Status")}</TableHead>
                    <TableHead>{t("flows.table.channel", "Channel")}</TableHead>
                    <TableHead>{t("flows.table.recipients", "Recipients")}</TableHead>
                    <TableHead>{t("flows.table.sent", "Sent")}</TableHead>
                    <TableHead>{t("flows.table.openRate", "Open Rate")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(campaigns as any[]).map((c: any) => (
                    <TableRow
                      key={c.id}
                      className={c.status === "draft" ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => c.status === "draft" && navigate(`/business/flows/${c.id}`)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[c.status]?.variant || "outline"}>
                          {STATUS_BADGE[c.status]?.label || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{CHANNEL_LABEL[c.channel] || c.channel || "—"}</TableCell>
                      <TableCell>{c.recipientCount ?? "—"}</TableCell>
                      <TableCell>
                        {c.sentAt ? new Date(c.sentAt).toLocaleDateString("de-CH") : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {c.status === "draft" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("flows.delete.title", "Delete Campaign?")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("flows.delete.description", "This action cannot be undone.")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(c.id); }}>
                                  {t("common.delete", "Delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Promo Codes Tab */}
        <TabsContent value="promos" className="mt-4">
          <Card>
            {(promoCodes as any[]).length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t("flows.promoCodes.empty", "No promo codes yet. Create one inside a campaign.")}
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("flows.promoCodes.code", "Code")}</TableHead>
                    <TableHead>{t("flows.promoCodes.discount", "Discount")}</TableHead>
                    <TableHead>{t("flows.offer.description", "Description")}</TableHead>
                    <TableHead>{t("flows.promoCodes.usage", "Usage")}</TableHead>
                    <TableHead>{t("flows.promoCodes.validUntil", "Valid Until")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(promoCodes as any[]).map((pc: any) => {
                    const isExpired = pc.validUntil && new Date(pc.validUntil) < new Date();
                    const isMaxed = pc.maxUses && pc.usedCount >= pc.maxUses;
                    return (
                      <TableRow key={pc.id} className={isExpired || isMaxed ? "opacity-50" : ""}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{pc.code}</Badge>
                        </TableCell>
                        <TableCell>
                          {pc.discountType === "percent" ? `${pc.discountValue}%` : `CHF ${pc.discountValue}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{pc.description || "—"}</TableCell>
                        <TableCell>
                          {pc.usedCount}{pc.maxUses ? ` / ${pc.maxUses}` : ""}
                        </TableCell>
                        <TableCell>
                          {pc.validUntil ? (
                            <span className={isExpired ? "text-destructive" : ""}>
                              {new Date(pc.validUntil).toLocaleDateString("de-CH")}
                              {isExpired && ` (${t("flows.promoCodes.expired", "expired")})`}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("flows.promoCodes.deleteTitle", "Delete promo code?")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("flows.promoCodes.deleteDesc", "Code {{code}} will be permanently deleted.", { code: pc.code })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deletePromoMutation.mutate(pc.id)}>
                                  {t("common.delete", "Delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
