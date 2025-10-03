import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import SignaturePad from "@/components/SignaturePad";
import type { Activity, User, Item } from "@shared/schema";

interface ControlledActivity extends Activity {
  user: User;
  item?: Item;
}

interface DrugSelection {
  itemId: string;
  name: string;
  onHand: number;
  qty: number;
  selected: boolean;
}

type PatientMethod = "text" | "barcode" | "photo";

export default function ControlledLog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeHospital] = useState(() => (user as any)?.hospitals?.[0]);
  const [showAdministrationModal, setShowAdministrationModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [patientMethod, setPatientMethod] = useState<PatientMethod>("text");
  
  // Form state
  const [selectedDrugs, setSelectedDrugs] = useState<DrugSelection[]>([
    { itemId: "1", name: "Fentanyl 100mcg", onHand: 45, qty: 1, selected: false },
    { itemId: "2", name: "Propofol 200mg", onHand: 18, qty: 0, selected: false },
    { itemId: "3", name: "Morphine 10mg", onHand: 32, qty: 0, selected: false },
  ]);
  const [patientId, setPatientId] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");

  const { data: activities = [], isLoading } = useQuery<ControlledActivity[]>({
    queryKey: ["/api/controlled/log", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const dispenseMutation = useMutation({
    mutationFn: async (data: {
      items: Array<{ itemId: string; qty: number; locationId: string }>;
      patientId: string;
      patientPhoto?: string;
      notes: string;
      signatures: string[];
    }) => {
      const response = await apiRequest("POST", "/api/controlled/dispense", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controlled/log"] });
      toast({
        title: "Administration Recorded",
        description: "Controlled substance administration has been logged.",
      });
      setShowAdministrationModal(false);
      resetForm();
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
        title: "Recording Failed",
        description: "Failed to record controlled substance administration.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedDrugs(prev => prev.map(drug => ({ ...drug, selected: false, qty: 0 })));
    setPatientId("");
    setNotes("");
    setSignature("");
    setPatientMethod("text");
  };

  const handleDrugSelection = (itemId: string, selected: boolean) => {
    setSelectedDrugs(prev =>
      prev.map(drug =>
        drug.itemId === itemId
          ? { ...drug, selected, qty: selected ? 1 : 0 }
          : drug
      )
    );
  };

  const handleQtyChange = (itemId: string, qty: number) => {
    setSelectedDrugs(prev =>
      prev.map(drug =>
        drug.itemId === itemId ? { ...drug, qty: Math.max(0, qty) } : drug
      )
    );
  };

  const handleSubmitAdministration = () => {
    const selectedItems = selectedDrugs.filter(drug => drug.selected && drug.qty > 0);
    
    if (selectedItems.length === 0) {
      toast({
        title: "No Drugs Selected",
        description: "Please select at least one drug to administer.",
        variant: "destructive",
      });
      return;
    }

    if (!patientId.trim()) {
      toast({
        title: "Patient Required",
        description: "Please provide patient identification.",
        variant: "destructive",
      });
      return;
    }

    if (!signature) {
      toast({
        title: "Signature Required",
        description: "Please provide your electronic signature.",
        variant: "destructive",
      });
      return;
    }

    const items = selectedItems.map(drug => ({
      itemId: drug.itemId,
      qty: drug.qty,
      locationId: "default-location", // Would be selected by user in real app
    }));

    dispenseMutation.mutate({
      items,
      patientId,
      notes,
      signatures: [signature],
    });
  };

  const getStatusChip = (activity: ControlledActivity) => {
    if (activity.controlledVerified) {
      return <span className="status-chip chip-success text-xs">Verified</span>;
    }
    return <span className="status-chip chip-warning text-xs">Pending</span>;
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Just now";
    if (diffInHours === 1) return "1 hour ago";
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    return "Yesterday";
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Hospital Selected</h3>
          <p className="text-muted-foreground">Please select a hospital to access controlled log.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Controlled Log</h1>
        <Button
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
          onClick={() => setShowAdministrationModal(true)}
          data-testid="record-administration-button"
        >
          <i className="fas fa-plus mr-2"></i>
          Record Administration
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Today's Records</p>
          <p className="text-3xl font-bold text-foreground" data-testid="todays-records">
            {activities.filter(a => {
              const today = new Date().toDateString();
              return new Date(a.timestamp).toDateString() === today;
            }).length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Pending Review</p>
          <p className="text-3xl font-bold text-accent" data-testid="pending-records">
            {activities.filter(a => !a.controlledVerified).length}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button className="status-chip chip-muted whitespace-nowrap" data-testid="filter-all">
          All ({activities.length})
        </button>
        <button className="status-chip chip-accent whitespace-nowrap" data-testid="filter-today">
          Today ({activities.filter(a => {
            const today = new Date().toDateString();
            return new Date(a.timestamp).toDateString() === today;
          }).length})
        </button>
        <button className="status-chip chip-warning whitespace-nowrap" data-testid="filter-pending">
          Pending ({activities.filter(a => !a.controlledVerified).length})
        </button>
        <button className="status-chip chip-primary whitespace-nowrap" data-testid="filter-week">
          This Week ({activities.length})
        </button>
      </div>

      {/* Log Entries */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
            <p className="text-muted-foreground">Loading controlled log...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <i className="fas fa-shield-halved text-4xl text-muted-foreground mb-4"></i>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Records Found</h3>
            <p className="text-muted-foreground">No controlled substance administrations recorded yet.</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className={`bg-card border rounded-lg p-4 ${
                !activity.controlledVerified ? "border-2 border-warning" : "border-border"
              }`}
              data-testid={`activity-${activity.id}`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-syringe text-accent text-lg"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground">
                    {activity.item?.name || "Unknown Item"}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {Math.abs(activity.delta || 0)} units dispensed
                  </p>
                </div>
                {getStatusChip(activity)}
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2">
                  <i className="fas fa-user-injured text-muted-foreground text-sm"></i>
                  <span className="text-sm text-foreground">
                    Patient: {activity.patientId || "Unknown"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="fas fa-user-md text-muted-foreground text-sm"></i>
                  <span className="text-sm text-foreground">
                    Administered by: {activity.user.firstName} {activity.user.lastName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="fas fa-clock text-muted-foreground text-sm"></i>
                  <span className="text-sm text-muted-foreground">
                    {formatTimeAgo(activity.timestamp)}
                  </span>
                </div>
              </div>

              {!activity.controlledVerified && (
                <div className="bg-warning/10 rounded-lg p-2 mt-2">
                  <p className="text-sm text-warning font-medium">
                    ⚠️ Awaiting second signature verification
                  </p>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                {!activity.controlledVerified ? (
                  <>
                    <Button size="sm" className="flex-1" data-testid={`sign-verify-${activity.id}`}>
                      Sign & Verify
                    </Button>
                    <Button variant="outline" size="sm" data-testid={`view-activity-${activity.id}`}>
                      <i className="fas fa-eye"></i>
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="flex-1" data-testid={`view-details-${activity.id}`}>
                    View Details
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Administration Modal */}
      {showAdministrationModal && (
        <div className="modal-overlay" onClick={() => setShowAdministrationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Record Administration</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdministrationModal(false)}
                data-testid="close-modal"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>

            <div className="space-y-4">
              {/* Drug Selection */}
              <div>
                <Label className="block text-sm font-medium mb-2">Select Drug(s)</Label>
                <div className="space-y-2">
                  {selectedDrugs.map((drug) => (
                    <div key={drug.itemId} className="bg-muted rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={drug.selected}
                          onCheckedChange={(checked) => handleDrugSelection(drug.itemId, !!checked)}
                          data-testid={`drug-checkbox-${drug.itemId}`}
                        />
                        <div>
                          <p className="font-medium text-foreground">{drug.name}</p>
                          <p className="text-xs text-muted-foreground">On hand: {drug.onHand} units</p>
                        </div>
                      </div>
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={drug.qty || ""}
                        onChange={(e) => handleQtyChange(drug.itemId, parseInt(e.target.value) || 0)}
                        className="w-16 text-center"
                        min="0"
                        max={drug.onHand}
                        disabled={!drug.selected}
                        data-testid={`drug-qty-${drug.itemId}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Patient Assignment */}
              <div>
                <Label className="block text-sm font-medium mb-2">Patient Assignment</Label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Button
                    variant={patientMethod === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPatientMethod("text")}
                    data-testid="patient-method-text"
                  >
                    <i className="fas fa-keyboard mr-1"></i>
                    Text
                  </Button>
                  <Button
                    variant={patientMethod === "barcode" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPatientMethod("barcode")}
                    data-testid="patient-method-barcode"
                  >
                    <i className="fas fa-barcode mr-1"></i>
                    Barcode
                  </Button>
                  <Button
                    variant={patientMethod === "photo" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPatientMethod("photo")}
                    data-testid="patient-method-photo"
                  >
                    <i className="fas fa-camera mr-1"></i>
                    Photo
                  </Button>
                </div>

                {patientMethod === "text" && (
                  <Input
                    placeholder="Enter Patient ID or Name"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    data-testid="patient-id-input"
                  />
                )}

                {patientMethod === "barcode" && (
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <i className="fas fa-barcode text-4xl text-muted-foreground mb-2"></i>
                    <p className="text-sm text-muted-foreground">Scan patient wristband</p>
                    <Button className="mt-3" data-testid="open-patient-scanner">
                      <i className="fas fa-camera mr-2"></i>
                      Open Scanner
                    </Button>
                  </div>
                )}

                {patientMethod === "photo" && (
                  <div className="camera-preview">
                    <div className="text-center">
                      <i className="fas fa-camera text-4xl text-muted-foreground mb-2"></i>
                      <p className="text-sm text-muted-foreground">Photo patient label/wristband</p>
                      <Button className="mt-3" data-testid="capture-patient-photo">
                        <i className="fas fa-camera mr-2"></i>
                        Capture Photo
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes" className="block text-sm font-medium mb-2">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder="Add any additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="administration-notes"
                />
              </div>

              {/* E-Signature */}
              <div>
                <Label className="block text-sm font-medium mb-2">Your E-Signature</Label>
                <div
                  className="signature-pad cursor-pointer"
                  onClick={() => setShowSignaturePad(true)}
                  data-testid="signature-trigger"
                >
                  {signature ? (
                    <div className="text-center">
                      <i className="fas fa-check-circle text-2xl text-success mb-2"></i>
                      <p className="text-sm text-success">Signature captured</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <i className="fas fa-signature text-2xl mb-2"></i>
                      <p className="text-sm">Tap to sign</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAdministrationModal(false)}
                  data-testid="cancel-administration"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-accent hover:bg-accent/90"
                  onClick={handleSubmitAdministration}
                  disabled={dispenseMutation.isPending}
                  data-testid="submit-administration"
                >
                  <i className="fas fa-shield-halved mr-2"></i>
                  Submit Record
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature Pad */}
      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onSave={(sig) => setSignature(sig)}
        title="Your E-Signature"
      />
    </div>
  );
}
