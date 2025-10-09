import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import type { Order, Vendor, OrderLine, Item, StockLevel, Location } from "@shared/schema";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface OrderWithDetails extends Order {
  vendor: Vendor | null;
  orderLines: (OrderLine & { item: Item & { location: Location; stockLevel?: StockLevel } })[];
}

interface ItemWithStock extends Item {
  stockLevel?: StockLevel;
}

type OrderStatus = "draft" | "sent" | "received";
type UnitType = "pack" | "ampulle";

const normalizeUnit = (unit: string): UnitType => {
  const normalized = unit.toLowerCase();
  if (normalized === "pack" || normalized === "box") {
    return "pack";
  }
  return "ampulle";
};

const getStockStatus = (item: Item & { stockLevel?: StockLevel }) => {
  const currentQty = item.stockLevel?.qtyOnHand || 0;
  const minThreshold = item.minThreshold || 0;
  
  if (currentQty <= minThreshold) {
    return { color: "text-warning", status: "Below Min" };
  }
  return { color: "text-success", status: "Good" };
};

export default function Orders() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newOrderDialogOpen, setNewOrderDialogOpen] = useState(false);
  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(1);
  const [lineToRemove, setLineToRemove] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders/${activeHospital?.id}`, activeHospital?.locationId],
    enabled: !!activeHospital?.id,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: [`/api/vendors/${activeHospital?.id}`, activeHospital?.locationId],
    enabled: !!activeHospital?.id,
  });

  const { data: items = [] } = useQuery<ItemWithStock[]>({
    queryKey: [`/api/items/${activeHospital?.id}`, activeHospital?.locationId],
    enabled: !!activeHospital?.id,
  });

  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const updatedOrder = orders.find(o => o.id === selectedOrder.id);
      if (updatedOrder) {
        setSelectedOrder(updatedOrder);
      }
    }
  }, [orders, selectedOrder?.id]);

  const createOrderMutation = useMutation({
    mutationFn: async (data: { vendorId: string | null; orderLines: { itemId: string; qty: number; packSize: number }[] }) => {
      const response = await apiRequest("POST", "/api/orders", {
        hospitalId: activeHospital?.id,
        vendorId: data.vendorId,
        orderLines: data.orderLines,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}`, activeHospital?.locationId] });
      setNewOrderDialogOpen(false);
      toast({
        title: t('orders.orderCreated'),
        description: t('orders.orderCreatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('orders.failedToCreateOrder'),
        variant: "destructive",
      });
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}`, activeHospital?.locationId] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}`, activeHospital?.locationId] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}/open-items`, activeHospital?.locationId] });
      toast({
        title: t('orders.orderUpdated'),
        description: t('orders.orderStatusUpdated'),
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('orders.unauthorized'),
          description: t('orders.unauthorizedMessage'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: t('orders.updateFailed'),
        description: t('orders.failedToUpdateStatus'),
        variant: "destructive",
      });
    },
  });

  const updateOrderLineMutation = useMutation({
    mutationFn: async ({ lineId, qty }: { lineId: string; qty: number }) => {
      const response = await apiRequest("PATCH", `/api/order-lines/${lineId}`, { qty });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}`, activeHospital?.locationId] });
      setEditingLineId(null);
      toast({
        title: t('orders.orderUpdated'),
        description: t('orders.itemQuantityUpdated'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.failedToUpdateQuantity'),
        variant: "destructive",
      });
    },
  });

  const removeOrderLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const response = await apiRequest("DELETE", `/api/order-lines/${lineId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}`, activeHospital?.locationId] });
      toast({
        title: t('orders.itemRemoved'),
        description: t('orders.itemRemovedSuccess'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.failedToRemoveItem'),
        variant: "destructive",
      });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest("DELETE", `/api/orders/${orderId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}`, activeHospital?.locationId] });
      setEditOrderDialogOpen(false);
      setSelectedOrder(null);
      toast({
        title: t('orders.orderDeleted'),
        description: t('orders.orderDeletedSuccess'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.failedToDeleteOrder'),
        variant: "destructive",
      });
    },
  });

  const addItemToOrderMutation = useMutation({
    mutationFn: async ({ orderId, itemId }: { orderId: string; itemId: string }) => {
      const item = items.find(i => i.id === itemId);
      if (!item) throw new Error("Item not found");
      
      const response = await apiRequest("POST", "/api/orders/quick-add", {
        hospitalId: activeHospital?.id,
        itemId,
        vendorId: item.vendorId,
        qty: 1,
        packSize: item.packSize || 1,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}`, activeHospital?.locationId] });
      toast({
        title: t('orders.itemAdded'),
        description: t('orders.itemAddedSuccess'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.failedToAddItem'),
        variant: "destructive",
      });
    },
  });

  const ordersByStatus = useMemo(() => {
    const grouped: Record<OrderStatus, OrderWithDetails[]> = {
      draft: [],
      sent: [],
      received: [],
    };

    orders.forEach((order) => {
      const status = order.status as OrderStatus;
      if (grouped[status]) {
        grouped[status].push(order);
      }
    });

    return grouped;
  }, [orders]);

  const itemsNeedingOrder = useMemo(() => {
    return items
      .map(item => ({
        ...item,
        qtyToOrder: Math.max(0, (item.maxThreshold || 10) - (item.stockLevel?.qtyOnHand || 0))
      }))
      .filter(item => item.qtyToOrder > 0);
  }, [items]);

  const getStatusChip = (status: string) => {
    switch (status) {
      case "draft":
        return "chip-muted";
      case "sent":
        return "chip-warning";
      case "received":
        return "chip-success";
      default:
        return "chip-muted";
    }
  };

  const formatCurrency = (amount?: string | number) => {
    if (!amount) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(amount));
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const downloadOrderPDF = (order: OrderWithDetails) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("PURCHASE ORDER", 105, 20, { align: "center" });
    
    // Order details
    doc.setFontSize(10);
    const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A";
    doc.text(`PO Number: PO-${order.id.slice(-4)}`, 20, 40);
    doc.text(`Date: ${orderDate}`, 20, 46);
    doc.text(`Status: ${order.status.toUpperCase()}`, 20, 52);
    doc.text(`Location: ${getOrderLocation(order)}`, 20, 58);
    
    // Vendor details
    if (order.vendor) {
      doc.text(`Vendor: ${order.vendor.name}`, 120, 40);
      if (order.vendor.contact) {
        doc.text(`Contact: ${order.vendor.contact}`, 120, 46);
      }
      if (order.vendor.leadTime) {
        doc.text(`Lead Time: ${order.vendor.leadTime} days`, 120, 52);
      }
    } else {
      doc.text(`Vendor: Not Specified`, 120, 40);
    }
    
    // Items table
    const tableData = order.orderLines.map((line) => {
      return [
        line.item.name,
        `${line.qty}`,
        line.item.unit,
        line.item.controlled ? "Yes" : "No",
      ];
    });
    
    autoTable(doc, {
      startY: 70,
      head: [["Item Name", "Quantity", "Unit", "Controlled"]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 30, halign: "center" },
        2: { cellWidth: 40 },
        3: { cellWidth: 30, halign: "center" },
      },
    });
    
    // Footer
    const finalY = (doc as any).lastAutoTable.finalY || 70;
    doc.setFontSize(9);
    doc.text(`Total Items: ${order.orderLines.length}`, 20, finalY + 15);
    doc.text(`Generated: ${new Date().toLocaleString("en-US")}`, 20, finalY + 21);
    
    // Download
    doc.save(`PO-${order.id.slice(-4)}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleStatusUpdate = (orderId: string, newStatus: string) => {
    updateOrderStatusMutation.mutate({ orderId, status: newStatus });
  };

  const handleNewOrder = () => {
    if (itemsNeedingOrder.length === 0) {
      toast({
        title: t('orders.noItemsToOrder'),
        description: t('orders.noItemsToOrderMessage'),
      });
      return;
    }

    setSelectedVendorId(vendors.length > 0 ? vendors[0].id : null);
    setNewOrderDialogOpen(true);
  };

  const handleCreateOrder = () => {
    const orderLines = itemsNeedingOrder.map(item => {
      const packSize = item.packSize || 1;
      
      return {
        itemId: item.id,
        qty: item.qtyToOrder,
        packSize,
      };
    });

    createOrderMutation.mutate({ vendorId: selectedVendorId, orderLines });
  };

  const handleEditOrder = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setEditOrderDialogOpen(true);
  };

  const handleUpdateQuantity = (lineId: string, qty: number) => {
    updateOrderLineMutation.mutate({ lineId, qty });
  };

  const handleRemoveItem = (lineId: string) => {
    setLineToRemove(lineId);
  };

  const confirmRemoveItem = () => {
    if (lineToRemove) {
      removeOrderLineMutation.mutate(lineToRemove);
      setLineToRemove(null);
    }
  };

  const handleDeleteOrder = () => {
    if (selectedOrder) {
      deleteOrderMutation.mutate(selectedOrder.id);
    }
  };

  const getOrderLocation = (order: OrderWithDetails) => {
    const locations = new Set(order.orderLines.map(line => line.item.location.name));
    return Array.from(locations).join(", ");
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('orders.noHospitalSelected')}</h3>
          <p className="text-muted-foreground">{t('orders.selectHospitalToView')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('orders.title')}</h1>
        <Button size="sm" onClick={handleNewOrder} data-testid="add-order-button">
          <i className="fas fa-plus mr-2"></i>
          {t('orders.newOrder')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
          <p className="text-muted-foreground">{t('orders.loadingOrders')}</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* Draft Column */}
          <div className="kanban-column">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t('orders.draft')}</h3>
              <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs flex items-center justify-center font-semibold">
                {ordersByStatus.draft.length}
              </span>
            </div>

            <div className="space-y-3">
              {ordersByStatus.draft.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t('orders.noDraftOrders')}
                </div>
              ) : (
                ordersByStatus.draft.map((order) => (
                  <div 
                    key={order.id} 
                    className="kanban-card cursor-pointer" 
                    onClick={() => handleEditOrder(order)}
                    data-testid={`draft-order-${order.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-foreground">PO-{order.id.slice(-4)}</h4>
                        <p className="text-xs text-muted-foreground">
                          <i className="fas fa-map-marker-alt mr-1"></i>
                          {getOrderLocation(order)}
                        </p>
                      </div>
                      <span className={`status-chip ${getStatusChip(order.status)} text-xs`}>
                        {t('orders.draft')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t('orders.itemsCount', { count: order.orderLines.length })}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOrderPDF(order);
                        }}
                        data-testid={`pdf-order-${order.id}`}
                      >
                        <i className="fas fa-file-pdf"></i>
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusUpdate(order.id, "sent");
                        }}
                        disabled={updateOrderStatusMutation.isPending}
                        data-testid={`submit-order-${order.id}`}
                      >
                        {t('orders.submit')}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sent Column */}
          <div className="kanban-column">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t('orders.sent')}</h3>
              <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs flex items-center justify-center font-semibold">
                {ordersByStatus.sent.length}
              </span>
            </div>

            <div className="space-y-3">
              {ordersByStatus.sent.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t('orders.noSentOrders')}
                </div>
              ) : (
                ordersByStatus.sent.map((order) => (
                  <div 
                    key={order.id} 
                    className="kanban-card cursor-pointer" 
                    onClick={() => handleEditOrder(order)}
                    data-testid={`sent-order-${order.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-foreground">PO-{order.id.slice(-4)}</h4>
                      </div>
                      <span className={`status-chip ${getStatusChip(order.status)} text-xs`}>
                        {t('orders.sent')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t('orders.itemsCount', { count: order.orderLines.length })}
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Sent {formatDate((order.updatedAt || order.createdAt) as any)}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOrderPDF(order);
                        }}
                        data-testid={`pdf-order-${order.id}`}
                      >
                        <i className="fas fa-file-pdf"></i>
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusUpdate(order.id, "received");
                        }}
                        disabled={updateOrderStatusMutation.isPending}
                        data-testid={`mark-received-${order.id}`}
                      >
                        <i className="fas fa-check mr-1"></i>
                        {t('orders.markAsReceived')}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Received Column */}
          <div className="kanban-column">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t('orders.received')}</h3>
              <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs flex items-center justify-center font-semibold">
                {ordersByStatus.received.length}
              </span>
            </div>

            <div className="space-y-3">
              {ordersByStatus.received.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t('orders.noReceivedOrders')}
                </div>
              ) : (
                ordersByStatus.received.map((order) => (
                  <div 
                    key={order.id} 
                    className="kanban-card cursor-pointer" 
                    onClick={() => handleEditOrder(order)}
                    data-testid={`received-order-${order.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-foreground">PO-{order.id.slice(-4)}</h4>
                      </div>
                      <span className={`status-chip ${getStatusChip(order.status)} text-xs`}>
                        {t('orders.received')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t('orders.itemsCount', { count: order.orderLines.length })}
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Received {formatDate((order.updatedAt || order.createdAt) as any)}
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadOrderPDF(order);
                      }}
                      data-testid={`pdf-order-${order.id}`}
                    >
                      <i className="fas fa-file-pdf mr-1"></i>
                      {t('orders.pdf')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Order Dialog */}
      <Dialog open={newOrderDialogOpen} onOpenChange={setNewOrderDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('orders.createNewOrder')}</DialogTitle>
            <DialogDescription>{t('orders.createDraftOrderDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">{t('orders.itemsToOrder', { count: itemsNeedingOrder.length })}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t('orders.itemsBelowMaxThreshold')}
              </p>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {itemsNeedingOrder.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30" data-testid={`order-item-${item.id}`}>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('orders.current')}: {item.stockLevel?.qtyOnHand || 0} / {t('orders.max')}: {item.maxThreshold || 10}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-primary">
                        {item.qtyToOrder} {item.unit}
                      </p>
                      <p className="text-xs text-muted-foreground">{t('orders.toOrder')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setNewOrderDialogOpen(false)}
                data-testid="cancel-order-button"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreateOrder}
                disabled={createOrderMutation.isPending}
                data-testid="confirm-order-button"
              >
                {createOrderMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    {t('orders.creating')}
                  </>
                ) : (
                  <>
                    <i className="fas fa-check mr-2"></i>
                    {t('orders.createDraftOrder')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={editOrderDialogOpen} onOpenChange={setEditOrderDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('orders.editOrderTitle', { number: selectedOrder?.id.slice(-4) })}</DialogTitle>
            <DialogDescription>{t('orders.editOrderDesc')}</DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">{t('orders.location')}</p>
                  <p className="font-medium text-foreground">
                    <i className="fas fa-map-marker-alt mr-1"></i>
                    {getOrderLocation(selectedOrder)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('orders.status')}</p>
                  <span className={`status-chip ${getStatusChip(selectedOrder.status)} text-xs`}>
                    {t(`orders.${selectedOrder.status}`)}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">{t('orders.orderItems', { count: selectedOrder.orderLines.length })}</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {selectedOrder.orderLines.map(line => {
                    const stockStatus = getStockStatus(line.item);
                    const currentQty = line.item.stockLevel?.qtyOnHand ?? 0;
                    const normalizedUnit = normalizeUnit(line.item.unit);
                    
                    const displayQty = line.qty;
                    const displayUnit = line.item.unit;
                    
                    return (
                    <div key={line.id} className="flex items-center gap-3 p-3 border border-border rounded-lg" data-testid={`order-line-${line.id}`}>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{line.item.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-base font-semibold ${stockStatus.color}`}>
                            {currentQty}
                          </span>
                          <i className={`fas ${normalizedUnit === "pack" ? "fa-box" : "fa-vial"} text-sm ${stockStatus.color}`}></i>
                          <span className="text-xs text-muted-foreground">
                            / {t('orders.min')}: {line.item.minThreshold ?? 0} / {t('orders.max')}: {line.item.maxThreshold ?? 0}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingLineId === line.id ? (
                          <>
                            <div className="text-right">
                              <input
                                type="number"
                                min="1"
                                value={editQty}
                                onChange={(e) => setEditQty(Number(e.target.value))}
                                className="w-20 px-2 py-1 border border-border rounded text-center bg-background text-foreground"
                                data-testid={`qty-input-${line.id}`}
                              />
                              <p className="text-xs text-muted-foreground mt-1">{displayUnit}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                handleUpdateQuantity(line.id, editQty);
                              }}
                              data-testid={`save-qty-${line.id}`}
                            >
                              <i className="fas fa-check"></i>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingLineId(null)}
                              data-testid={`cancel-qty-${line.id}`}
                            >
                              <i className="fas fa-times"></i>
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="text-right min-w-[80px]">
                              <p className="text-lg font-semibold text-foreground">{displayQty}</p>
                              <p className="text-xs text-muted-foreground">{displayUnit}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingLineId(line.id);
                                setEditQty(line.qty);
                              }}
                              data-testid={`edit-qty-${line.id}`}
                            >
                              <i className="fas fa-edit"></i>
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRemoveItem(line.id)}
                              disabled={removeOrderLineMutation.isPending}
                              data-testid={`remove-item-${line.id}`}
                            >
                              <i className="fas fa-trash"></i>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between gap-2 pt-4 border-t border-border">
                <Button
                  variant="destructive"
                  onClick={handleDeleteOrder}
                  disabled={deleteOrderMutation.isPending}
                  data-testid="delete-order-button"
                >
                  {deleteOrderMutation.isPending ? t('orders.deleting') : t('common.delete')}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditOrderDialogOpen(false)}
                    data-testid="close-edit-dialog"
                  >
                    {t('common.close')}
                  </Button>
                  {selectedOrder.status === 'draft' && (
                    <Button
                      onClick={() => {
                        handleStatusUpdate(selectedOrder.id, "sent");
                        setEditOrderDialogOpen(false);
                      }}
                      data-testid="submit-from-edit"
                    >
                      <i className="fas fa-paper-plane mr-2"></i>
                      {t('orders.submitOrder')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Item Confirmation Dialog */}
      <AlertDialog open={!!lineToRemove} onOpenChange={(open) => !open && setLineToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('orders.removeItemTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('orders.removeItemDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-remove-item">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-remove-item"
            >
              {t('orders.removeItem')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
