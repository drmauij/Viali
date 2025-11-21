import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Package, Loader2, Edit, X, AlertCircle } from "lucide-react";

interface InventoryUsageTabProps {
  anesthesiaRecordId: string;
}

interface InventoryUsage {
  id: string;
  anesthesiaRecordId: string;
  itemId: string;
  itemName: string;
  calculatedQty: number;
  overrideQty: number | null;
  overrideReason: string | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
}

export function InventoryUsageTab({ anesthesiaRecordId }: InventoryUsageTabProps) {
  const { toast } = useToast();
  const [selectedUsage, setSelectedUsage] = useState<InventoryUsage | null>(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideQty, setOverrideQty] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState("");

  // Fetch inventory usage
  const { data: inventoryUsage = [], isLoading } = useQuery<InventoryUsage[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Set override mutation
  const setOverrideMutation = useMutation({
    mutationFn: async ({ id, overrideQty, overrideReason }: { id: string; overrideQty: number; overrideReason: string }) => {
      const response = await apiRequest('PATCH', `/api/anesthesia/inventory/${id}/override`, {
        overrideQty,
        overrideReason,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
      toast({
        title: "Override Set",
        description: "Inventory quantity has been manually overridden.",
      });
      setOverrideDialogOpen(false);
      setSelectedUsage(null);
      setOverrideQty("");
      setOverrideReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set override.",
        variant: "destructive",
      });
    },
  });

  // Clear override mutation
  const clearOverrideMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/anesthesia/inventory/${id}/override`);
      // DELETE returns 204 with no content
      return response.status === 204 ? null : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
      toast({
        title: "Override Cleared",
        description: "Inventory quantity has been reset to calculated value.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear override.",
        variant: "destructive",
      });
    },
  });

  const handleOpenOverrideDialog = (usage: InventoryUsage) => {
    setSelectedUsage(usage);
    setOverrideQty(usage.overrideQty?.toString() || usage.calculatedQty.toString());
    setOverrideReason(usage.overrideReason || "");
    setOverrideDialogOpen(true);
  };

  const handleSetOverride = () => {
    if (!selectedUsage) return;

    const qty = parseFloat(overrideQty);
    if (isNaN(qty) || qty < 0) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid quantity (0 or greater).",
        variant: "destructive",
      });
      return;
    }

    if (!overrideReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for the override.",
        variant: "destructive",
      });
      return;
    }

    setOverrideMutation.mutate({
      id: selectedUsage.id,
      overrideQty: qty,
      overrideReason: overrideReason.trim(),
    });
  };

  const handleClearOverride = (id: string) => {
    clearOverrideMutation.mutate(id);
  };

  if (!anesthesiaRecordId) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No anesthesia record available</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Medication & Supply Usage</h3>
          <Badge variant="outline" className="text-xs">
            Auto-calculated from timeline
          </Badge>
        </div>

        {inventoryUsage.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No inventory usage recorded yet</p>
              <p className="text-sm text-muted-foreground mt-2">Usage is automatically calculated from medication administration in the timeline</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-sm">Item</th>
                      <th className="text-right py-2 px-3 font-medium text-sm">Calculated</th>
                      <th className="text-right py-2 px-3 font-medium text-sm">Override</th>
                      <th className="text-right py-2 px-3 font-medium text-sm">Final Qty</th>
                      <th className="text-right py-2 px-3 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryUsage.map((usage) => {
                      const finalQty = usage.overrideQty !== null ? usage.overrideQty : usage.calculatedQty;
                      const hasOverride = usage.overrideQty !== null;
                      
                      return (
                        <tr 
                          key={usage.id} 
                          className={`border-b last:border-b-0 ${hasOverride ? 'bg-amber-500/10 dark:bg-amber-400/10' : ''}`}
                          data-testid={`inventory-usage-${usage.itemId}`}
                        >
                          <td className="py-3 px-3">
                            <div>
                              <p className="font-medium text-sm">{usage.itemName}</p>
                              {hasOverride && usage.overrideReason && (
                                <p className="text-xs text-muted-foreground mt-1 italic">
                                  {usage.overrideReason}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="text-right py-3 px-3 text-sm" data-testid={`calculated-${usage.itemId}`}>
                            {usage.calculatedQty}
                          </td>
                          <td className="text-right py-3 px-3 text-sm" data-testid={`override-${usage.itemId}`}>
                            {hasOverride ? (
                              <Badge variant="secondary" className="text-xs">
                                {usage.overrideQty}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="text-right py-3 px-3 font-semibold text-sm" data-testid={`final-qty-${usage.itemId}`}>
                            {finalQty}
                          </td>
                          <td className="text-right py-3 px-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenOverrideDialog(usage)}
                                data-testid={`button-edit-${usage.itemId}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {hasOverride && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleClearOverride(usage.id)}
                                  disabled={clearOverrideMutation.isPending}
                                  data-testid={`button-clear-${usage.itemId}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 px-3 text-xs text-muted-foreground">
                <p>Showing all items tracked from medication administration. Items with quantity 0 are displayed for reference and can be manually adjusted if needed.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent data-testid="dialog-override">
          <DialogHeader>
            <DialogTitle>Override Inventory Quantity</DialogTitle>
          </DialogHeader>
          
          {selectedUsage && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Item: {selectedUsage.itemName}</p>
                <p className="text-sm text-muted-foreground">
                  Calculated quantity: {selectedUsage.calculatedQty}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="override-qty">Override Quantity</Label>
                <Input
                  id="override-qty"
                  type="number"
                  min="0"
                  step="0.1"
                  value={overrideQty}
                  onChange={(e) => setOverrideQty(e.target.value)}
                  placeholder="Enter quantity"
                  data-testid="input-override-qty"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="override-reason">Reason for Override</Label>
                <Textarea
                  id="override-reason"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why the quantity is being manually adjusted..."
                  rows={3}
                  data-testid="textarea-override-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOverrideDialogOpen(false);
                setSelectedUsage(null);
                setOverrideQty("");
                setOverrideReason("");
              }}
              data-testid="button-cancel-override"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetOverride}
              disabled={setOverrideMutation.isPending}
              data-testid="button-confirm-override"
            >
              {setOverrideMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Set Override'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
