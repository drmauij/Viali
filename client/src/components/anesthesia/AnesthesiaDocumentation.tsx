import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, X, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface InstallationsSectionProps {
  anesthesiaRecordId: string | undefined;
}

export function InstallationsSection({ anesthesiaRecordId }: InstallationsSectionProps) {
  const { toast } = useToast();

  const { data: installations = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/installations/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/anesthesia/installations", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/installations/${anesthesiaRecordId}`] });
      toast({ title: "Installation added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add installation", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await apiRequest("PATCH", `/api/anesthesia/installations/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/installations/${anesthesiaRecordId}`] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/anesthesia/installations/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/installations/${anesthesiaRecordId}`] });
      toast({ title: "Installation removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove installation", variant: "destructive" });
    },
  });

  const pvAccessInstallations = installations.filter(i => i.type === "peripheral_venous");
  const arterialInstallations = installations.filter(i => i.type === "arterial");
  const cvcInstallations = installations.filter(i => i.type === "central_venous");
  const airwayInstallations = installations.filter(i => i.type === "airway");

  const handleAddInstallation = (type: string) => {
    if (!anesthesiaRecordId) return;
    createMutation.mutate({
      anesthesiaRecordId,
      type,
      location: null,
      gauge: null,
      attempts: 1,
      notes: null,
    });
  };

  const handleUpdateInstallation = (id: string, field: string, value: any) => {
    updateMutation.mutate({ id, [field]: value });
  };

  const handleDeleteInstallation = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <CardContent className="space-y-6 pt-0">
      {/* Peripheral Access */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Peripheral Venous Access</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddInstallation("peripheral_venous")}
            data-testid="button-add-pv-access"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Entry
          </Button>
        </div>

        {pvAccessInstallations.map((inst, index) => (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Entry #{index + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDeleteInstallation(inst.id)}
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
                  onChange={(e) => handleUpdateInstallation(inst.id, "location", e.target.value)}
                  data-testid={`select-pv-location-${index + 1}`}
                >
                  <option value="">Select location</option>
                  <option value="right-hand">Right Hand (Dorsum)</option>
                  <option value="left-hand">Left Hand (Dorsum)</option>
                  <option value="right-forearm">Right Forearm</option>
                  <option value="left-forearm">Left Forearm</option>
                  <option value="right-ac-fossa">Right Antecubital Fossa</option>
                  <option value="left-ac-fossa">Left Antecubital Fossa</option>
                  <option value="right-wrist">Right Wrist</option>
                  <option value="left-wrist">Left Wrist</option>
                  <option value="right-foot">Right Foot</option>
                  <option value="left-foot">Left Foot</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Gauge</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={inst.gauge || ""}
                  onChange={(e) => handleUpdateInstallation(inst.id, "gauge", e.target.value)}
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
                onChange={(e) => handleUpdateInstallation(inst.id, "attempts", parseInt(e.target.value))}
                data-testid={`input-pv-attempts-${index + 1}`}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={inst.notes || ""}
                onChange={(e) => handleUpdateInstallation(inst.id, "notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid={`textarea-pv-notes-${index + 1}`}
              />
            </div>
          </div>
        ))}

        {pvAccessInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No entries yet. Click "Add Entry" to document peripheral venous access.
          </p>
        )}
      </div>

      {/* Arterial Line */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Arterial Line</Label>
          {arterialInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddInstallation("arterial")}
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
                onClick={() => handleDeleteInstallation(inst.id)}
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
                  onChange={(e) => handleUpdateInstallation(inst.id, "location", e.target.value)}
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
                  value={inst.gauge || ""}
                  onChange={(e) => handleUpdateInstallation(inst.id, "gauge", e.target.value)}
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
                  onChange={(e) => handleUpdateInstallation(inst.id, "attempts", parseInt(e.target.value))}
                  data-testid="input-arterial-attempts"
                />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={inst.details?.technique || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, technique: e.target.value })
                  }
                  data-testid="select-arterial-technique"
                >
                  <option value="">Select technique</option>
                  <option value="direct">Direct (Seldinger)</option>
                  <option value="transfixion">Transfixion</option>
                  <option value="ultrasound">Ultrasound-guided</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={inst.notes || ""}
                onChange={(e) => handleUpdateInstallation(inst.id, "notes", e.target.value)}
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

      {/* Central Line */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Central Venous Catheter</Label>
          {cvcInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddInstallation("central_venous")}
              data-testid="button-add-cvc"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {cvcInstallations.map((inst) => (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Central Venous Catheter</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDeleteInstallation(inst.id)}
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
                  onChange={(e) => handleUpdateInstallation(inst.id, "location", e.target.value)}
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
                  value={inst.details?.lumens || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, lumens: e.target.value })
                  }
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
                  value={inst.details?.depth || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, depth: e.target.value })
                  }
                  placeholder="16"
                  data-testid="input-cvc-depth"
                />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={inst.details?.technique || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, technique: e.target.value })
                  }
                  data-testid="select-cvc-technique"
                >
                  <option value="">Select technique</option>
                  <option value="landmark">Landmark</option>
                  <option value="ultrasound">Ultrasound-guided</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={inst.notes || ""}
                onChange={(e) => handleUpdateInstallation(inst.id, "notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid="textarea-cvc-notes"
              />
            </div>
          </div>
        ))}

        {cvcInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No CVC documented. Click "Add" to document central venous catheter placement.
          </p>
        )}
      </div>

      {/* Airway */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Airway Management</Label>
          {airwayInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddInstallation("airway")}
              data-testid="button-add-airway"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {airwayInstallations.map((inst) => (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Airway Management</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleDeleteInstallation(inst.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Device</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={inst.details?.device || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, device: e.target.value })
                  }
                  data-testid="select-airway-device"
                >
                  <option value="">Select device</option>
                  <option value="ett">Endotracheal Tube</option>
                  <option value="lma">Laryngeal Mask Airway</option>
                  <option value="facemask">Face Mask</option>
                  <option value="tracheostomy">Tracheostomy</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Size</Label>
                <Input
                  type="text"
                  value={inst.details?.size || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, size: e.target.value })
                  }
                  placeholder="e.g., 7.5"
                  data-testid="input-airway-size"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Depth (cm at teeth)</Label>
                <Input
                  type="number"
                  value={inst.details?.depth || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, depth: e.target.value })
                  }
                  placeholder="22"
                  data-testid="input-airway-depth"
                />
              </div>
              <div className="space-y-2">
                <Label>Cuff Pressure (cmH₂O)</Label>
                <Input
                  type="number"
                  value={inst.details?.cuffPressure || ""}
                  onChange={(e) =>
                    handleUpdateInstallation(inst.id, "details", { ...inst.details, cuffPressure: e.target.value })
                  }
                  placeholder="20"
                  data-testid="input-airway-cuff"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={inst.notes || ""}
                onChange={(e) => handleUpdateInstallation(inst.id, "notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid="textarea-airway-notes"
              />
            </div>
          </div>
        ))}

        {airwayInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No airway device documented. Click "Add" to document airway management.
          </p>
        )}
      </div>
    </CardContent>
  );
}

interface TechniqueSectionProps {
  anesthesiaRecordId: string | undefined;
  technique: "general" | "sedation" | "regional_spinal" | "regional_epidural" | "regional_peripheral";
  title: string;
}

function TechniqueSection({ anesthesiaRecordId, technique, title }: TechniqueSectionProps) {
  const { toast } = useToast();
  const [localDetails, setLocalDetails] = useState<any>({});

  const { data: techniqueDetails = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/technique-details/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  const detail = techniqueDetails.find((d) => d.technique === technique);

  const upsertMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/anesthesia/technique-details", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/technique-details/${anesthesiaRecordId}`] });
      toast({ title: "Details saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save details", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!anesthesiaRecordId) return;
    upsertMutation.mutate({
      anesthesiaRecordId,
      technique,
      details: localDetails,
    });
  };

  const handleFieldChange = (field: string, value: any) => {
    setLocalDetails((prev: any) => ({ ...prev, [field]: value }));
  };

  // Initialize local details from database
  useEffect(() => {
    if (detail?.details) {
      setLocalDetails(detail.details);
    }
  }, [detail]);

  const renderFields = () => {
    switch (technique) {
      case "general":
        return (
          <>
            <div className="space-y-2">
              <Label>Induction Agent</Label>
              <Input
                value={localDetails.inductionAgent || ""}
                onChange={(e) => handleFieldChange("inductionAgent", e.target.value)}
                placeholder="e.g., Propofol"
                data-testid="input-induction-agent"
              />
            </div>
            <div className="space-y-2">
              <Label>Induction Dose</Label>
              <Input
                value={localDetails.inductionDose || ""}
                onChange={(e) => handleFieldChange("inductionDose", e.target.value)}
                placeholder="e.g., 200mg"
                data-testid="input-induction-dose"
              />
            </div>
            <div className="space-y-2">
              <Label>Muscle Relaxant</Label>
              <Input
                value={localDetails.muscleRelaxant || ""}
                onChange={(e) => handleFieldChange("muscleRelaxant", e.target.value)}
                placeholder="e.g., Rocuronium"
                data-testid="input-muscle-relaxant"
              />
            </div>
            <div className="space-y-2">
              <Label>Relaxant Dose</Label>
              <Input
                value={localDetails.relaxantDose || ""}
                onChange={(e) => handleFieldChange("relaxantDose", e.target.value)}
                placeholder="e.g., 50mg"
                data-testid="input-relaxant-dose"
              />
            </div>
            <div className="space-y-2">
              <Label>Maintenance Technique</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={localDetails.maintenanceTechnique || ""}
                onChange={(e) => handleFieldChange("maintenanceTechnique", e.target.value)}
                data-testid="select-maintenance-technique"
              >
                <option value="">Select technique</option>
                <option value="inhalational">Inhalational</option>
                <option value="tiva">TIVA (Total Intravenous Anesthesia)</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Volatile Agent (if applicable)</Label>
              <Input
                value={localDetails.volatileAgent || ""}
                onChange={(e) => handleFieldChange("volatileAgent", e.target.value)}
                placeholder="e.g., Sevoflurane"
                data-testid="input-volatile-agent"
              />
            </div>
            <div className="space-y-2">
              <Label>Reversal Agent</Label>
              <Input
                value={localDetails.reversalAgent || ""}
                onChange={(e) => handleFieldChange("reversalAgent", e.target.value)}
                placeholder="e.g., Sugammadex"
                data-testid="input-reversal-agent"
              />
            </div>
            <div className="space-y-2">
              <Label>Reversal Dose</Label>
              <Input
                value={localDetails.reversalDose || ""}
                onChange={(e) => handleFieldChange("reversalDose", e.target.value)}
                placeholder="e.g., 200mg"
                data-testid="input-reversal-dose"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={localDetails.notes || ""}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid="textarea-general-notes"
              />
            </div>
          </>
        );

      case "sedation":
        return (
          <>
            <div className="space-y-2">
              <Label>Sedation Level</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={localDetails.sedationLevel || ""}
                onChange={(e) => handleFieldChange("sedationLevel", e.target.value)}
                data-testid="select-sedation-level"
              >
                <option value="">Select level</option>
                <option value="minimal">Minimal (Anxiolysis)</option>
                <option value="moderate">Moderate (Conscious Sedation)</option>
                <option value="deep">Deep Sedation</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Primary Agent</Label>
              <Input
                value={localDetails.primaryAgent || ""}
                onChange={(e) => handleFieldChange("primaryAgent", e.target.value)}
                placeholder="e.g., Midazolam"
                data-testid="input-sedation-agent"
              />
            </div>
            <div className="space-y-2">
              <Label>Primary Agent Dose</Label>
              <Input
                value={localDetails.primaryAgentDose || ""}
                onChange={(e) => handleFieldChange("primaryAgentDose", e.target.value)}
                placeholder="e.g., 3mg"
                data-testid="input-sedation-dose"
              />
            </div>
            <div className="space-y-2">
              <Label>Analgesic Agent</Label>
              <Input
                value={localDetails.analgesicAgent || ""}
                onChange={(e) => handleFieldChange("analgesicAgent", e.target.value)}
                placeholder="e.g., Fentanyl"
                data-testid="input-analgesic-agent"
              />
            </div>
            <div className="space-y-2">
              <Label>Analgesic Dose</Label>
              <Input
                value={localDetails.analgesicDose || ""}
                onChange={(e) => handleFieldChange("analgesicDose", e.target.value)}
                placeholder="e.g., 100μg"
                data-testid="input-analgesic-dose"
              />
            </div>
            <div className="space-y-2">
              <Label>Monitoring</Label>
              <Textarea
                rows={2}
                value={localDetails.monitoring || ""}
                onChange={(e) => handleFieldChange("monitoring", e.target.value)}
                placeholder="e.g., Continuous pulse oximetry, capnography"
                data-testid="textarea-sedation-monitoring"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={localDetails.notes || ""}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid="textarea-sedation-notes"
              />
            </div>
          </>
        );

      case "regional_spinal":
        return (
          <>
            <div className="space-y-2">
              <Label>Level (Interspace)</Label>
              <Input
                value={localDetails.level || ""}
                onChange={(e) => handleFieldChange("level", e.target.value)}
                placeholder="e.g., L3-L4"
                data-testid="input-spinal-level"
              />
            </div>
            <div className="space-y-2">
              <Label>Approach</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={localDetails.approach || ""}
                onChange={(e) => handleFieldChange("approach", e.target.value)}
                data-testid="select-spinal-approach"
              >
                <option value="">Select approach</option>
                <option value="midline">Midline</option>
                <option value="paramedian">Paramedian</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Needle Gauge</Label>
              <Input
                value={localDetails.needleGauge || ""}
                onChange={(e) => handleFieldChange("needleGauge", e.target.value)}
                placeholder="e.g., 25G"
                data-testid="input-spinal-gauge"
              />
            </div>
            <div className="space-y-2">
              <Label>Local Anesthetic</Label>
              <Input
                value={localDetails.localAnesthetic || ""}
                onChange={(e) => handleFieldChange("localAnesthetic", e.target.value)}
                placeholder="e.g., Bupivacaine 0.5% hyperbaric"
                data-testid="input-spinal-anesthetic"
              />
            </div>
            <div className="space-y-2">
              <Label>Dose (mg)</Label>
              <Input
                value={localDetails.dose || ""}
                onChange={(e) => handleFieldChange("dose", e.target.value)}
                placeholder="e.g., 15mg"
                data-testid="input-spinal-dose"
              />
            </div>
            <div className="space-y-2">
              <Label>Adjuvants</Label>
              <Input
                value={localDetails.adjuvants || ""}
                onChange={(e) => handleFieldChange("adjuvants", e.target.value)}
                placeholder="e.g., Fentanyl 25μg, Morphine 0.1mg"
                data-testid="input-spinal-adjuvants"
              />
            </div>
            <div className="space-y-2">
              <Label>Number of Attempts</Label>
              <Input
                type="number"
                value={localDetails.attempts || 1}
                onChange={(e) => handleFieldChange("attempts", parseInt(e.target.value))}
                data-testid="input-spinal-attempts"
              />
            </div>
            <div className="space-y-2">
              <Label>Sensory Level Achieved</Label>
              <Input
                value={localDetails.sensoryLevel || ""}
                onChange={(e) => handleFieldChange("sensoryLevel", e.target.value)}
                placeholder="e.g., T4"
                data-testid="input-spinal-sensory"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={localDetails.notes || ""}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid="textarea-spinal-notes"
              />
            </div>
          </>
        );

      case "regional_epidural":
        return (
          <>
            <div className="space-y-2">
              <Label>Level (Interspace)</Label>
              <Input
                value={localDetails.level || ""}
                onChange={(e) => handleFieldChange("level", e.target.value)}
                placeholder="e.g., L2-L3"
                data-testid="input-epidural-level"
              />
            </div>
            <div className="space-y-2">
              <Label>Approach</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={localDetails.approach || ""}
                onChange={(e) => handleFieldChange("approach", e.target.value)}
                data-testid="select-epidural-approach"
              >
                <option value="">Select approach</option>
                <option value="midline">Midline</option>
                <option value="paramedian">Paramedian</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Needle Gauge</Label>
              <Input
                value={localDetails.needleGauge || ""}
                onChange={(e) => handleFieldChange("needleGauge", e.target.value)}
                placeholder="e.g., 18G Tuohy"
                data-testid="input-epidural-gauge"
              />
            </div>
            <div className="space-y-2">
              <Label>Catheter Depth (cm)</Label>
              <Input
                value={localDetails.catheterDepth || ""}
                onChange={(e) => handleFieldChange("catheterDepth", e.target.value)}
                placeholder="e.g., 10cm at skin"
                data-testid="input-epidural-depth"
              />
            </div>
            <div className="space-y-2">
              <Label>Test Dose</Label>
              <Input
                value={localDetails.testDose || ""}
                onChange={(e) => handleFieldChange("testDose", e.target.value)}
                placeholder="e.g., Lidocaine 3ml with epinephrine"
                data-testid="input-epidural-test-dose"
              />
            </div>
            <div className="space-y-2">
              <Label>Loading Dose</Label>
              <Input
                value={localDetails.loadingDose || ""}
                onChange={(e) => handleFieldChange("loadingDose", e.target.value)}
                placeholder="e.g., Bupivacaine 0.25% 12ml"
                data-testid="input-epidural-loading"
              />
            </div>
            <div className="space-y-2">
              <Label>Infusion Rate</Label>
              <Input
                value={localDetails.infusionRate || ""}
                onChange={(e) => handleFieldChange("infusionRate", e.target.value)}
                placeholder="e.g., 8ml/h"
                data-testid="input-epidural-rate"
              />
            </div>
            <div className="space-y-2">
              <Label>Number of Attempts</Label>
              <Input
                type="number"
                value={localDetails.attempts || 1}
                onChange={(e) => handleFieldChange("attempts", parseInt(e.target.value))}
                data-testid="input-epidural-attempts"
              />
            </div>
            <div className="space-y-2">
              <Label>Sensory Level Achieved</Label>
              <Input
                value={localDetails.sensoryLevel || ""}
                onChange={(e) => handleFieldChange("sensoryLevel", e.target.value)}
                placeholder="e.g., T8"
                data-testid="input-epidural-sensory"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={localDetails.notes || ""}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid="textarea-epidural-notes"
              />
            </div>
          </>
        );

      case "regional_peripheral":
        return (
          <>
            <div className="space-y-2">
              <Label>Block Type</Label>
              <Input
                value={localDetails.blockType || ""}
                onChange={(e) => handleFieldChange("blockType", e.target.value)}
                placeholder="e.g., Interscalene, Femoral, Popliteal"
                data-testid="input-peripheral-type"
              />
            </div>
            <div className="space-y-2">
              <Label>Laterality</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={localDetails.laterality || ""}
                onChange={(e) => handleFieldChange("laterality", e.target.value)}
                data-testid="select-peripheral-laterality"
              >
                <option value="">Select side</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="bilateral">Bilateral</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Guidance Technique</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={localDetails.guidanceTechnique || ""}
                onChange={(e) => handleFieldChange("guidanceTechnique", e.target.value)}
                data-testid="select-peripheral-guidance"
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
                value={localDetails.needleType || ""}
                onChange={(e) => handleFieldChange("needleType", e.target.value)}
                placeholder="e.g., 22G 50mm stimulating needle"
                data-testid="input-peripheral-needle"
              />
            </div>
            <div className="space-y-2">
              <Label>Local Anesthetic</Label>
              <Input
                value={localDetails.localAnesthetic || ""}
                onChange={(e) => handleFieldChange("localAnesthetic", e.target.value)}
                placeholder="e.g., Ropivacaine 0.5%"
                data-testid="input-peripheral-anesthetic"
              />
            </div>
            <div className="space-y-2">
              <Label>Volume (ml)</Label>
              <Input
                value={localDetails.volume || ""}
                onChange={(e) => handleFieldChange("volume", e.target.value)}
                placeholder="e.g., 30ml"
                data-testid="input-peripheral-volume"
              />
            </div>
            <div className="space-y-2">
              <Label>Adjuvants</Label>
              <Input
                value={localDetails.adjuvants || ""}
                onChange={(e) => handleFieldChange("adjuvants", e.target.value)}
                placeholder="e.g., Dexamethasone 4mg"
                data-testid="input-peripheral-adjuvants"
              />
            </div>
            <div className="space-y-2">
              <Label>Catheter Placed</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={localDetails.catheterPlaced || ""}
                onChange={(e) => handleFieldChange("catheterPlaced", e.target.value)}
                data-testid="select-peripheral-catheter"
              >
                <option value="">Select option</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            {localDetails.catheterPlaced === "yes" && (
              <div className="space-y-2">
                <Label>Catheter Infusion Details</Label>
                <Input
                  value={localDetails.catheterInfusion || ""}
                  onChange={(e) => handleFieldChange("catheterInfusion", e.target.value)}
                  placeholder="e.g., Ropivacaine 0.2% at 8ml/h"
                  data-testid="input-peripheral-infusion"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Number of Attempts</Label>
              <Input
                type="number"
                value={localDetails.attempts || 1}
                onChange={(e) => handleFieldChange("attempts", parseInt(e.target.value))}
                data-testid="input-peripheral-attempts"
              />
            </div>
            <div className="space-y-2">
              <Label>Sensory Block Assessment</Label>
              <Textarea
                rows={2}
                value={localDetails.sensoryAssessment || ""}
                onChange={(e) => handleFieldChange("sensoryAssessment", e.target.value)}
                placeholder="e.g., Complete sensory blockade C5-T1"
                data-testid="textarea-peripheral-sensory"
              />
            </div>
            <div className="space-y-2">
              <Label>Motor Block Assessment</Label>
              <Textarea
                rows={2}
                value={localDetails.motorAssessment || ""}
                onChange={(e) => handleFieldChange("motorAssessment", e.target.value)}
                placeholder="e.g., Modified Bromage scale 2"
                data-testid="textarea-peripheral-motor"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={localDetails.notes || ""}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Additional notes..."
                data-testid="textarea-peripheral-notes"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <CardContent className="space-y-4 pt-0">
      {renderFields()}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleSave}
          disabled={upsertMutation.isPending}
          data-testid={`button-save-${technique}`}
        >
          {upsertMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Details"
          )}
        </Button>
      </div>
    </CardContent>
  );
}

export function GeneralAnesthesiaSection({ anesthesiaRecordId }: { anesthesiaRecordId: string | undefined }) {
  return <TechniqueSection anesthesiaRecordId={anesthesiaRecordId} technique="general" title="General Anesthesia" />;
}

export function SedationSection({ anesthesiaRecordId }: { anesthesiaRecordId: string | undefined }) {
  return <TechniqueSection anesthesiaRecordId={anesthesiaRecordId} technique="sedation" title="Sedation" />;
}

export function RegionalAnesthesiaSection({ anesthesiaRecordId }: { anesthesiaRecordId: string | undefined }) {
  return (
    <CardContent className="space-y-6 pt-0">
      <Accordion type="multiple" className="space-y-4">
        <AccordionItem value="spinal">
          <Card>
            <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid="accordion-spinal">
              <span className="text-base font-semibold">Spinal Anesthesia</span>
            </AccordionTrigger>
            <AccordionContent>
              <TechniqueSection anesthesiaRecordId={anesthesiaRecordId} technique="regional_spinal" title="Spinal" />
            </AccordionContent>
          </Card>
        </AccordionItem>

        <AccordionItem value="epidural">
          <Card>
            <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid="accordion-epidural">
              <span className="text-base font-semibold">Epidural Anesthesia</span>
            </AccordionTrigger>
            <AccordionContent>
              <TechniqueSection
                anesthesiaRecordId={anesthesiaRecordId}
                technique="regional_epidural"
                title="Epidural"
              />
            </AccordionContent>
          </Card>
        </AccordionItem>

        <AccordionItem value="peripheral">
          <Card>
            <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid="accordion-peripheral">
              <span className="text-base font-semibold">Peripheral Nerve Block</span>
            </AccordionTrigger>
            <AccordionContent>
              <TechniqueSection
                anesthesiaRecordId={anesthesiaRecordId}
                technique="regional_peripheral"
                title="Peripheral"
              />
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>
    </CardContent>
  );
}
