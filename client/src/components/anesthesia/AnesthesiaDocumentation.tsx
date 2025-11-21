import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Download, Printer, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useInstallations,
  useCreateInstallation,
  useUpdateInstallation,
  useDeleteInstallation,
  useGeneralTechnique,
  useUpsertGeneralTechnique,
  useDeleteGeneralTechnique,
  useAirwayManagement,
  useUpsertAirwayManagement,
  useDeleteAirwayManagement,
  useNeuraxialBlocks,
  useCreateNeuraxialBlock,
  useUpdateNeuraxialBlock,
  useDeleteNeuraxialBlock,
  usePeripheralBlocks,
  useCreatePeripheralBlock,
  useUpdatePeripheralBlock,
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
  const { toast } = useToast();
  const { data: installations = [], isLoading } = useInstallations(anesthesiaRecordId);
  const createMutation = useCreateInstallation(anesthesiaRecordId);
  const updateMutation = useUpdateInstallation(anesthesiaRecordId);
  const deleteMutation = useDeleteInstallation(anesthesiaRecordId);

  const peripheralInstallations = installations.filter(i => i.category === "peripheral");
  const arterialInstallations = installations.filter(i => i.category === "arterial");
  const centralInstallations = installations.filter(i => i.category === "central");
  const bladderInstallations = installations.filter(i => i.category === "bladder");

  const handleCreate = (category: "peripheral" | "arterial" | "central" | "bladder") => {
    createMutation.mutate(
      { anesthesiaRecordId, category, attempts: 1, notes: null, location: null, isPreExisting: false, metadata: {} },
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

  const handleUpdate = (id: string, data: Partial<InsertAnesthesiaInstallation>) => {
    updateMutation.mutate({ id, data });
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

        {peripheralInstallations.map((inst, index) => (
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
                  value={inst.location || ""}
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
                  value={inst.metadata?.gauge || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, gauge: e.target.value } })}
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
                value={inst.attempts || 1}
                onChange={(e) => handleUpdate(inst.id, { attempts: parseInt(e.target.value) || 1 })}
                data-testid={`input-pv-attempts-${index + 1}`}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
              <input
                type="checkbox"
                checked={inst.isPreExisting || false}
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
                value={inst.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid={`textarea-pv-notes-${index + 1}`}
              />
            </div>
          </div>
        ))}
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

        {arterialInstallations.map((inst) => (
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
                  value={inst.location || ""}
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
                  value={inst.metadata?.gauge || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, gauge: e.target.value } })}
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
                  value={inst.attempts || 1}
                  onChange={(e) => handleUpdate(inst.id, { attempts: parseInt(e.target.value) || 1 })}
                  data-testid="input-arterial-attempts"
                />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={inst.metadata?.technique || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, technique: e.target.value } })}
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
                checked={inst.isPreExisting || false}
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
                value={inst.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="textarea-arterial-notes"
              />
            </div>
          </div>
        ))}

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

        {centralInstallations.map((inst) => (
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
                  value={inst.location || ""}
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
                  value={inst.metadata?.lumens || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, lumens: parseInt(e.target.value) || undefined } })}
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
                  value={inst.metadata?.depth || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, depth: parseInt(e.target.value) || undefined } })}
                  data-testid="input-cvc-depth"
                />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={inst.metadata?.cvcTechnique || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, cvcTechnique: e.target.value } })}
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
                checked={inst.isPreExisting || false}
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
                value={inst.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="textarea-cvc-notes"
              />
            </div>
          </div>
        ))}

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

        {bladderInstallations.map((inst) => (
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
                  value={inst.metadata?.bladderType || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, bladderType: e.target.value } })}
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
                  value={inst.metadata?.bladderSize || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { ...inst.metadata, bladderSize: e.target.value } })}
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
                checked={inst.isPreExisting || false}
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
                value={inst.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder="Additional notes..."
                data-testid="textarea-bladder-notes"
              />
            </div>
          </div>
        ))}

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
  const { toast } = useToast();
  const { data: generalTechnique, isLoading: isLoadingGeneral } = useGeneralTechnique(anesthesiaRecordId);
  const { data: airwayManagement, isLoading: isLoadingAirway } = useAirwayManagement(anesthesiaRecordId);
  const upsertGeneralMutation = useUpsertGeneralTechnique(anesthesiaRecordId);
  const upsertAirwayMutation = useUpsertAirwayManagement(anesthesiaRecordId);

  const [approach, setApproach] = useState<string>("");
  const [rsi, setRsi] = useState(false);
  const [airwayDevice, setAirwayDevice] = useState("");
  const [size, setSize] = useState("");
  const [depth, setDepth] = useState("");
  const [cuffPressure, setCuffPressure] = useState("");
  const [intubationPreExisting, setIntubationPreExisting] = useState(false);
  const [airwayNotes, setAirwayNotes] = useState("");

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
    }
  }, [airwayManagement]);

  const handleSaveGeneral = () => {
    upsertGeneralMutation.mutate(
      {
        anesthesiaRecordId,
        approach: approach as "tiva" | "tci" | "balanced-gas" | "sedation" | null,
        rsi,
        sedationLevel: null,
        airwaySupport: null,
        notes: null,
      },
      {
        onSuccess: () => {
          toast({ title: "General technique saved" });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save general technique", variant: "destructive" });
        },
      }
    );
  };

  const handleSaveAirway = () => {
    upsertAirwayMutation.mutate(
      {
        anesthesiaRecordId,
        airwayDevice: airwayDevice || null,
        size: size || null,
        depth: depth ? parseInt(depth) : null,
        cuffPressure: cuffPressure ? parseInt(cuffPressure) : null,
        intubationPreExisting,
        notes: airwayNotes || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Airway management saved" });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save airway management", variant: "destructive" });
        },
      }
    );
  };

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
              onChange={(e) => setApproach(e.target.value)}
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
              onChange={(e) => setApproach(e.target.value)}
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
              onChange={(e) => setApproach(e.target.value)}
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
              onChange={(e) => setApproach(e.target.value)}
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
            onChange={(e) => setRsi(e.target.checked)}
            className="h-4 w-4"
            data-testid="checkbox-rsi"
          />
          <span className="font-medium">RSI (Rapid Sequence Intubation)</span>
        </label>
        <Button onClick={handleSaveGeneral} disabled={upsertGeneralMutation.isPending} size="sm">
          {upsertGeneralMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save General Technique
        </Button>
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
                onChange={(e) => setAirwayDevice(e.target.value)}
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
              <Input
                type="text"
                placeholder="e.g., 7.5"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                data-testid="input-airway-size"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Depth (cm at teeth)</Label>
              <Input
                type="number"
                placeholder="22"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                data-testid="input-airway-depth"
              />
            </div>
            <div className="space-y-2">
              <Label>Cuff Pressure (cmH₂O)</Label>
              <Input
                type="number"
                placeholder="20"
                value={cuffPressure}
                onChange={(e) => setCuffPressure(e.target.value)}
                data-testid="input-airway-cuff"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input
              type="checkbox"
              checked={intubationPreExisting}
              onChange={(e) => setIntubationPreExisting(e.target.checked)}
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
              onChange={(e) => setAirwayNotes(e.target.value)}
              data-testid="textarea-airway-notes"
            />
          </div>
          <Button onClick={handleSaveAirway} disabled={upsertAirwayMutation.isPending} size="sm">
            {upsertAirwayMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Airway Management
          </Button>
        </div>
      </div>
    </CardContent>
  );
}

