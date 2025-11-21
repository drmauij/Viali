import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Download, Printer, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAutoSaveMutation } from "@/hooks/useAutoSaveMutation";
import { apiRequest } from "@/lib/queryClient";
import {
  useInstallations,
  useCreateInstallation,
  useDeleteInstallation,
  useGeneralTechnique,
  useAirwayManagement,
  useNeuraxialBlocks,
  useCreateNeuraxialBlock,
  useDeleteNeuraxialBlock,
  usePeripheralBlocks,
  useCreatePeripheralBlock,
  useDeletePeripheralBlock,
} from "@/lib/anesthesiaDocumentation";
import type { AnesthesiaInstallation, InsertAnesthesiaInstallation } from "@shared/schema";

interface SectionProps {
  anesthesiaRecordId: string;
}

// ============================================================================
// INSTALLATIONS SECTION
// ============================================================================
export function InstallationsSection({ anesthesiaRecordId }: SectionProps) {
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        No anesthesia record available
      </CardContent>
    );
  }

  const { toast } = useToast();
  const { data: installations = [], isLoading } = useInstallations(anesthesiaRecordId);
  const createMutation = useCreateInstallation(anesthesiaRecordId);
  const deleteMutation = useDeleteInstallation(anesthesiaRecordId);
  
  // Maintain local state for each installation to avoid stale data
  const [localState, setLocalState] = useState<Record<string, any>>({});

  // Sync local state from server data
  useEffect(() => {
    const newState: Record<string, any> = {};
    installations.forEach(inst => {
      newState[inst.id] = inst;
    });
    setLocalState(newState);
  }, [installations]);

  // Get current state (local or from server)
  const getCurrentState = useCallback((id: string) => {
    return localState[id] || installations.find(i => i.id === id);
  }, [localState, installations]);

  // Auto-save mutation for installations
  const installationAutoSave = useAutoSaveMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest('PATCH', `/api/anesthesia/installations/${id}`, data);
    },
    queryKey: [`/api/anesthesia/installations/${anesthesiaRecordId}`],
  });

  const peripheralInstallations = installations.filter(i => i.category === "peripheral");
  const arterialInstallations = installations.filter(i => i.category === "arterial");
  const centralInstallations = installations.filter(i => i.category === "central");
  const bladderInstallations = installations.filter(i => i.category === "bladder");

  const handleCreate = (category: "peripheral" | "arterial" | "central" | "bladder") => {
    createMutation.mutate(
      { category, attempts: 1, notes: null, location: null, isPreExisting: false, metadata: {} },
      {
        onSuccess: () => {
          toast({ title: "Installation added successfully" });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add installation", variant: "destructive" });
        },
      }
    );
  };

  const handleUpdate = (id: string, updates: any) => {
    const current = getCurrentState(id);
    if (!current) return;
    
    // Deep merge metadata if it's being updated
    let mergedUpdates = updates;
    if (updates.metadata) {
      mergedUpdates = {
        ...updates,
        metadata: { ...current.metadata, ...updates.metadata }
      };
    }
    
    // Compute fresh merged state
    const nextState = { ...current, ...mergedUpdates };
    
    // Update local state immediately for optimistic UI
    setLocalState(prev => ({ ...prev, [id]: nextState }));
    
    // Trigger auto-save with the merged updates
    installationAutoSave.mutate({ id, data: mergedUpdates });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Installation removed" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to remove installation", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <CardContent className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CardContent>
    );
  }

  return (
    <CardContent className="space-y-6 pt-0">
      {/* Peripheral Venous Access */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Peripheral Venous Access</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("peripheral")}
            disabled={createMutation.isPending}
            data-testid="button-add-pv-access"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Entry
          </Button>
        </div>

        {peripheralInstallations.map((inst, index) => {
          const current = getCurrentState(inst.id) || inst;
          return (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Entry #{index + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDelete(inst.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-remove-pv-${index + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.location || ""}
                  onChange={(e) => handleUpdate(inst.id, { location: e.target.value })}
                  data-testid={`select-pv-location-${index + 1}`}
                >
                  <option value="">Select location</option>
                  <option value="right-hand">Right Hand (Dorsum)</option>
                  <option value="left-hand">Left Hand (Dorsum)</option>
                  <option value="right-forearm">Right Forearm</option>
                  <option value="left-forearm">Left Forearm</option>
                  <option value="right-ac-fossa">Right Antecubital Fossa</option>
                  <option value="left-ac-fossa">Left Antecubital Fossa</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Gauge</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.gauge || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { gauge: e.target.value } })}
                  data-testid={`select-pv-gauge-${index + 1}`}
                >
                  <option value="">Select gauge</option>
                  <option value="14G">14G (Orange)</option>
                  <option value="16G">16G (Gray)</option>
                  <option value="18G">18G (Green)</option>
                  <option value="20G">20G (Pink)</option>
                  <option value="22G">22G (Blue)</option>
                  <option value="24G">24G (Yellow)</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Number of Attempts</Label>
              <Input
                type="number"
                value={current.attempts || 1}
                onChange={(e) => handleUpdate(inst.id, { attempts: parseInt(e.target.value) || 1 })}
                data-testid={`input-pv-attempts-${index + 1}`}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
              <input
                type="checkbox"
                checked={current.isPreExisting || false}
                onChange={(e) => handleUpdate(inst.id, { isPreExisting: e.target.checked })}
                className="h-4 w-4"
                data-testid={`checkbox-pv-preexisting-${index + 1}`}
              />
              <span className="text-sm font-medium">Pre-existing Installation</span>
            </label>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={current.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid={`textarea-pv-notes-${index + 1}`}
              />
            </div>
          </div>
        );
        })}
      </div>

      {/* Arterial Line */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Arterial Line</Label>
          {arterialInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreate("arterial")}
              disabled={createMutation.isPending}
              data-testid="button-add-arterial"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {arterialInstallations.map((inst) => {
          const current = getCurrentState(inst.id) || inst;
          return (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Arterial Line</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDelete(inst.id)}
                disabled={deleteMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.location || ""}
                  onChange={(e) => handleUpdate(inst.id, { location: e.target.value })}
                  data-testid="select-arterial-location"
                >
                  <option value="">Select location</option>
                  <option value="radial-left">Radial - Left</option>
                  <option value="radial-right">Radial - Right</option>
                  <option value="femoral-left">Femoral - Left</option>
                  <option value="femoral-right">Femoral - Right</option>
                  <option value="brachial">Brachial</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Gauge</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.gauge || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { gauge: e.target.value } })}
                  data-testid="select-arterial-gauge"
                >
                  <option value="">Select gauge</option>
                  <option value="18G">18G</option>
                  <option value="20G">20G</option>
                  <option value="22G">22G</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Number of Attempts</Label>
                <Input
                  type="number"
                  value={current.attempts || 1}
                  onChange={(e) => handleUpdate(inst.id, { attempts: parseInt(e.target.value) || 1 })}
                  data-testid="input-arterial-attempts"
                />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.technique || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { technique: e.target.value } })}
                  data-testid="select-arterial-technique"
                >
                  <option value="">Select technique</option>
                  <option value="direct">Direct (Seldinger)</option>
                  <option value="transfixion">Transfixion</option>
                  <option value="ultrasound">Ultrasound-guided</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
              <input
                type="checkbox"
                checked={current.isPreExisting || false}
                onChange={(e) => handleUpdate(inst.id, { isPreExisting: e.target.checked })}
                className="h-4 w-4"
                data-testid="checkbox-arterial-preexisting"
              />
              <span className="text-sm font-medium">Pre-existing Installation</span>
            </label>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={current.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="textarea-arterial-notes"
              />
            </div>
          </div>
        );
        })}

        {arterialInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No arterial line documented. Click "Add" to document arterial line placement.
          </p>
        )}
      </div>

      {/* Central Venous Catheter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Central Venous Catheter</Label>
          {centralInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreate("central")}
              disabled={createMutation.isPending}
              data-testid="button-add-cvc"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {centralInstallations.map((inst) => {
          const current = getCurrentState(inst.id) || inst;
          return (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Central Venous Catheter</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDelete(inst.id)}
                disabled={deleteMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.location || ""}
                  onChange={(e) => handleUpdate(inst.id, { location: e.target.value })}
                  data-testid="select-cvc-location"
                >
                  <option value="">Select location</option>
                  <option value="right-ijv">Right Internal Jugular</option>
                  <option value="left-ijv">Left Internal Jugular</option>
                  <option value="right-subclavian">Right Subclavian</option>
                  <option value="left-subclavian">Left Subclavian</option>
                  <option value="femoral">Femoral</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Lumens</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.lumens || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { lumens: parseInt(e.target.value) || undefined } })}
                  data-testid="select-cvc-lumens"
                >
                  <option value="">Select lumens</option>
                  <option value="1">Single</option>
                  <option value="2">Double</option>
                  <option value="3">Triple</option>
                  <option value="4">Quad</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Depth (cm)</Label>
                <Input
                  type="number"
                  placeholder="16"
                  value={current.metadata?.depth || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { depth: parseInt(e.target.value) || undefined } })}
                  data-testid="input-cvc-depth"
                />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.cvcTechnique || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { cvcTechnique: e.target.value } })}
                  data-testid="select-cvc-technique"
                >
                  <option value="">Select technique</option>
                  <option value="landmark">Landmark</option>
                  <option value="ultrasound">Ultrasound-guided</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
              <input
                type="checkbox"
                checked={current.isPreExisting || false}
                onChange={(e) => handleUpdate(inst.id, { isPreExisting: e.target.checked })}
                className="h-4 w-4"
                data-testid="checkbox-cvc-preexisting"
              />
              <span className="text-sm font-medium">Pre-existing Installation</span>
            </label>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={current.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="textarea-cvc-notes"
              />
            </div>
          </div>
        );
        })}

        {centralInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No CVC documented. Click "Add" to document central venous catheter placement.
          </p>
        )}
      </div>

      {/* Bladder Catheter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Bladder Catheter</Label>
          {bladderInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreate("bladder")}
              disabled={createMutation.isPending}
              data-testid="button-add-bladder"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {bladderInstallations.map((inst) => {
          const current = getCurrentState(inst.id) || inst;
          return (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Bladder Catheter</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDelete(inst.id)}
                disabled={deleteMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.bladderType || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { bladderType: e.target.value } })}
                  data-testid="select-bladder-type"
                >
                  <option value="">Select type</option>
                  <option value="foley">Foley (Transurethral)</option>
                  <option value="suprapubic">Suprapubic</option>
                  <option value="three-way">Three-way Foley</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Size (French/Charrière)</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.bladderSize || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { bladderSize: e.target.value } })}
                  data-testid="select-bladder-size"
                >
                  <option value="">Select size</option>
                  <option value="12">12 Fr</option>
                  <option value="14">14 Fr</option>
                  <option value="16">16 Fr</option>
                  <option value="18">18 Fr</option>
                  <option value="20">20 Fr</option>
                  <option value="22">22 Fr</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
              <input
                type="checkbox"
                checked={current.isPreExisting || false}
                onChange={(e) => handleUpdate(inst.id, { isPreExisting: e.target.checked })}
                className="h-4 w-4"
                data-testid="checkbox-bladder-preexisting"
              />
              <span className="text-sm font-medium">Pre-existing Installation</span>
            </label>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={current.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="textarea-bladder-notes"
              />
            </div>
          </div>
        );
        })}

        {bladderInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No bladder catheter documented. Click "Add" to document bladder catheter placement.
          </p>
        )}
      </div>
    </CardContent>
  );
}

// ============================================================================
// GENERAL ANESTHESIA SECTION
// ============================================================================
export function GeneralAnesthesiaSection({ anesthesiaRecordId }: SectionProps) {
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        No anesthesia record available
      </CardContent>
    );
  }

  const { toast } = useToast();
  const { data: generalTechnique, isLoading: isLoadingGeneral } = useGeneralTechnique(anesthesiaRecordId);
  const { data: airwayManagement, isLoading: isLoadingAirway } = useAirwayManagement(anesthesiaRecordId);
  
  // Auto-save mutations
  const generalAutoSave = useAutoSaveMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', `/api/anesthesia/${anesthesiaRecordId}/general-technique`, data);
    },
    queryKey: [`/api/anesthesia/${anesthesiaRecordId}/general-technique`],
  });

  const airwayAutoSave = useAutoSaveMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', `/api/anesthesia/${anesthesiaRecordId}/airway`, data);
    },
    queryKey: [`/api/anesthesia/${anesthesiaRecordId}/airway`],
  });

  const [approach, setApproach] = useState<string>("");
  const [rsi, setRsi] = useState(false);
  const [airwayDevice, setAirwayDevice] = useState("");
  const [size, setSize] = useState("");
  const [depth, setDepth] = useState("");
  const [cuffPressure, setCuffPressure] = useState("");
  const [intubationPreExisting, setIntubationPreExisting] = useState(false);
  const [airwayNotes, setAirwayNotes] = useState("");
  const [laryngoscopeType, setLaryngoscopeType] = useState("");
  const [laryngoscopeBlade, setLaryngoscopeBlade] = useState("");
  const [intubationAttempts, setIntubationAttempts] = useState("");
  const [difficultAirway, setDifficultAirway] = useState(false);
  const [cormackLehane, setCormackLehane] = useState("");

  useEffect(() => {
    if (generalTechnique) {
      setApproach(generalTechnique.approach || "");
      setRsi(generalTechnique.rsi || false);
    }
  }, [generalTechnique]);

  useEffect(() => {
    if (airwayManagement) {
      setAirwayDevice(airwayManagement.airwayDevice || "");
      setSize(airwayManagement.size || "");
      setDepth(airwayManagement.depth?.toString() || "");
      setCuffPressure(airwayManagement.cuffPressure?.toString() || "");
      setIntubationPreExisting(airwayManagement.intubationPreExisting || false);
      setAirwayNotes(airwayManagement.notes || "");
      setLaryngoscopeType(airwayManagement.laryngoscopeType || "");
      setLaryngoscopeBlade(airwayManagement.laryngoscopeBlade || "");
      setIntubationAttempts(airwayManagement.intubationAttempts?.toString() || "");
      setDifficultAirway(airwayManagement.difficultAirway || false);
      setCormackLehane(airwayManagement.cormackLehane || "");
    }
  }, [airwayManagement]);

  // Helper to build airway save payload with optional overrides
  const buildAirwaySavePayload = (overrides: any = {}) => ({
    airwayDevice: overrides.airwayDevice !== undefined ? overrides.airwayDevice : (airwayDevice || null),
    size: overrides.size !== undefined ? overrides.size : (size || null),
    depth: overrides.depth !== undefined ? overrides.depth : (depth ? parseInt(depth) : null),
    cuffPressure: overrides.cuffPressure !== undefined ? overrides.cuffPressure : (cuffPressure ? parseInt(cuffPressure) : null),
    intubationPreExisting: overrides.intubationPreExisting !== undefined ? overrides.intubationPreExisting : intubationPreExisting,
    notes: overrides.notes !== undefined ? overrides.notes : (airwayNotes || null),
    laryngoscopeType: overrides.laryngoscopeType !== undefined ? overrides.laryngoscopeType : (laryngoscopeType || null),
    laryngoscopeBlade: overrides.laryngoscopeBlade !== undefined ? overrides.laryngoscopeBlade : (laryngoscopeBlade || null),
    intubationAttempts: overrides.intubationAttempts !== undefined ? overrides.intubationAttempts : (intubationAttempts ? parseInt(intubationAttempts) : null),
    difficultAirway: overrides.difficultAirway !== undefined ? overrides.difficultAirway : difficultAirway,
    cormackLehane: overrides.cormackLehane !== undefined ? overrides.cormackLehane : (cormackLehane || null),
  });

  // Check if device requires laryngoscopy documentation
  const isIntubated = ['ett', 'spiral-tube', 'rae-tube', 'dlt-left', 'dlt-right'].includes(airwayDevice);

  if (isLoadingGeneral || isLoadingAirway) {
    return (
      <CardContent className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CardContent>
    );
  }

  return (
    <CardContent className="space-y-6 pt-0">
      {/* Maintenance Type Options */}
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input
              type="radio"
              name="maintenance-type"
              value="tiva"
              checked={approach === "tiva"}
              onChange={(e) => {
                const nextApproach = e.target.value;
                setApproach(nextApproach);
                generalAutoSave.mutate({
                  approach: nextApproach as "tiva" | "tci" | "balanced-gas" | "sedation" | null,
                  rsi,
                  sedationLevel: null,
                  airwaySupport: null,
                  notes: null,
                });
              }}
              className="h-4 w-4"
              data-testid="radio-maintenance-tiva"
            />
            <span className="font-medium">TIVA</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input
              type="radio"
              name="maintenance-type"
              value="tci"
              checked={approach === "tci"}
              onChange={(e) => {
                const nextApproach = e.target.value;
                setApproach(nextApproach);
                generalAutoSave.mutate({
                  approach: nextApproach as "tiva" | "tci" | "balanced-gas" | "sedation" | null,
                  rsi,
                  sedationLevel: null,
                  airwaySupport: null,
                  notes: null,
                });
              }}
              className="h-4 w-4"
              data-testid="radio-maintenance-tci"
            />
            <span className="font-medium">TCI (Target Controlled Infusion)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input
              type="radio"
              name="maintenance-type"
              value="balanced-gas"
              checked={approach === "balanced-gas"}
              onChange={(e) => {
                const nextApproach = e.target.value;
                setApproach(nextApproach);
                generalAutoSave.mutate({
                  approach: nextApproach as "tiva" | "tci" | "balanced-gas" | "sedation" | null,
                  rsi,
                  sedationLevel: null,
                  airwaySupport: null,
                  notes: null,
                });
              }}
              className="h-4 w-4"
              data-testid="radio-maintenance-balanced-gas"
            />
            <span className="font-medium">Balanced/Gas</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input
              type="radio"
              name="maintenance-type"
              value="sedation"
              checked={approach === "sedation"}
              onChange={(e) => {
                const nextApproach = e.target.value;
                setApproach(nextApproach);
                generalAutoSave.mutate({
                  approach: nextApproach as "tiva" | "tci" | "balanced-gas" | "sedation" | null,
                  rsi,
                  sedationLevel: null,
                  airwaySupport: null,
                  notes: null,
                });
              }}
              className="h-4 w-4"
              data-testid="radio-maintenance-sedation"
            />
            <span className="font-medium">Sedation</span>
          </label>
        </div>
        <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
          <input
            type="checkbox"
            checked={rsi}
            onChange={(e) => {
              const nextRsi = e.target.checked;
              setRsi(nextRsi);
              generalAutoSave.mutate({
                approach: approach as "tiva" | "tci" | "balanced-gas" | "sedation" | null,
                rsi: nextRsi,
                sedationLevel: null,
                airwaySupport: null,
                notes: null,
              });
            }}
            className="h-4 w-4"
            data-testid="checkbox-rsi"
          />
          <span className="font-medium">RSI (Rapid Sequence Intubation)</span>
        </label>
      </div>

      {/* Airway Management */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Airway Management</Label>
        <div className="border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Device</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={airwayDevice}
                onChange={(e) => {
                  const nextDevice = e.target.value;
                  setAirwayDevice(nextDevice);
                  airwayAutoSave.mutate(buildAirwaySavePayload({ airwayDevice: nextDevice || null }));
                }}
                data-testid="select-airway-device"
              >
                <option value="">Select device</option>
                <option value="ett">Endotracheal Tube (Straight)</option>
                <option value="spiral-tube">Spiral Tube (Flexometallic)</option>
                <option value="rae-tube">RAE Tube (Right-Angle)</option>
                <option value="dlt-left">Double-Lumen Tube - Left</option>
                <option value="dlt-right">Double-Lumen Tube - Right</option>
                <option value="lma">Laryngeal Mask Airway (Classic)</option>
                <option value="lma-auragain">Laryngeal Mask AuraGain</option>
                <option value="facemask">Face Mask</option>
                <option value="tracheostomy">Tracheostomy</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Size</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={size}
                onChange={(e) => {
                  const nextSize = e.target.value;
                  setSize(nextSize);
                  airwayAutoSave.mutate({
                    airwayDevice: airwayDevice || null,
                    size: nextSize || null,
                    depth: depth ? parseInt(depth) : null,
                    cuffPressure: cuffPressure ? parseInt(cuffPressure) : null,
                    intubationPreExisting,
                    notes: airwayNotes || null,
                  });
                }}
                data-testid="select-airway-size"
              >
                <option value="">Select size</option>
                {/* ETT, Spiral Tube, RAE Tube */}
                {(airwayDevice === 'ett' || airwayDevice === 'spiral-tube' || airwayDevice === 'rae-tube') && (
                  <>
                    <option value="4.0">4.0 mm</option>
                    <option value="4.5">4.5 mm</option>
                    <option value="5.0">5.0 mm</option>
                    <option value="5.5">5.5 mm</option>
                    <option value="6.0">6.0 mm</option>
                    <option value="6.5">6.5 mm</option>
                    <option value="7.0">7.0 mm</option>
                    <option value="7.5">7.5 mm</option>
                    <option value="8.0">8.0 mm</option>
                    <option value="8.5">8.5 mm</option>
                    <option value="9.0">9.0 mm</option>
                    <option value="9.5">9.5 mm</option>
                    <option value="10.0">10.0 mm</option>
                  </>
                )}
                {/* Double-Lumen Tubes */}
                {(airwayDevice === 'dlt-left' || airwayDevice === 'dlt-right') && (
                  <>
                    <option value="35">35 Fr</option>
                    <option value="37">37 Fr</option>
                    <option value="39">39 Fr</option>
                    <option value="41">41 Fr</option>
                  </>
                )}
                {/* LMA or AuraGain */}
                {(airwayDevice === 'lma' || airwayDevice === 'lma-auragain') && (
                  <>
                    <option value="3">Size 3</option>
                    <option value="4">Size 4</option>
                    <option value="5">Size 5</option>
                    <option value="6">Size 6</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Depth (cm at teeth)</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={depth}
                onChange={(e) => {
                  const nextDepth = e.target.value;
                  setDepth(nextDepth);
                  airwayAutoSave.mutate({
                    airwayDevice: airwayDevice || null,
                    size: size || null,
                    depth: nextDepth ? parseInt(nextDepth) : null,
                    cuffPressure: cuffPressure ? parseInt(cuffPressure) : null,
                    intubationPreExisting,
                    notes: airwayNotes || null,
                  });
                }}
                data-testid="select-airway-depth"
              >
                <option value="">Select depth</option>
                <option value="19">19 cm</option>
                <option value="20">20 cm</option>
                <option value="21">21 cm</option>
                <option value="22">22 cm</option>
                <option value="23">23 cm</option>
                <option value="24">24 cm</option>
                <option value="25">25 cm</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Cuff Pressure (cmH₂O)</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={cuffPressure}
                onChange={(e) => {
                  const nextCuffPressure = e.target.value;
                  setCuffPressure(nextCuffPressure);
                  airwayAutoSave.mutate({
                    airwayDevice: airwayDevice || null,
                    size: size || null,
                    depth: depth ? parseInt(depth) : null,
                    cuffPressure: nextCuffPressure ? parseInt(nextCuffPressure) : null,
                    intubationPreExisting,
                    notes: airwayNotes || null,
                  });
                }}
                data-testid="select-airway-cuff"
              >
                <option value="">Select pressure</option>
                <option value="15">15 cmH₂O</option>
                <option value="20">20 cmH₂O (Recommended min)</option>
                <option value="22">22 cmH₂O</option>
                <option value="24">24 cmH₂O</option>
                <option value="25">25 cmH₂O</option>
                <option value="26">26 cmH₂O</option>
                <option value="28">28 cmH₂O</option>
                <option value="30">30 cmH₂O (Recommended max)</option>
              </select>
            </div>
          </div>

          {/* Laryngoscopy Documentation - Only for intubated patients */}
          {isIntubated && (
            <>
              <div className="pt-3 border-t">
                <Label className="text-sm font-semibold mb-3 block">Laryngoscopy Details</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Laryngoscope Type</Label>
                    <select
                      className="w-full border rounded-md p-2 bg-background"
                      value={laryngoscopeType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setLaryngoscopeType(nextType);
                        airwayAutoSave.mutate(buildAirwaySavePayload({ laryngoscopeType: nextType || null }));
                      }}
                      data-testid="select-laryngoscope-type"
                    >
                      <option value="">Select type</option>
                      <option value="macintosh">Macintosh (Curved)</option>
                      <option value="miller">Miller (Straight)</option>
                      <option value="mccoy">McCoy (Articulating)</option>
                      <option value="video">Video Laryngoscope</option>
                      <option value="glidescope">GlideScope</option>
                      <option value="airtraq">Airtraq</option>
                      <option value="cmac">C-MAC</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Blade Size</Label>
                    <select
                      className="w-full border rounded-md p-2 bg-background"
                      value={laryngoscopeBlade}
                      onChange={(e) => {
                        const nextBlade = e.target.value;
                        setLaryngoscopeBlade(nextBlade);
                        airwayAutoSave.mutate(buildAirwaySavePayload({ laryngoscopeBlade: nextBlade || null }));
                      }}
                      data-testid="select-laryngoscope-blade"
                    >
                      <option value="">Select blade</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Intubation Attempts</Label>
                    <select
                      className="w-full border rounded-md p-2 bg-background"
                      value={intubationAttempts}
                      onChange={(e) => {
                        const nextAttempts = e.target.value;
                        setIntubationAttempts(nextAttempts);
                        airwayAutoSave.mutate(buildAirwaySavePayload({ intubationAttempts: nextAttempts ? parseInt(nextAttempts) : null }));
                      }}
                      data-testid="select-intubation-attempts"
                    >
                      <option value="">Select</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4+</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cormack-Lehane Grade</Label>
                    <select
                      className="w-full border rounded-md p-2 bg-background"
                      value={cormackLehane}
                      onChange={(e) => {
                        const nextGrade = e.target.value;
                        setCormackLehane(nextGrade);
                        airwayAutoSave.mutate(buildAirwaySavePayload({ cormackLehane: nextGrade || null }));
                      }}
                      data-testid="select-cormack-lehane"
                    >
                      <option value="">Select grade</option>
                      <option value="I">I - Full view of glottis</option>
                      <option value="IIa">IIa - Partial view of glottis</option>
                      <option value="IIb">IIb - Only arytenoids visible</option>
                      <option value="III">III - Only epiglottis visible</option>
                      <option value="IV">IV - No glottic structures visible</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50 mt-3">
                  <input
                    type="checkbox"
                    checked={difficultAirway}
                    onChange={(e) => {
                      const nextDifficult = e.target.checked;
                      setDifficultAirway(nextDifficult);
                      airwayAutoSave.mutate(buildAirwaySavePayload({ difficultAirway: nextDifficult }));
                    }}
                    className="h-4 w-4"
                    data-testid="checkbox-difficult-airway"
                  />
                  <span className="text-sm font-medium text-destructive">Difficult Airway</span>
                </label>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input
              type="checkbox"
              checked={intubationPreExisting}
              onChange={(e) => {
                const nextPreExisting = e.target.checked;
                setIntubationPreExisting(nextPreExisting);
                airwayAutoSave.mutate({
                  airwayDevice: airwayDevice || null,
                  size: size || null,
                  depth: depth ? parseInt(depth) : null,
                  cuffPressure: cuffPressure ? parseInt(cuffPressure) : null,
                  intubationPreExisting: nextPreExisting,
                  notes: airwayNotes || null,
                });
              }}
              className="h-4 w-4"
              data-testid="checkbox-preexisting-intubation"
            />
            <span className="text-sm font-medium">Pre-existing Intubation</span>
          </label>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              placeholder="Additional notes..."
              value={airwayNotes}
              onChange={(e) => {
                const nextNotes = e.target.value;
                setAirwayNotes(nextNotes);
                airwayAutoSave.mutate({
                  airwayDevice: airwayDevice || null,
                  size: size || null,
                  depth: depth ? parseInt(depth) : null,
                  cuffPressure: cuffPressure ? parseInt(cuffPressure) : null,
                  intubationPreExisting,
                  notes: nextNotes || null,
                });
              }}
              data-testid="textarea-airway-notes"
            />
          </div>
        </div>
      </div>
    </CardContent>
  );
}

// ============================================================================
// NEURAXIAL ANESTHESIA SECTION
// ============================================================================
export function NeuraxialAnesthesiaSection({ anesthesiaRecordId }: SectionProps) {
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        No anesthesia record available
      </CardContent>
    );
  }

  const { toast } = useToast();
  const { data: blocks = [], isLoading } = useNeuraxialBlocks(anesthesiaRecordId);
  const createMutation = useCreateNeuraxialBlock(anesthesiaRecordId);
  const deleteMutation = useDeleteNeuraxialBlock(anesthesiaRecordId);

  // Debug: Log blocks data
  useEffect(() => {
    console.log('[NEURAXIAL] Blocks data changed:', { blocks, count: blocks.length });
  }, [blocks]);

  // Maintain local state for each block to avoid stale data
  const [localBlockState, setLocalBlockState] = useState<Record<string, any>>({});

  // Sync local state from server data
  useEffect(() => {
    const newState: Record<string, any> = {};
    blocks.forEach(block => {
      newState[block.id] = block;
    });
    setLocalBlockState(newState);
  }, [blocks]);

  // Get current block state (local or from server)
  const getCurrentBlockState = useCallback((id: string) => {
    return localBlockState[id] || blocks.find(b => b.id === id);
  }, [localBlockState, blocks]);

  // Auto-save mutation for neuraxial blocks
  const blockAutoSave = useAutoSaveMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest('PATCH', `/api/anesthesia/${anesthesiaRecordId}/neuraxial-blocks/${id}`, data);
    },
    queryKey: [`/api/anesthesia/${anesthesiaRecordId}/neuraxial-blocks`],
  });

  const spinalBlocks = blocks.filter(b => b.blockType === "spinal");
  const epiduralBlocks = blocks.filter(b => b.blockType === "epidural");
  const cseBlocks = blocks.filter(b => b.blockType === "cse");
  const caudalBlocks = blocks.filter(b => b.blockType === "caudal");

  const handleCreate = (blockType: "spinal" | "epidural" | "cse" | "caudal") => {
    createMutation.mutate(
      {
        blockType,
        level: null,
        approach: null,
        needleGauge: null,
        testDose: null,
        attempts: 1,
        sensoryLevel: null,
        catheterPresent: false,
        catheterDepth: null,
        guidanceTechnique: null,
        notes: null,
      },
      {
        onSuccess: () => {
          toast({ title: "Block added successfully" });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add block", variant: "destructive" });
        },
      }
    );
  };

  const handleUpdate = (id: string, updates: any) => {
    const current = getCurrentBlockState(id);
    if (!current) return;
    
    // Compute fresh merged state
    const nextState = { ...current, ...updates };
    
    // Update local state immediately for optimistic UI
    setLocalBlockState(prev => ({ ...prev, [id]: nextState }));
    
    // Trigger auto-save
    blockAutoSave.mutate({ id, data: updates });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Block removed" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to remove block", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <CardContent className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CardContent>
    );
  }

  const renderBlockForm = (block: any, index: number, blockType: string) => {
    const current = getCurrentBlockState(block.id) || block;
    return (
    <Card key={block.id} className="border-2">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium capitalize">{blockType} #{index + 1}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleDelete(block.id)}
            disabled={deleteMutation.isPending}
            data-testid={`button-remove-${blockType}-${index + 1}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Level</Label>
            <Input
              placeholder="e.g., L3-L4"
              value={current.level || ""}
              onChange={(e) => handleUpdate(block.id, { level: e.target.value })}
              data-testid={`input-${blockType}-level-${index + 1}`}
            />
          </div>
          <div className="space-y-2">
            <Label>Needle Gauge</Label>
            <Input
              placeholder="e.g., 25G Pencil Point"
              value={current.needleGauge || ""}
              onChange={(e) => handleUpdate(block.id, { needleGauge: e.target.value })}
              data-testid={`input-${blockType}-needle-${index + 1}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Attempts</Label>
            <Input
              type="number"
              value={current.attempts || 1}
              onChange={(e) => handleUpdate(block.id, { attempts: parseInt(e.target.value) || 1 })}
              data-testid={`input-${blockType}-attempts-${index + 1}`}
            />
          </div>
          <div className="space-y-2">
            <Label>Sensory Level</Label>
            <Input
              placeholder="e.g., T4"
              value={current.sensoryLevel || ""}
              onChange={(e) => handleUpdate(block.id, { sensoryLevel: e.target.value })}
              data-testid={`input-${blockType}-sensory-${index + 1}`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            rows={2}
            placeholder="Additional notes..."
            value={current.notes || ""}
            onChange={(e) => handleUpdate(block.id, { notes: e.target.value })}
            data-testid={`textarea-${blockType}-notes-${index + 1}`}
          />
        </div>
      </CardContent>
    </Card>
  );
  };

  return (
    <CardContent className="space-y-6 pt-0">
      {/* Spinal */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Spinal Anesthesia</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("spinal")}
            disabled={createMutation.isPending}
            data-testid="button-add-spinal"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Spinal
          </Button>
        </div>
        {spinalBlocks.map((block, idx) => renderBlockForm(block, idx, "spinal"))}
        {spinalBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No spinal blocks documented. Click "Add Spinal" to document.
          </p>
        )}
      </div>

      {/* Epidural */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Epidural Anesthesia</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("epidural")}
            disabled={createMutation.isPending}
            data-testid="button-add-epidural"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Epidural
          </Button>
        </div>
        {epiduralBlocks.map((block, idx) => renderBlockForm(block, idx, "epidural"))}
        {epiduralBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No epidural blocks documented. Click "Add Epidural" to document.
          </p>
        )}
      </div>

      {/* CSE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Combined Spinal-Epidural (CSE)</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("cse")}
            disabled={createMutation.isPending}
            data-testid="button-add-cse"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add CSE
          </Button>
        </div>
        {cseBlocks.map((block, idx) => renderBlockForm(block, idx, "cse"))}
        {cseBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No CSE blocks documented. Click "Add CSE" to document.
          </p>
        )}
      </div>

      {/* Caudal */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Caudal Anesthesia</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("caudal")}
            disabled={createMutation.isPending}
            data-testid="button-add-caudal"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Caudal
          </Button>
        </div>
        {caudalBlocks.map((block, idx) => renderBlockForm(block, idx, "caudal"))}
        {caudalBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No caudal blocks documented. Click "Add Caudal" to document.
          </p>
        )}
      </div>
    </CardContent>
  );
}

