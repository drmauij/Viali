import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatDateTime } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SignaturePad from "@/components/SignaturePad";
import type { Order, Vendor, OrderLine, Item, StockLevel, Unit } from "@shared/schema";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Check, ChevronDown, ChevronUp, Merge, Paperclip, Upload, Camera, Trash2, Download, FileIcon, GripVertical, Flame } from "lucide-react";
import type { OrderAttachment } from "@shared/schema";
import { DndContext, DragEndEvent, useDraggable, useDroppable, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

interface OrderWithDetails extends Order {
  vendor: Vendor | null;
  orderLines: (OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } })[];
}

interface ItemWithStock extends Item {
  stockLevel?: StockLevel;
}

type OrderStatus = "draft" | "ready_to_send" | "sent" | "received";
type UnitType = "Pack" | "Single unit";

const normalizeUnit = (unit: string | undefined | null): UnitType => {
  if (!unit) return "Single unit";
  const normalized = unit.toLowerCase();
  if (normalized === "pack" || normalized === "box" || normalized.includes("pack")) {
    return "Pack";
  }
  return "Single unit";
};

const getStockStatus = (item: Item & { stockLevel?: StockLevel }) => {
  const currentQty = item.stockLevel?.qtyOnHand || 0;
  const minThreshold = item.minThreshold || 0;
  
  if (currentQty <= minThreshold) {
    return { color: "text-warning", status: "Below Min" };
  }
  return { color: "text-success", status: "Good" };
};

// Helper to check if a code value is valid (not a placeholder like "Not visible")
const isValidCode = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const placeholders = ['not visible', 'not clearly visible', 'nicht sichtbar', 'n/a', 'na', '-'];
  return !placeholders.includes(value.toLowerCase().trim());
};

// Helper to get supplier/code info for display in order items
const getItemSupplierInfo = (
  line: { item: any },
  vendorName?: string | null
): string | null => {
  const supplierCode = line.item?.preferredSupplierCode;
  const codes = line.item?.itemCodes;
  
  const parts: string[] = [];
  
  // Supplier name (prefer preferred supplier, fallback to vendor)
  if (supplierCode?.supplierName) {
    parts.push(supplierCode.supplierName);
  } else if (vendorName) {
    parts.push(vendorName);
  }
  
  // Article code from preferred supplier
  if (supplierCode?.articleCode && isValidCode(supplierCode.articleCode)) {
    parts.push(`Art: ${supplierCode.articleCode}`);
  }
  
  // Pharmacode (only if valid)
  if (codes?.pharmacode && isValidCode(codes.pharmacode)) {
    parts.push(`PC: ${codes.pharmacode}`);
  }
  
  // GTIN (only if valid)
  if (codes?.gtin && isValidCode(codes.gtin)) {
    parts.push(`GTIN: ${codes.gtin}`);
  }
  
  return parts.length > 0 ? parts.join(' · ') : null;
};

// Helper to convert order status to translation key
const getStatusTranslationKey = (status: string): string => {
  switch (status) {
    case 'ready_to_send':
      return 'readyToSend';
    default:
      return status;
  }
};

