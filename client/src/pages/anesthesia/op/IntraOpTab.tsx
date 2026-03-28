import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { OrMedicationsCard } from "@/components/anesthesia/OrMedicationsCard";
import SignaturePad from "@/components/SignaturePad";
import { useDebouncedAutoSave } from "@/hooks/useDebouncedAutoSave";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatTime } from "@/lib/dateUtils";
import { TimeInput } from "@/components/ui/time-input";
import {
  Clock,
  ChevronDown,
  Plus,
  X,
  Check,
  ChevronsUpDown,
  Play,
  Square,
  Trash2,
} from "lucide-react";

// Intra-Op data type
interface IntraOpData {
  positioning?: { RL?: boolean; SL?: boolean; BL?: boolean; SSL?: boolean; EXT?: boolean; notes?: string };
  disinfection?: { kodanColored?: boolean; kodanColorless?: boolean; octanisept?: boolean; betadine?: boolean; performedBy?: string; notes?: string };
  equipment?: {
    monopolar?: boolean;
    bipolar?: boolean;
    neutralElectrodeLocation?: string;
    neutralElectrodeSide?: string;
    pathology?: { histology?: boolean; microbiology?: boolean };
    notes?: string;
    devices?: string;
  };
  irrigationMeds?: {
    irrigation?: string;
    infiltration?: string;
    tumorSolution?: string;
    medications?: string;
    contrast?: string;
    ointments?: string;
  };
  irrigation?: { nacl?: boolean; ringerSolution?: boolean; betadine?: boolean; hydrogenPeroxide?: boolean; other?: string };
  infiltration?: {
    tumorSolution?: boolean;
    carrier?: string;
    carrierVolume?: string;
    epinephrine?: boolean;
    epinephrineAmount?: string;
    totalVolume?: string;
    other?: string;
  };
  medications?: {
    rapidocain1?: boolean;
    ropivacainEpinephrine?: boolean;
    ropivacain05?: boolean;
    ropivacain075?: boolean;
    ropivacain1?: boolean;
    bupivacain?: boolean;
    bupivacain025?: boolean;
    bupivacain05?: boolean;
    rapidocain1Volume?: string;
    ropivacainEpinephrineVolume?: string;
    ropivacain05Volume?: string;
    ropivacain075Volume?: string;
    ropivacain1Volume?: string;
    bupivacainVolume?: string;
    bupivacain025Volume?: string;
    bupivacain05Volume?: string;
    vancomycinImplant?: boolean;
    contrast?: boolean;
    ointments?: boolean;
    other?: string;
    customMedications?: Array<{ itemId: string; name: string; volume?: string }>;
    [key: string]: boolean | string | undefined | Array<any>;
  };
  dressing?: {
    elasticBandage?: boolean;
    abdominalBelt?: boolean;
    bra?: boolean;
    faceLiftMask?: boolean;
    steristrips?: boolean;
    comfeel?: boolean;
    opsite?: boolean;
    compresses?: boolean;
    mefix?: boolean;
    other?: string;
    type?: string;
    redon?: boolean;
  };
  drainage?: { type?: string; count?: number; redonCH?: string; redonCount?: number; other?: string; redon?: boolean };
  drainages?: Array<{
    id: string;
    type: string;
    typeOther?: string;
    size: string;
    position: string;
  }>;
  xray?: {
    used: boolean;
    imageCount?: number;
    bodyRegion?: string;
    notes?: string;
  };
  co2Pressure?: {
    pressure?: number;
    notes?: string;
  };
  tourniquet?: {
    position?: string;
    side?: string;
    pressure?: number;
    duration?: number;
    notes?: string;
  };
  intraoperativeNotes?: string;
  signatures?: { circulatingNurse?: string; instrumentNurse?: string };
}

interface IntraOpTabProps {
  surgeryId: string;
  anesthesiaRecordId: string | undefined;
  surgery: any;
  anesthesiaRecord: any;
  t: (key: string, defaultValueOrOptions?: any) => string;
}