// ============================================================================
// NEURAXIAL ANESTHESIA SECTION
// ============================================================================
export function NeuraxialAnesthesiaSection({ anesthesiaRecordId }: SectionProps) {
  const { toast } = useToast();
  const { data: blocks = [], isLoading } = useNeuraxialBlocks(anesthesiaRecordId);
  const createMutation = useCreateNeuraxialBlock(anesthesiaRecordId);
  const updateMutation = useUpdateNeuraxialBlock(anesthesiaRecordId);
  const deleteMutation = useDeleteNeuraxialBlock(anesthesiaRecordId);

  const spinalBlocks = blocks.filter(b => b.blockType === "spinal");
  const epiduralBlocks = blocks.filter(b => b.blockType === "epidural");
  const cseBlocks = blocks.filter(b => b.blockType === "cse");
  const caudalBlocks = blocks.filter(b => b.blockType === "caudal");

  const handleCreate = (blockType: "spinal" | "epidural" | "cse" | "caudal") => {
    createMutation.mutate(
      {
        anesthesiaRecordId,
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

  const handleUpdate = (id: string, data: any) => {
    updateMutation.mutate({ id, data });
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

  const renderBlockForm = (block: any, index: number, blockType: string) => (
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
              value={block.level || ""}
              onChange={(e) => handleUpdate(block.id, { level: e.target.value })}
              data-testid={`input-${blockType}-level-${index + 1}`}
            />
          </div>
          <div className="space-y-2">
            <Label>Needle Gauge</Label>
            <Input
              placeholder="e.g., 25G Pencil Point"
              value={block.needleGauge || ""}
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
              value={block.attempts || 1}
              onChange={(e) => handleUpdate(block.id, { attempts: parseInt(e.target.value) || 1 })}
              data-testid={`input-${blockType}-attempts-${index + 1}`}
            />
          </div>
          <div className="space-y-2">
            <Label>Sensory Level</Label>
            <Input
              placeholder="e.g., T4"
              value={block.sensoryLevel || ""}
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
            value={block.notes || ""}
            onChange={(e) => handleUpdate(block.id, { notes: e.target.value })}
            data-testid={`textarea-${blockType}-notes-${index + 1}`}
          />
        </div>
      </CardContent>
    </Card>
  );

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
  const { toast } = useToast();
  const { data: blocks = [], isLoading } = usePeripheralBlocks(anesthesiaRecordId);
  const createMutation = useCreatePeripheralBlock(anesthesiaRecordId);
  const updateMutation = useUpdatePeripheralBlock(anesthesiaRecordId);
  const deleteMutation = useDeletePeripheralBlock(anesthesiaRecordId);

  const handleCreate = () => {
    createMutation.mutate(
      {
        anesthesiaRecordId,
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

  const handleUpdate = (id: string, data: any) => {
    updateMutation.mutate({ id, data });
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

      {blocks.map((block, index) => (
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
                  value={block.blockType}
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
                  value={block.laterality || ""}
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
                  value={block.guidanceTechnique || ""}
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
                  value={block.needleType || ""}
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
                  value={block.catheterPlaced ? "yes" : "no"}
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
                  value={block.attempts || 1}
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
                value={block.sensoryAssessment || ""}
                onChange={(e) => handleUpdate(block.id, { sensoryAssessment: e.target.value })}
                data-testid={`textarea-sensory-${index + 1}`}
              />
            </div>

            <div className="space-y-2">
              <Label>Motor Block Assessment</Label>
              <Textarea
                rows={2}
                placeholder="e.g., Modified Bromage scale 2"
                value={block.motorAssessment || ""}
                onChange={(e) => handleUpdate(block.id, { motorAssessment: e.target.value })}
                data-testid={`textarea-motor-${index + 1}`}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                placeholder="Additional notes..."
                value={block.notes || ""}
                onChange={(e) => handleUpdate(block.id, { notes: e.target.value })}
                data-testid={`textarea-notes-${index + 1}`}
              />
            </div>
          </CardContent>
        </Card>
      ))}

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