// Draggable order card wrapper
function DraggableOrderCard({ 
  orderId, 
  children, 
  disabled 
}: { 
  orderId: string; 
  children: React.ReactNode; 
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: orderId,
    disabled,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {!disabled && (
        <div 
          {...listeners} 
          {...attributes}
          className="absolute left-1 top-3 cursor-grab active:cursor-grabbing z-10 bg-muted/80 rounded p-1 touch-none"
          data-testid={`drag-handle-order-${orderId}`}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className={!disabled ? "pl-6" : ""}>
        {children}
      </div>
    </div>
  );
}

// Droppable column wrapper
function DroppableColumn({ 
  id, 
  children 
}: { 
  id: string; 
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div 
      ref={setNodeRef} 
      className={`kanban-column transition-all ${isOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
    >
      {children}
    </div>
  );
}

interface OrdersProps {
  logisticMode?: boolean;
}

export default function Orders({ logisticMode = false }: OrdersProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newOrderDialogOpen, setNewOrderDialogOpen] = useState(false);
  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(1);
  const [lineToRemove, setLineToRemove] = useState<string | null>(null);
  const [editingOrderNotes, setEditingOrderNotes] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [editingLineNotes, setEditingLineNotes] = useState<string | null>(null);
  const [lineNotes, setLineNotes] = useState("");
  
  // Logistics mode: filter by unit
  const [filterUnitId, setFilterUnitId] = useState<string>("all");
  
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [selectedLineToReceive, setSelectedLineToReceive] = useState<(OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } }) | null>(null);
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveSignature, setReceiveSignature] = useState("");
  const [showReceiveSignaturePad, setShowReceiveSignaturePad] = useState(false);
  
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [orderDialogTab, setOrderDialogTab] = useState<"details" | "attachments">("details");
  
  // Expand/collapse state for order preview
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  
  // Multi-select state for merging orders (works across draft, ready_to_send, sent)
  const [selectedOrdersForMerge, setSelectedOrdersForMerge] = useState<Set<string>>(new Set());
  
  // State for split functionality - selected line IDs in the edit dialog
  const [selectedLinesForSplit, setSelectedLinesForSplit] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState(false);
  
  // Drag-and-drop state for order status changes
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  const toggleOrderExpanded = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };
  
  const toggleOrderSelectionForMerge = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrdersForMerge(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        // Enforce same-status selection: only allow selecting orders with matching status
        const orderToAdd = orders.find(o => o.id === orderId);
        if (orderToAdd && newSet.size > 0) {
          const firstSelectedId = Array.from(newSet)[0];
          const firstSelectedOrder = orders.find(o => o.id === firstSelectedId);
          if (firstSelectedOrder && firstSelectedOrder.status !== orderToAdd.status) {
            // Different status - show toast and don't add
            toast({
              title: t('orders.mergeError'),
              description: t('orders.sameStatusRequired'),
              variant: 'destructive',
            });
            return prev; // Return unchanged
          }
        }
        newSet.add(orderId);
      }
      return newSet;
    });
  };
  
  const toggleLineForSplit = (lineId: string) => {
    setSelectedLinesForSplit(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lineId)) {
        newSet.delete(lineId);
      } else {
        newSet.add(lineId);
      }
      return newSet;
    });
  };

  // Auto-select handler for number inputs (with workaround for browser compatibility)
  const handleNumberInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Use setTimeout to ensure selection happens after focus is complete
    // This is necessary for type="number" inputs in some browsers
    setTimeout(() => {
      e.target.select();
    }, 0);
  };

  // Use different endpoints for logistic vs standard mode
  const ordersQueryKey = logisticMode 
    ? [`/api/logistic/orders/${activeHospital?.id}`]
    : [`/api/orders/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId];
  
  const { data: allOrders = [], isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ordersQueryKey,
    enabled: logisticMode ? !!activeHospital?.id : (!!activeHospital?.id && !!activeHospital?.unitId),
  });
  
  // For logistics mode, fetch all units for the filter
  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: [`/api/units/${activeHospital?.id}`],
    enabled: logisticMode && !!activeHospital?.id,
  });
  
  // Filter to only units with inventory module enabled
  const inventoryUnits = useMemo(() => {
    return allUnits.filter(unit => (unit as any).showInventory !== false);
  }, [allUnits]);
  
  // Filter orders by unit when in logistics mode
  const orders = useMemo(() => {
    if (!logisticMode || filterUnitId === "all") return allOrders;
    return allOrders.filter(order => order.unitId === filterUnitId);
  }, [logisticMode, filterUnitId, allOrders]);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: [`/api/vendors/${activeHospital?.id}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id,
  });

  const { data: items = [] } = useQuery<ItemWithStock[]>({
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
  });
  
  // Helper to invalidate order caches (works for both standard and logistics mode)
  const invalidateOrderCaches = () => {
    // Standard mode query key includes unitId in the URL
    queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId] });
    queryClient.invalidateQueries({ queryKey: [`/api/orders/open-items/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId] });
    if (logisticMode) {
      queryClient.invalidateQueries({ queryKey: [`/api/logistic/orders/${activeHospital?.id}`] });
    }
  };
  
  // Helper to get unit name from inventoryUnits (only available in logistics mode)
  const getUnitName = (unitId: string) => {
    if (!logisticMode || !inventoryUnits) return '';
    const unit = inventoryUnits.find(u => u.id === unitId);
    return unit?.name || '';
  };

  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const updatedOrder = orders.find(o => o.id === selectedOrder.id);
      if (updatedOrder) {
        setSelectedOrder(updatedOrder);
      }
    }
  }, [orders, selectedOrder?.id]);

  // Order attachments query
  const { data: orderAttachments = [], refetch: refetchAttachments } = useQuery<OrderAttachment[]>({
    queryKey: ['/api/orders', selectedOrder?.id, 'attachments'],
    queryFn: async () => {
      if (!selectedOrder?.id) return [];
      const response = await fetch(`/api/orders/${selectedOrder.id}/attachments`);
      if (!response.ok) throw new Error('Failed to fetch attachments');
      return response.json();
    },
    enabled: !!selectedOrder?.id && editOrderDialogOpen,
  });

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
      invalidateOrderCaches();
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
      invalidateOrderCaches();
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId] });
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

  const toggleHighPriorityMutation = useMutation({
    mutationFn: async ({ orderId, highPriority }: { orderId: string; highPriority: boolean }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}`, { highPriority });
      return response.json();
    },
    onSuccess: () => {
      invalidateOrderCaches();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.failedToUpdatePriority') || 'Failed to update priority',
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
      invalidateOrderCaches();
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
      invalidateOrderCaches();
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
      invalidateOrderCaches();
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

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiRequest("DELETE", `/api/orders/attachments/${attachmentId}`);
      return response.json();
    },
    onSuccess: () => {
      refetchAttachments();
      toast({
        title: t('orders.attachmentDeleted'),
        description: t('orders.attachmentDeletedSuccess'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.failedToDeleteAttachment'),
        variant: "destructive",
      });
    },
  });

  const handleAttachmentUpload = async (file: File) => {
    if (!selectedOrder) return;
    
    setUploadingAttachment(true);
    try {
      // Get presigned upload URL
      const uploadUrlResponse = await apiRequest("POST", `/api/orders/${selectedOrder.id}/attachments/upload-url`, {
        filename: file.name,
        contentType: file.type,
      });
      const { uploadURL, storageKey } = await uploadUrlResponse.json();
      
      // Upload file to S3
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }
      
      // Create attachment record
      await apiRequest("POST", `/api/orders/${selectedOrder.id}/attachments`, {
        filename: file.name,
        contentType: file.type,
        storageKey,
      });
      
      refetchAttachments();
      toast({
        title: t('orders.attachmentUploaded'),
        description: t('orders.attachmentUploadedSuccess'),
      });
    } catch (error) {
      console.error('Error uploading attachment:', error);
      toast({
        title: t('common.error'),
        description: t('orders.failedToUploadAttachment'),
        variant: "destructive",
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAttachmentUpload(file);
    }
    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const response = await fetch(`/api/orders/attachments/${attachmentId}/download-url`);
      if (!response.ok) throw new Error('Failed to get download URL');
      const { downloadURL, filename } = await response.json();
      
      // Open in new tab or download
      const link = document.createElement('a');
      link.href = downloadURL;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      toast({
        title: t('common.error'),
        description: t('orders.failedToDownloadAttachment'),
        variant: "destructive",
      });
    }
  };

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
      invalidateOrderCaches();
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

  const receiveLineMutation = useMutation({
    mutationFn: async (data: {
      lineId: string;
      notes?: string;
      signature?: string;
    }) => {
      const response = await apiRequest("POST", `/api/order-lines/${data.lineId}/receive`, {
        notes: data.notes,
        signature: data.signature,
      });
      return response.json();
    },
    // Optimistic update for instant UI feedback
    onMutate: async (data) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ordersQueryKey });
      
      // Snapshot the previous value
      const previousOrders = queryClient.getQueryData<OrderWithDetails[]>(ordersQueryKey);
      
      // Optimistically update to the new value
      if (previousOrders) {
        queryClient.setQueryData<OrderWithDetails[]>(ordersQueryKey, (old) => {
          if (!old) return old;
          return old.map(order => ({
            ...order,
            orderLines: order.orderLines.map(line => 
              line.id === data.lineId 
                ? { ...line, received: true, receivedAt: new Date() }
                : line
            ),
          }));
        });
      }
      
      // Return context with the snapshotted value
      return { previousOrders };
    },
    onSuccess: () => {
      invalidateOrderCaches();
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId] });
      toast({
        title: t('orders.itemReceived'),
        description: t('orders.itemReceivedSuccess'),
      });
      setShowReceiveDialog(false);
      resetReceiveForm();
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousOrders) {
        queryClient.setQueryData(ordersQueryKey, context.previousOrders);
      }
      
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
        title: t('orders.receiveFailed'),
        description: t('orders.receiveFailedMessage'),
        variant: "destructive",
      });
    },
  });

  const updateOrderNotesMutation = useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/notes`, { notes });
      return response.json();
    },
    onSuccess: () => {
      invalidateOrderCaches();
      setEditingOrderNotes(false);
      toast({
        title: t('common.success'),
        description: 'Order notes updated successfully',
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: 'Failed to update order notes',
        variant: "destructive",
      });
    },
  });

  const updateLineNotesMutation = useMutation({
    mutationFn: async ({ lineId, notes }: { lineId: string; notes: string }) => {
      const response = await apiRequest("PATCH", `/api/order-lines/${lineId}`, { notes });
      return response.json();
    },
    onSuccess: () => {
      invalidateOrderCaches();
      setEditingLineNotes(null);
      toast({
        title: t('common.success'),
        description: 'Item notes updated successfully',
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: 'Failed to update item notes',
        variant: "destructive",
      });
    },
  });

  const moveToSecondaryMutation = useMutation({
    mutationFn: async (lineId: string) => {
      const response = await apiRequest("POST", `/api/order-lines/${lineId}/move-to-secondary`, {});
      return response.json();
    },
    onSuccess: (data) => {
      invalidateOrderCaches();
      
      // If main order was deleted, close the dialog to avoid showing stale data
      if (data.mainOrderDeleted) {
        setEditOrderDialogOpen(false);
        toast({
          title: t('common.success'),
          description: 'Item moved to secondary order. Main order was empty and has been removed.',
        });
      } else {
        toast({
          title: t('common.success'),
          description: 'Item moved to secondary order',
        });
      }
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: 'Failed to move item to secondary order',
        variant: "destructive",
      });
    },
  });

  const toggleOfflineWorkedMutation = useMutation({
    mutationFn: async ({ lineId, offlineWorked }: { lineId: string; offlineWorked: boolean }) => {
      const response = await apiRequest("PATCH", `/api/order-lines/${lineId}/offline-worked`, { offlineWorked });
      return response.json();
    },
    onMutate: async ({ lineId, offlineWorked }) => {
      // Cancel any outgoing refetches
      const queryKey = [`/api/orders/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId];
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot the previous value
      const previousOrders = queryClient.getQueryData<OrderWithDetails[]>(queryKey);
      
      // Optimistically update to the new value
      queryClient.setQueryData<OrderWithDetails[]>(
        queryKey,
        (old) => {
          if (!old) return old;
          return old.map(order => ({
            ...order,
            orderLines: order.orderLines.map(line => 
              line.id === lineId 
                ? { ...line, offlineWorked } 
                : line
            ),
          }));
        }
      );
      
      // Return context with snapshot
      return { previousOrders, queryKey };
    },
    onError: (_error, _variables, context) => {
      // Rollback to previous value on error
      if (context?.previousOrders && context?.queryKey) {
        queryClient.setQueryData(
          context.queryKey,
          context.previousOrders
        );
      }
      toast({
        title: t('common.error'),
        description: 'Failed to update offline worked status',
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Sync with server after mutation
      invalidateOrderCaches();
    },
  });

  // Merge selected sent orders mutation
  const mergeOrdersMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest("POST", `/api/orders/${activeHospital?.id}/merge`, { orderIds });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: t('orders.ordersMerged'),
      });
      setSelectedOrdersForMerge(new Set());
      invalidateOrderCaches();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.mergeFailed'),
        variant: "destructive",
      });
    },
  });

  const splitOrderMutation = useMutation({
    mutationFn: async ({ orderId, lineIds }: { orderId: string; lineIds: string[] }) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/split`, { lineIds });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: t('orders.orderSplit'),
      });
      setSelectedLinesForSplit(new Set());
      setEditOrderDialogOpen(false);
      invalidateOrderCaches();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('orders.splitFailed'),
        variant: "destructive",
      });
    },
  });

  const handleSplitOrder = () => {
    if (!selectedOrder || selectedLinesForSplit.size === 0) return;
    
    // Don't split all items - at least one must remain
    if (selectedLinesForSplit.size >= selectedOrder.orderLines.length) {
      toast({
        title: t('common.error'),
        description: t('orders.cannotSplitAllItems'),
        variant: "destructive",
      });
      return;
    }
    
    splitOrderMutation.mutate({
      orderId: selectedOrder.id,
      lineIds: Array.from(selectedLinesForSplit),
    });
  };

  const handleMergeOrders = () => {
    if (selectedOrdersForMerge.size < 2) {
      toast({
        title: t('common.error'),
        description: t('orders.selectAtLeastTwo'),
        variant: "destructive",
      });
      return;
    }
    mergeOrdersMutation.mutate(Array.from(selectedOrdersForMerge));
  };

  const ordersByStatus = useMemo(() => {
    const grouped: Record<OrderStatus, OrderWithDetails[]> = {
      draft: [],
      ready_to_send: [],
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
      case "ready_to_send":
        return "chip-info";
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

  const downloadOrderPDF = (order: OrderWithDetails) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("PURCHASE ORDER", 105, 20, { align: "center" });
    
    // Order details
    doc.setFontSize(10);
    const orderDate = order.createdAt ? formatDate(order.createdAt) : "N/A";
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
        normalizeUnit(line.item.unit),
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
    doc.text(`Generated: ${formatDateTime(new Date())}`, 20, finalY + 21);
    
    // Download
    doc.save(`PO-${order.id.slice(-4)}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const isMainDraftOrder = (order: OrderWithDetails): boolean => {
    if (order.status !== 'draft') return false;
    
    // Find all draft orders for the same unit
    const draftOrdersForUnit = orders.filter(o => 
      o.status === 'draft' && 
      o.unitId === order.unitId
    );
    
    if (draftOrdersForUnit.length === 0) return false;
    
    // Sort by createdAt to find the oldest (main) draft
    const sortedDrafts = [...draftOrdersForUnit].sort((a, b) => 
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    );
    
    // Main order is the oldest draft
    return sortedDrafts[0].id === order.id;
  };

  const handleStatusUpdate = (orderId: string, newStatus: string) => {
    updateOrderStatusMutation.mutate({ orderId, status: newStatus });
  };

  // Handle drag-and-drop for order status changes
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    
    if (!over) return;
    
    const orderId = active.id as string;
    const targetStatus = over.id as string;
    
    // Only allow transitions between draft, ready_to_send, and sent
    const allowedStatuses = ['draft', 'ready_to_send', 'sent'];
    if (!allowedStatuses.includes(targetStatus)) return;
    
    // Find the order being dragged
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Don't update if dropping in the same column
    if (order.status === targetStatus) return;
    
    // Check if user can edit this order
    if (!canEditOrder(order)) {
      toast({
        title: t('orders.accessDenied'),
        description: t('orders.cannotEditOtherUnitOrder'),
        variant: "destructive",
      });
      return;
    }
    
    // Update the status
    handleStatusUpdate(orderId, targetStatus);
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
    setOrderDialogTab("details");
    setSelectedLinesForSplit(new Set()); // Clear split selection when opening a different order
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
    const locations = new Set(order.orderLines.map(line => line.item.hospitalUnit?.name));
    return Array.from(locations).join(", ");
  };

  // Check if the user can edit/modify this order (must be from same unit OR in logistics mode)
  const canEditOrder = (order: OrderWithDetails) => {
    if (logisticMode) return true; // Logistics users can edit any order
    return activeHospital?.unitId === order.unitId;
  };

  const resetReceiveForm = () => {
    setSelectedLineToReceive(null);
    setReceiveNotes("");
    setReceiveSignature("");
    setShowReceiveSignaturePad(false);
  };

  const handleReceiveLine = (line: OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } }) => {
    setSelectedLineToReceive(line);
    setShowReceiveDialog(true);
  };

  const handleSubmitReceive = () => {
    if (!selectedLineToReceive) return;
    
    if (selectedLineToReceive.item.controlled) {
      if (!receiveSignature) {
        toast({
          title: "Signature Required",
          description: "Signature is required for controlled substances.",
          variant: "destructive",
        });
        return;
      }
      if (!receiveNotes || receiveNotes.trim() === '') {
        toast({
          title: "Notes Required",
          description: "Notes are required for controlled substances.",
          variant: "destructive",
        });
        return;
      }
    }

    receiveLineMutation.mutate({
      lineId: selectedLineToReceive.id,
      notes: receiveNotes || undefined,
      signature: receiveSignature || undefined,
    });
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
        <h1 className="text-2xl font-bold text-foreground">
          {logisticMode ? t('logistic.orders', 'Orders') : t('orders.title')}
        </h1>
        {canWrite && !logisticMode && (
          <Button size="sm" onClick={handleNewOrder} data-testid="add-order-button">
            <i className="fas fa-plus mr-2"></i>
            {t('orders.newOrder')}
          </Button>
        )}
      </div>

      {/* Logistics mode: Unit filter bar */}
      {logisticMode && (
        <div className="bg-muted/30 border rounded-lg p-3 flex items-center gap-4">
          <label className="text-sm font-medium text-muted-foreground">
            {t('logistic.filterByUnit', 'Filter by Unit')}:
          </label>
          <Select value={filterUnitId} onValueChange={setFilterUnitId}>
            <SelectTrigger className="w-[250px]" data-testid="logistic-orders-unit-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('logistic.allUnits', 'All Units')}</SelectItem>
              {inventoryUnits.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">
            {orders.length} {t('orders.totalOrders', 'orders')}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">
          <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
          <p className="text-muted-foreground">{t('orders.loadingOrders')}</p>
        </div>
      ) : (
        <DndContext 
          sensors={sensors} 
          onDragStart={(event) => setActiveDragId(event.active.id as string)}
          onDragEnd={handleDragEnd}
        >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* Draft Column */}
          <DroppableColumn id="draft">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t('orders.draft')}</h3>
              <div className="flex items-center gap-2">
                {selectedOrdersForMerge.size >= 2 && ordersByStatus.draft.some(o => selectedOrdersForMerge.has(o.id)) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMergeOrders}
                    disabled={mergeOrdersMutation.isPending}
                    className="h-6 text-xs"
                    data-testid="merge-draft-orders-button"
                  >
                    <Merge className="w-3 h-3 mr-1" />
                    {t('orders.merge')} ({selectedOrdersForMerge.size})
                  </Button>
                )}
                <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs flex items-center justify-center font-semibold">
                  {ordersByStatus.draft.length}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {ordersByStatus.draft.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t('orders.noDraftOrders')}
                </div>
              ) : (
                ordersByStatus.draft.map((order) => (
                  <DraggableOrderCard key={order.id} orderId={order.id} disabled={!canWrite || !canEditOrder(order)}>
                  <div 
                    className={`kanban-card cursor-pointer ${selectedOrdersForMerge.has(order.id) ? 'ring-2 ring-primary' : ''} ${!canEditOrder(order) ? 'opacity-60 border-muted' : ''}`}
                    onClick={() => handleEditOrder(order)}
                    data-testid={`draft-order-${order.id}`}
                  >
                    <div className="flex flex-col gap-1 mb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={selectedOrdersForMerge.has(order.id)}
                            onClick={(e) => toggleOrderSelectionForMerge(order.id, e)}
                            data-testid={`select-draft-order-${order.id}`}
                            className="shrink-0"
                          />
                          <h4 className="font-semibold text-foreground whitespace-nowrap">PO-{order.id.slice(-4)}</h4>
                          {order.highPriority && (
                            <Flame className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          {canEditOrder(order) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`p-1 h-auto shrink-0 ${order.highPriority ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleHighPriorityMutation.mutate({ orderId: order.id, highPriority: !order.highPriority });
                              }}
                              title={order.highPriority ? 'Remove high priority' : 'Mark as high priority'}
                              data-testid={`toggle-priority-${order.id}`}
                            >
                              <Flame className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {logisticMode && (
                          <Badge variant="outline" className="text-xs shrink-0 truncate max-w-[120px]">
                            <i className="fas fa-building mr-1"></i>
                            {getUnitName(order.unitId) || 'Unknown'}
                          </Badge>
                        )}
                      </div>
                      {!logisticMode && (
                        <p className="text-xs text-muted-foreground truncate pl-6">
                          <i className="fas fa-map-marker-alt mr-1"></i>
                          {getOrderLocation(order)}
                          {!canEditOrder(order) && <span className="ml-1 text-warning">(Other)</span>}
                        </p>
                      )}
                    </div>
                    <button 
                      className="flex items-center gap-1 text-sm text-muted-foreground mb-2 hover:text-foreground transition-colors"
                      onClick={(e) => toggleOrderExpanded(order.id, e)}
                      data-testid={`expand-order-${order.id}`}
                    >
                      {expandedOrders.has(order.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {t('orders.itemsCount', { count: order.orderLines.length })}
                    </button>
                    
                    {expandedOrders.has(order.id) && order.orderLines.length > 0 && (
                      <div className="mb-3 space-y-1 text-xs border-t border-border pt-2">
                        {order.orderLines.map(line => (
                          <div key={line.id} className="flex justify-between text-muted-foreground">
                            <div className="flex-1 mr-2 min-w-0">
                              <span className="truncate block">{line.item?.name || 'Unknown Item'}</span>
                              {(() => {
                                const supplierInfo = getItemSupplierInfo(line, order.vendor?.name);
                                return supplierInfo && (
                                  <span className="text-[10px] text-muted-foreground/70 block truncate">
                                    {supplierInfo}
                                  </span>
                                );
                              })()}
                            </div>
                            <span className="font-medium text-foreground shrink-0">{line.qty}x</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
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
                      {canWrite && canEditOrder(order) && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusUpdate(order.id, "ready_to_send");
                          }}
                          disabled={updateOrderStatusMutation.isPending}
                          data-testid={`mark-ready-order-${order.id}`}
                        >
                          {t('orders.markReady')}
                        </Button>
                      )}
                    </div>
                  </div>
                  </DraggableOrderCard>
                ))
              )}
            </div>
          </DroppableColumn>

          {/* Ready to Send Column */}
          <DroppableColumn id="ready_to_send">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t('orders.readyToSend')}</h3>
              <div className="flex items-center gap-2">
                {selectedOrdersForMerge.size >= 2 && ordersByStatus.ready_to_send.some(o => selectedOrdersForMerge.has(o.id)) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMergeOrders}
                    disabled={mergeOrdersMutation.isPending}
                    className="h-6 text-xs"
                    data-testid="merge-ready-orders-button"
                  >
                    <Merge className="w-3 h-3 mr-1" />
                    {t('orders.merge')} ({selectedOrdersForMerge.size})
                  </Button>
                )}
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-semibold">
                  {ordersByStatus.ready_to_send.length}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {ordersByStatus.ready_to_send.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t('orders.noReadyToSendOrders')}
                </div>
              ) : (
                ordersByStatus.ready_to_send.map((order) => (
                  <DraggableOrderCard key={order.id} orderId={order.id} disabled={!canWrite || !canEditOrder(order)}>
                  <div 
                    className={`kanban-card cursor-pointer ${selectedOrdersForMerge.has(order.id) ? 'ring-2 ring-primary' : ''} ${!canEditOrder(order) ? 'opacity-60 border-muted' : ''}`}
                    onClick={() => handleEditOrder(order)}
                    data-testid={`ready-to-send-order-${order.id}`}
                  >
                    <div className="flex flex-col gap-1 mb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={selectedOrdersForMerge.has(order.id)}
                            onClick={(e) => toggleOrderSelectionForMerge(order.id, e)}
                            data-testid={`select-ready-order-${order.id}`}
                            className="shrink-0"
                          />
                          <h4 className="font-semibold text-foreground whitespace-nowrap">PO-{order.id.slice(-4)}</h4>
                          {order.highPriority && (
                            <Flame className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          {canEditOrder(order) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`p-1 h-auto shrink-0 ${order.highPriority ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleHighPriorityMutation.mutate({ orderId: order.id, highPriority: !order.highPriority });
                              }}
                              title={order.highPriority ? 'Remove high priority' : 'Mark as high priority'}
                              data-testid={`toggle-priority-ready-${order.id}`}
                            >
                              <Flame className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {logisticMode && (
                          <Badge variant="outline" className="text-xs shrink-0 truncate max-w-[120px]">
                            <i className="fas fa-building mr-1"></i>
                            {getUnitName(order.unitId) || 'Unknown'}
                          </Badge>
                        )}
                      </div>
                      {!logisticMode && (
                        <p className="text-xs text-muted-foreground truncate pl-6">
                          <i className="fas fa-map-marker-alt mr-1"></i>
                          {getOrderLocation(order)}
                          {!canEditOrder(order) && <span className="ml-1 text-warning">(Other)</span>}
                        </p>
                      )}
                    </div>
                    <button 
                      className="flex items-center gap-1 text-sm text-muted-foreground mb-2 hover:text-foreground transition-colors"
                      onClick={(e) => toggleOrderExpanded(order.id, e)}
                      data-testid={`expand-ready-order-${order.id}`}
                    >
                      {expandedOrders.has(order.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {t('orders.itemsCount', { count: order.orderLines.length })}
                    </button>
                    
                    {expandedOrders.has(order.id) && order.orderLines.length > 0 && (
                      <div className="mb-3 space-y-1 text-xs border-t border-border pt-2">
                        {order.orderLines.map(line => (
                          <div key={line.id} className="flex justify-between text-muted-foreground">
                            <div className="flex-1 mr-2 min-w-0">
                              <span className="truncate block">{line.item?.name || 'Unknown Item'}</span>
                              {(() => {
                                const supplierInfo = getItemSupplierInfo(line, order.vendor?.name);
                                return supplierInfo && (
                                  <span className="text-[10px] text-muted-foreground/70 block truncate">
                                    {supplierInfo}
                                  </span>
                                );
                              })()}
                            </div>
                            <span className="font-medium text-foreground shrink-0">{line.qty}x</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOrderPDF(order);
                        }}
                        data-testid={`pdf-ready-order-${order.id}`}
                      >
                        <i className="fas fa-file-pdf"></i>
                      </Button>
                      {canWrite && canEditOrder(order) && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusUpdate(order.id, "sent");
                          }}
                          disabled={updateOrderStatusMutation.isPending}
                          data-testid={`send-order-${order.id}`}
                        >
                          {t('orders.sendOrder')}
                        </Button>
                      )}
                    </div>
                  </div>
                  </DraggableOrderCard>
                ))
              )}
            </div>
          </DroppableColumn>

          {/* Sent Column */}
          <DroppableColumn id="sent">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t('orders.sent')}</h3>
              <div className="flex items-center gap-2">
                {selectedOrdersForMerge.size >= 2 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMergeOrders}
                    disabled={mergeOrdersMutation.isPending}
                    className="h-6 text-xs"
                    data-testid="merge-orders-button"
                  >
                    <Merge className="w-3 h-3 mr-1" />
                    {t('orders.merge')} ({selectedOrdersForMerge.size})
                  </Button>
                )}
                <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs flex items-center justify-center font-semibold">
                  {ordersByStatus.sent.length}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {ordersByStatus.sent.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {t('orders.noSentOrders')}
                </div>
              ) : (
                ordersByStatus.sent.map((order) => (
                  <DraggableOrderCard key={order.id} orderId={order.id} disabled={!canWrite || !canEditOrder(order)}>
                  <div 
                    className={`kanban-card cursor-pointer ${selectedOrdersForMerge.has(order.id) ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => handleEditOrder(order)}
                    data-testid={`sent-order-${order.id}`}
                  >
                    <div className="flex flex-col gap-1 mb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={selectedOrdersForMerge.has(order.id)}
                            onClick={(e) => toggleOrderSelectionForMerge(order.id, e)}
                            data-testid={`select-order-${order.id}`}
                            className="shrink-0"
                          />
                          <h4 className="font-semibold text-foreground whitespace-nowrap">PO-{order.id.slice(-4)}</h4>
                          {order.highPriority && (
                            <Flame className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          {canEditOrder(order) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`p-1 h-auto shrink-0 ${order.highPriority ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleHighPriorityMutation.mutate({ orderId: order.id, highPriority: !order.highPriority });
                              }}
                              title={order.highPriority ? 'Remove high priority' : 'Mark as high priority'}
                              data-testid={`toggle-priority-sent-${order.id}`}
                            >
                              <Flame className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {logisticMode && (
                          <Badge variant="outline" className="text-xs shrink-0 truncate max-w-[120px]">
                            <i className="fas fa-building mr-1"></i>
                            {getUnitName(order.unitId) || 'Unknown'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button 
                      className="flex items-center gap-1 text-sm text-muted-foreground mb-1 hover:text-foreground transition-colors"
                      onClick={(e) => toggleOrderExpanded(order.id, e)}
                      data-testid={`expand-sent-order-${order.id}`}
                    >
                      {expandedOrders.has(order.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {t('orders.itemsCount', { count: order.orderLines.length })}
                    </button>
                    
                    {expandedOrders.has(order.id) && order.orderLines.length > 0 && (
                      <div className="mb-2 space-y-1 text-xs border-t border-border pt-2">
                        {order.orderLines.map(line => (
                          <div key={line.id} className="flex justify-between text-muted-foreground">
                            <div className="flex-1 mr-2 min-w-0">
                              <span className="truncate block">{line.item?.name || 'Unknown Item'}</span>
                              {(() => {
                                const supplierInfo = getItemSupplierInfo(line, order.vendor?.name);
                                return supplierInfo && (
                                  <span className="text-[10px] text-muted-foreground/70 block truncate">
                                    {supplierInfo}
                                  </span>
                                );
                              })()}
                            </div>
                            <span className="font-medium text-foreground shrink-0">{line.qty}x</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground mb-3">
                      Sent {formatDate((order.updatedAt || order.createdAt) as any)}
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
                  </DraggableOrderCard>
                ))
              )}
            </div>
          </DroppableColumn>

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
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground">PO-{order.id.slice(-4)}</h4>
                          {logisticMode && (
                            <Badge variant="outline" className="text-xs">
                              <i className="fas fa-building mr-1"></i>
                              {getUnitName(order.unitId) || 'Unknown Unit'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className={`status-chip ${getStatusChip(order.status)} text-xs`}>
                        {t('orders.received')}
                      </span>
                    </div>
                    <button 
                      className="flex items-center gap-1 text-sm text-muted-foreground mb-1 hover:text-foreground transition-colors"
                      onClick={(e) => toggleOrderExpanded(order.id, e)}
                      data-testid={`expand-received-order-${order.id}`}
                    >
                      {expandedOrders.has(order.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {t('orders.itemsCount', { count: order.orderLines.length })}
                    </button>
                    
                    {expandedOrders.has(order.id) && order.orderLines.length > 0 && (
                      <div className="mb-2 space-y-1 text-xs border-t border-border pt-2">
                        {order.orderLines.map(line => (
                          <div key={line.id} className="flex justify-between text-muted-foreground">
                            <div className="flex-1 mr-2 min-w-0">
                              <span className="truncate block">{line.item?.name || 'Unknown Item'}</span>
                              {(() => {
                                const supplierInfo = getItemSupplierInfo(line, order.vendor?.name);
                                return supplierInfo && (
                                  <span className="text-[10px] text-muted-foreground/70 block truncate">
                                    {supplierInfo}
                                  </span>
                                );
                              })()}
                            </div>
                            <span className="font-medium text-foreground shrink-0">{line.qty}x</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
                      {(order as any).sentAt && (
                        <p>Sent {formatDate((order as any).sentAt)}</p>
                      )}
                      <p>Received {formatDate((order.updatedAt || order.createdAt) as any)}</p>
                    </div>
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
        </DndContext>
      )}

      {/* New Order Dialog */}
      <Dialog open={newOrderDialogOpen} onOpenChange={setNewOrderDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t('orders.createNewOrder')}</DialogTitle>
            <DialogDescription>{t('orders.createDraftOrderDesc')}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            <h3 className="font-semibold mb-2">{t('orders.itemsToOrder', { count: itemsNeedingOrder.length })}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t('orders.itemsBelowMaxThreshold')}
            </p>
            
            <div className="space-y-2">
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

          <div className="flex justify-end gap-2 pt-4 border-t border-border flex-shrink-0">
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
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={editOrderDialogOpen} onOpenChange={(open) => {
        setEditOrderDialogOpen(open);
        if (!open) {
          setSplitMode(false);
          setSelectedLinesForSplit(new Set());
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t('orders.editOrderTitle', { number: selectedOrder?.id.slice(-4) })}</DialogTitle>
            <DialogDescription>{t('orders.editOrderDesc')}</DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t('orders.unit')}</p>
                  <p className="font-medium text-foreground">
                    <i className="fas fa-map-marker-alt mr-1"></i>
                    {getOrderLocation(selectedOrder)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('orders.status')}</p>
                  <span className={`status-chip ${getStatusChip(selectedOrder.status)} text-xs`}>
                    {t(`orders.${getStatusTranslationKey(selectedOrder.status)}`)}
                  </span>
                </div>
              </div>

              <Tabs value={orderDialogTab} onValueChange={(v) => setOrderDialogTab(v as "details" | "attachments")} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="details" data-testid="tab-order-details">
                    <i className="fas fa-list mr-2"></i>
                    {t('orders.orderItems', { count: selectedOrder.orderLines.length })}
                  </TabsTrigger>
                  <TabsTrigger value="attachments" data-testid="tab-order-attachments">
                    <Paperclip className="h-4 w-4 mr-2" />
                    {t('orders.attachments')} ({orderAttachments.length})
                  </TabsTrigger>
                </TabsList>

                {/* Details Tab */}
                <TabsContent value="details" className="flex-1 overflow-y-auto space-y-4 mt-0">
                  {/* Order Notes */}
                  {canWrite && (selectedOrder.status === 'draft' || selectedOrder.status === 'ready_to_send' || selectedOrder.status === 'sent') && canEditOrder(selectedOrder) && (
                    <div className="p-3 bg-muted/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-foreground">
                          <i className="fas fa-sticky-note mr-1"></i>
                          Order Notes
                        </label>
                        {!editingOrderNotes && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingOrderNotes(true);
                              setOrderNotes(selectedOrder.notes || "");
                            }}
                            data-testid="edit-order-notes"
                          >
                            <i className="fas fa-edit"></i>
                          </Button>
                        )}
                      </div>
                      {editingOrderNotes ? (
                        <div className="space-y-2">
                          <textarea
                            value={orderNotes}
                            onChange={(e) => setOrderNotes(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded bg-background text-foreground"
                            rows={3}
                            placeholder="Add notes for this order..."
                            data-testid="order-notes-input"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                updateOrderNotesMutation.mutate({
                                  orderId: selectedOrder.id,
                                  notes: orderNotes,
                                });
                              }}
                              disabled={updateOrderNotesMutation.isPending}
                              data-testid="save-order-notes"
                            >
                              <i className="fas fa-check mr-1"></i>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingOrderNotes(false);
                                setOrderNotes("");
                              }}
                              data-testid="cancel-order-notes"
                            >
                              <i className="fas fa-times mr-1"></i>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p 
                          className="text-sm text-muted-foreground whitespace-pre-wrap cursor-pointer hover:bg-muted/30 rounded p-1 -m-1 transition-colors"
                          onClick={() => {
                            setEditingOrderNotes(true);
                            setOrderNotes(selectedOrder.notes || "");
                          }}
                          data-testid="order-notes-text"
                        >
                          {selectedOrder.notes || t('orders.noNotes')}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{t('orders.orderItems', { count: selectedOrder.orderLines.length })}</h3>
                  {canWrite && canEditOrder(selectedOrder) && selectedOrder.status !== 'received' && selectedOrder.orderLines.length > 1 && (
                    <div className="flex items-center gap-2">
                      {splitMode ? (
                        <>
                          {selectedLinesForSplit.size > 0 && selectedLinesForSplit.size < selectedOrder.orderLines.length && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={handleSplitOrder}
                              disabled={splitOrderMutation.isPending}
                              data-testid="split-order-button"
                            >
                              <i className="fas fa-scissors mr-1"></i>
                              {t('orders.splitSelected')} ({selectedLinesForSplit.size})
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSplitMode(false);
                              setSelectedLinesForSplit(new Set());
                            }}
                            data-testid="cancel-split-mode"
                          >
                            {t('common.cancel')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSplitMode(true)}
                          data-testid="enter-split-mode"
                        >
                          <i className="fas fa-scissors mr-1"></i>
                          {t('orders.split')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {selectedOrder.orderLines.map(line => {
                    const stockStatus = getStockStatus(line.item);
                    const currentQty = line.item.stockLevel?.qtyOnHand ?? 0;
                    const normalizedUnit = normalizeUnit(line.item.unit);
                    
                    const displayQty = line.qty;
                    const displayUnit = line.item.unit;
                    
                    const canToggleOffline = canWrite && (selectedOrder.status === 'draft' || selectedOrder.status === 'ready_to_send' || selectedOrder.status === 'sent') && canEditOrder(selectedOrder) && !line.received;
                    
                    const canSplit = canWrite && canEditOrder(selectedOrder) && selectedOrder.status !== 'received' && selectedOrder.orderLines.length > 1;
                    
                    return (
                    <div key={line.id} className={`flex flex-col gap-2 p-3 border border-border rounded-lg transition-colors ${selectedLinesForSplit.has(line.id) ? 'ring-2 ring-primary bg-primary/5' : ''} ${canToggleOffline ? (line.offlineWorked ? 'bg-green-50 dark:bg-green-950/20' : '') : ''}`} data-testid={`order-line-${line.id}`}>
                      <div className="flex items-center gap-3">
                        {/* Split checkbox - only show when in split mode */}
                        {splitMode && canSplit && (
                          <Checkbox
                            checked={selectedLinesForSplit.has(line.id)}
                            onCheckedChange={() => toggleLineForSplit(line.id)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`split-line-${line.id}`}
                            className="mt-1"
                            title={t('orders.split')}
                          />
                        )}
                        <div 
                          className={`flex-1 flex items-center gap-3 ${canToggleOffline ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (canToggleOffline) {
                              toggleOfflineWorkedMutation.mutate({
                                lineId: line.id,
                                offlineWorked: !line.offlineWorked,
                              });
                            }
                          }}
                        >
                          {canToggleOffline && (
                            <Checkbox
                              checked={line.offlineWorked || false}
                              onCheckedChange={(checked) => {
                                toggleOfflineWorkedMutation.mutate({
                                  lineId: line.id,
                                  offlineWorked: checked === true,
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`offline-worked-${line.id}`}
                              className="mt-1"
                              title="Mark as offline worked"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-foreground">{line.item.name}</p>
                            {(() => {
                              const supplierInfo = getItemSupplierInfo(line, selectedOrder.vendor?.name);
                              return supplierInfo && (
                                <p className="text-xs text-muted-foreground/70 truncate">
                                  {supplierInfo}
                                </p>
                              );
                            })()}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`text-base font-semibold ${stockStatus.color}`}>
                                {currentQty}
                              </span>
                              <i className={`fas ${normalizedUnit === "Pack" ? "fa-box" : "fa-vial"} text-sm ${stockStatus.color}`}></i>
                              <span className="text-xs text-muted-foreground">
                                / {t('orders.min')}: {line.item.minThreshold ?? 0} / {t('orders.max')}: {line.item.maxThreshold ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      <div className="flex items-center gap-2">
                        {line.received ? (
                          <div className="flex items-center gap-2 text-success">
                            <Check className="h-5 w-5" />
                            <div className="text-right">
                              <p className="text-sm font-medium">Received</p>
                              {line.receivedAt && (
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(line.receivedAt as any)}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : editingLineId === line.id ? (
                          <>
                            <div className="text-right">
                              <input
                                type="number"
                                min="1"
                                value={editQty}
                                onChange={(e) => setEditQty(Number(e.target.value))}
                                onFocus={handleNumberInputFocus}
                                autoFocus
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
                            {canWrite && selectedOrder.status === 'sent' && canEditOrder(selectedOrder) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingLineId(line.id);
                                    setEditQty(line.qty);
                                  }}
                                  data-testid={`edit-qty-${line.id}`}
                                  title="Edit quantity"
                                >
                                  <i className="fas fa-edit"></i>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => {
                                    if (line.item.controlled) {
                                      handleReceiveLine(line);
                                    } else {
                                      receiveLineMutation.mutate({
                                        lineId: line.id,
                                      });
                                    }
                                  }}
                                  disabled={receiveLineMutation.isPending}
                                  data-testid={`receive-line-${line.id}`}
                                  title={line.item.controlled ? "Receive (requires signature)" : "Receive item"}
                                >
                                  <i className="fas fa-check"></i>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRemoveItem(line.id)}
                                  disabled={removeOrderLineMutation.isPending}
                                  data-testid={`remove-item-${line.id}`}
                                  title="Remove item"
                                >
                                  <i className="fas fa-trash"></i>
                                </Button>
                              </>
                            )}
                            {canWrite && selectedOrder.status === 'draft' && canEditOrder(selectedOrder) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingLineId(line.id);
                                    setEditQty(line.qty);
                                  }}
                                  data-testid={`edit-qty-${line.id}`}
                                  title="Edit quantity"
                                >
                                  <i className="fas fa-edit"></i>
                                </Button>
                                {isMainDraftOrder(selectedOrder) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => moveToSecondaryMutation.mutate(line.id)}
                                    disabled={moveToSecondaryMutation.isPending}
                                    data-testid={`move-to-secondary-${line.id}`}
                                    title="Move to secondary order"
                                    className="bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 border-blue-300 dark:border-blue-700"
                                  >
                                    <i className="fas fa-arrow-right text-blue-600 dark:text-blue-400"></i>
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRemoveItem(line.id)}
                                  disabled={removeOrderLineMutation.isPending}
                                  data-testid={`remove-item-${line.id}`}
                                  title="Remove item"
                                >
                                  <i className="fas fa-trash"></i>
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                      </div>

                      {/* Line Item Notes */}
                      {canWrite && (selectedOrder.status === 'draft' || selectedOrder.status === 'ready_to_send' || selectedOrder.status === 'sent') && canEditOrder(selectedOrder) && !line.received && (
                        <div className="pt-2 border-t border-border/50">
                          {editingLineNotes === line.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={lineNotes}
                                onChange={(e) => setLineNotes(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground"
                                rows={2}
                                placeholder="Add notes for this item..."
                                data-testid={`line-notes-input-${line.id}`}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updateLineNotesMutation.mutate({
                                      lineId: line.id,
                                      notes: lineNotes,
                                    });
                                  }}
                                  disabled={updateLineNotesMutation.isPending}
                                  data-testid={`save-line-notes-${line.id}`}
                                >
                                  <i className="fas fa-check mr-1"></i>
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingLineNotes(null);
                                    setLineNotes("");
                                  }}
                                  data-testid={`cancel-line-notes-${line.id}`}
                                >
                                  <i className="fas fa-times mr-1"></i>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="flex items-start justify-between cursor-pointer hover:bg-muted/30 rounded p-1 -m-1 transition-colors"
                              onClick={() => {
                                setEditingLineNotes(line.id);
                                setLineNotes(line.notes || "");
                              }}
                              data-testid={`line-notes-text-${line.id}`}
                            >
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground">
                                  <i className="fas fa-sticky-note mr-1"></i>
                                  {line.notes ? <span className="text-foreground">{line.notes}</span> : t('orders.noNotes')}
                                </p>
                              </div>
                              <i className="fas fa-edit text-xs text-muted-foreground ml-2"></i>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
                  </div>
                </TabsContent>

                {/* Attachments Tab */}
                <TabsContent value="attachments" className="flex-1 overflow-y-auto mt-0">
                  <div className="space-y-4">
                    {canWrite && canEditOrder(selectedOrder) && (
                      <div className="flex gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={handleFileInputChange}
                          data-testid="attachment-file-input"
                        />
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingAttachment}
                          data-testid="upload-attachment-button"
                        >
                          {uploadingAttachment ? (
                            <i className="fas fa-spinner fa-spin mr-2"></i>
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          {t('orders.uploadFile')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.capture = 'environment';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) handleAttachmentUpload(file);
                            };
                            input.click();
                          }}
                          disabled={uploadingAttachment}
                          data-testid="camera-attachment-button"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          {t('orders.takePhoto')}
                        </Button>
                      </div>
                    )}
                    
                    {orderAttachments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Paperclip className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>{t('orders.noAttachments')}</p>
                        <p className="text-sm mt-1">Upload delivery receipts or other documents</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {orderAttachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border"
                            data-testid={`attachment-${attachment.id}`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {attachment.contentType?.startsWith('image/') ? (
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded flex items-center justify-center">
                                  <i className="fas fa-image text-blue-500"></i>
                                </div>
                              ) : (
                                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
                                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{attachment.filename}</p>
                                <p className="text-xs text-muted-foreground">
                                  {attachment.createdAt ? formatDate(attachment.createdAt as any) : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadAttachment(attachment.id)}
                                data-testid={`download-attachment-${attachment.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {canWrite && canEditOrder(selectedOrder) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                                  disabled={deleteAttachmentMutation.isPending}
                                  data-testid={`delete-attachment-${attachment.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-between gap-2 pt-4 border-t border-border">
                {canWrite && canEditOrder(selectedOrder) && (
                  <Button
                    variant="destructive"
                    onClick={handleDeleteOrder}
                    disabled={deleteOrderMutation.isPending}
                    data-testid="delete-order-button"
                  >
                    {deleteOrderMutation.isPending ? t('orders.deleting') : t('common.delete')}
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditOrderDialogOpen(false)}
                    data-testid="close-edit-dialog"
                  >
                    {t('common.close')}
                  </Button>
                  {canWrite && selectedOrder.status === 'draft' && canEditOrder(selectedOrder) && (
                    <Button
                      onClick={() => {
                        handleStatusUpdate(selectedOrder.id, "ready_to_send");
                        setEditOrderDialogOpen(false);
                      }}
                      data-testid="mark-ready-from-edit"
                    >
                      <i className="fas fa-check mr-2"></i>
                      {t('orders.markReady')}
                    </Button>
                  )}
                  {canWrite && selectedOrder.status === 'ready_to_send' && canEditOrder(selectedOrder) && (
                    <Button
                      onClick={() => {
                        handleStatusUpdate(selectedOrder.id, "sent");
                        setEditOrderDialogOpen(false);
                      }}
                      data-testid="send-from-edit"
                    >
                      <i className="fas fa-paper-plane mr-2"></i>
                      {t('orders.sendOrder')}
                    </Button>
                  )}
                  {!canEditOrder(selectedOrder) && (
                    <p className="text-xs text-warning">
                      <i className="fas fa-info-circle mr-1"></i>
                      This order is from another unit and cannot be edited
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receive Item</DialogTitle>
            <DialogDescription>
              Mark this item as received and update stock levels.
            </DialogDescription>
          </DialogHeader>

          {selectedLineToReceive && (
            <div className="space-y-4">
              {selectedLineToReceive.item.controlled && (
                <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <i className="fas fa-exclamation-triangle text-orange-600 dark:text-orange-500 mt-0.5"></i>
                    <div>
                      <p className="font-semibold text-orange-900 dark:text-orange-100 text-sm">
                        Controlled Substance
                      </p>
                      <p className="text-orange-700 dark:text-orange-300 text-xs mt-1">
                        Signature and notes are required for receiving controlled substances.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-muted/30 rounded-lg p-3">
                <p className="font-medium text-foreground">{selectedLineToReceive.item.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Quantity: {selectedLineToReceive.qty} {selectedLineToReceive.item.unit}
                </p>
              </div>

              <div>
                <Label htmlFor="receive-notes" data-testid="label-receive-notes">
                  Notes {selectedLineToReceive.item.controlled && <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  id="receive-notes"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Add notes about this receipt..."
                  className="mt-1"
                  data-testid="input-receive-notes"
                />
              </div>

              {selectedLineToReceive.item.controlled && (
                <div>
                  <Label data-testid="label-receive-signature">
                    Signature <span className="text-destructive">*</span>
                  </Label>
                  {receiveSignature ? (
                    <div className="mt-1">
                      <img 
                        src={receiveSignature} 
                        alt="Signature" 
                        className="border border-border rounded-lg w-full h-24 object-contain bg-white"
                        data-testid="signature-preview"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReceiveSignature("")}
                        className="mt-2"
                        data-testid="button-clear-signature"
                      >
                        <i className="fas fa-times mr-1"></i>
                        Clear Signature
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setShowReceiveSignaturePad(true)}
                      className="mt-1 w-full"
                      data-testid="button-add-signature"
                    >
                      <i className="fas fa-signature mr-2"></i>
                      Add Signature
                    </Button>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReceiveDialog(false);
                    resetReceiveForm();
                  }}
                  data-testid="button-cancel-receive"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitReceive}
                  disabled={receiveLineMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-receive"
                >
                  {receiveLineMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Receiving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check mr-2"></i>
                      Confirm Receipt
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Signature Pad for Receiving */}
      <SignaturePad
        isOpen={showReceiveSignaturePad}
        onClose={() => setShowReceiveSignaturePad(false)}
        onSave={(signature) => {
          setReceiveSignature(signature);
          setShowReceiveSignaturePad(false);
        }}
        title="Sign to Confirm Receipt"
      />

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