export function IntraOpTab({ surgeryId, anesthesiaRecordId, surgery, anesthesiaRecord, t }: IntraOpTabProps) {
  const activeHospital = useActiveHospital();

  // Staff popover state for performedBy field
  const [openStaffPopover, setOpenStaffPopover] = useState<string | null>(null);
  const [staffSearchInput, setStaffSearchInput] = useState("");

  // Signature pad dialogs for surgery module
  const [showIntraOpSignaturePad, setShowIntraOpSignaturePad] = useState<'circulating' | 'instrument' | null>(null);

  // Intraoperative Data state
  const [intraOpData, setIntraOpData] = useState<IntraOpData>({});

  // Custom medications state
  const [medSearchOpen, setMedSearchOpen] = useState(false);
  const [medSearchQuery, setMedSearchQuery] = useState("");

  const hospitalId = activeHospital?.id;
  const unitId = activeHospital?.unitId;

  // Fetch inventory items for search
  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId],
    enabled: !!hospitalId && !!unitId,
  });

  // Fetch current inventory usage to find IDs for removal
  const { data: inventoryUsageItems = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Filter items for the search combobox
  const filteredMedItems = useMemo(() => {
    const existing = intraOpData.medications?.customMedications?.map((m: any) => m.itemId) ?? [];
    const available = inventoryItems.filter((item: any) => !existing.includes(item.id));
    if (!medSearchQuery.trim()) return available.slice(0, 50);
    const query = medSearchQuery.toLowerCase();
    return available
      .filter((item: any) =>
        item.name?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [inventoryItems, medSearchQuery, intraOpData.medications?.customMedications]);

  // Check if OR medication groups are configured for this hospital
  const { data: orGroups } = useQuery<any[]>({
    queryKey: [`/api/administration-groups/${hospitalId}?unitType=or`],
    enabled: !!hospitalId,
  });
  const hasOrGroups = (orGroups?.length ?? 0) > 0;
  const isAdmin = activeHospital?.role === 'admin';

  // Legacy infiltration/medications data detection
  const hasLegacyData = !!(
    intraOpData.medications?.rapidocain1 ||
    intraOpData.medications?.ropivacainEpinephrine ||
    intraOpData.medications?.ropivacain05 ||
    intraOpData.medications?.ropivacain075 ||
    intraOpData.medications?.ropivacain1 ||
    intraOpData.medications?.bupivacain ||
    intraOpData.medications?.bupivacain025 ||
    intraOpData.medications?.bupivacain05 ||
    intraOpData.medications?.vancomycinImplant ||
    intraOpData.medications?.contrast ||
    intraOpData.medications?.ointments ||
    intraOpData.medications?.other ||
    (intraOpData.medications?.customMedications?.length ?? 0) > 0 ||
    intraOpData.infiltration?.tumorSolution ||
    intraOpData.infiltration?.carrier ||
    intraOpData.infiltration?.epinephrine ||
    intraOpData.infiltration?.other
  );

  // Collapsible section state for intraop cards
  const [expandedIntraOpSections, setExpandedIntraOpSections] = useState<Record<string, boolean>>({
    surgeryTimes: false,
    positioning: false,
    disinfection: false,
    equipment: false,
    co2Pressure: false,
    tourniquet: false,
    irrigation: false,
    infiltrationMedications: false,
    dressing: false,
    drainage: false,
    xray: false,
    intraoperativeNotes: false,
    signatures: true,
  });

  const toggleIntraOpSection = (section: string) => {
    setExpandedIntraOpSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const hasIntraOpData = (section: string): boolean => {
    switch (section) {
      case 'surgeryTimes':
        return !!localSurgeryStart || !!localSurgeryEnd;
      case 'positioning':
        return !!(intraOpData.positioning && Object.values(intraOpData.positioning).some(v => v));
      case 'disinfection':
        return !!(intraOpData.disinfection && Object.values(intraOpData.disinfection).some(v => v));
      case 'equipment':
        return !!(intraOpData.equipment && Object.values(intraOpData.equipment).some(v => {
          if (typeof v === 'object' && v !== null) return Object.values(v).some(sv => sv);
          return !!v;
        }));
      case 'co2Pressure':
        return !!(intraOpData.co2Pressure?.pressure || intraOpData.co2Pressure?.notes);
      case 'tourniquet':
        return !!(intraOpData.tourniquet && Object.values(intraOpData.tourniquet).some(v => v));
      case 'irrigation':
        return !!(intraOpData.irrigation && Object.values(intraOpData.irrigation).some(v => v));
      case 'infiltrationMedications':
        return !!(intraOpData.infiltration && Object.values(intraOpData.infiltration).some(v => v)) ||
               !!(intraOpData.medications && Object.values(intraOpData.medications).some(v => v && !(Array.isArray(v) && v.length === 0))) ||
               !!(intraOpData.medications?.customMedications && intraOpData.medications.customMedications.length > 0);
      case 'dressing':
        return !!(intraOpData.dressing && Object.values(intraOpData.dressing).some(v => v));
      case 'drainage':
        return !!(intraOpData.drainages && intraOpData.drainages.length > 0) || !!(intraOpData.drainage && (intraOpData.drainage.redonCH || intraOpData.drainage.other));
      case 'xray':
        return !!(intraOpData.xray?.used);
      case 'intraoperativeNotes':
        return !!intraOpData.intraoperativeNotes;
      case 'signatures':
        return !!(intraOpData.signatures?.circulatingNurse || intraOpData.signatures?.instrumentNurse);
      default:
        return false;
    }
  };

  // Auto-save mutation for Intra-Op data (debounced to reduce lag)
  const intraOpAutoSave = useDebouncedAutoSave({
    mutationFn: async (data: IntraOpData) => {
      if (!anesthesiaRecordId) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecordId}/intra-op`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
    debounceMs: 800,
  });

  // Add a custom medication from inventory.
  // Note: inventory_usage has a unique constraint on (anesthesiaRecordId, itemId).
  // If the same item is already tracked via anesthesia drug doses, the manual endpoint
  // will upsert and overwrite the calculated qty with overrideQty: 1.
  const addCustomMedication = async (item: any) => {
    const newEntry = { itemId: item.id, name: item.name, volume: '' };
    const currentCustom = intraOpData.medications?.customMedications ?? [];
    const updated = {
      ...intraOpData,
      medications: {
        ...intraOpData.medications,
        customMedications: [...currentCustom, newEntry],
      },
    };
    setIntraOpData(updated);
    intraOpAutoSave.mutate(updated);
    setMedSearchOpen(false);
    setMedSearchQuery("");

    // Add to inventory usage (qty=1)
    if (anesthesiaRecordId) {
      try {
        await apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/manual`, {
          itemId: item.id,
          qty: 1,
          reason: 'Infiltration medication',
        });
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
      } catch (err) {
        console.error('Failed to add inventory usage:', err);
      }
    }
  };

  // Remove a custom medication
  const removeCustomMedication = async (itemId: string) => {
    const currentCustom = intraOpData.medications?.customMedications ?? [];
    const updated = {
      ...intraOpData,
      medications: {
        ...intraOpData.medications,
        customMedications: currentCustom.filter((m: any) => m.itemId !== itemId),
      },
    };
    setIntraOpData(updated);
    intraOpAutoSave.mutate(updated);

    // Zero out inventory usage
    if (anesthesiaRecordId) {
      try {
        const usageRow = inventoryUsageItems.find((u: any) => u.itemId === itemId);
        if (usageRow) {
          await apiRequest('PATCH', `/api/anesthesia/inventory/${usageRow.id}/override`, {
            overrideQty: 0,
            overrideReason: 'Removed from infiltration medications',
          });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
        }
      } catch (err) {
        console.error('Failed to zero inventory usage:', err);
      }
    }
  };

  // Update volume for a custom medication
  const updateCustomMedicationVolume = (itemId: string, volume: string) => {
    const currentCustom = intraOpData.medications?.customMedications ?? [];
    const updated = {
      ...intraOpData,
      medications: {
        ...intraOpData.medications,
        customMedications: currentCustom.map((m: any) =>
          m.itemId === itemId ? { ...m, volume } : m
        ),
      },
    };
    setIntraOpData(updated);
  };

  // Local state for surgery times (optimistic updates so duration shows immediately)
  const [localSurgeryStart, setLocalSurgeryStart] = useState<string | null>(null);
  const [localSurgeryEnd, setLocalSurgeryEnd] = useState<string | null>(null);

  // Sync local state from server data
  useEffect(() => {
    if (surgery?.actualStartTime) setLocalSurgeryStart(String(surgery.actualStartTime));
    else setLocalSurgeryStart(null);
  }, [surgery?.actualStartTime]);
  useEffect(() => {
    if (surgery?.actualEndTime) setLocalSurgeryEnd(String(surgery.actualEndTime));
    else setLocalSurgeryEnd(null);
  }, [surgery?.actualEndTime]);

  // Mutation for saving surgery times (actualStartTime / actualEndTime)
  const updateSurgeryTimeMutation = useMutation({
    mutationFn: async (data: { actualStartTime?: string | null; actualEndTime?: string | null }) => {
      // Optimistic local update
      if ('actualStartTime' in data) setLocalSurgeryStart(data.actualStartTime ?? null);
      if ('actualEndTime' in data) setLocalSurgeryEnd(data.actualEndTime ?? null);
      return apiRequest('PATCH', `/api/anesthesia/surgeries/${surgeryId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/${surgeryId}`] });
    },
  });

  // Initialize Intra-Op data from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;

    const intraOpValue = anesthesiaRecord.intraOpData;
    if (intraOpValue) {
      setIntraOpData(intraOpValue);
    }
  }, [anesthesiaRecord]);

  // Fetch surgery nurses and doctors for performedBy disinfection field
  const { data: disinfectionStaff = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: [`/api/hospitals/${activeHospital?.id}/users-by-module`, 'surgery', 'disinfection-staff'],
    queryFn: async () => {
      const [nursesRes, doctorsRes] = await Promise.all([
        fetch(`/api/hospitals/${activeHospital?.id}/users-by-module?module=surgery&role=nurse`, { credentials: 'include' }),
        fetch(`/api/hospitals/${activeHospital?.id}/users-by-module?module=surgery&role=doctor`, { credentials: 'include' }),
      ]);

      const nurses = nursesRes.ok ? await nursesRes.json() : [];
      const doctors = doctorsRes.ok ? await doctorsRes.json() : [];

      const combined = [...nurses, ...doctors];
      const seen = new Set<string>();
      return combined.filter((u: any) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      }).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    },
    enabled: !!activeHospital?.id,
  });

  return (
    <>
      {/* Surgery Times O1/O2 — only for LA surgeries (noPreOpRequired) */}
      {surgery?.noPreOpRequired && (
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('surgeryTimes')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t('surgery.intraop.surgeryTimes', 'OP-Zeiten')}
              </CardTitle>
              {!expandedIntraOpSections.surgeryTimes && hasIntraOpData('surgeryTimes') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.surgeryTimes ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.surgeryTimes && (
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* O1 - Surgery Start */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">O1 – {t('surgery.intraop.surgeryStart', 'Schnitt')}</Label>
              <div className="flex items-center gap-2">
                <TimeInput
                  className="h-9 text-sm flex-1"
                  data-testid="input-surgery-start-time"
                  value={localSurgeryStart ? formatTime(localSurgeryStart) : ''}
                  onChange={(time) => {
                    if (!time) {
                      updateSurgeryTimeMutation.mutate({ actualStartTime: null });
                      return;
                    }
                    const [hours, minutes] = time.split(':').map(Number);
                    const ref = surgery?.plannedDate ? new Date(surgery.plannedDate) : new Date();
                    const date = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), hours, minutes, 0, 0);
                    updateSurgeryTimeMutation.mutate({ actualStartTime: date.toISOString() });
                  }}
                />
                <Button
                  variant={localSurgeryStart ? "outline" : "default"}
                  size="sm"
                  className="shrink-0"
                  data-testid="button-surgery-start-now"
                  onClick={() => {
                    updateSurgeryTimeMutation.mutate({ actualStartTime: new Date().toISOString() });
                  }}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {t('surgery.intraop.now', 'Jetzt')}
                </Button>
              </div>
            </div>
            {/* O2 - Surgery End */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">O2 – {t('surgery.intraop.surgeryEnd', 'Naht')}</Label>
              <div className="flex items-center gap-2">
                <TimeInput
                  className="h-9 text-sm flex-1"
                  data-testid="input-surgery-end-time"
                  value={localSurgeryEnd ? formatTime(localSurgeryEnd) : ''}
                  onChange={(time) => {
                    if (!time) {
                      updateSurgeryTimeMutation.mutate({ actualEndTime: null });
                      return;
                    }
                    const [hours, minutes] = time.split(':').map(Number);
                    const ref = surgery?.plannedDate ? new Date(surgery.plannedDate) : new Date();
                    const date = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), hours, minutes, 0, 0);
                    updateSurgeryTimeMutation.mutate({ actualEndTime: date.toISOString() });
                  }}
                />
                <Button
                  variant={localSurgeryEnd ? "outline" : "default"}
                  size="sm"
                  className="shrink-0"
                  data-testid="button-surgery-end-now"
                  onClick={() => {
                    updateSurgeryTimeMutation.mutate({ actualEndTime: new Date().toISOString() });
                  }}
                >
                  <Square className="h-3.5 w-3.5 mr-1" />
                  {t('surgery.intraop.now', 'Jetzt')}
                </Button>
              </div>
            </div>
          </div>
          {/* Duration display */}
          {localSurgeryStart && localSurgeryEnd && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {t('surgery.intraop.totalSurgeryTime', 'OP-Dauer')}: {(() => {
                  const ms = new Date(localSurgeryEnd).getTime() - new Date(localSurgeryStart).getTime();
                  if (ms < 0) return '–';
                  const hours = Math.floor(ms / (1000 * 60 * 60));
                  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
                  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
                })()}
              </p>
            </div>
          )}
        </CardContent>
        )}
      </Card>
      )}

      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('positioning')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t('surgery.intraop.positioning')}</CardTitle>
              {!expandedIntraOpSections.positioning && hasIntraOpData('positioning') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.positioning ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.positioning && (
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: "RL", label: t('surgery.intraop.positions.supine') },
              { id: "SL", label: t('surgery.intraop.positions.lateral') },
              { id: "BL", label: t('surgery.intraop.positions.prone') },
              { id: "SSL", label: t('surgery.intraop.positions.lithotomy') },
              { id: "EXT", label: t('surgery.intraop.positions.extension') }
            ].map((pos) => (
              <div key={pos.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`pos-${pos.id}`}
                  data-testid={`checkbox-position-${pos.id}`}
                  className="h-4 w-4"
                  checked={!!(intraOpData.positioning?.[pos.id as keyof typeof intraOpData.positioning])}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...intraOpData,
                      positioning: {
                        ...intraOpData.positioning,
                        [pos.id]: checked === true
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                />
                <Label htmlFor={`pos-${pos.id}`} className="text-sm">{pos.label}</Label>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Notizen</Label>
            <Input
              id="positioning-notes"
              data-testid="input-positioning-notes"
              className="h-9 text-sm"
              placeholder="Notizen..."
              value={intraOpData.positioning?.notes ?? ''}
              onChange={(e) => {
                const updated = {
                  ...intraOpData,
                  positioning: {
                    ...intraOpData.positioning,
                    notes: e.target.value
                  }
                };
                setIntraOpData(updated);
              }}
              onBlur={(e) => {
                const updated = {
                  ...intraOpData,
                  positioning: {
                    ...intraOpData.positioning,
                    notes: e.target.value
                  }
                };
                intraOpAutoSave.mutate(updated);
              }}
            />
          </div>
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('disinfection')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t('surgery.intraop.disinfection')}</CardTitle>
              {!expandedIntraOpSections.disinfection && hasIntraOpData('disinfection') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.disinfection ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.disinfection && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="kodan-colored"
                data-testid="checkbox-kodan-colored"
                className="h-4 w-4"
                checked={intraOpData.disinfection?.kodanColored ?? false}
                onCheckedChange={(checked) => {
                  const updated = {
                    ...intraOpData,
                    disinfection: {
                      ...intraOpData.disinfection,
                      kodanColored: checked === true
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              />
              <Label htmlFor="kodan-colored" className="text-sm">{t('surgery.intraop.kodanColored')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="kodan-colorless"
                data-testid="checkbox-kodan-colorless"
                className="h-4 w-4"
                checked={intraOpData.disinfection?.kodanColorless ?? false}
                onCheckedChange={(checked) => {
                  const updated = {
                    ...intraOpData,
                    disinfection: {
                      ...intraOpData.disinfection,
                      kodanColorless: checked === true
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              />
              <Label htmlFor="kodan-colorless" className="text-sm">{t('surgery.intraop.kodanColorless')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="octanisept"
                data-testid="checkbox-octanisept"
                className="h-4 w-4"
                checked={intraOpData.disinfection?.octanisept ?? false}
                onCheckedChange={(checked) => {
                  const updated = {
                    ...intraOpData,
                    disinfection: {
                      ...intraOpData.disinfection,
                      octanisept: checked === true
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              />
              <Label htmlFor="octanisept" className="text-sm">{t('surgery.intraop.octanisept')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="disinfection-betadine"
                data-testid="checkbox-disinfection-betadine"
                className="h-4 w-4"
                checked={intraOpData.disinfection?.betadine ?? false}
                onCheckedChange={(checked) => {
                  const updated = {
                    ...intraOpData,
                    disinfection: {
                      ...intraOpData.disinfection,
                      betadine: checked === true
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              />
              <Label htmlFor="disinfection-betadine" className="text-sm">{t('surgery.intraop.betadine')}</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('surgery.intraop.performedBy')}</Label>
            <Popover
              open={openStaffPopover === 'performedBy'}
              onOpenChange={(open) => {
                setOpenStaffPopover(open ? 'performedBy' : null);
                if (!open) setStaffSearchInput("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openStaffPopover === 'performedBy'}
                  className="w-full justify-between font-normal"
                  disabled={!anesthesiaRecordId}
                  data-testid="combobox-disinfection-by"
                >
                  {intraOpData.disinfection?.performedBy || t('surgery.intraop.selectStaff')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-0" align="start">
                <Command shouldFilter={true}>
                  <CommandInput
                    placeholder={t('surgery.intraop.typeOrSelect')}
                    value={staffSearchInput}
                    onValueChange={setStaffSearchInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && staffSearchInput.trim()) {
                        e.preventDefault();
                        const updated = {
                          ...intraOpData,
                          disinfection: {
                            ...intraOpData.disinfection,
                            performedBy: staffSearchInput.trim()
                          }
                        };
                        setIntraOpData(updated);
                        intraOpAutoSave.mutate(updated);
                        setOpenStaffPopover(null);
                        setStaffSearchInput("");
                      }
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {staffSearchInput.trim() ? (
                        <button
                          className="w-full px-2 py-3 text-left text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
                          onClick={() => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                performedBy: staffSearchInput.trim()
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                            setOpenStaffPopover(null);
                            setStaffSearchInput("");
                          }}
                          data-testid="add-custom-disinfection-by"
                        >
                          <Plus className="h-4 w-4" />
                          {t('surgery.intraop.useCustomName', { name: staffSearchInput.trim() } as any)}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t('surgery.intraop.noStaffFound')}</span>
                      )}
                    </CommandEmpty>
                    <CommandGroup>
                      {intraOpData.disinfection?.performedBy && !staffSearchInput.trim() && (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                performedBy: ""
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                            setOpenStaffPopover(null);
                            setStaffSearchInput("");
                          }}
                          className="text-destructive"
                          data-testid="clear-disinfection-by"
                        >
                          <X className="mr-2 h-4 w-4" />
                          {t('surgery.intraop.clearSelection')}
                        </CommandItem>
                      )}
                      {staffSearchInput.trim() && !disinfectionStaff.some(s => s.name.toLowerCase() === staffSearchInput.trim().toLowerCase()) && (
                        <CommandItem
                          value={`__custom__${staffSearchInput.trim()}`}
                          onSelect={() => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                performedBy: staffSearchInput.trim()
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                            setOpenStaffPopover(null);
                            setStaffSearchInput("");
                          }}
                          className="text-primary"
                          data-testid="add-custom-disinfection-by"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t('surgery.intraop.useCustomName', { name: staffSearchInput.trim() } as any)}
                        </CommandItem>
                      )}
                      {disinfectionStaff.map((staff) => (
                        <CommandItem
                          key={staff.id}
                          value={staff.name}
                          onSelect={() => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                performedBy: staff.name
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                            setOpenStaffPopover(null);
                            setStaffSearchInput("");
                          }}
                          data-testid={`disinfection-by-option-${staff.id}`}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              intraOpData.disinfection?.performedBy === staff.name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {staff.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Notizen</Label>
            <Input
              id="disinfection-notes"
              data-testid="input-disinfection-notes"
              className="h-9 text-sm"
              placeholder="Notizen..."
              value={intraOpData.disinfection?.notes ?? ''}
              onChange={(e) => {
                const updated = {
                  ...intraOpData,
                  disinfection: {
                    ...intraOpData.disinfection,
                    notes: e.target.value
                  }
                };
                setIntraOpData(updated);
              }}
              onBlur={(e) => {
                const updated = {
                  ...intraOpData,
                  disinfection: {
                    ...intraOpData.disinfection,
                    notes: e.target.value
                  }
                };
                intraOpAutoSave.mutate(updated);
              }}
            />
          </div>
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('equipment')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t('surgery.intraop.equipment')}</CardTitle>
              {!expandedIntraOpSections.equipment && hasIntraOpData('equipment') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.equipment ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.equipment && (
        <CardContent className="space-y-4">
          {/* Coagulation Subsection */}
          <div className="rounded-lg bg-muted/30 p-3 space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.koagulation')}</Label>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="koag-mono"
                  data-testid="checkbox-koag-mono"
                  className="h-4 w-4"
                  checked={intraOpData.equipment?.monopolar ?? false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...intraOpData,
                      equipment: {
                        ...intraOpData.equipment,
                        monopolar: checked === true
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                />
                <Label htmlFor="koag-mono" className="text-sm">Monopolar</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="koag-bi"
                  data-testid="checkbox-koag-bi"
                  className="h-4 w-4"
                  checked={intraOpData.equipment?.bipolar ?? false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...intraOpData,
                      equipment: {
                        ...intraOpData.equipment,
                        bipolar: checked === true
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                />
                <Label htmlFor="koag-bi" className="text-sm">Bipolar</Label>
              </div>
            </div>
          </div>

          {/* Neutral Electrode Subsection */}
          <div className="rounded-lg bg-muted/30 p-3 space-y-3">
            <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.neutralElectrode')}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {["shoulder", "abdomen", "thigh", "back", "forearm"].map((loc) => (
                <div key={loc} className="flex items-center space-x-2">
                  <Checkbox
                    id={`electrode-${loc}`}
                    data-testid={`checkbox-electrode-${loc}`}
                    className="h-4 w-4"
                    checked={intraOpData.equipment?.neutralElectrodeLocation === loc}
                    onCheckedChange={(checked) => {
                      const updated = {
                        ...intraOpData,
                        equipment: {
                          ...intraOpData.equipment,
                          neutralElectrodeLocation: checked ? loc : undefined
                        }
                      };
                      setIntraOpData(updated);
                      intraOpAutoSave.mutate(updated);
                    }}
                  />
                  <Label htmlFor={`electrode-${loc}`} className="text-sm">{t(`surgery.intraop.${loc}`)}</Label>
                </div>
              ))}
            </div>
            <div className="border-t border-border/50 pt-3 mt-3">
              <Label className="text-sm font-medium mb-2 block">{t('surgery.intraop.bodySide')}</Label>
              <div className="flex gap-6">
                {["left", "right"].map((side) => (
                  <div key={side} className="flex items-center space-x-2">
                    <Checkbox
                      id={`electrode-side-${side}`}
                      data-testid={`checkbox-electrode-side-${side}`}
                      className="h-4 w-4"
                      checked={intraOpData.equipment?.neutralElectrodeSide === side}
                      onCheckedChange={(checked) => {
                        const updated = {
                          ...intraOpData,
                          equipment: {
                            ...intraOpData.equipment,
                            neutralElectrodeSide: checked ? side : undefined
                          }
                        };
                        setIntraOpData(updated);
                        intraOpAutoSave.mutate(updated);
                      }}
                    />
                    <Label htmlFor={`electrode-side-${side}`} className="text-sm">{t(`surgery.intraop.${side}`)}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pathology Subsection */}
          <div className="rounded-lg bg-muted/30 p-3 space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.pathology')}</Label>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="path-histo"
                  data-testid="checkbox-path-histo"
                  className="h-4 w-4"
                  checked={intraOpData.equipment?.pathology?.histology ?? false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...intraOpData,
                      equipment: {
                        ...intraOpData.equipment,
                        pathology: {
                          ...intraOpData.equipment?.pathology,
                          histology: checked === true
                        }
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                />
                <Label htmlFor="path-histo" className="text-sm">{t('surgery.intraop.histologie')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="path-mikro"
                  data-testid="checkbox-path-mikro"
                  className="h-4 w-4"
                  checked={intraOpData.equipment?.pathology?.microbiology ?? false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...intraOpData,
                      equipment: {
                        ...intraOpData.equipment,
                        pathology: {
                          ...intraOpData.equipment?.pathology,
                          microbiology: checked === true
                        }
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                />
                <Label htmlFor="path-mikro" className="text-sm">{t('surgery.intraop.mikrobio')}</Label>
              </div>
            </div>
          </div>

          {/* Devices Subsection */}
          <div className="rounded-lg bg-muted/30 p-3 space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.devices')}</Label>
            <Input
              id="equipment-devices"
              data-testid="input-equipment-devices"
              className="h-9 text-sm"
              placeholder={t('surgery.intraop.devicesPlaceholder')}
              value={intraOpData.equipment?.devices ?? ''}
              onChange={(e) => {
                const updated = {
                  ...intraOpData,
                  equipment: {
                    ...intraOpData.equipment,
                    devices: e.target.value
                  }
                };
                setIntraOpData(updated);
              }}
              onBlur={(e) => {
                const updated = {
                  ...intraOpData,
                  equipment: {
                    ...intraOpData.equipment,
                    devices: e.target.value
                  }
                };
                intraOpAutoSave.mutate(updated);
              }}
            />
          </div>

          {/* Notes Subsection */}
          <div className="space-y-2">
            <Label className="text-sm">Notizen</Label>
            <Input
              id="equipment-notes"
              data-testid="input-equipment-notes"
              className="h-9 text-sm"
              placeholder="Notizen..."
              value={intraOpData.equipment?.notes ?? ''}
              onChange={(e) => {
                const updated = {
                  ...intraOpData,
                  equipment: {
                    ...intraOpData.equipment,
                    notes: e.target.value
                  }
                };
                setIntraOpData(updated);
              }}
              onBlur={(e) => {
                const updated = {
                  ...intraOpData,
                  equipment: {
                    ...intraOpData.equipment,
                    notes: e.target.value
                  }
                };
                intraOpAutoSave.mutate(updated);
              }}
            />
          </div>
        </CardContent>
        )}
      </Card>

      {/* CO2 / Laparoskopie Section */}
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('co2Pressure')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>CO2 / Laparoskopie</CardTitle>
              {!expandedIntraOpSections.co2Pressure && hasIntraOpData('co2Pressure') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.co2Pressure ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.co2Pressure && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Druck (mmHg)</Label>
              <Input
                id="co2-pressure"
                data-testid="input-co2-pressure"
                type="number"
                min="0"
                className="h-9 text-sm"
                placeholder="z.B. 12"
                value={intraOpData.co2Pressure?.pressure ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  const updated = {
                    ...intraOpData,
                    co2Pressure: {
                      ...intraOpData.co2Pressure,
                      pressure: value
                    }
                  };
                  setIntraOpData(updated);
                }}
                onBlur={(e) => {
                  const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  const updated = {
                    ...intraOpData,
                    co2Pressure: {
                      ...intraOpData.co2Pressure,
                      pressure: value
                    }
                  };
                  intraOpAutoSave.mutate(updated);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Notizen</Label>
              <Input
                id="co2-notes"
                data-testid="input-co2-notes"
                className="h-9 text-sm"
                placeholder="Notizen..."
                value={intraOpData.co2Pressure?.notes ?? ''}
                onChange={(e) => {
                  const updated = {
                    ...intraOpData,
                    co2Pressure: {
                      ...intraOpData.co2Pressure,
                      notes: e.target.value
                    }
                  };
                  setIntraOpData(updated);
                }}
                onBlur={(e) => {
                  const updated = {
                    ...intraOpData,
                    co2Pressure: {
                      ...intraOpData.co2Pressure,
                      notes: e.target.value
                    }
                  };
                  intraOpAutoSave.mutate(updated);
                }}
              />
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      {/* Blutsperre / Tourniquet Section */}
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('tourniquet')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Blutsperre / Tourniquet</CardTitle>
              {!expandedIntraOpSections.tourniquet && hasIntraOpData('tourniquet') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.tourniquet ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.tourniquet && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Position</Label>
              <Select
                value={intraOpData.tourniquet?.position ?? ''}
                onValueChange={(value) => {
                  const updated = {
                    ...intraOpData,
                    tourniquet: {
                      ...intraOpData.tourniquet,
                      position: value
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              >
                <SelectTrigger className="h-9 text-sm" data-testid="select-tourniquet-position">
                  <SelectValue placeholder="Position wählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arm">Arm</SelectItem>
                  <SelectItem value="leg">Bein</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Seite</Label>
              <Select
                value={intraOpData.tourniquet?.side ?? ''}
                onValueChange={(value) => {
                  const updated = {
                    ...intraOpData,
                    tourniquet: {
                      ...intraOpData.tourniquet,
                      side: value
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              >
                <SelectTrigger className="h-9 text-sm" data-testid="select-tourniquet-side">
                  <SelectValue placeholder="Seite wählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Links</SelectItem>
                  <SelectItem value="right">Rechts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Druck (mmHg)</Label>
              <Input
                id="tourniquet-pressure"
                data-testid="input-tourniquet-pressure"
                type="number"
                min="0"
                className="h-9 text-sm"
                placeholder="z.B. 250"
                value={intraOpData.tourniquet?.pressure ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  const updated = {
                    ...intraOpData,
                    tourniquet: {
                      ...intraOpData.tourniquet,
                      pressure: value
                    }
                  };
                  setIntraOpData(updated);
                }}
                onBlur={(e) => {
                  const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  const updated = {
                    ...intraOpData,
                    tourniquet: {
                      ...intraOpData.tourniquet,
                      pressure: value
                    }
                  };
                  intraOpAutoSave.mutate(updated);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Dauer (Min.)</Label>
              <Input
                id="tourniquet-duration"
                data-testid="input-tourniquet-duration"
                type="number"
                min="0"
                className="h-9 text-sm"
                placeholder="z.B. 60"
                value={intraOpData.tourniquet?.duration ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  const updated = {
                    ...intraOpData,
                    tourniquet: {
                      ...intraOpData.tourniquet,
                      duration: value
                    }
                  };
                  setIntraOpData(updated);
                }}
                onBlur={(e) => {
                  const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  const updated = {
                    ...intraOpData,
                    tourniquet: {
                      ...intraOpData.tourniquet,
                      duration: value
                    }
                  };
                  intraOpAutoSave.mutate(updated);
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Notizen</Label>
            <Input
              id="tourniquet-notes"
              data-testid="input-tourniquet-notes"
              className="h-9 text-sm"
              placeholder="Notizen..."
              value={intraOpData.tourniquet?.notes ?? ''}
              onChange={(e) => {
                const updated = {
                  ...intraOpData,
                  tourniquet: {
                    ...intraOpData.tourniquet,
                    notes: e.target.value
                  }
                };
                setIntraOpData(updated);
              }}
              onBlur={(e) => {
                const updated = {
                  ...intraOpData,
                  tourniquet: {
                    ...intraOpData.tourniquet,
                    notes: e.target.value
                  }
                };
                intraOpAutoSave.mutate(updated);
              }}
            />
          </div>
        </CardContent>
        )}
      </Card>

      {/* Irrigation Section */}
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('irrigation')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t('surgery.intraop.irrigation')}</CardTitle>
              {!expandedIntraOpSections.irrigation && hasIntraOpData('irrigation') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.irrigation ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.irrigation && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="irrigation-nacl"
                data-testid="checkbox-irrigation-nacl"
                className="h-4 w-4"
                checked={intraOpData.irrigation?.nacl ?? false}
                onCheckedChange={(checked) => {
                  const updated = {
                    ...intraOpData,
                    irrigation: {
                      ...intraOpData.irrigation,
                      nacl: checked === true
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              />
              <Label htmlFor="irrigation-nacl" className="text-sm">{t('surgery.intraop.irrigationOptions.nacl')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="irrigation-ringer"
                data-testid="checkbox-irrigation-ringer"
                className="h-4 w-4"
                checked={intraOpData.irrigation?.ringerSolution ?? false}
                onCheckedChange={(checked) => {
                  const updated = {
                    ...intraOpData,
                    irrigation: {
                      ...intraOpData.irrigation,
                      ringerSolution: checked === true
                    }
                  };
                  setIntraOpData(updated);
                  intraOpAutoSave.mutate(updated);
                }}
              />
              <Label htmlFor="irrigation-ringer" className="text-sm">{t('surgery.intraop.irrigationOptions.ringerSolution')}</Label>
            </div>
          </div>
          <Input
            id="irrigation-other"
            data-testid="input-irrigation-other"
            className="h-9 text-sm"
            placeholder={t('surgery.intraop.irrigationOther')}
            value={intraOpData.irrigation?.other ?? ''}
            onChange={(e) => {
              const updated = {
                ...intraOpData,
                irrigation: {
                  ...intraOpData.irrigation,
                  other: e.target.value
                }
              };
              setIntraOpData(updated);
            }}
            onBlur={(e) => {
              const updated = {
                ...intraOpData,
                irrigation: {
                  ...intraOpData.irrigation,
                  other: e.target.value
                }
              };
              intraOpAutoSave.mutate(updated);
            }}
          />
        </CardContent>
        )}
      </Card>

      {/* Configurable OR Medications Card (new system) */}
      {hospitalId && anesthesiaRecordId && (
        <OrMedicationsCard
          anesthesiaRecordId={anesthesiaRecordId}
          hospitalId={hospitalId}
          isAdmin={isAdmin ?? false}
          hasLegacyData={hasLegacyData}
        />
      )}

      {/* Infiltration & Medications Section (Legacy) */}
      <Collapsible defaultOpen={!hasOrGroups}>
        <Card className={cn(hasOrGroups && "opacity-50")}>
          <CardHeader className="py-3">
            <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 transition-colors rounded-md">
              <div className="flex items-center gap-2">
                <CardTitle>
                  {hasOrGroups ? t('surgery.intraop.infiltrationLegacy') : t('surgery.intraop.infiltrationMedications')}
                </CardTitle>
                {hasIntraOpData('infiltrationMedications') && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
          <CardContent className="space-y-4">
          {/* Tumescent / Infiltration Solution */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.tumescentSolution')}</h4>

            {/* Carrier row */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">{t('surgery.intraop.carrier')}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['ringer', 'nacl'] as const).map((carrier) => (
                  <div key={carrier} className="flex items-center gap-2">
                    <Checkbox
                      id={`carrier-${carrier}`}
                      data-testid={`checkbox-carrier-${carrier}`}
                      className="h-4 w-4"
                      checked={intraOpData.infiltration?.carrier === carrier}
                      onCheckedChange={(checked) => {
                        const updated = {
                          ...intraOpData,
                          infiltration: {
                            ...intraOpData.infiltration,
                            carrier: checked ? carrier : undefined,
                            carrierVolume: checked ? intraOpData.infiltration?.carrierVolume : undefined,
                          }
                        };
                        setIntraOpData(updated);
                        intraOpAutoSave.mutate(updated);
                      }}
                    />
                    <Label htmlFor={`carrier-${carrier}`} className="text-sm">{t(`surgery.intraop.carrierOptions.${carrier}`)}</Label>
                    {intraOpData.infiltration?.carrier === carrier && (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-7 w-20 text-sm"
                          placeholder="0"
                          value={intraOpData.infiltration?.carrierVolume ?? ''}
                          onChange={(e) => {
                            const updated = {
                              ...intraOpData,
                              infiltration: { ...intraOpData.infiltration, carrierVolume: e.target.value }
                            };
                            setIntraOpData(updated);
                          }}
                          onBlur={() => intraOpAutoSave.mutate(intraOpData)}
                        />
                        <span className="text-xs text-muted-foreground">{t('surgery.intraop.mlUnit')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Additives: LA + Epinephrine */}
            <div className="space-y-3">
              <span className="text-xs font-medium text-muted-foreground">{t('surgery.intraop.additive')}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["rapidocain1", "ropivacain05", "ropivacain075", "ropivacain1", "bupivacain025", "bupivacain05"] as const).map((med) => (
                  <div key={med} className="flex items-center gap-2">
                    <Checkbox
                      id={`meds-${med}`}
                      data-testid={`checkbox-meds-${med}`}
                      className="h-4 w-4"
                      checked={(intraOpData.medications as Record<string, boolean | string | undefined>)?.[med] === true}
                      onCheckedChange={(checked) => {
                        const updated = {
                          ...intraOpData,
                          medications: {
                            ...intraOpData.medications,
                            [med]: checked === true,
                            [`${med}Volume`]: checked ? (intraOpData.medications as Record<string, boolean | string | undefined>)?.[`${med}Volume`] : undefined,
                          }
                        };
                        setIntraOpData(updated);
                        intraOpAutoSave.mutate(updated);
                      }}
                    />
                    <Label htmlFor={`meds-${med}`} className="text-sm">{t(`surgery.intraop.medicationOptions.${med}`)}</Label>
                    {(intraOpData.medications as Record<string, boolean | string | undefined>)?.[med] === true && (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-7 w-20 text-sm"
                          placeholder="0"
                          value={String((intraOpData.medications as Record<string, boolean | string | undefined>)?.[`${med}Volume`] ?? '')}
                          onChange={(e) => {
                            const updated = {
                              ...intraOpData,
                              medications: { ...intraOpData.medications, [`${med}Volume`]: e.target.value }
                            };
                            setIntraOpData(updated);
                          }}
                          onBlur={() => intraOpAutoSave.mutate(intraOpData)}
                        />
                        <span className="text-xs text-muted-foreground">{t('surgery.intraop.mlUnit')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="infiltration-epinephrine"
                  data-testid="checkbox-infiltration-epinephrine"
                  className="h-4 w-4"
                  checked={intraOpData.infiltration?.epinephrine ?? false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...intraOpData,
                      infiltration: {
                        ...intraOpData.infiltration,
                        epinephrine: checked === true,
                        epinephrineAmount: checked ? intraOpData.infiltration?.epinephrineAmount : undefined,
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                />
                <Label htmlFor="infiltration-epinephrine" className="text-sm">{t('surgery.intraop.epinephrine')}</Label>
                {intraOpData.infiltration?.epinephrine && (
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 w-20 text-sm"
                      placeholder="0"
                      value={intraOpData.infiltration?.epinephrineAmount ?? ''}
                      onChange={(e) => {
                        const updated = {
                          ...intraOpData,
                          infiltration: { ...intraOpData.infiltration, epinephrineAmount: e.target.value }
                        };
                        setIntraOpData(updated);
                      }}
                      onBlur={() => intraOpAutoSave.mutate(intraOpData)}
                    />
                    <span className="text-xs text-muted-foreground">{t('surgery.intraop.mlUnit')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Total volume */}
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">{t('surgery.intraop.totalVolume')}</Label>
              <Input
                className="h-7 w-24 text-sm"
                placeholder="0"
                value={intraOpData.infiltration?.totalVolume ?? ''}
                onChange={(e) => {
                  const updated = {
                    ...intraOpData,
                    infiltration: { ...intraOpData.infiltration, totalVolume: e.target.value }
                  };
                  setIntraOpData(updated);
                }}
                onBlur={() => intraOpAutoSave.mutate(intraOpData)}
              />
              <span className="text-xs text-muted-foreground">{t('surgery.intraop.mlUnit')}</span>
            </div>

            {/* Other infiltration */}
            <Input
              id="infiltration-other"
              data-testid="input-infiltration-other"
              className="h-9 text-sm"
              placeholder={t('surgery.intraop.infiltrationOther')}
              value={intraOpData.infiltration?.other ?? ''}
              onChange={(e) => {
                const updated = {
                  ...intraOpData,
                  infiltration: { ...intraOpData.infiltration, other: e.target.value }
                };
                setIntraOpData(updated);
              }}
              onBlur={() => intraOpAutoSave.mutate(intraOpData)}
            />
          </div>

          {/* Custom Medications from Inventory */}
          {(intraOpData.medications?.customMedications?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">{t('surgery.intraop.customMedications')}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {intraOpData.medications?.customMedications?.map((med: any) => (
                  <div key={med.itemId} className="flex items-center gap-2">
                    <span className="text-sm flex-1 truncate">{med.name}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 w-20 text-sm"
                        placeholder="0"
                        value={med.volume ?? ''}
                        onChange={(e) => updateCustomMedicationVolume(med.itemId, e.target.value)}
                        onBlur={() => intraOpAutoSave.mutate(intraOpData)}
                      />
                      <span className="text-xs text-muted-foreground">{t('surgery.intraop.mlUnit')}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCustomMedication(med.itemId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Medication from Inventory */}
          <Popover open={medSearchOpen} onOpenChange={setMedSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={!anesthesiaRecordId}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('surgery.intraop.addCustomMedication')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t('surgery.intraop.searchInventoryMedication')}
                  value={medSearchQuery}
                  onValueChange={setMedSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>{t('surgery.intraop.noMedicationFound')}</CommandEmpty>
                  <CommandGroup>
                    {filteredMedItems.map((item: any) => (
                      <CommandItem
                        key={item.id}
                        value={item.name}
                        onSelect={() => addCustomMedication(item)}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="truncate flex-1">{item.name}</span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{item.description}</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Divider */}
          <hr className="border-border" />

          {/* Other Medications */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.otherMedications')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["vancomycinImplant", "contrast", "ointments"] as const).map((med) => (
                <div key={med} className="flex items-center space-x-2">
                  <Checkbox
                    id={`meds-${med}`}
                    data-testid={`checkbox-meds-${med}`}
                    className="h-4 w-4"
                    checked={(intraOpData.medications as Record<string, boolean | string | undefined>)?.[med] === true}
                    onCheckedChange={(checked) => {
                      const updated = {
                        ...intraOpData,
                        medications: {
                          ...intraOpData.medications,
                          [med]: checked === true
                        }
                      };
                      setIntraOpData(updated);
                      intraOpAutoSave.mutate(updated);
                    }}
                  />
                  <Label htmlFor={`meds-${med}`} className="text-sm">{t(`surgery.intraop.medicationOptions.${med}`)}</Label>
                </div>
              ))}
            </div>
            <Input
              id="medications-other"
              data-testid="input-medications-other"
              className="h-9 text-sm"
              placeholder={t('surgery.intraop.medicationsOther')}
              value={intraOpData.medications?.other ?? ''}
              onChange={(e) => {
                const updated = {
                  ...intraOpData,
                  medications: { ...intraOpData.medications, other: e.target.value }
                };
                setIntraOpData(updated);
              }}
              onBlur={() => intraOpAutoSave.mutate(intraOpData)}
            />
          </div>
        </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Dressing Section */}
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('dressing')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t('surgery.intraop.dressing')}</CardTitle>
              {!expandedIntraOpSections.dressing && hasIntraOpData('dressing') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.dressing ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.dressing && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { id: 'elasticBandage', key: 'elasticBandage' },
              { id: 'abdominalBelt', key: 'abdominalBelt' },
              { id: 'bra', key: 'bra' },
              { id: 'faceLiftMask', key: 'faceLiftMask' },
              { id: 'steristrips', key: 'steristrips' },
              { id: 'comfeel', key: 'comfeel' },
              { id: 'opsite', key: 'opsite' },
              { id: 'compresses', key: 'compresses' },
              { id: 'mefix', key: 'mefix' }
            ].map((item) => (
              <div key={item.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`dressing-${item.id}`}
                  data-testid={`checkbox-dressing-${item.id}`}
                  className="h-4 w-4"
                  checked={!!(intraOpData.dressing?.[item.key as keyof typeof intraOpData.dressing])}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...intraOpData,
                      dressing: {
                        ...intraOpData.dressing,
                        [item.key]: checked === true
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                />
                <Label htmlFor={`dressing-${item.id}`} className="text-sm">{t(`surgery.intraop.dressingOptions.${item.key}`)}</Label>
              </div>
            ))}
          </div>
          <Input
            id="dressing-other"
            data-testid="input-dressing-other"
            className="h-9 text-sm"
            placeholder={t('surgery.intraop.dressingOther')}
            value={intraOpData.dressing?.other ?? ''}
            onChange={(e) => {
              const updated = {
                ...intraOpData,
                dressing: {
                  ...intraOpData.dressing,
                  other: e.target.value
                }
              };
              setIntraOpData(updated);
            }}
            onBlur={(e) => {
              const updated = {
                ...intraOpData,
                dressing: {
                  ...intraOpData.dressing,
                  other: e.target.value
                }
              };
              intraOpAutoSave.mutate(updated);
            }}
          />
        </CardContent>
        )}
      </Card>

      {/* Drainage Section */}
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('drainage')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t('surgery.intraop.drainage')}</CardTitle>
              {!expandedIntraOpSections.drainage && hasIntraOpData('drainage') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.drainage ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.drainage && (
        <CardContent className="space-y-3">
          {(() => {
            // Helper: get drainages array, migrating old format if needed
            const getDrainages = () => {
              if (intraOpData.drainages && intraOpData.drainages.length > 0) {
                return intraOpData.drainages;
              }
              if (intraOpData.drainage && (intraOpData.drainage.redonCH || intraOpData.drainage.other)) {
                return [{
                  id: crypto.randomUUID(),
                  type: 'Redon',
                  size: intraOpData.drainage.redonCH ?? '',
                  position: intraOpData.drainage.other ?? '',
                }];
              }
              return [];
            };
            const drainages = getDrainages();
            return (
              <>
                {drainages.map((drain, index) => (
                  <div key={drain.id} className="flex items-start gap-2 p-2 border rounded-lg">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('surgery.intraop.drainageType')}</Label>
                        <Select
                          value={drain.type}
                          onValueChange={(value) => {
                            const updated_drainages = [...drainages];
                            updated_drainages[index] = { ...updated_drainages[index], type: value, typeOther: value === 'Other' ? updated_drainages[index].typeOther : undefined };
                            const updated = { ...intraOpData, drainages: updated_drainages };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                          }}
                        >
                          <SelectTrigger data-testid={`select-drainage-type-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['Redon', 'Jackson-Pratt', 'Blake', 'Penrose', 'T-Tube', 'Chest Tube', 'Silicone Drain', 'Other'].map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {t(`surgery.intraop.drainageTypes.${opt === 'Jackson-Pratt' ? 'jacksonPratt' : opt === 'T-Tube' ? 'tTube' : opt === 'Chest Tube' ? 'chestTube' : opt === 'Silicone Drain' ? 'siliconeDrain' : opt.toLowerCase()}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {drain.type === 'Other' && (
                          <Input
                            data-testid={`input-drainage-type-other-${index}`}
                            placeholder={t('surgery.intraop.drainageTypeOtherPlaceholder')}
                            value={drain.typeOther ?? ''}
                            onChange={(e) => {
                              const updated_drainages = [...drainages];
                              updated_drainages[index] = { ...updated_drainages[index], typeOther: e.target.value };
                              setIntraOpData({ ...intraOpData, drainages: updated_drainages });
                            }}
                            onBlur={() => {
                              intraOpAutoSave.mutate({ ...intraOpData, drainages });
                            }}
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('surgery.intraop.drainageSize')}</Label>
                        <Input
                          data-testid={`input-drainage-size-${index}`}
                          placeholder={t('surgery.intraop.drainageSizePlaceholder')}
                          value={drain.size ?? ''}
                          onChange={(e) => {
                            const updated_drainages = [...drainages];
                            updated_drainages[index] = { ...updated_drainages[index], size: e.target.value };
                            setIntraOpData({ ...intraOpData, drainages: updated_drainages });
                          }}
                          onBlur={() => {
                            intraOpAutoSave.mutate({ ...intraOpData, drainages });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('surgery.intraop.drainagePosition')}</Label>
                        <Input
                          data-testid={`input-drainage-position-${index}`}
                          placeholder={t('surgery.intraop.drainagePositionPlaceholder')}
                          value={drain.position ?? ''}
                          onChange={(e) => {
                            const updated_drainages = [...drainages];
                            updated_drainages[index] = { ...updated_drainages[index], position: e.target.value };
                            setIntraOpData({ ...intraOpData, drainages: updated_drainages });
                          }}
                          onBlur={() => {
                            intraOpAutoSave.mutate({ ...intraOpData, drainages });
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-5 text-destructive hover:text-destructive"
                      data-testid={`button-remove-drainage-${index}`}
                      onClick={() => {
                        const updated_drainages = drainages.filter((_, i) => i !== index);
                        const updated = { ...intraOpData, drainages: updated_drainages };
                        setIntraOpData(updated);
                        intraOpAutoSave.mutate(updated);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-add-drainage"
                  onClick={() => {
                    const updated_drainages = [...drainages, {
                      id: crypto.randomUUID(),
                      type: 'Redon',
                      size: '',
                      position: '',
                    }];
                    const updated = { ...intraOpData, drainages: updated_drainages };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('surgery.intraop.addDrainage')}
                </Button>
              </>
            );
          })()}
        </CardContent>
        )}
      </Card>

      {/* X-Ray / Fluoroscopy Section */}
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('xray')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>{t('surgery.intraop.xray')}</CardTitle>
              {!expandedIntraOpSections.xray && hasIntraOpData('xray') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.xray ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.xray && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">{t('surgery.intraop.xrayImageCount')}</Label>
                <Input
                  data-testid="input-xray-image-count"
                  type="number"
                  min="0"
                  value={intraOpData.xray?.imageCount ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                    const updated = {
                      ...intraOpData,
                      xray: { ...intraOpData.xray, used: true, imageCount: value }
                    };
                    setIntraOpData(updated);
                  }}
                  onBlur={() => {
                    intraOpAutoSave.mutate(intraOpData);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('surgery.intraop.xrayBodyRegion')}</Label>
                <Input
                  data-testid="input-xray-body-region"
                  placeholder={t('surgery.intraop.xrayBodyRegionPlaceholder')}
                  value={intraOpData.xray?.bodyRegion ?? ''}
                  onChange={(e) => {
                    const updated = {
                      ...intraOpData,
                      xray: { ...intraOpData.xray, used: true, bodyRegion: e.target.value }
                    };
                    setIntraOpData(updated);
                  }}
                  onBlur={() => {
                    intraOpAutoSave.mutate(intraOpData);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('surgery.intraop.xrayNotes')}</Label>
              <Input
                data-testid="input-xray-notes"
                placeholder={t('surgery.intraop.xrayNotesPlaceholder')}
                value={intraOpData.xray?.notes ?? ''}
                onChange={(e) => {
                  const updated = {
                    ...intraOpData,
                    xray: { ...intraOpData.xray, used: true, notes: e.target.value }
                  };
                  setIntraOpData(updated);
                }}
                onBlur={() => {
                  intraOpAutoSave.mutate(intraOpData);
                }}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Intraoperative Notes Section */}
      <Card>
        <CardHeader
          className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleIntraOpSection('intraoperativeNotes')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Intraoperative Notizen</CardTitle>
              {!expandedIntraOpSections.intraoperativeNotes && hasIntraOpData('intraoperativeNotes') && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIntraOpSections.intraoperativeNotes ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {expandedIntraOpSections.intraoperativeNotes && (
        <CardContent>
          <Textarea
            id="intraoperative-notes"
            data-testid="textarea-intraoperative-notes"
            className="text-sm"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            placeholder="Notizen..."
            value={intraOpData.intraoperativeNotes ?? ''}
            onChange={(e) => {
              const updated = {
                ...intraOpData,
                intraoperativeNotes: e.target.value
              };
              setIntraOpData(updated);
            }}
            onBlur={(e) => {
              const updated = {
                ...intraOpData,
                intraoperativeNotes: e.target.value
              };
              intraOpAutoSave.mutate(updated);
            }}
          />
        </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle>{t('surgery.intraop.signatures')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('surgery.intraop.signatureZudienung')}</Label>
            <div
              className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
              onClick={() => setShowIntraOpSignaturePad('circulating')}
              data-testid="signature-pad-zudienung"
            >
              {intraOpData.signatures?.circulatingNurse ? (
                <img src={intraOpData.signatures.circulatingNurse} alt="Signature" className="h-full w-full object-contain" />
              ) : (
                t('surgery.intraop.tapToSign')
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('surgery.intraop.signatureInstrum')}</Label>
            <div
              className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
              onClick={() => setShowIntraOpSignaturePad('instrument')}
              data-testid="signature-pad-instrum"
            >
              {intraOpData.signatures?.instrumentNurse ? (
                <img src={intraOpData.signatures.instrumentNurse} alt="Signature" className="h-full w-full object-contain" />
              ) : (
                t('surgery.intraop.tapToSign')
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Intra-Op Signature Pad Dialogs */}
      {showIntraOpSignaturePad === 'circulating' && <SignaturePad
        isOpen={showIntraOpSignaturePad === 'circulating'}
        onClose={() => setShowIntraOpSignaturePad(null)}
        onSave={(signature) => {
          const updated = {
            ...intraOpData,
            signatures: {
              ...intraOpData.signatures,
              circulatingNurse: signature
            }
          };
          setIntraOpData(updated);
          intraOpAutoSave.mutate(updated);
        }}
        title={t('surgery.intraop.signatureZudienung')}
      />}
      {showIntraOpSignaturePad === 'instrument' && <SignaturePad
        isOpen={showIntraOpSignaturePad === 'instrument'}
        onClose={() => setShowIntraOpSignaturePad(null)}
        onSave={(signature) => {
          const updated = {
            ...intraOpData,
            signatures: {
              ...intraOpData.signatures,
              instrumentNurse: signature
            }
          };
          setIntraOpData(updated);
          intraOpAutoSave.mutate(updated);
        }}
        title={t('surgery.intraop.signatureInstrum')}
      />}
    </>
  );
}
