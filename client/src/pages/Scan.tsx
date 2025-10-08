import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import BarcodeScanner from "@/components/BarcodeScanner";
import ItemQuickPanel from "@/components/ItemQuickPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Item, StockLevel, InsertItem } from "@shared/schema";

interface ItemWithStock extends Item {
  stockLevel?: StockLevel;
}

interface ExternalProduct {
  name: string;
  manufacturer: string;
  category: string;
  barcode: string;
  found: boolean;
}

export default function Scan() {
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showScanner, setShowScanner] = useState(false);
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [scannedItem, setScannedItem] = useState<ItemWithStock | null>(null);
  const [externalProduct, setExternalProduct] = useState<ExternalProduct | null>(null);

  // Barcode scan mutation - first try to find in local database
  const scanMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const response = await apiRequest("POST", "/api/scan/barcode", {
        barcode,
        hospitalId: activeHospital?.id,
      });
      return response.json();
    },
    onSuccess: (item) => {
      setScannedItem(item);
      setShowQuickPanel(true);
      setShowScanner(false);
      toast({
        title: "Item Found",
        description: `${item.name} has been scanned successfully.`,
      });
    },
    onError: async (error: any, barcode) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      // Check if it's a 404 error (error message format: "404: Not found")
      if (error?.message?.startsWith("404")) {
        // Item not found locally, try external lookup
        externalLookupMutation.mutate(barcode);
      } else {
        toast({
          title: "Scan Error",
          description: "Failed to scan barcode. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  // External barcode lookup mutation
  const externalLookupMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const response = await apiRequest("POST", "/api/scan/lookup", {
        barcode,
      });
      return response.json();
    },
    onSuccess: (product: ExternalProduct) => {
      setExternalProduct(product);
      setShowScanner(false);
      setShowAddDialog(true);
      toast({
        title: "Product Found",
        description: `${product.name} found in external database.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Item Not Found",
        description: "This barcode is not in your inventory or external databases.",
        variant: "destructive",
      });
    },
  });

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<InsertItem>) => {
      const response = await apiRequest("POST", "/api/items", {
        ...data,
        hospitalId: activeHospital?.id,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setShowAddDialog(false);
      setExternalProduct(null);
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

  // Stock update mutation
  const updateStockMutation = useMutation({
    mutationFn: async ({ itemId, newQty }: { itemId: string; newQty: number }) => {
      // Get current stock level first (simplified - would need location)
      const currentQty = scannedItem?.stockLevel?.qtyOnHand || 0;
      const delta = newQty - currentQty;
      
      const response = await apiRequest("POST", "/api/stock/update", {
        itemId,
        qty: newQty,
        delta,
        notes: "Updated via scan interface",
      });
      return response.json();
    },
    onSuccess: (updatedStock) => {
      toast({
        title: "Stock Updated",
        description: "Stock level has been updated successfully.",
      });
      
      // Update the scanned item with new stock level
      if (scannedItem && updatedStock) {
        setScannedItem({
          ...scannedItem,
          stockLevel: updatedStock,
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/kpis"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: "Update Failed",
        description: "Failed to update stock level.",
        variant: "destructive",
      });
    },
  });

  const handleScan = (barcode: string) => {
    if (!activeHospital?.id) {
      toast({
        title: "No Hospital Selected",
        description: "Please select a hospital first.",
        variant: "destructive",
      });
      return;
    }
    
    scanMutation.mutate(barcode);
  };

  const handleManualScan = () => {
    if (!manualBarcode.trim()) return;
    handleScan(manualBarcode.trim());
    setManualBarcode("");
  };

  const handleStockUpdate = (itemId: string, newQty: number) => {
    updateStockMutation.mutate({ itemId, newQty });
  };

  const handleControlledDispense = (item: ItemWithStock) => {
    // Navigate to controlled substances page or open modal
    toast({
      title: "Feature Coming Soon",
      description: "Controlled substance recording will open controlled log.",
    });
  };

  const handleAddExternalItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const minValue = formData.get("minThreshold") as string;
    const maxValue = formData.get("maxThreshold") as string;
    
    const itemData = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      unit: formData.get("unit") as string,
      barcodes: externalProduct?.barcode ? [externalProduct.barcode] : [],
      minThreshold: minValue ? parseInt(minValue, 10) : 0,
      maxThreshold: maxValue ? parseInt(maxValue, 10) : 0,
      critical: formData.get("critical") === "on",
      controlled: formData.get("controlled") === "on",
    };

    createItemMutation.mutate(itemData);
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Hospital Selected</h3>
          <p className="text-muted-foreground">Please select a hospital to start scanning.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">Scan Items</h2>
        <p className="text-muted-foreground">Scan barcodes to manage inventory</p>
      </div>

      {/* Scan Methods */}
      <div className="space-y-4">
        {/* Camera Scan */}
        <Button
          className="w-full h-20 text-lg"
          onClick={() => setShowScanner(true)}
          data-testid="open-camera-scanner"
        >
          <i className="fas fa-camera text-2xl mr-3"></i>
          <div className="text-left">
            <div>Open Camera Scanner</div>
            <div className="text-sm opacity-75">Scan with device camera</div>
          </div>
        </Button>

        {/* Manual Entry */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-sm text-muted-foreground px-2">or</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>
          
          <div className="flex gap-3">
            <Input
              placeholder="Enter barcode manually"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleManualScan()}
              data-testid="manual-barcode-input"
            />
            <Button
              onClick={handleManualScan}
              disabled={!manualBarcode.trim() || scanMutation.isPending}
              data-testid="manual-scan-button"
            >
              <i className="fas fa-search"></i>
            </Button>
          </div>
        </div>
      </div>

      {/* Scan Status */}
      {scanMutation.isPending && (
        <div className="text-center py-8">
          <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
          <p className="text-muted-foreground">Scanning barcode...</p>
        </div>
      )}

      {/* Quick Tips */}
      <div className="bg-muted rounded-lg p-4">
        <h3 className="font-semibold text-foreground mb-2">
          <i className="fas fa-lightbulb text-accent mr-2"></i>
          Scanning Tips
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Ensure good lighting for camera scanning</li>
          <li>• Hold steady and center the barcode</li>
          <li>• Use manual entry if barcode is damaged</li>
          <li>• Controlled substances require additional verification</li>
        </ul>
      </div>

      {/* Recent Scans */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">Recent Scans</h3>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-center">No recent scans</p>
        </div>
      </div>

      {/* Camera Scanner */}
      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
        onManualEntry={() => {
          setShowScanner(false);
          // Focus manual input
          setTimeout(() => {
            const input = document.querySelector('[data-testid="manual-barcode-input"]') as HTMLInputElement;
            input?.focus();
          }, 100);
        }}
      />

      {/* Item Quick Panel */}
      <ItemQuickPanel
        isOpen={showQuickPanel}
        onClose={() => setShowQuickPanel(false)}
        item={scannedItem ? {
          ...scannedItem,
          stockLevel: scannedItem.stockLevel ? {
            qtyOnHand: scannedItem.stockLevel.qtyOnHand || 0
          } : undefined
        } : null}
        onStockUpdate={handleStockUpdate}
        onControlledDispense={handleControlledDispense}
      />

      {/* Add Item from External Lookup Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
            <DialogDescription>
              Product found in external database. Review and complete the details below.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleAddExternalItem} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={externalProduct?.name || ""}
                required
                data-testid="add-item-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                defaultValue={`${externalProduct?.manufacturer || ""} - ${externalProduct?.category || ""}`.trim()}
                data-testid="add-item-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                name="barcode"
                value={externalProduct?.barcode || ""}
                readOnly
                disabled
                className="bg-muted"
                data-testid="add-item-barcode"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit *</Label>
              <Input
                id="unit"
                name="unit"
                placeholder="e.g., mg, ml, box"
                required
                data-testid="add-item-unit"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minThreshold">Min Threshold</Label>
                <Input
                  id="minThreshold"
                  name="minThreshold"
                  type="number"
                  defaultValue="0"
                  data-testid="add-item-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxThreshold">Max Threshold</Label>
                <Input
                  id="maxThreshold"
                  name="maxThreshold"
                  type="number"
                  defaultValue="0"
                  data-testid="add-item-max"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="critical" name="critical" data-testid="add-item-critical" />
                <Label htmlFor="critical" className="font-normal cursor-pointer">Critical Item</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="controlled" name="controlled" data-testid="add-item-controlled" />
                <Label htmlFor="controlled" className="font-normal cursor-pointer">Controlled Substance</Label>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  setExternalProduct(null);
                }}
                data-testid="cancel-add-item"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createItemMutation.isPending}
                data-testid="submit-add-item"
              >
                {createItemMutation.isPending ? "Adding..." : "Add Item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