// ============================================================================
// PERIPHERAL BLOCKS SECTION
// ============================================================================
export function PeripheralBlocksSection({ anesthesiaRecordId }: SectionProps) {
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        No anesthesia record available
      </CardContent>
    );
  }

  const { toast } = useToast();
  const { data: blocks = [], isLoading } = usePeripheralBlocks(anesthesiaRecordId);
  const createMutation = useCreatePeripheralBlock(anesthesiaRecordId);
  const deleteMutation = useDeletePeripheralBlock(anesthesiaRecordId);

  // Debug: Log blocks data
  useEffect(() => {
    console.log('[PERIPHERAL] Blocks data changed:', { blocks, count: blocks.length });
  }, [blocks]);

  // Maintain local state for each block to avoid stale data
  const [localPeripheralState, setLocalPeripheralState] = useState<Record<string, any>>({});

  // Sync local state from server data
  useEffect(() => {
    const newState: Record<string, any> = {};
    blocks.forEach(block => {
      newState[block.id] = block;
    });
    setLocalPeripheralState(newState);
  }, [blocks]);

  // Get current block state (local or from server)
  const getCurrentPeripheralState = useCallback((id: string) => {
    return localPeripheralState[id] || blocks.find(b => b.id === id);
  }, [localPeripheralState, blocks]);

  // Auto-save mutation for peripheral blocks
  const peripheralAutoSave = useAutoSaveMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest('PATCH', `/api/anesthesia/${anesthesiaRecordId}/peripheral-blocks/${id}`, data);
    },
    queryKey: [`/api/anesthesia/${anesthesiaRecordId}/peripheral-blocks`],
  });

  const handleCreate = () => {
    createMutation.mutate(
      {
        blockType: "",
        laterality: null,
        guidanceTechnique: null,
        needleType: null,
        catheterPlaced: false,
        attempts: 1,
        sensoryAssessment: null,
        motorAssessment: null,
        notes: null,
      },
      {
        onSuccess: () => {
          toast({ title: "Block added successfully" });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add block", variant: "destructive" });
        },
      }
    );
  };

  const handleUpdate = (id: string, updates: any) => {
    const current = getCurrentPeripheralState(id);
    if (!current) return;
    
    // Compute fresh merged state
    const nextState = { ...current, ...updates };
    
    // Update local state immediately for optimistic UI
    setLocalPeripheralState(prev => ({ ...prev, [id]: nextState }));
    
    // Trigger auto-save
    peripheralAutoSave.mutate({ id, data: updates });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Block removed" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to remove block", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <CardContent className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CardContent>
    );
  }

  return (
    <CardContent className="space-y-6 pt-0">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Peripheral Nerve Blocks</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          data-testid="button-add-peripheral-block"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Block
        </Button>
      </div>

      {blocks.map((block, index) => {
        const current = getCurrentPeripheralState(block.id) || block;
        return (
        <Card key={block.id} className="border-2">
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Block #{index + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDelete(block.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-remove-block-${index + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Block Type</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.blockType}
                  onChange={(e) => handleUpdate(block.id, { blockType: e.target.value })}
                  data-testid={`select-block-type-${index + 1}`}
                >
                  <option value="">Select block type</option>
                  <optgroup label="Upper Extremity">
                    <option value="interscalene">Interscalene</option>
                    <option value="supraclavicular">Supraclavicular</option>
                    <option value="infraclavicular">Infraclavicular</option>
                    <option value="axillary">Axillary</option>
                    <option value="radial">Radial Nerve</option>
                    <option value="median">Median Nerve</option>
                    <option value="ulnar">Ulnar Nerve</option>
                  </optgroup>
                  <optgroup label="Lower Extremity">
                    <option value="femoral">Femoral</option>
                    <option value="sciatic">Sciatic</option>
                    <option value="popliteal">Popliteal</option>
                    <option value="adductor-canal">Adductor Canal</option>
                    <option value="saphenous">Saphenous</option>
                    <option value="ankle-block">Ankle Block</option>
                  </optgroup>
                  <optgroup label="Truncal">
                    <option value="tap">Transversus Abdominis Plane (TAP)</option>
                    <option value="ql">Quadratus Lumborum (QL)</option>
                    <option value="pecs">Pectoral (PECS)</option>
                    <option value="serratus">Serratus Anterior</option>
                    <option value="erector-spinae">Erector Spinae Plane (ESP)</option>
                    <option value="intercostal">Intercostal</option>
                    <option value="paravertebral">Paravertebral</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="superficial-cervical">Superficial Cervical Plexus</option>
                    <option value="deep-cervical">Deep Cervical Plexus</option>
                    <option value="stellate-ganglion">Stellate Ganglion</option>
                    <option value="other">Other</option>
                  </optgroup>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Laterality</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.laterality || ""}
                  onChange={(e) => handleUpdate(block.id, { laterality: e.target.value })}
                  data-testid={`select-laterality-${index + 1}`}
                >
                  <option value="">Select side</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="bilateral">Bilateral</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Guidance Technique</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.guidanceTechnique || ""}
                  onChange={(e) => handleUpdate(block.id, { guidanceTechnique: e.target.value })}
                  data-testid={`select-guidance-${index + 1}`}
                >
                  <option value="">Select guidance</option>
                  <option value="ultrasound">Ultrasound</option>
                  <option value="nerve-stimulator">Nerve Stimulator</option>
                  <option value="both">Both</option>
                  <option value="landmark">Landmark</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Needle Type</Label>
                <Input
                  placeholder="e.g., 22G 50mm stimulating needle"
                  value={current.needleType || ""}
                  onChange={(e) => handleUpdate(block.id, { needleType: e.target.value })}
                  data-testid={`input-needle-type-${index + 1}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catheter Placed</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.catheterPlaced ? "yes" : "no"}
                  onChange={(e) => handleUpdate(block.id, { catheterPlaced: e.target.value === "yes" })}
                  data-testid={`select-catheter-${index + 1}`}
                >
                  <option value="">Select option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Number of Attempts</Label>
                <Input
                  type="number"
                  value={current.attempts || 1}
                  onChange={(e) => handleUpdate(block.id, { attempts: parseInt(e.target.value) || 1 })}
                  data-testid={`input-attempts-${index + 1}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sensory Block Assessment</Label>
              <Textarea
                rows={2}
                placeholder="e.g., Complete sensory blockade C5-T1"
                value={current.sensoryAssessment || ""}
                onChange={(e) => handleUpdate(block.id, { sensoryAssessment: e.target.value })}
                data-testid={`textarea-sensory-${index + 1}`}
              />
            </div>

            <div className="space-y-2">
              <Label>Motor Block Assessment</Label>
              <Textarea
                rows={2}
                placeholder="e.g., Modified Bromage scale 2"
                value={current.motorAssessment || ""}
                onChange={(e) => handleUpdate(block.id, { motorAssessment: e.target.value })}
                data-testid={`textarea-motor-${index + 1}`}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                placeholder="Additional notes..."
                value={current.notes || ""}
                onChange={(e) => handleUpdate(block.id, { notes: e.target.value })}
                data-testid={`textarea-notes-${index + 1}`}
              />
            </div>
          </CardContent>
        </Card>
      );
      })}

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No peripheral nerve blocks documented. Click "Add Block" to document a block.
        </p>
      )}
    </CardContent>
  );
}

