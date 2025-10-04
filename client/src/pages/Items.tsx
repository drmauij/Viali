import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Item, StockLevel, InsertItem, Vendor } from "@shared/schema";

type FilterType = "all" | "critical" | "controlled" | "expiring" | "belowMin";

interface ItemWithStock extends Item {
  stockLevel?: StockLevel;
  soonestExpiry?: Date;
}

type UnitType = "pack" | "single item";

export default function Items() {
  const { user } = useAuth();
  const [activeHospital] = useState(() => (user as any)?.hospitals?.[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState("name");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemWithStock | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("pack");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    minThreshold: "0",
    maxThreshold: "0",
    defaultOrderQty: "0",
    packSize: "1",
    actualStock: "0",
    critical: false,
    controlled: false,
  });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    minThreshold: "5",
    maxThreshold: "10",
    defaultOrderQty: "0",
    packSize: "1",
    initialStock: "0",
    critical: false,
    controlled: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const packSizeInputRef = useRef<HTMLInputElement>(null);
  const editPackSizeInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<ItemWithStock[]>({
    queryKey: ["/api/items", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/items`, {
        ...data,
        hospitalId: activeHospital?.id,
        locationId: activeHospital?.locationId,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      resetForm();
      setAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Item created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create item",
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (data: any) => {
      // Update item details
      const response = await apiRequest("PATCH", `/api/items/${selectedItem?.id}`, data.itemData);
      const updatedItem = await response.json();
      
      // Update stock level if provided
      if (data.actualStock !== undefined && selectedItem) {
        const currentStock = selectedItem.stockLevel?.qtyOnHand || 0;
        const newStock = parseInt(data.actualStock);
        const delta = newStock - currentStock;
        
        await apiRequest("POST", "/api/stock/update", {
          itemId: selectedItem.id,
          qty: newStock,
          delta: delta,
          notes: "Stock updated via item edit",
        });
      }
      
      return updatedItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
      setEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Item updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update item",
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("DELETE", `/api/items/${itemId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
      setEditDialogOpen(false);
      toast({
        title: "Item Deleted",
        description: "Item has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete item",
        variant: "destructive",
      });
    },
  });

  const normalizeUnit = (unit: string): UnitType => {
    const normalized = unit.toLowerCase();
    if (normalized === "pack" || normalized === "box") {
      return "pack";
    }
    return "single item";
  };

  // Auto-focus pack size field in Add Item dialog when it becomes visible
  useEffect(() => {
    if (selectedUnit === "single item" && formData.controlled && addDialogOpen) {
      setTimeout(() => {
        packSizeInputRef.current?.focus();
      }, 100);
    }
  }, [selectedUnit, formData.controlled, addDialogOpen]);

  // Auto-focus pack size field in Edit Item dialog when it becomes visible
  useEffect(() => {
    if (selectedUnit === "single item" && editFormData.controlled && editDialogOpen) {
      setTimeout(() => {
        editPackSizeInputRef.current?.focus();
      }, 100);
    }
  }, [selectedUnit, editFormData.controlled, editDialogOpen]);

  const handleEditItem = (item: ItemWithStock) => {
    setSelectedItem(item);
    setEditFormData({
      name: item.name,
      description: item.description || "",
      barcode: item.barcodes?.[0] || "",
      minThreshold: String(item.minThreshold || 0),
      maxThreshold: String(item.maxThreshold || 0),
      defaultOrderQty: String(item.defaultOrderQty || 0),
      packSize: String(item.packSize || 1),
      actualStock: String(item.stockLevel?.qtyOnHand || 0),
      critical: item.critical || false,
      controlled: item.controlled || false,
    });
    setSelectedUnit(normalizeUnit(item.unit));
    setEditDialogOpen(true);
  };

  const quickOrderMutation = useMutation({
    mutationFn: async (data: { itemId: string; qty: number; packSize: number; vendorId: string }) => {
      const response = await apiRequest("POST", "/api/orders/quick-add", {
        hospitalId: activeHospital?.id,
        itemId: data.itemId,
        qty: data.qty,
        packSize: data.packSize,
        vendorId: data.vendorId,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Added to Order",
        description: "Item has been added to draft order",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add item to order",
        variant: "destructive",
      });
    },
  });

  const handleQuickOrder = (e: React.MouseEvent, item: ItemWithStock) => {
    e.stopPropagation();
    
    if (vendors.length === 0) {
      toast({
        title: "No Vendor",
        description: "Please add a vendor first before creating orders",
        variant: "destructive",
      });
      return;
    }

    const defaultVendor = item.vendorId ? vendors.find(v => v.id === item.vendorId) : vendors[0];
    if (!defaultVendor) {
      toast({
        title: "No Vendor",
        description: "No vendor available for this item",
        variant: "destructive",
      });
      return;
    }

    const currentStock = item.stockLevel?.qtyOnHand || 0;
    const maxThreshold = item.maxThreshold || 10;
    const qtyToOrder = Math.max(0, maxThreshold - currentStock);

    if (qtyToOrder <= 0) {
      toast({
        title: "Stock Sufficient",
        description: "Item stock is already at or above max threshold",
      });
      return;
    }

    const packSize = item.packSize || 1;
    const normalizedUnit = normalizeUnit(item.unit);
    const isControlledSingleItem = item.controlled && normalizedUnit === "single item";
    const qty = isControlledSingleItem ? Math.ceil(qtyToOrder / packSize) : qtyToOrder;

    quickOrderMutation.mutate({
      itemId: item.id,
      qty,
      packSize,
      vendorId: defaultVendor.id,
    });
  };

  const handleUpdateItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const itemData = {
      name: editFormData.name,
      description: editFormData.description,
      unit: selectedUnit,
      barcodes: editFormData.barcode ? [editFormData.barcode] : undefined,
      minThreshold: parseInt(editFormData.minThreshold) || 0,
      maxThreshold: parseInt(editFormData.maxThreshold) || 0,
      defaultOrderQty: parseInt(editFormData.defaultOrderQty) || 0,
      packSize: (selectedUnit === "single item" && editFormData.controlled) ? parseInt(editFormData.packSize) || 1 : 1,
      critical: editFormData.critical,
      controlled: editFormData.controlled,
    };

    updateItemMutation.mutate({
      itemData,
      actualStock: editFormData.actualStock,
    });
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Resize if image is too large (max 800px on longest side for better compression)
          const maxSize = 800;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.7 quality for better size reduction
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          resolve(compressedBase64);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    const allResults: any[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Compress image before sending
        const compressedImage = await compressImage(file);
        setUploadedImages(prev => [...prev, compressedImage]);
        
        // Analyze image with AI
        try {
          const response = await apiRequest('POST', '/api/items/analyze-image', {
            image: compressedImage
          });
          const result: any = await response.json();
          allResults.push(result);
          
          // Update form with the first valid result
          if (i === 0 || !formData.name) {
            // Build name by appending concentration and size if available
            let itemName = result.name || '';
            if (result.concentration) {
              itemName += ` ${result.concentration}`;
            }
            if (result.size) {
              itemName += ` ${result.size}`;
            }
            
            setFormData(prev => ({
              ...prev,
              name: itemName.trim() || prev.name,
              description: result.description || prev.description,
              barcode: result.barcode || prev.barcode,
            }));
            
            if (result.unit) {
              setSelectedUnit(result.unit as UnitType);
            }
          }
        } catch (error: any) {
          console.error(`Failed to analyze image ${i + 1}:`, error);
        }
      }
      
      if (allResults.length > 0) {
        const avgConfidence = allResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / allResults.length;
        toast({
          title: "Images analyzed",
          description: `Processed ${allResults.length} image(s) with ${Math.round(avgConfidence * 100)}% avg confidence`,
        });
      } else {
        toast({
          title: "Analysis failed",
          description: "Could not extract data from images",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process images",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleAddItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const itemData = {
      name: formData.name,
      description: formData.description,
      unit: selectedUnit,
      barcodes: formData.barcode ? [formData.barcode] : undefined,
      minThreshold: parseInt(formData.minThreshold) || 0,
      maxThreshold: parseInt(formData.maxThreshold) || 0,
      defaultOrderQty: parseInt(formData.defaultOrderQty) || 0,
      packSize: (selectedUnit === "single item" && formData.controlled) ? parseInt(formData.packSize) || 1 : 1,
      critical: formData.critical,
      controlled: formData.controlled,
      initialStock: parseInt(formData.initialStock) || 0,
    };

    createItemMutation.mutate(itemData);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      barcode: "",
      minThreshold: "5",
      maxThreshold: "10",
      defaultOrderQty: "0",
      packSize: "1",
      initialStock: "0",
      critical: false,
      controlled: false,
    });
    setSelectedUnit("pack");
    setUploadedImages([]);
  };

  const filteredItems = useMemo(() => {
    let filtered = items;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter
    if (activeFilter !== "all") {
      filtered = filtered.filter(item => {
        switch (activeFilter) {
          case "critical":
            return item.critical;
          case "controlled":
            return item.controlled;
          case "expiring":
            if (!item.soonestExpiry) return false;
            const daysUntilExpiry = Math.ceil((new Date(item.soonestExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
          case "belowMin":
            return (item.stockLevel?.qtyOnHand || 0) <= (item.minThreshold || 0);
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "expiry":
          const aExpiry = a.soonestExpiry ? new Date(a.soonestExpiry).getTime() : Infinity;
          const bExpiry = b.soonestExpiry ? new Date(b.soonestExpiry).getTime() : Infinity;
          return aExpiry - bExpiry;
        case "usage":
          // Mock usage rate - would come from analytics
          return Math.random() - 0.5;
        case "stock":
          const aStock = a.stockLevel?.qtyOnHand || 0;
          const bStock = b.stockLevel?.qtyOnHand || 0;
          return aStock - bStock;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [items, searchTerm, activeFilter, sortBy]);

  const getFilterCounts = () => {
    return {
      all: items.length,
      critical: items.filter(item => item.critical).length,
      controlled: items.filter(item => item.controlled).length,
      expiring: items.filter(item => {
        if (!item.soonestExpiry) return false;
        const daysUntilExpiry = Math.ceil((new Date(item.soonestExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
      }).length,
      belowMin: items.filter(item => (item.stockLevel?.qtyOnHand || 0) <= (item.minThreshold || 0)).length,
    };
  };

  const filterCounts = getFilterCounts();

  const getDaysUntilExpiry = (expiryDate?: Date) => {
    if (!expiryDate) return null;
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryColor = (days: number | null) => {
    if (!days || days < 0) return "expiry-red";
    if (days <= 30) return "expiry-red";
    if (days <= 60) return "expiry-orange";
    if (days <= 90) return "expiry-yellow";
    return "expiry-green";
  };

  const getStockStatus = (item: ItemWithStock) => {
    const currentQty = item.stockLevel?.qtyOnHand || 0;
    const minThreshold = item.minThreshold || 0;
    
    if (currentQty <= minThreshold) {
      return { color: "text-warning", status: "Below Min" };
    }
    return { color: "text-success", status: "Good" };
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Hospital Selected</h3>
          <p className="text-muted-foreground">Please select a hospital to view items.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Items</h1>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} data-testid="add-item-button">
          <i className="fas fa-plus mr-2"></i>
          Add Item
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"></i>
        <Input
          placeholder="Search items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="items-search"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "all" ? "chip-primary" : "chip-muted"}`}
          onClick={() => setActiveFilter("all")}
          data-testid="filter-all"
        >
          All Items ({filterCounts.all})
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "belowMin" ? "chip-warning" : "chip-muted"}`}
          onClick={() => setActiveFilter("belowMin")}
          data-testid="filter-below-min"
        >
          <i className="fas fa-arrow-down text-xs mr-1"></i>
          Below Min ({filterCounts.belowMin})
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "critical" ? "chip-critical" : "chip-muted"}`}
          onClick={() => setActiveFilter("critical")}
          data-testid="filter-critical"
        >
          <i className="fas fa-exclamation-circle text-xs mr-1"></i>
          Critical ({filterCounts.critical})
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "controlled" ? "chip-controlled" : "chip-muted"}`}
          onClick={() => setActiveFilter("controlled")}
          data-testid="filter-controlled"
        >
          <i className="fas fa-shield-halved text-xs mr-1"></i>
          Controlled ({filterCounts.controlled})
        </button>
      </div>

      {/* Sort Options */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{filteredItems.length} items</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="items-sort"
        >
          <option value="name">Sort: Name A-Z</option>
          <option value="stock">Sort: Stock Level</option>
        </select>
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
            <p className="text-muted-foreground">Loading items...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <i className="fas fa-search text-4xl text-muted-foreground mb-4"></i>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Items Found</h3>
            <p className="text-muted-foreground">
              {searchTerm ? "Try adjusting your search terms" : "No items match the selected filters"}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const stockStatus = getStockStatus(item);
            const daysUntilExpiry = getDaysUntilExpiry(item.soonestExpiry);
            const currentQty = item.stockLevel?.qtyOnHand || 0;

            return (
              <div 
                key={item.id} 
                className="item-row cursor-pointer hover:bg-accent/50 transition-colors" 
                onClick={() => handleEditItem(item)}
                data-testid={`item-${item.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">{item.description || `${item.unit} unit`}</p>
                  </div>
                  <div className="flex gap-1">
                    {item.critical && (
                      <span className="status-chip chip-critical text-xs">
                        <i className="fas fa-exclamation-circle"></i>
                      </span>
                    )}
                    {item.controlled && (
                      <span className="status-chip chip-controlled text-xs">
                        <i className="fas fa-shield-halved"></i>
                      </span>
                    )}
                  </div>
                </div>

                {daysUntilExpiry !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`expiry-indicator ${getExpiryColor(daysUntilExpiry)}`}></div>
                    <span className="text-sm text-muted-foreground">
                      Expires in {Math.max(0, daysUntilExpiry)} days
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${stockStatus.color}`}>
                      {currentQty}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / Min: {item.minThreshold || 0} / Max: {item.maxThreshold || 0}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={(e) => handleQuickOrder(e, item)} data-testid={`quick-order-${item.id}`}>
                    <i className="fas fa-bolt mr-1"></i>
                    Quick Order
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
            <DialogDescription>Create a new inventory item</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
            {/* Image Upload */}
            <div>
              <Label>Item Photo (AI Analysis)</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                data-testid="button-upload-image"
              >
                <i className={`fas ${isAnalyzing ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
                {isAnalyzing ? "Analyzing..." : "Take Photo / Upload Images"}
              </Button>
              {uploadedImages.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {uploadedImages.map((img, idx) => (
                    <img key={idx} src={img} alt={`Upload ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="name">Item Name *</Label>
              <Input 
                id="name" 
                name="name" 
                required 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-item-name" 
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Input 
                id="description" 
                name="description" 
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-item-description" 
              />
            </div>

            {/* Visual Unit Selector */}
            <div>
              <Label>Unit Type *</Label>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUnit("pack")}
                  className={`flex-1 py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "pack" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="unit-pack"
                >
                  <i className="fas fa-box text-xl mb-1"></i>
                  <div className="text-xs font-medium">Pack</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUnit("single item")}
                  className={`flex-1 py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "single item" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="unit-single"
                >
                  <i className="fas fa-vial text-xl mb-1"></i>
                  <div className="text-xs font-medium">Single Item</div>
                </button>
              </div>
            </div>

            {selectedUnit === "single item" && formData.controlled && (
              <div>
                <Label htmlFor="packSize">Pack Size (pieces per pack) *</Label>
                <Input 
                  ref={packSizeInputRef}
                  id="packSize" 
                  name="packSize" 
                  type="number" 
                  min="1"
                  value={formData.packSize}
                  onChange={(e) => setFormData(prev => ({ ...prev, packSize: e.target.value }))}
                  data-testid="input-item-pack-size" 
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Required to allow placing new orders in packs</p>
              </div>
            )}

            {/* <div>
              <Label htmlFor="barcode">Barcode</Label>
              <Input 
                id="barcode" 
                name="barcode" 
                value={formData.barcode}
                onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                data-testid="input-item-barcode" 
              />
            </div> */}

            <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border-2 border-primary/30">
              <Label htmlFor="initialStock" className="text-base font-semibold">Actual Stock</Label>
              <Input 
                id="initialStock" 
                name="initialStock" 
                type="number" 
                min="0"
                value={formData.initialStock}
                onChange={(e) => setFormData(prev => ({ ...prev, initialStock: e.target.value }))}
                data-testid="input-initial-stock"
                className="mt-2 text-lg font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minThreshold">Min Threshold</Label>
                <Input 
                  id="minThreshold" 
                  name="minThreshold" 
                  type="number" 
                  min="0"
                  value={formData.minThreshold}
                  onChange={(e) => setFormData(prev => ({ ...prev, minThreshold: e.target.value }))}
                  data-testid="input-item-min" 
                />
              </div>
              <div>
                <Label htmlFor="maxThreshold">Max Threshold</Label>
                <Input 
                  id="maxThreshold" 
                  name="maxThreshold" 
                  type="number" 
                  min="0"
                  value={formData.maxThreshold}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxThreshold: e.target.value }))}
                  data-testid="input-item-max" 
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="critical" 
                  name="critical" 
                  checked={formData.critical}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, critical: checked === true }))}
                  data-testid="checkbox-item-critical" 
                />
                <Label htmlFor="critical" className="cursor-pointer">Critical Item</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="controlled" 
                  name="controlled"
                  checked={formData.controlled}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, controlled: checked === true }))}
                  data-testid="checkbox-item-controlled" 
                />
                <Label htmlFor="controlled" className="cursor-pointer">Controlled Substance</Label>
              </div>
            </div>

            <div className="flex gap-3 pt-4 justify-end">
              <Button type="button" variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createItemMutation.isPending || isAnalyzing} data-testid="button-save-item">
                {createItemMutation.isPending ? "Creating..." : "Create Item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>Update item details</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateItem} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Item Name *</Label>
              <Input 
                id="edit-name" 
                name="name" 
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                data-testid="input-edit-name"
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Input 
                id="edit-description" 
                name="description" 
                value={editFormData.description}
                onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-edit-description" 
              />
            </div>

            <div>
              <Label>Unit Type *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUnit("pack")}
                  className={`flex flex-col items-center py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "pack" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="edit-unit-pack"
                >
                  <i className="fas fa-box text-xl mb-1"></i>
                  <div className="text-xs font-medium">Pack</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUnit("single item")}
                  className={`flex flex-col items-center py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "single item" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="edit-unit-single"
                >
                  <i className="fas fa-vial text-xl mb-1"></i>
                  <div className="text-xs font-medium">Single Item</div>
                </button>
              </div>
            </div>

            {selectedUnit === "single item" && editFormData.controlled && (
              <div>
                <Label htmlFor="edit-packSize">Pack Size (pieces per pack) *</Label>
                <Input 
                  ref={editPackSizeInputRef}
                  id="edit-packSize" 
                  name="packSize" 
                  type="number" 
                  min="1"
                  value={editFormData.packSize}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, packSize: e.target.value }))}
                  data-testid="input-edit-pack-size" 
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Required to allow placing new orders in packs</p>
              </div>
            )}

            {/* <div>
              <Label htmlFor="edit-barcode">Barcode</Label>
              <Input 
                id="edit-barcode" 
                name="barcode" 
                value={editFormData.barcode}
                onChange={(e) => setEditFormData(prev => ({ ...prev, barcode: e.target.value }))}
                data-testid="input-edit-barcode" 
              />
            </div> */}

            <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border-2 border-primary/30">
              <Label htmlFor="edit-actualStock" className="text-base font-semibold">Actual Stock</Label>
              <Input 
                id="edit-actualStock" 
                name="actualStock" 
                type="number" 
                min="0"
                value={editFormData.actualStock}
                onChange={(e) => setEditFormData(prev => ({ ...prev, actualStock: e.target.value }))}
                data-testid="input-edit-actual-stock"
                className="mt-2 text-lg font-medium"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-minThreshold">Min Threshold</Label>
                <Input 
                  id="edit-minThreshold" 
                  name="minThreshold" 
                  type="number" 
                  min="0"
                  value={editFormData.minThreshold}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, minThreshold: e.target.value }))}
                  data-testid="input-edit-min" 
                />
              </div>
              <div>
                <Label htmlFor="edit-maxThreshold">Max Threshold</Label>
                <Input 
                  id="edit-maxThreshold" 
                  name="maxThreshold" 
                  type="number" 
                  min="0"
                  value={editFormData.maxThreshold}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, maxThreshold: e.target.value }))}
                  data-testid="input-edit-max" 
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-critical" 
                  name="critical" 
                  checked={editFormData.critical}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, critical: checked === true }))}
                  data-testid="checkbox-edit-critical" 
                />
                <Label htmlFor="edit-critical" className="cursor-pointer">Critical Item</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-controlled" 
                  name="controlled"
                  checked={editFormData.controlled}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, controlled: checked === true }))}
                  data-testid="checkbox-edit-controlled" 
                />
                <Label htmlFor="edit-controlled" className="cursor-pointer">Controlled Substance</Label>
              </div>
            </div>

            <div className="flex gap-2 justify-between">
              <Button 
                type="button" 
                variant="destructive" 
                onClick={() => {
                  if (selectedItem && window.confirm(`Are you sure you want to delete "${selectedItem.name}"? This action cannot be undone.`)) {
                    deleteItemMutation.mutate(selectedItem.id);
                  }
                }}
                disabled={deleteItemMutation.isPending}
                data-testid="button-delete-item"
              >
                {deleteItemMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateItemMutation.isPending} data-testid="button-update-item">
                  {updateItemMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
