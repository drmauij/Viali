import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Download, Printer, Loader2, Trash2, Check, Pencil, MessageCircle, User, Mail, Stethoscope } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAutoSaveMutation } from "@/hooks/useAutoSaveMutation";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useInstallations,
  useCreateInstallation,
  useDeleteInstallation,
  useGeneralTechnique,
  useAirwayManagement,
  useDifficultAirwayReport,
  useUpsertDifficultAirwayReport,
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
  const { t } = useTranslation();
  
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        {t('anesthesia.documentation.noRecord')}
      </CardContent>
    );
  }

  const { toast } = useToast();
  const { data: installations = [], isLoading } = useInstallations(anesthesiaRecordId);
  const createMutation = useCreateInstallation(anesthesiaRecordId);
  const deleteMutation = useDeleteInstallation(anesthesiaRecordId);
  
  // Maintain local state for each installation to avoid stale data
  const [localState, setLocalState] = useState<Record<string, any>>({});
  // Track which installations have pending saves (use ref for synchronous access)
  const pendingSavesRef = useRef<Set<string>>(new Set());

  // Sync local state from server data, but preserve installations with pending saves
  useEffect(() => {
    setLocalState(prev => {
      const newState: Record<string, any> = { ...prev };
      installations.forEach(inst => {
        // Only update from server if there's no pending save for this installation
        if (!pendingSavesRef.current.has(inst.id)) {
          newState[inst.id] = inst;
        }
      });
      return newState;
    });
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
          toast({ title: t('anesthesia.documentation.installationAdded') });
        },
        onError: () => {
          toast({ title: t('anesthesia.op.error'), description: t('anesthesia.documentation.installationAddError'), variant: "destructive" });
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
    
    // Mark this installation as having a pending save (synchronously via ref)
    pendingSavesRef.current.add(id);
    
    // Update local state immediately for optimistic UI
    setLocalState(prev => ({ ...prev, [id]: nextState }));
    
    // Trigger auto-save with the merged updates
    installationAutoSave.mutate({ id, data: mergedUpdates });
    
    // Clear pending flag after a delay to allow server sync
    // This ensures the flag is cleared even if the mutation takes a while
    setTimeout(() => {
      pendingSavesRef.current.delete(id);
    }, 3000);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: t('anesthesia.documentation.installationRemoved') });
      },
      onError: () => {
        toast({ title: t('anesthesia.op.error'), description: t('anesthesia.documentation.installationRemoveError'), variant: "destructive" });
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
          <Label className="text-base font-semibold">{t('anesthesia.documentation.peripheralVenousAccess')}</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("peripheral")}
            disabled={createMutation.isPending}
            data-testid="button-add-pv-access"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('anesthesia.documentation.addEntry')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {peripheralInstallations.map((inst, index) => {
            const current = getCurrentState(inst.id) || inst;
            return (
            <div key={inst.id} className="border rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-900 relative">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 absolute top-2 right-2"
                onClick={() => handleDelete(inst.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-remove-pv-${index + 1}`}
              >
                <X className="h-3 w-3" />
              </Button>
              <div className="space-y-1">
                <Label className="text-xs">{t('anesthesia.documentation.location')}</Label>
                <select
                  className="w-full border rounded-md p-1.5 text-sm bg-background"
                  value={current.location || ""}
                  onChange={(e) => handleUpdate(inst.id, { location: e.target.value })}
                  data-testid={`select-pv-location-${index + 1}`}
                >
                  <option value="">{t('anesthesia.documentation.selectLocation')}</option>
                  <option value="right-hand">{t('anesthesia.documentation.peripheralLocations.rightHand')}</option>
                  <option value="left-hand">{t('anesthesia.documentation.peripheralLocations.leftHand')}</option>
                  <option value="right-forearm">{t('anesthesia.documentation.peripheralLocations.rightForearm')}</option>
                  <option value="left-forearm">{t('anesthesia.documentation.peripheralLocations.leftForearm')}</option>
                  <option value="right-ac-fossa">{t('anesthesia.documentation.peripheralLocations.rightAcFossa')}</option>
                  <option value="left-ac-fossa">{t('anesthesia.documentation.peripheralLocations.leftAcFossa')}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('anesthesia.documentation.gauge')}</Label>
                <select
                  className="w-full border rounded-md p-1.5 text-sm bg-background"
                  value={current.metadata?.gauge || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { gauge: e.target.value } })}
                  data-testid={`select-pv-gauge-${index + 1}`}
                >
                  <option value="">{t('anesthesia.documentation.selectGauge')}</option>
                  <option value="14G">{t('anesthesia.documentation.gauges.14g')}</option>
                  <option value="16G">{t('anesthesia.documentation.gauges.16g')}</option>
                  <option value="18G">{t('anesthesia.documentation.gauges.18g')}</option>
                  <option value="20G">{t('anesthesia.documentation.gauges.20g')}</option>
                  <option value="22G">{t('anesthesia.documentation.gauges.22g')}</option>
                  <option value="24G">{t('anesthesia.documentation.gauges.24g')}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer py-1 rounded hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={current.isPreExisting || false}
                  onChange={(e) => handleUpdate(inst.id, { isPreExisting: e.target.checked })}
                  className="h-4 w-4"
                  data-testid={`checkbox-pv-preexisting-${index + 1}`}
                />
                <span className="text-xs font-medium">{t('anesthesia.documentation.preExistingInstallation')}</span>
              </label>
            </div>
          );
          })}
        </div>
      </div>

      {/* Arterial Line */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t('anesthesia.documentation.arterialLine')}</Label>
          {arterialInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreate("arterial")}
              disabled={createMutation.isPending}
              data-testid="button-add-arterial"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('anesthesia.documentation.add')}
            </Button>
          )}
        </div>

        {arterialInstallations.map((inst) => {
          const current = getCurrentState(inst.id) || inst;
          return (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('anesthesia.documentation.arterialLine')}</span>
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
                <Label>{t('anesthesia.documentation.location')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.location || ""}
                  onChange={(e) => handleUpdate(inst.id, { location: e.target.value })}
                  data-testid="select-arterial-location"
                >
                  <option value="">{t('anesthesia.documentation.selectLocation')}</option>
                  <option value="radial-left">{t('anesthesia.documentation.arterialLocations.radialLeft')}</option>
                  <option value="radial-right">{t('anesthesia.documentation.arterialLocations.radialRight')}</option>
                  <option value="femoral-left">{t('anesthesia.documentation.arterialLocations.femoralLeft')}</option>
                  <option value="femoral-right">{t('anesthesia.documentation.arterialLocations.femoralRight')}</option>
                  <option value="brachial">{t('anesthesia.documentation.arterialLocations.brachial')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.gauge')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.gauge || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { gauge: e.target.value } })}
                  data-testid="select-arterial-gauge"
                >
                  <option value="">{t('anesthesia.documentation.selectGauge')}</option>
                  <option value="18G">{t('anesthesia.documentation.gauges.18g')}</option>
                  <option value="20G">{t('anesthesia.documentation.gauges.20g')}</option>
                  <option value="22G">{t('anesthesia.documentation.gauges.22g')}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.numberOfAttempts')}</Label>
                <Input
                  type="number"
                  value={current.attempts || 1}
                  onChange={(e) => handleUpdate(inst.id, { attempts: parseInt(e.target.value) || 1 })}
                  data-testid="input-arterial-attempts"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.technique')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.technique || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { technique: e.target.value } })}
                  data-testid="select-arterial-technique"
                >
                  <option value="">{t('anesthesia.documentation.selectTechnique')}</option>
                  <option value="direct">{t('anesthesia.documentation.techniques.direct')}</option>
                  <option value="transfixion">{t('anesthesia.documentation.techniques.transfixion')}</option>
                  <option value="ultrasound">{t('anesthesia.documentation.techniques.ultrasound')}</option>
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
              <span className="text-sm font-medium">{t('anesthesia.documentation.preExistingInstallation')}</span>
            </label>
            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.notes')}</Label>
              <Textarea
                rows={2}
                value={current.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder={t('anesthesia.documentation.additionalNotes')}
                data-testid="textarea-arterial-notes"
              />
            </div>
          </div>
        );
        })}

        {arterialInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('anesthesia.documentation.noArterialLineDocumented')}
          </p>
        )}
      </div>

      {/* Central Venous Catheter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t('anesthesia.documentation.centralVenousCatheter')}</Label>
          {centralInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreate("central")}
              disabled={createMutation.isPending}
              data-testid="button-add-cvc"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('anesthesia.documentation.add')}
            </Button>
          )}
        </div>

        {centralInstallations.map((inst) => {
          const current = getCurrentState(inst.id) || inst;
          return (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('anesthesia.documentation.centralVenousCatheter')}</span>
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
                <Label>{t('anesthesia.documentation.location')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.location || ""}
                  onChange={(e) => handleUpdate(inst.id, { location: e.target.value })}
                  data-testid="select-cvc-location"
                >
                  <option value="">{t('anesthesia.documentation.selectLocation')}</option>
                  <option value="right-ijv">{t('anesthesia.documentation.centralLocations.rightIjv')}</option>
                  <option value="left-ijv">{t('anesthesia.documentation.centralLocations.leftIjv')}</option>
                  <option value="right-subclavian">{t('anesthesia.documentation.centralLocations.rightSubclavian')}</option>
                  <option value="left-subclavian">{t('anesthesia.documentation.centralLocations.leftSubclavian')}</option>
                  <option value="right-femoral">{t('anesthesia.documentation.centralLocations.rightFemoral')}</option>
                  <option value="left-femoral">{t('anesthesia.documentation.centralLocations.leftFemoral')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.lumens')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.lumens || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { lumens: parseInt(e.target.value) || undefined } })}
                  data-testid="select-cvc-lumens"
                >
                  <option value="">{t('anesthesia.documentation.selectLumens')}</option>
                  <option value="1">{t('anesthesia.documentation.lumensOptions.single')}</option>
                  <option value="2">{t('anesthesia.documentation.lumensOptions.double')}</option>
                  <option value="3">{t('anesthesia.documentation.lumensOptions.triple')}</option>
                  <option value="4">{t('anesthesia.documentation.lumensOptions.quad')}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.depthCm')}</Label>
                <Input
                  type="number"
                  placeholder="16"
                  value={current.metadata?.depth || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { depth: parseInt(e.target.value) || undefined } })}
                  data-testid="input-cvc-depth"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.technique')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.cvcTechnique || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { cvcTechnique: e.target.value } })}
                  data-testid="select-cvc-technique"
                >
                  <option value="">{t('anesthesia.documentation.selectTechnique')}</option>
                  <option value="landmark">{t('anesthesia.documentation.techniques.landmark')}</option>
                  <option value="ultrasound">{t('anesthesia.documentation.techniques.ultrasound')}</option>
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
              <span className="text-sm font-medium">{t('anesthesia.documentation.preExistingInstallation')}</span>
            </label>
            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.notes')}</Label>
              <Textarea
                rows={2}
                value={current.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder={t('anesthesia.documentation.additionalNotes')}
                data-testid="textarea-cvc-notes"
              />
            </div>
          </div>
        );
        })}

        {centralInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('anesthesia.documentation.noCvcDocumented')}
          </p>
        )}
      </div>

      {/* Bladder Catheter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t('anesthesia.documentation.bladderCatheter')}</Label>
          {bladderInstallations.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreate("bladder")}
              disabled={createMutation.isPending}
              data-testid="button-add-bladder"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('anesthesia.documentation.add')}
            </Button>
          )}
        </div>

        {bladderInstallations.map((inst) => {
          const current = getCurrentState(inst.id) || inst;
          return (
          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('anesthesia.documentation.bladderCatheter')}</span>
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
                <Label>{t('anesthesia.documentation.type')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.bladderType || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { bladderType: e.target.value } })}
                  data-testid="select-bladder-type"
                >
                  <option value="">{t('anesthesia.documentation.selectType')}</option>
                  <option value="foley">{t('anesthesia.documentation.bladderTypes.foley')}</option>
                  <option value="suprapubic">{t('anesthesia.documentation.bladderTypes.suprapubic')}</option>
                  <option value="three-way">{t('anesthesia.documentation.bladderTypes.threeWay')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.size')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.metadata?.bladderSize || ""}
                  onChange={(e) => handleUpdate(inst.id, { metadata: { bladderSize: e.target.value } })}
                  data-testid="select-bladder-size"
                >
                  <option value="">{t('anesthesia.documentation.select')}</option>
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
              <span className="text-sm font-medium">{t('anesthesia.documentation.preExistingInstallation')}</span>
            </label>
            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.notes')}</Label>
              <Textarea
                rows={2}
                value={current.notes || ""}
                onChange={(e) => handleUpdate(inst.id, { notes: e.target.value })}
                placeholder={t('anesthesia.documentation.additionalNotes')}
                data-testid="textarea-bladder-notes"
              />
            </div>
          </div>
        );
        })}

        {bladderInstallations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('anesthesia.documentation.noCvcDocumented')}
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
  const { t } = useTranslation();
  
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        {t('anesthesia.documentation.noRecord')}
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

  const handleClearAll = () => {
    // Clear all general technique state
    setApproach("");
    setRsi(false);
    
    // Clear all airway management state
    setAirwayDevice("");
    setSize("");
    setDepth("");
    setCuffPressure("");
    setIntubationPreExisting(false);
    setAirwayNotes("");
    setLaryngoscopeType("");
    setLaryngoscopeBlade("");
    setIntubationAttempts("");
    setDifficultAirway(false);
    setCormackLehane("");
    
    // Save cleared state to database
    generalAutoSave.mutate({
      approach: null,
      rsi: false,
      sedationLevel: null,
      airwaySupport: null,
      notes: null,
    });
    
    airwayAutoSave.mutate({
      airwayDevice: null,
      size: null,
      depth: null,
      cuffPressure: null,
      intubationPreExisting: false,
      notes: null,
      laryngoscopeType: null,
      laryngoscopeBlade: null,
      intubationAttempts: null,
      difficultAirway: false,
      cormackLehane: null,
    });
    
    toast({
      title: t('anesthesia.documentation.cleared'),
      description: t('anesthesia.documentation.generalAnesthesiaCleared'),
    });
  };

  // Check if any data exists
  const hasData = approach || rsi || airwayDevice || size || depth || cuffPressure || 
                  laryngoscopeType || laryngoscopeBlade || intubationAttempts || 
                  difficultAirway || cormackLehane || airwayNotes || intubationPreExisting;

  return (
    <CardContent className="space-y-6 pt-0">
      {/* Clear All Button */}
      {hasData && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="text-destructive hover:text-destructive"
            data-testid="button-clear-general-anesthesia"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('anesthesia.documentation.clearAll')}
          </Button>
        </div>
      )}
      
      {/* Maintenance Type Options */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">{t('anesthesia.documentation.maintenanceType')}</Label>
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
          <span className="font-medium">{t('anesthesia.documentation.rsi')}</span>
        </label>
      </div>

      {/* Airway Management */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">{t('anesthesia.documentation.airwayManagement')}</Label>
        <div className="border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.device')}</Label>
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
                <option value="">{t('anesthesia.documentation.selectDevice')}</option>
                <option value="ett">{t('anesthesia.documentation.airwayDevices.ett')}</option>
                <option value="spiral-tube">{t('anesthesia.documentation.airwayDevices.spiralTube')}</option>
                <option value="rae-tube">{t('anesthesia.documentation.airwayDevices.raeTube')}</option>
                <option value="dlt-left">{t('anesthesia.documentation.airwayDevices.dltLeft')}</option>
                <option value="dlt-right">{t('anesthesia.documentation.airwayDevices.dltRight')}</option>
                <option value="lma">{t('anesthesia.documentation.airwayDevices.lma')}</option>
                <option value="lma-auragain">{t('anesthesia.documentation.airwayDevices.lmaAuragain')}</option>
                <option value="facemask">{t('anesthesia.documentation.airwayDevices.facemask')}</option>
                <option value="tracheostomy">{t('anesthesia.documentation.airwayDevices.tracheostomy')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.size')}</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={size}
                onChange={(e) => {
                  const nextSize = e.target.value;
                  setSize(nextSize);
                  airwayAutoSave.mutate(buildAirwaySavePayload({ size: nextSize || null }));
                }}
                data-testid="select-airway-size"
              >
                <option value="">{t('anesthesia.documentation.selectSize')}</option>
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
              <Label>{t('anesthesia.documentation.depth')}</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={depth}
                onChange={(e) => {
                  const nextDepth = e.target.value;
                  setDepth(nextDepth);
                  airwayAutoSave.mutate(buildAirwaySavePayload({ depth: nextDepth ? parseInt(nextDepth) : null }));
                }}
                data-testid="select-airway-depth"
              >
                <option value="">{t('anesthesia.documentation.selectDepth')}</option>
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
              <Label>{t('anesthesia.documentation.cuffPressure')}</Label>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={cuffPressure}
                onChange={(e) => {
                  const nextCuffPressure = e.target.value;
                  setCuffPressure(nextCuffPressure);
                  airwayAutoSave.mutate(buildAirwaySavePayload({ cuffPressure: nextCuffPressure ? parseInt(nextCuffPressure) : null }));
                }}
                data-testid="select-airway-cuff"
              >
                <option value="">{t('anesthesia.documentation.selectPressure')}</option>
                <option value="15">15 cmH₂O</option>
                <option value="20">20 cmH₂O ({t('anesthesia.documentation.recommendedMin')})</option>
                <option value="22">22 cmH₂O</option>
                <option value="24">24 cmH₂O</option>
                <option value="25">25 cmH₂O</option>
                <option value="26">26 cmH₂O</option>
                <option value="28">28 cmH₂O</option>
                <option value="30">30 cmH₂O ({t('anesthesia.documentation.recommendedMax')})</option>
              </select>
            </div>
          </div>

          {/* Laryngoscopy Documentation - Only for intubated patients */}
          {isIntubated && (
            <>
              <div className="pt-3 border-t">
                <Label className="text-sm font-semibold mb-3 block">{t('anesthesia.documentation.laryngoscopyDetails')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('anesthesia.documentation.laryngoscopeType')}</Label>
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
                      <option value="">{t('anesthesia.documentation.selectType')}</option>
                      <option value="macintosh">{t('anesthesia.documentation.laryngoscopeTypes.macintosh')}</option>
                      <option value="miller">{t('anesthesia.documentation.laryngoscopeTypes.miller')}</option>
                      <option value="mccoy">{t('anesthesia.documentation.laryngoscopeTypes.mccoy')}</option>
                      <option value="video">{t('anesthesia.documentation.laryngoscopeTypes.video')}</option>
                      <option value="glidescope">{t('anesthesia.documentation.laryngoscopeTypes.glidescope')}</option>
                      <option value="airtraq">{t('anesthesia.documentation.laryngoscopeTypes.airtraq')}</option>
                      <option value="cmac">{t('anesthesia.documentation.laryngoscopeTypes.cmac')}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.documentation.bladeSize')}</Label>
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
                      <option value="">{t('anesthesia.documentation.selectBlade')}</option>
                      <option value="1">{t('anesthesia.documentation.laryngoscopeBlades.blade1')}</option>
                      <option value="2">{t('anesthesia.documentation.laryngoscopeBlades.blade2')}</option>
                      <option value="3">{t('anesthesia.documentation.laryngoscopeBlades.blade3')}</option>
                      <option value="4">{t('anesthesia.documentation.laryngoscopeBlades.blade4')}</option>
                      <option value="5">{t('anesthesia.documentation.laryngoscopeBlades.blade5')}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.documentation.intubationAttempts')}</Label>
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
                      <option value="">{t('anesthesia.documentation.selectAttempts')}</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4+</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.documentation.cormackLehane')}</Label>
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
                      <option value="">{t('anesthesia.documentation.selectGrade')}</option>
                      <option value="I">{t('anesthesia.documentation.cormackLehaneGrades.grade1')}</option>
                      <option value="IIa">{t('anesthesia.documentation.cormackLehaneGrades.grade2a')}</option>
                      <option value="IIb">{t('anesthesia.documentation.cormackLehaneGrades.grade2b')}</option>
                      <option value="III">{t('anesthesia.documentation.cormackLehaneGrades.grade3')}</option>
                      <option value="IV">{t('anesthesia.documentation.cormackLehaneGrades.grade4')}</option>
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
                  <span className="text-sm font-medium text-destructive">{t('anesthesia.documentation.difficultAirway')}</span>
                </label>
                
                {difficultAirway && airwayManagement?.id && (
                  <DifficultAirwayDetailsSection airwayManagementId={airwayManagement.id} />
                )}
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
            <span className="text-sm font-medium">{t('anesthesia.documentation.preExistingIntubation')}</span>
          </label>
          <div className="space-y-2">
            <Label>{t('anesthesia.documentation.notes')}</Label>
            <Textarea
              rows={2}
              placeholder={t('anesthesia.documentation.additionalNotes')}
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
  const { t } = useTranslation();
  
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        {t('anesthesia.documentation.noRecord')}
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
          toast({ title: t('anesthesia.documentation.blockAdded') });
        },
        onError: () => {
          toast({ title: t('anesthesia.op.error'), description: t('anesthesia.documentation.blockAddError'), variant: "destructive" });
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
        toast({ title: t('anesthesia.documentation.blockRemoved') });
      },
      onError: () => {
        toast({ title: t('anesthesia.op.error'), description: t('anesthesia.documentation.blockRemoveError'), variant: "destructive" });
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
            <Label>{t('anesthesia.documentation.level')}</Label>
            <Input
              placeholder="e.g., L3-L4"
              value={current.level || ""}
              onChange={(e) => handleUpdate(block.id, { level: e.target.value })}
              data-testid={`input-${blockType}-level-${index + 1}`}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('anesthesia.documentation.needleGauge')}</Label>
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
            <Label>{t('anesthesia.documentation.numberOfAttempts')}</Label>
            <Input
              type="number"
              value={current.attempts || 1}
              onChange={(e) => handleUpdate(block.id, { attempts: parseInt(e.target.value) || 1 })}
              data-testid={`input-${blockType}-attempts-${index + 1}`}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('anesthesia.documentation.sensoryLevel')}</Label>
            <Input
              placeholder="e.g., T4"
              value={current.sensoryLevel || ""}
              onChange={(e) => handleUpdate(block.id, { sensoryLevel: e.target.value })}
              data-testid={`input-${blockType}-sensory-${index + 1}`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('anesthesia.documentation.notes')}</Label>
          <Textarea
            rows={2}
            placeholder={t('anesthesia.documentation.additionalNotes')}
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
          <Label className="text-base font-semibold">{t('anesthesia.documentation.spinal')}</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("spinal")}
            disabled={createMutation.isPending}
            data-testid="button-add-spinal"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('anesthesia.documentation.addSpinal')}
          </Button>
        </div>
        {spinalBlocks.map((block, idx) => renderBlockForm(block, idx, "spinal"))}
        {spinalBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('anesthesia.documentation.noSpinalDocumented')}
          </p>
        )}
      </div>

      {/* Epidural */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t('anesthesia.documentation.epidural')}</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("epidural")}
            disabled={createMutation.isPending}
            data-testid="button-add-epidural"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('anesthesia.documentation.addEpidural')}
          </Button>
        </div>
        {epiduralBlocks.map((block, idx) => renderBlockForm(block, idx, "epidural"))}
        {epiduralBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('anesthesia.documentation.noEpiduralDocumented')}
          </p>
        )}
      </div>

      {/* CSE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t('anesthesia.documentation.cse')}</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("cse")}
            disabled={createMutation.isPending}
            data-testid="button-add-cse"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('anesthesia.documentation.addCse')}
          </Button>
        </div>
        {cseBlocks.map((block, idx) => renderBlockForm(block, idx, "cse"))}
        {cseBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('anesthesia.documentation.noCseDocumented')}
          </p>
        )}
      </div>

      {/* Caudal */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t('anesthesia.documentation.caudal')}</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreate("caudal")}
            disabled={createMutation.isPending}
            data-testid="button-add-caudal"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('anesthesia.documentation.addCaudal')}
          </Button>
        </div>
        {caudalBlocks.map((block, idx) => renderBlockForm(block, idx, "caudal"))}
        {caudalBlocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('anesthesia.documentation.noCaudalDocumented')}
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
  const { t } = useTranslation();
  
  if (!anesthesiaRecordId) {
    return (
      <CardContent className="py-8 text-center text-muted-foreground">
        {t('anesthesia.documentation.noRecord')}
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
          toast({ title: t('anesthesia.documentation.blockAdded') });
        },
        onError: () => {
          toast({ title: t('anesthesia.op.error'), description: t('anesthesia.documentation.blockAddError'), variant: "destructive" });
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
        toast({ title: t('anesthesia.documentation.blockRemoved') });
      },
      onError: () => {
        toast({ title: t('anesthesia.op.error'), description: t('anesthesia.documentation.blockRemoveError'), variant: "destructive" });
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
        <Label className="text-base font-semibold">{t('anesthesia.documentation.peripheralNerveBlocks')}</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          data-testid="button-add-peripheral-block"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('anesthesia.documentation.addBlock')}
        </Button>
      </div>

      {blocks.map((block, index) => {
        const current = getCurrentPeripheralState(block.id) || block;
        return (
        <Card key={block.id} className="border-2">
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('anesthesia.documentation.block')} #{index + 1}</span>
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
                <Label>{t('anesthesia.documentation.blockType')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.blockType}
                  onChange={(e) => handleUpdate(block.id, { blockType: e.target.value })}
                  data-testid={`select-block-type-${index + 1}`}
                >
                  <option value="">{t('anesthesia.documentation.selectBlockType')}</option>
                  <optgroup label={t('anesthesia.documentation.blockTypeGroups.upperExtremity')}>
                    <option value="interscalene">{t('anesthesia.documentation.blockTypes.interscalene')}</option>
                    <option value="supraclavicular">{t('anesthesia.documentation.blockTypes.supraclavicular')}</option>
                    <option value="infraclavicular">{t('anesthesia.documentation.blockTypes.infraclavicular')}</option>
                    <option value="axillary">{t('anesthesia.documentation.blockTypes.axillary')}</option>
                    <option value="radial">{t('anesthesia.documentation.blockTypes.radial')}</option>
                    <option value="median">{t('anesthesia.documentation.blockTypes.median')}</option>
                    <option value="ulnar">{t('anesthesia.documentation.blockTypes.ulnar')}</option>
                  </optgroup>
                  <optgroup label={t('anesthesia.documentation.blockTypeGroups.lowerExtremity')}>
                    <option value="femoral">{t('anesthesia.documentation.blockTypes.femoral')}</option>
                    <option value="sciatic">{t('anesthesia.documentation.blockTypes.sciatic')}</option>
                    <option value="popliteal">{t('anesthesia.documentation.blockTypes.popliteal')}</option>
                    <option value="adductor-canal">{t('anesthesia.documentation.blockTypes.adductorCanal')}</option>
                    <option value="saphenous">{t('anesthesia.documentation.blockTypes.saphenous')}</option>
                    <option value="ankle-block">{t('anesthesia.documentation.blockTypes.ankleBlock')}</option>
                  </optgroup>
                  <optgroup label={t('anesthesia.documentation.blockTypeGroups.truncal')}>
                    <option value="tap">{t('anesthesia.documentation.blockTypes.tap')}</option>
                    <option value="ql">{t('anesthesia.documentation.blockTypes.ql')}</option>
                    <option value="pecs">{t('anesthesia.documentation.blockTypes.pecs')}</option>
                    <option value="serratus">{t('anesthesia.documentation.blockTypes.serratus')}</option>
                    <option value="erector-spinae">{t('anesthesia.documentation.blockTypes.erectorSpinae')}</option>
                    <option value="intercostal">{t('anesthesia.documentation.blockTypes.intercostal')}</option>
                    <option value="paravertebral">{t('anesthesia.documentation.blockTypes.paravertebral')}</option>
                  </optgroup>
                  <optgroup label={t('anesthesia.documentation.blockTypeGroups.other')}>
                    <option value="superficial-cervical">{t('anesthesia.documentation.blockTypes.superficialCervical')}</option>
                    <option value="deep-cervical">{t('anesthesia.documentation.blockTypes.deepCervical')}</option>
                    <option value="stellate-ganglion">{t('anesthesia.documentation.blockTypes.stellateGanglion')}</option>
                    <option value="other">{t('anesthesia.documentation.blockTypes.other')}</option>
                  </optgroup>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.laterality')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.laterality || ""}
                  onChange={(e) => handleUpdate(block.id, { laterality: e.target.value })}
                  data-testid={`select-laterality-${index + 1}`}
                >
                  <option value="">{t('anesthesia.documentation.selectSide')}</option>
                  <option value="left">{t('anesthesia.documentation.lateralityOptions.left')}</option>
                  <option value="right">{t('anesthesia.documentation.lateralityOptions.right')}</option>
                  <option value="bilateral">{t('anesthesia.documentation.lateralityOptions.bilateral')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.guidanceTechnique')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.guidanceTechnique || ""}
                  onChange={(e) => handleUpdate(block.id, { guidanceTechnique: e.target.value })}
                  data-testid={`select-guidance-${index + 1}`}
                >
                  <option value="">{t('anesthesia.documentation.selectGuidance')}</option>
                  <option value="ultrasound">{t('anesthesia.documentation.guidanceOptions.ultrasound')}</option>
                  <option value="nerve-stimulator">{t('anesthesia.documentation.guidanceOptions.nerveStimulator')}</option>
                  <option value="both">{t('anesthesia.documentation.guidanceOptions.both')}</option>
                  <option value="landmark">{t('anesthesia.documentation.guidanceOptions.landmark')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.needleType')}</Label>
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
                <Label>{t('anesthesia.documentation.catheterPlaced')}</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={current.catheterPlaced ? "yes" : "no"}
                  onChange={(e) => handleUpdate(block.id, { catheterPlaced: e.target.value === "yes" })}
                  data-testid={`select-catheter-${index + 1}`}
                >
                  <option value="">{t('anesthesia.documentation.selectOption')}</option>
                  <option value="yes">{t('anesthesia.documentation.yesNo.yes')}</option>
                  <option value="no">{t('anesthesia.documentation.yesNo.no')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('anesthesia.documentation.numberOfAttempts')}</Label>
                <Input
                  type="number"
                  value={current.attempts || 1}
                  onChange={(e) => handleUpdate(block.id, { attempts: parseInt(e.target.value) || 1 })}
                  data-testid={`input-attempts-${index + 1}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.sensoryBlockAssessment')}</Label>
              <Textarea
                rows={2}
                placeholder="e.g., Complete sensory blockade C5-T1"
                value={current.sensoryAssessment || ""}
                onChange={(e) => handleUpdate(block.id, { sensoryAssessment: e.target.value })}
                data-testid={`textarea-sensory-${index + 1}`}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.motorBlockAssessment')}</Label>
              <Textarea
                rows={2}
                placeholder="e.g., Modified Bromage scale 2"
                value={current.motorAssessment || ""}
                onChange={(e) => handleUpdate(block.id, { motorAssessment: e.target.value })}
                data-testid={`textarea-motor-${index + 1}`}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('anesthesia.documentation.notes')}</Label>
              <Textarea
                rows={2}
                placeholder={t('anesthesia.documentation.additionalNotes')}
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
          {t('anesthesia.documentation.noPeripheralBlocksDocumented')}
        </p>
      )}
    </CardContent>
  );
}

// ============================================================================
// DIFFICULT AIRWAY DETAILS SECTION
// ============================================================================
function DifficultAirwayDetailsSection({ airwayManagementId }: { airwayManagementId: string }) {
  const { data: report, isLoading } = useDifficultAirwayReport(airwayManagementId);
  const upsertMutation = useUpsertDifficultAirwayReport(airwayManagementId);

  const [description, setDescription] = useState("");
  const [techniquesAttempted, setTechniquesAttempted] = useState<Array<{ technique: string; outcome: "success" | "failure" | "partial"; notes?: string }>>([]);
  const [finalTechnique, setFinalTechnique] = useState("");
  const [equipmentUsed, setEquipmentUsed] = useState("");
  const [complications, setComplications] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [patientInformed, setPatientInformed] = useState(false);
  const [patientInformedAt, setPatientInformedAt] = useState<string | null>(null);
  const [letterSentToPatient, setLetterSentToPatient] = useState(false);
  const [letterSentAt, setLetterSentAt] = useState<string | null>(null);
  const [gpNotified, setGpNotified] = useState(false);
  const [gpNotifiedAt, setGpNotifiedAt] = useState<string | null>(null);

  useEffect(() => {
    if (report) {
      setDescription(report.description || "");
      setTechniquesAttempted((report.techniquesAttempted as any) || []);
      setFinalTechnique(report.finalTechnique || "");
      setEquipmentUsed(report.equipmentUsed || "");
      setComplications(report.complications || "");
      setRecommendations(report.recommendations || "");
      setPatientInformed(report.patientInformed || false);
      setPatientInformedAt(report.patientInformedAt ? new Date(report.patientInformedAt).toISOString() : null);
      setLetterSentToPatient(report.letterSentToPatient || false);
      setLetterSentAt(report.letterSentAt ? new Date(report.letterSentAt).toISOString() : null);
      setGpNotified(report.gpNotified || false);
      setGpNotifiedAt(report.gpNotifiedAt ? new Date(report.gpNotifiedAt).toISOString() : null);
    }
  }, [report]);

  const reportAutoSave = useAutoSaveMutation({
    mutationFn: async (data: any) => {
      return upsertMutation.mutateAsync(data);
    },
    queryKey: [`/api/airway/${airwayManagementId}/difficult-airway-report`],
  });

  const buildCompletePayload = (overrides: any = {}) => {
    const currentDescription = overrides.description !== undefined ? overrides.description : description;
    const currentTechniques = overrides.techniquesAttempted !== undefined ? overrides.techniquesAttempted : techniquesAttempted;
    const currentFinalTechnique = overrides.finalTechnique !== undefined ? overrides.finalTechnique : finalTechnique;
    
    const hasMinimumData = currentDescription && currentTechniques.length > 0 && currentFinalTechnique;
    
    if (!hasMinimumData) {
      return null;
    }
    
    return {
      description: currentDescription,
      techniquesAttempted: currentTechniques,
      finalTechnique: currentFinalTechnique,
      equipmentUsed: overrides.equipmentUsed !== undefined ? overrides.equipmentUsed : (equipmentUsed || null),
      complications: overrides.complications !== undefined ? overrides.complications : (complications || null),
      recommendations: overrides.recommendations !== undefined ? overrides.recommendations : (recommendations || null),
      patientInformed: overrides.patientInformed !== undefined ? overrides.patientInformed : patientInformed,
      patientInformedAt: overrides.patientInformedAt !== undefined ? overrides.patientInformedAt : patientInformedAt,
      letterSentToPatient: overrides.letterSentToPatient !== undefined ? overrides.letterSentToPatient : letterSentToPatient,
      letterSentAt: overrides.letterSentAt !== undefined ? overrides.letterSentAt : letterSentAt,
      gpNotified: overrides.gpNotified !== undefined ? overrides.gpNotified : gpNotified,
      gpNotifiedAt: overrides.gpNotifiedAt !== undefined ? overrides.gpNotifiedAt : gpNotifiedAt,
    };
  };

  const handleAddTechnique = () => {
    const updated = [...techniquesAttempted, { technique: "", outcome: "failure" as const, notes: "" }];
    setTechniquesAttempted(updated);
    const payload = buildCompletePayload({ techniquesAttempted: updated });
    if (payload) {
      reportAutoSave.mutate(payload);
    }
  };

  const handleRemoveTechnique = (index: number) => {
    if (techniquesAttempted.length <= 1) {
      return;
    }
    const updated = techniquesAttempted.filter((_, i) => i !== index);
    setTechniquesAttempted(updated);
    const payload = buildCompletePayload({ techniquesAttempted: updated });
    if (payload) {
      reportAutoSave.mutate(payload);
    }
  };

  const handleTechniqueChange = (index: number, field: 'technique' | 'outcome' | 'notes', value: string) => {
    const updated = [...techniquesAttempted];
    if (field === 'outcome') {
      updated[index][field] = value as "success" | "failure" | "partial";
    } else {
      updated[index][field] = value;
    }
    setTechniquesAttempted(updated);
    const payload = buildCompletePayload({ techniquesAttempted: updated });
    if (payload) {
      reportAutoSave.mutate(payload);
    }
  };

  if (isLoading) {
    return (
      <div className="mt-4 p-4 border-2 border-destructive/50 rounded-lg bg-destructive/5">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 border-2 border-destructive/50 rounded-lg bg-destructive/5 space-y-4">
      <h4 className="font-semibold text-destructive flex items-center gap-2">
        {t('anesthesia.documentation.difficultAirwayTitle')}
      </h4>

      <div className="space-y-2">
        <Label>{t('anesthesia.documentation.descriptionOfIncident')} <span className="text-destructive">*</span></Label>
        <Textarea
          rows={3}
          placeholder={t('anesthesia.documentation.placeholders.difficultAirwayDescription')}
          value={description}
          onChange={(e) => {
            const value = e.target.value;
            setDescription(value);
            const payload = buildCompletePayload({ description: value });
            if (payload) {
              reportAutoSave.mutate(payload);
            }
          }}
          data-testid="textarea-difficult-airway-description"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t('anesthesia.documentation.techniquesAttempted')}</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAddTechnique}
            data-testid="button-add-technique"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('anesthesia.documentation.addTechnique')}
          </Button>
        </div>
        
        {techniquesAttempted.map((item, index) => (
          <div key={index} className="flex gap-2 items-start p-3 bg-background rounded border">
            <div className="flex-1 space-y-2">
              <Input
                placeholder={t('anesthesia.documentation.placeholders.techniqueExample')}
                value={item.technique}
                onChange={(e) => handleTechniqueChange(index, 'technique', e.target.value)}
                data-testid={`input-technique-${index}`}
              />
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={item.outcome}
                onChange={(e) => handleTechniqueChange(index, 'outcome', e.target.value)}
                data-testid={`select-outcome-${index}`}
              >
                <option value="failure">{t('anesthesia.documentation.outcomeOptions.failure')}</option>
                <option value="partial">{t('anesthesia.documentation.outcomeOptions.partial')}</option>
                <option value="success">{t('anesthesia.documentation.outcomeOptions.success')}</option>
              </select>
              <Input
                placeholder={t('anesthesia.documentation.placeholders.notesOptional')}
                value={item.notes || ""}
                onChange={(e) => handleTechniqueChange(index, 'notes', e.target.value)}
                data-testid={`input-notes-${index}`}
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => handleRemoveTechnique(index)}
              data-testid={`button-remove-technique-${index}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        
        {techniquesAttempted.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            {t('anesthesia.documentation.noTechniquesDocumented')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t('anesthesia.documentation.finalSuccessfulTechnique')} <span className="text-destructive">*</span></Label>
        <Input
          placeholder={t('anesthesia.documentation.placeholders.finalTechnique')}
          value={finalTechnique}
          onChange={(e) => {
            const value = e.target.value;
            setFinalTechnique(value);
            const payload = buildCompletePayload({ finalTechnique: value });
            if (payload) {
              reportAutoSave.mutate(payload);
            }
          }}
          data-testid="input-final-technique"
        />
      </div>

      <div className="space-y-2">
        <Label>{t('anesthesia.documentation.equipmentUsed')}</Label>
        <Textarea
          rows={2}
          placeholder={t('anesthesia.documentation.placeholders.equipmentUsed')}
          value={equipmentUsed}
          onChange={(e) => {
            const value = e.target.value;
            setEquipmentUsed(value);
            const payload = buildCompletePayload({ equipmentUsed: value || null });
            if (payload) {
              reportAutoSave.mutate(payload);
            }
          }}
          data-testid="textarea-equipment-used"
        />
      </div>

      <div className="space-y-2">
        <Label>{t('anesthesia.documentation.complications')}</Label>
        <Textarea
          rows={2}
          placeholder={t('anesthesia.documentation.placeholders.complications')}
          value={complications}
          onChange={(e) => {
            const value = e.target.value;
            setComplications(value);
            const payload = buildCompletePayload({ complications: value || null });
            if (payload) {
              reportAutoSave.mutate(payload);
            }
          }}
          data-testid="textarea-complications"
        />
      </div>

      <div className="space-y-2">
        <Label>{t('anesthesia.documentation.recommendationsFutureAnesthetics')}</Label>
        <Textarea
          rows={3}
          placeholder={t('anesthesia.documentation.placeholders.recommendations')}
          value={recommendations}
          onChange={(e) => {
            const value = e.target.value;
            setRecommendations(value);
            const payload = buildCompletePayload({ recommendations: value || null });
            if (payload) {
              reportAutoSave.mutate(payload);
            }
          }}
          data-testid="textarea-recommendations"
        />
      </div>

      {/* Chat-like Patient Communication Timeline */}
      <div className="pt-3 border-t space-y-3">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          {t('anesthesia.documentation.patientCommunication')}
        </Label>
        
        <div className="space-y-2 pl-2 border-l-2 border-muted ml-2">
          {/* Patient Informed Message */}
          <label 
            className={`relative pl-4 py-2 cursor-pointer rounded-r-lg transition-colors flex items-start justify-between gap-2 ${
              patientInformed ? 'bg-green-50 dark:bg-green-950/30' : 'hover:bg-muted/50'
            }`}
            data-testid="comm-patient-informed"
          >
            <div className="absolute -left-[9px] top-3 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center"
              style={{ backgroundColor: patientInformed ? '#22c55e' : '#d1d5db' }}>
              {patientInformed && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Patient informed about difficult airway</span>
              </div>
              {patientInformedAt && (
                <p className="text-xs text-muted-foreground mt-1 ml-5">
                  {new Date(patientInformedAt).toLocaleString()}
                </p>
              )}
            </div>
            <input
              type="checkbox"
              checked={patientInformed}
              onChange={(e) => {
                const checked = e.target.checked;
                const timestamp = checked ? new Date().toISOString() : null;
                setPatientInformed(checked);
                setPatientInformedAt(timestamp);
                const payload = buildCompletePayload({ 
                  patientInformed: checked,
                  patientInformedAt: timestamp,
                });
                if (payload) {
                  reportAutoSave.mutate(payload);
                }
              }}
              className="h-4 w-4 mt-0.5 accent-green-500"
              data-testid="checkbox-patient-informed"
            />
          </label>

          {/* Letter Sent Message */}
          <label 
            className={`relative pl-4 py-2 cursor-pointer rounded-r-lg transition-colors flex items-start justify-between gap-2 ${
              letterSentToPatient ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/50'
            }`}
            data-testid="comm-letter-sent"
          >
            <div className="absolute -left-[9px] top-3 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center"
              style={{ backgroundColor: letterSentToPatient ? '#3b82f6' : '#d1d5db' }}>
              {letterSentToPatient && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Patient letter sent</span>
              </div>
              {letterSentAt && (
                <p className="text-xs text-muted-foreground mt-1 ml-5">
                  {new Date(letterSentAt).toLocaleString()}
                </p>
              )}
            </div>
            <input
              type="checkbox"
              checked={letterSentToPatient}
              onChange={(e) => {
                const checked = e.target.checked;
                const timestamp = checked ? new Date().toISOString() : null;
                setLetterSentToPatient(checked);
                setLetterSentAt(timestamp);
                const payload = buildCompletePayload({ 
                  letterSentToPatient: checked,
                  letterSentAt: timestamp,
                });
                if (payload) {
                  reportAutoSave.mutate(payload);
                }
              }}
              className="h-4 w-4 mt-0.5 accent-blue-500"
              data-testid="checkbox-letter-sent"
            />
          </label>

          {/* GP Notified Message */}
          <label 
            className={`relative pl-4 py-2 cursor-pointer rounded-r-lg transition-colors flex items-start justify-between gap-2 ${
              gpNotified ? 'bg-purple-50 dark:bg-purple-950/30' : 'hover:bg-muted/50'
            }`}
            data-testid="comm-gp-notified"
          >
            <div className="absolute -left-[9px] top-3 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center"
              style={{ backgroundColor: gpNotified ? '#a855f7' : '#d1d5db' }}>
              {gpNotified && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">GP notified</span>
              </div>
              {gpNotifiedAt && (
                <p className="text-xs text-muted-foreground mt-1 ml-5">
                  {new Date(gpNotifiedAt).toLocaleString()}
                </p>
              )}
            </div>
            <input
              type="checkbox"
              checked={gpNotified}
              onChange={(e) => {
                const checked = e.target.checked;
                const timestamp = checked ? new Date().toISOString() : null;
                setGpNotified(checked);
                setGpNotifiedAt(timestamp);
                const payload = buildCompletePayload({ 
                  gpNotified: checked,
                  gpNotifiedAt: timestamp,
                });
                if (payload) {
                  reportAutoSave.mutate(payload);
                }
              }}
              className="h-4 w-4 mt-0.5 accent-purple-500"
              data-testid="checkbox-gp-notified"
            />
          </label>
        </div>
      </div>
    </div>
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
