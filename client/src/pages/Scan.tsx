import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import BarcodeScanner from "@/components/BarcodeScanner";
import ItemQuickPanel from "@/components/ItemQuickPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Item } from "@shared/schema";

export default function Scan() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showScanner, setShowScanner] = useState(false);
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [scannedItem, setScannedItem] = useState<Item | null>(null);
  const [activeHospital] = useState(() => (user as any)?.hospitals?.[0]);

  // Barcode scan mutation
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
      
      if (error.message.includes("404")) {
        toast({
          title: "Item Not Found",
          description: "This barcode is not recognized in your inventory.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Scan Error",
          description: "Failed to scan barcode. Please try again.",
          variant: "destructive",
        });
      }
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
        locationId: "default-location", // Would be selected by user in real app
        qty: newQty,
        delta,
        notes: "Updated via scan interface",
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Stock Updated",
        description: "Stock level has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
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

  const handleControlledDispense = (item: Item) => {
    // Navigate to controlled substances page or open modal
    toast({
      title: "Feature Coming Soon",
      description: "Controlled substance recording will open controlled log.",
    });
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
        item={scannedItem}
        onStockUpdate={handleStockUpdate}
        onControlledDispense={handleControlledDispense}
      />
    </div>
  );
}
