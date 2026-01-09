import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useCanWrite } from "@/hooks/useCanWrite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Unit } from "@shared/schema";

interface OrderLine {
  id: string;
  itemId: string;
  qty: number;
  packSize: number;
  item: {
    id: string;
    name: string;
    unitId: string;
    hospitalUnit?: { name: string };
  };
}

interface OrderWithDetails {
  id: string;
  hospitalId: string;
  unitId: string;
  vendorId: string | null;
  status: string;
  createdBy: string;
  totalAmount: string | null;
  notes: string | null;
  sentAt: string | null;
  createdAt: string;
  vendor: { id: string; name: string } | null;
  orderLines: OrderLine[];
  unit?: { name: string };
}

export default function LogisticOrders() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [filterUnitId, setFilterUnitId] = useState<string>("all");

  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: [`/api/units/${activeHospital?.hospitalId}`],
    enabled: !!activeHospital?.hospitalId,
  });

  const { data: allOrders = [], isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/logistic/orders/${activeHospital?.hospitalId}`],
    enabled: !!activeHospital?.hospitalId,
  });

  const filteredOrders = useMemo(() => {
    if (filterUnitId === "all") return allOrders;
    return allOrders.filter(order => order.unitId === filterUnitId);
  }, [allOrders, filterUnitId]);

  const draftOrders = filteredOrders.filter(o => o.status === "draft");
  const sentOrders = filteredOrders.filter(o => o.status === "sent");
  const receivedOrders = filteredOrders.filter(o => o.status === "received");

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/logistic/orders/${activeHospital?.hospitalId}`] });
      toast({ title: t('orders.statusUpdated', 'Order status updated') });
    },
    onError: () => {
      toast({ title: t('orders.updateFailed', 'Failed to update order'), variant: "destructive" });
    }
  });

  const getUnitName = (unitId: string) => {
    const unit = allUnits.find(u => u.id === unitId);
    return unit?.name || unitId;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">{t('orders.draft', 'Draft')}</Badge>;
      case "sent":
        return <Badge variant="default" className="bg-blue-500">{t('orders.sent', 'Sent')}</Badge>;
      case "received":
        return <Badge variant="default" className="bg-green-500">{t('orders.received', 'Received')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const OrderCard = ({ order }: { order: OrderWithDetails }) => (
    <Card 
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => setSelectedOrder(order)}
      data-testid={`order-card-${order.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {getStatusBadge(order.status)}
              <Badge variant="outline" className="text-xs">
                <i className="fas fa-building mr-1"></i>
                {getUnitName(order.unitId)}
              </Badge>
            </div>
            <p className="font-medium">
              {order.vendor?.name || t('orders.noVendor', 'No vendor')}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.orderLines.length} {t('orders.items', 'items')} · {format(new Date(order.createdAt), 'dd.MM.yyyy HH:mm')}
            </p>
          </div>
          <div className="text-right">
            {order.totalAmount && (
              <p className="font-medium">CHF {parseFloat(order.totalAmount).toFixed(2)}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="orders" className="flex flex-col flex-1">
        <div className="border-b bg-background sticky top-0 z-10">
          <div className="container px-4">
            <TabsList className="h-12">
              <TabsTrigger value="inventory" asChild>
                <Link href="/logistic/inventory" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
                  <i className="fas fa-boxes mr-2"></i>
                  {t('logistic.inventory', 'Inventory')}
                </Link>
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:bg-primary/10">
                <i className="fas fa-clipboard-list mr-2"></i>
                {t('logistic.orders', 'Orders')}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="orders" className="flex-1 m-0">
          <div className="bg-muted/30 border-b py-3 px-4">
            <div className="container flex items-center gap-4">
              <label className="text-sm font-medium text-muted-foreground">
                {t('logistic.filterByUnit', 'Filter by Unit')}:
              </label>
              <Select value={filterUnitId} onValueChange={setFilterUnitId}>
                <SelectTrigger className="w-[250px]" data-testid="logistic-orders-unit-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('logistic.allUnits', 'All Units')}</SelectItem>
                  {allUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground ml-auto">
                {filteredOrders.length} {t('orders.totalOrders', 'orders')}
              </span>
            </div>
          </div>

          <div className="container px-4 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <i className="fas fa-edit text-muted-foreground"></i>
                    {t('orders.draftOrders', 'Draft Orders')} ({draftOrders.length})
                  </h3>
                  <div className="space-y-2">
                    {draftOrders.map(order => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                    {draftOrders.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t('orders.noDraftOrders', 'No draft orders')}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <i className="fas fa-paper-plane text-blue-500"></i>
                    {t('orders.sentOrders', 'Sent Orders')} ({sentOrders.length})
                  </h3>
                  <div className="space-y-2">
                    {sentOrders.map(order => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                    {sentOrders.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t('orders.noSentOrders', 'No sent orders')}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <i className="fas fa-check-circle text-green-500"></i>
                    {t('orders.receivedOrders', 'Received Orders')} ({receivedOrders.length})
                  </h3>
                  <div className="space-y-2">
                    {receivedOrders.map(order => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                    {receivedOrders.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t('orders.noReceivedOrders', 'No received orders')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl" data-testid="order-detail-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t('orders.orderDetails', 'Order Details')}
              {selectedOrder && getStatusBadge(selectedOrder.status)}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder && (
                <span>
                  {getUnitName(selectedOrder.unitId)} · {selectedOrder.vendor?.name || t('orders.noVendor', 'No vendor')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="border rounded-lg divide-y">
                {selectedOrder.orderLines.map((line) => (
                  <div key={line.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{line.item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {line.qty} × {line.packSize} = {line.qty * line.packSize} {t('orders.units', 'units')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {canWrite && selectedOrder.status !== "received" && (
                <div className="flex gap-2 justify-end">
                  {selectedOrder.status === "draft" && (
                    <Button
                      onClick={() => {
                        updateStatusMutation.mutate({ orderId: selectedOrder.id, status: "sent" });
                        setSelectedOrder(null);
                      }}
                      disabled={updateStatusMutation.isPending}
                      data-testid="mark-sent-button"
                    >
                      <i className="fas fa-paper-plane mr-2"></i>
                      {t('orders.markAsSent', 'Mark as Sent')}
                    </Button>
                  )}
                  {selectedOrder.status === "sent" && (
                    <Button
                      onClick={() => {
                        updateStatusMutation.mutate({ orderId: selectedOrder.id, status: "received" });
                        setSelectedOrder(null);
                      }}
                      disabled={updateStatusMutation.isPending}
                      data-testid="mark-received-button"
                    >
                      <i className="fas fa-check mr-2"></i>
                      {t('orders.markAsReceived', 'Mark as Received')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