// ============================================================================
// MAIN DOCUMENTATION COMPONENT WITH ACCORDION
// ============================================================================
export default function AnesthesiaDocumentation({ anesthesiaRecordId }: { anesthesiaRecordId: string }) {
  return (
    <Card className="w-full">
      <Accordion type="multiple" defaultValue={["installations", "general", "neuraxial", "peripheral"]} className="w-full">
        <AccordionItem value="installations">
          <AccordionTrigger className="px-6 hover:no-underline">
            <CardTitle className="text-xl">Installations</CardTitle>
          </AccordionTrigger>
          <AccordionContent>
            <InstallationsSection anesthesiaRecordId={anesthesiaRecordId} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="general">
          <AccordionTrigger className="px-6 hover:no-underline">
            <CardTitle className="text-xl">General Anesthesia</CardTitle>
          </AccordionTrigger>
          <AccordionContent>
            <GeneralAnesthesiaSection anesthesiaRecordId={anesthesiaRecordId} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="neuraxial">
          <AccordionTrigger className="px-6 hover:no-underline">
            <CardTitle className="text-xl">Neuraxial Anesthesia</CardTitle>
          </AccordionTrigger>
          <AccordionContent>
            <NeuraxialAnesthesiaSection anesthesiaRecordId={anesthesiaRecordId} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="peripheral">
          <AccordionTrigger className="px-6 hover:no-underline">
            <CardTitle className="text-xl">Peripheral Nerve Blocks</CardTitle>
          </AccordionTrigger>
          <AccordionContent>
            <PeripheralBlocksSection anesthesiaRecordId={anesthesiaRecordId} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
