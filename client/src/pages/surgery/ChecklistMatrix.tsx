import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ClipboardCheck, 
  Loader2, 
  MessageSquare, 
  Star, 
  StarOff,
  CheckCircle2,
  Circle,
  AlertCircle,
  Wand2,
  Save,
  Pencil,
  Plus,
  History
} from "lucide-react";
import { SurgeonChecklistTemplateEditor } from "@/components/anesthesia/SurgeonChecklistTemplateEditor";
import { resolvePlaceholders, type SurgeryContext } from "@shared/checklistPlaceholders";
import type { SurgeonChecklistTemplate, SurgeonChecklistTemplateItem, Surgery, Patient } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type TabValue = "matrix" | "past";

interface SurgeryWithPatient extends Surgery {
  patient?: Patient;
}

interface ChecklistEntryData {
  surgeryId: string;
  itemId: string;
  checked: boolean;
  note: string | null;
}

interface MatrixCellState {
  checked: boolean;
  note: string;
  isDirty: boolean;
}

export default function ChecklistMatrix() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const userId = user?.id;
  
  const [activeTab, setActiveTab] = useState<TabValue>("matrix");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [cellStates, setCellStates] = useState<Record<string, MatrixCellState>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState("");
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingSurgeryId, setEditingSurgeryId] = useState<string | null>(null);
  
  // Track pending mutation counts per cell to prevent race conditions when clicking quickly
  // Using refs (not state) for SYNCHRONOUS updates - critical for preventing blink on checkbox click
  // Refs update immediately, while state updates are async and can cause race conditions
  const pendingMutationsRef = useRef<Map<string, number>>(new Map());
  const pastPendingMutationsRef = useRef<Map<string, number>>(new Map());
  
  // Force re-render trigger for when we need to update UI after pending count changes
  const [, forceUpdate] = useState({});
  
  const { data: templatesData, isLoading: templatesLoading } = useQuery<SurgeonChecklistTemplate[]>({
    queryKey: ['/api/surgeon-checklists/templates', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeon-checklists/templates?hospitalId=${hospitalId}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!hospitalId,
  });
  const templates = templatesData || [];

  const { data: selectedTemplate, isLoading: templateLoading } = useQuery<SurgeonChecklistTemplate & { items: SurgeonChecklistTemplateItem[] }>({
    queryKey: ['/api/surgeon-checklists/templates', selectedTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeon-checklists/templates/${selectedTemplateId}`);
      return res.json();
    },
    enabled: !!selectedTemplateId,
  });

  const userRole = activeHospital?.role;
  // Check if user is a doctor/surgeon (they should only see their own surgeries)
  const isSurgeonOrDoctor = userRole === 'surgeon' || userRole === 'doctor';
  
  const { data: futureSurgeriesData, isLoading: surgeriesLoading } = useQuery<SurgeryWithPatient[]>({
    queryKey: ['/api/surgeries/future', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeries/future?hospitalId=${hospitalId}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!hospitalId,
  });
  
  // Filter surgeries: doctors/surgeons only see their own surgeries, others see all
  const futureSurgeries = useMemo(() => {
    const allSurgeries = futureSurgeriesData || [];
    if (isSurgeonOrDoctor && userId) {
      return allSurgeries.filter(surgery => surgery.surgeonId === userId);
    }
    return allSurgeries;
  }, [futureSurgeriesData, isSurgeonOrDoctor, userId]);

  const { data: matrixData, isLoading: matrixLoading } = useQuery<{ entries: ChecklistEntryData[] }>({
    queryKey: ['/api/surgeon-checklists/matrix', selectedTemplateId, hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeon-checklists/matrix?templateId=${selectedTemplateId}&hospitalId=${hospitalId}`);
      return res.json();
    },
    enabled: !!selectedTemplateId && !!hospitalId,
  });

  // Past surgeries query
  const { data: pastSurgeriesData, isLoading: pastSurgeriesLoading } = useQuery<SurgeryWithPatient[]>({
    queryKey: ['/api/surgeries/past', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/surgeries/past?hospitalId=${hospitalId}&limit=100`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!hospitalId && activeTab === "past",
  });

  // Filter past surgeries: doctors/surgeons only see their own surgeries
  const pastSurgeries = useMemo(() => {
    const allSurgeries = pastSurgeriesData || [];
    if (isSurgeonOrDoctor && userId) {
      return allSurgeries.filter(surgery => surgery.surgeonId === userId);
    }
    return allSurgeries;
  }, [pastSurgeriesData, isSurgeonOrDoctor, userId]);

  // Past matrix data query
  const { data: pastMatrixData, isLoading: pastMatrixLoading } = useQuery<{ entries: ChecklistEntryData[] }>({
    queryKey: ['/api/surgeon-checklists/matrix/past', selectedTemplateId, hospitalId],
    queryFn: async () => {
      const url = `/api/surgeon-checklists/matrix/past?templateId=${selectedTemplateId}&hospitalId=${hospitalId}&limit=100`;
      console.log('[PastMatrix] Fetching:', url);
      const res = await fetch(url, {
        credentials: "include",
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const data = await res.json();
      console.log('[PastMatrix] API Response - entries count:', data.entries?.length);
      if (data.entries?.length > 0) {
        const checkedEntries = data.entries.filter((e: ChecklistEntryData) => e.checked);
        console.log('[PastMatrix] Checked entries count:', checkedEntries.length);
        console.log('[PastMatrix] First 3 entries:', JSON.stringify(data.entries.slice(0, 3)));
      }
      return data;
    },
    enabled: !!selectedTemplateId && !!hospitalId && activeTab === "past",
    staleTime: 0, // Always refetch when mounting this query
  });

  // Past cell states (now editable)
  // Use useMemo to compute initial states directly from pastMatrixData to avoid race conditions
  const pastCellStatesFromData = useMemo(() => {
    console.log('[PastMatrix] useMemo recalculating - entries:', pastMatrixData?.entries?.length);
    if (!pastMatrixData?.entries) return {};
    
    const states: Record<string, MatrixCellState> = {};
    let checkedCount = 0;
    pastMatrixData.entries.forEach(entry => {
      const key = `${entry.surgeryId}-${entry.itemId}`;
      states[key] = {
        checked: entry.checked,
        note: entry.note || "",
        isDirty: false,
      };
      if (entry.checked) checkedCount++;
    });
    console.log('[PastMatrix] Computed states - total:', Object.keys(states).length, 'checked:', checkedCount);
    return states;
  }, [pastMatrixData]);

  // Local state for optimistic updates (merged with server data)
  const [pastCellLocalOverrides, setPastCellLocalOverrides] = useState<Record<string, MatrixCellState>>({});
  
  // Reset local overrides when switching templates or data changes
  useEffect(() => {
    setPastCellLocalOverrides({});
  }, [selectedTemplateId, pastMatrixData]);

  const getPastCellState = (surgeryId: string, itemId: string): MatrixCellState => {
    const key = `${surgeryId}-${itemId}`;
    // First check local overrides (for optimistic updates), then fall back to server data
    const localOverride = pastCellLocalOverrides[key];
    if (localOverride) {
      return localOverride;
    }
    const serverState = pastCellStatesFromData[key];
    if (serverState) {
      return serverState;
    }
    // Debug: Log when we can't find a matching entry (only first few times)
    const stateKeys = Object.keys(pastCellStatesFromData);
    if (stateKeys.length > 0 && !serverState) {
      // Check if this surgery exists in any entry
      const matchingSurgery = stateKeys.find(k => k.startsWith(surgeryId));
      const matchingItem = stateKeys.find(k => k.endsWith(itemId));
      if (!matchingSurgery && !matchingItem) {
        console.log('[PastMatrix] No match for key:', key, 'Available keys sample:', stateKeys.slice(0, 3));
      }
    }
    return { checked: false, note: "", isDirty: false };
  };

  const updatePastCellState = (surgeryId: string, itemId: string, updates: Partial<MatrixCellState>) => {
    const key = `${surgeryId}-${itemId}`;
    const current = getPastCellState(surgeryId, itemId);
    setPastCellLocalOverrides(prev => ({
      ...prev,
      [key]: {
        ...current,
        ...updates,
        isDirty: true,
      },
    }));
  };

  useEffect(() => {
    if (templates.length > 0) {
      // Check if selected template still exists (may have been deleted)
      const selectedExists = selectedTemplateId && templates.some(t => t.id === selectedTemplateId);
      
      if (!selectedTemplateId || !selectedExists) {
        const defaultTemplate = templates.find(t => t.isDefault && t.ownerUserId === userId);
        const fallbackTemplate = templates.find(t => t.ownerUserId === userId) || templates[0];
        setSelectedTemplateId(defaultTemplate?.id || fallbackTemplate?.id || null);
      }
    } else if (templates.length === 0 && selectedTemplateId) {
      // No templates left, clear selection
      setSelectedTemplateId(null);
    }
  }, [templates, selectedTemplateId, userId]);

  useEffect(() => {
    if (matrixData?.entries) {
      setCellStates(prev => {
        const newStates: Record<string, MatrixCellState> = {};
        const pendingMap = pendingMutationsRef.current;
        matrixData.entries.forEach(entry => {
          const key = `${entry.surgeryId}-${entry.itemId}`;
          // Preserve optimistic state for pending mutations to prevent race conditions
          const pendingCount = pendingMap.get(key) || 0;
          if (pendingCount > 0 && prev[key]) {
            newStates[key] = prev[key];
          } else {
            newStates[key] = {
              checked: entry.checked,
              note: entry.note || "",
              isDirty: false,
            };
          }
        });
        // Also preserve any cells with pending mutations that might not be in server response yet
        pendingMap.forEach((count, key) => {
          if (count > 0 && prev[key] && !newStates[key]) {
            newStates[key] = prev[key];
          }
        });
        return newStates;
      });
    }
  }, [matrixData]);

  const getCellState = (surgeryId: string, itemId: string): MatrixCellState => {
    const key = `${surgeryId}-${itemId}`;
    return cellStates[key] || { checked: false, note: "", isDirty: false };
  };

  const updateCellState = (surgeryId: string, itemId: string, updates: Partial<MatrixCellState>) => {
    const key = `${surgeryId}-${itemId}`;
    setCellStates(prev => ({
      ...prev,
      [key]: {
        ...getCellState(surgeryId, itemId),
        ...updates,
        isDirty: true,
      },
    }));
  };

  const saveCellMutation = useMutation({
    mutationFn: async ({ surgeryId, itemId, checked, note }: { surgeryId: string; itemId: string; checked: boolean; note: string }) => {
      if (!selectedTemplateId) throw new Error("No template selected");
      const res = await apiRequest("PUT", `/api/surgeries/${surgeryId}/checklist/entry`, {
        templateId: selectedTemplateId,
        itemId,
        checked,
        note: note || null,
      });
      return res.json();
    },
    onSettled: (_, __, variables) => {
      const key = `${variables.surgeryId}-${variables.itemId}`;
      // Decrement pending count for this cell (synchronously via ref)
      const pendingMap = pendingMutationsRef.current;
      const count = pendingMap.get(key) || 0;
      if (count <= 1) {
        pendingMap.delete(key);
      } else {
        pendingMap.set(key, count - 1);
      }
      // Only refetch after all pending mutations are complete
      if (pendingMap.size === 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/surgeon-checklists/matrix', selectedTemplateId, hospitalId] });
      }
    },
    onSuccess: (_, variables) => {
      const key = `${variables.surgeryId}-${variables.itemId}`;
      setCellStates(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          isDirty: false,
        },
      }));
    },
    onError: () => {
      toast({ title: t('checklistMatrix.saveFailed', 'Failed to save'), variant: "destructive" });
    },
  });

  const toggleDefaultMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("PUT", `/api/surgeon-checklists/templates/${templateId}/default`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/surgeon-checklists/templates', hospitalId] });
      toast({ title: t('checklistMatrix.defaultSet', 'Default template updated') });
    },
    onError: () => {
      toast({ title: t('checklistMatrix.defaultFailed', 'Failed to set default'), variant: "destructive" });
    },
  });

  const bulkApplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error("No template selected");
      const res = await apiRequest("POST", `/api/surgeon-checklists/templates/${selectedTemplateId}/apply-to-future`, {
        hospitalId,
      });
      return res.json();
    },
    onSuccess: (data: { applied: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/surgeon-checklists/matrix', selectedTemplateId, hospitalId] });
      toast({ 
        title: t('checklistMatrix.bulkApplied', 'Template applied'),
        description: t('checklistMatrix.bulkAppliedDesc', 'Applied to {{count}} surgeries', { count: data.applied }),
      });
    },
    onError: () => {
      toast({ title: t('checklistMatrix.bulkApplyFailed', 'Failed to apply template'), variant: "destructive" });
    },
  });

  const handleCellCheck = (surgeryId: string, itemId: string) => {
    const cellKey = `${surgeryId}-${itemId}`;
    const current = getCellState(surgeryId, itemId);
    const newChecked = !current.checked;
    
    // Increment pending count SYNCHRONOUSLY via ref BEFORE triggering the mutation
    // This is critical - refs update immediately, state updates are async
    const pendingMap = pendingMutationsRef.current;
    pendingMap.set(cellKey, (pendingMap.get(cellKey) || 0) + 1);
    
    updateCellState(surgeryId, itemId, { checked: newChecked });
    
    saveCellMutation.mutate({
      surgeryId,
      itemId,
      checked: newChecked,
      note: current.note,
    });
  };

  const handleNoteSubmit = (surgeryId: string, itemId: string) => {
    const cellKey = `${surgeryId}-${itemId}`;
    const current = getCellState(surgeryId, itemId);
    
    // Increment pending count SYNCHRONOUSLY via ref
    const pendingMap = pendingMutationsRef.current;
    pendingMap.set(cellKey, (pendingMap.get(cellKey) || 0) + 1);
    
    saveCellMutation.mutate({
      surgeryId,
      itemId,
      checked: current.checked,
      note: editingNote,
    });
    updateCellState(surgeryId, itemId, { note: editingNote });
    setEditingCell(null);
    setEditingNote("");
  };

  const openNoteEditor = (surgeryId: string, itemId: string) => {
    const current = getCellState(surgeryId, itemId);
    setEditingCell(`${surgeryId}-${itemId}`);
    setEditingNote(current.note);
  };

  // Past surgery mutation (same API, different state handling)
  const savePastCellMutation = useMutation({
    mutationFn: async ({ surgeryId, itemId, checked, note }: { surgeryId: string; itemId: string; checked: boolean; note: string }) => {
      if (!selectedTemplateId) throw new Error("No template selected");
      const res = await apiRequest("PUT", `/api/surgeries/${surgeryId}/checklist/entry`, {
        templateId: selectedTemplateId,
        itemId,
        checked,
        note: note || null,
      });
      return res.json();
    },
    onSettled: (_, __, variables) => {
      const key = `${variables.surgeryId}-${variables.itemId}`;
      // Decrement pending count for this cell (synchronously via ref)
      const pendingMap = pastPendingMutationsRef.current;
      const count = pendingMap.get(key) || 0;
      if (count <= 1) {
        pendingMap.delete(key);
      } else {
        pendingMap.set(key, count - 1);
      }
      // Only refetch after all pending mutations are complete
      if (pendingMap.size === 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/surgeon-checklists/matrix/past', selectedTemplateId, hospitalId] });
      }
    },
    onSuccess: (_, variables) => {
      const key = `${variables.surgeryId}-${variables.itemId}`;
      setPastCellLocalOverrides(prev => {
        if (!prev[key]) return prev;
        return {
          ...prev,
          [key]: {
            ...prev[key],
            isDirty: false,
          },
        };
      });
    },
    onError: () => {
      toast({ title: t('checklistMatrix.saveFailed', 'Failed to save'), variant: "destructive" });
    },
  });

  const handlePastCellCheck = (surgeryId: string, itemId: string) => {
    const cellKey = `${surgeryId}-${itemId}`;
    const current = getPastCellState(surgeryId, itemId);
    const newChecked = !current.checked;
    
    // Increment pending count SYNCHRONOUSLY via ref
    const pendingMap = pastPendingMutationsRef.current;
    pendingMap.set(cellKey, (pendingMap.get(cellKey) || 0) + 1);
    
    updatePastCellState(surgeryId, itemId, { checked: newChecked });
    
    savePastCellMutation.mutate({
      surgeryId,
      itemId,
      checked: newChecked,
      note: current.note,
    });
  };

  const handlePastNoteSubmit = (surgeryId: string, itemId: string) => {
    const cellKey = `${surgeryId}-${itemId}`;
    const current = getPastCellState(surgeryId, itemId);
    
    // Increment pending count SYNCHRONOUSLY via ref
    const pendingMap = pastPendingMutationsRef.current;
    pendingMap.set(cellKey, (pendingMap.get(cellKey) || 0) + 1);
    
    savePastCellMutation.mutate({
      surgeryId,
      itemId,
      checked: current.checked,
      note: editingNote,
    });
    updatePastCellState(surgeryId, itemId, { note: editingNote });
    setEditingCell(null);
    setEditingNote("");
  };

  const openPastNoteEditor = (surgeryId: string, itemId: string) => {
    const current = getPastCellState(surgeryId, itemId);
    setEditingCell(`${surgeryId}-${itemId}`);
    setEditingNote(current.note);
  };

  const getSurgeryContext = (surgery: SurgeryWithPatient): SurgeryContext => ({
    price: surgery.price || null,
    admissionTime: surgery.admissionTime || null,
    plannedDate: surgery.plannedDate || null,
    plannedSurgery: surgery.plannedSurgery || null,
    surgeonName: surgery.surgeon || null,
    patientName: surgery.patient ? `${surgery.patient.firstName} ${surgery.patient.surname}` : null,
    patientDob: surgery.patient?.birthday || null,
    surgeryRoom: surgery.surgeryRoomId || null,
    notes: surgery.notes || null,
    implantDetails: surgery.implantDetails || null,
  });

  const getCompletionStats = (surgeryId: string, items: SurgeonChecklistTemplateItem[]) => {
    let checked = 0;
    items.forEach(item => {
      if (getCellState(surgeryId, item.id).checked) {
        checked++;
      }
    });
    return { checked, total: items.length };
  };

  const getPastCompletionStats = (surgeryId: string, items: SurgeonChecklistTemplateItem[]) => {
    let checked = 0;
    items.forEach(item => {
      if (getPastCellState(surgeryId, item.id).checked) {
        checked++;
      }
    });
    return { checked, total: items.length };
  };

  const getStatusColor = (checked: number, total: number): { bg: string; text: string; icon: typeof CheckCircle2 } => {
    if (total === 0) return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", icon: Circle };
    if (checked === 0) return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400", icon: AlertCircle };
    if (checked === total) return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", icon: CheckCircle2 };
    return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-600 dark:text-yellow-400", icon: Circle };
  };

  const isLoading = templatesLoading || templateLoading || surgeriesLoading || matrixLoading;
  const isPastLoading = templatesLoading || templateLoading || pastSurgeriesLoading || pastMatrixLoading;

  const currentTemplate = templates.find(t => t.id === selectedTemplateId);
  const isCurrentDefault = currentTemplate?.isDefault && currentTemplate?.ownerUserId === userId;

  const handlePastSurgeryClick = (surgery: Surgery) => {
    // Navigate to the patient's detail page with the surgery context
    if (surgery.patientId) {
      setLocation(`/surgery/patients/${surgery.patientId}`);
    }
  };

  if (!hospitalId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t('checklistMatrix.noHospital', 'Please select a hospital')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">{t('checklistMatrix.title', 'Checklist Matrix')}</h1>
            </div>
            
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="ml-4">
              <TabsList>
                <TabsTrigger value="matrix" data-testid="tab-matrix">
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  {t('checklistMatrix.upcoming', 'Upcoming')}
                </TabsTrigger>
                <TabsTrigger value="past" data-testid="tab-past">
                  <History className="h-4 w-4 mr-2" />
                  {t('checklistMatrix.pastSurgeries', 'Past')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {activeTab === "matrix" && (
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={selectedTemplateId || ""}
                onValueChange={setSelectedTemplateId}
              >
                <SelectTrigger className="w-[200px]" data-testid="select-matrix-template">
                  <SelectValue placeholder={t('checklistMatrix.selectTemplate', 'Select template...')} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      <div className="flex items-center gap-2">
                        {tpl.isDefault && tpl.ownerUserId === userId && (
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                        )}
                        <span>{tpl.title}</span>
                        {tpl.isShared && (
                          <Badge variant="secondary" className="text-[10px] px-1">shared</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTemplateId && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setTemplateEditorOpen(true)}
                          data-testid="button-edit-template"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('checklistMatrix.editTemplate', 'Edit template')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isCurrentDefault ? "secondary" : "outline"}
                          size="icon"
                          onClick={() => toggleDefaultMutation.mutate(selectedTemplateId)}
                          disabled={toggleDefaultMutation.isPending}
                          data-testid="button-toggle-default"
                        >
                          {isCurrentDefault ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          ) : (
                            <StarOff className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isCurrentDefault 
                          ? t('checklistMatrix.removeDefault', 'Remove as default')
                          : t('checklistMatrix.setDefault', 'Set as default template')
                        }
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkApplyMutation.mutate()}
                    disabled={bulkApplyMutation.isPending}
                    data-testid="button-bulk-apply"
                  >
                    {bulkApplyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Wand2 className="h-4 w-4 mr-2" />
                    )}
                    {t('checklistMatrix.applyToAll', 'Apply to all')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Past Surgeries Tab Content */}
      {activeTab === "past" && (
        <div className="flex-1 overflow-auto">
          {isPastLoading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !selectedTemplate || !selectedTemplate.items.length ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">{t('checklistMatrix.noTemplate', 'Select a template to view the matrix')}</p>
                <Button
                  variant="outline"
                  onClick={() => setTemplateEditorOpen(true)}
                  data-testid="button-create-template-past-empty"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('checklistMatrix.createTemplate', 'Create Template')}
                </Button>
              </div>
            </div>
          ) : pastSurgeries.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('checklistMatrix.noPastSurgeries', 'No past surgeries found')}</p>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-x-auto overflow-y-auto pr-4 py-4">
              <table className="w-full border-collapse text-sm" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="sticky left-0 z-20 pl-4 pr-3 py-2 text-left font-medium min-w-[200px] bg-muted border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      {t('checklistMatrix.patient', 'Patient')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium min-w-[100px]">
                      {t('checklistMatrix.date', 'Date')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium min-w-[150px]">
                      {t('checklistMatrix.surgery', 'Surgery')}
                    </th>
                    <th className="px-3 py-2 text-center font-medium min-w-[80px]">
                      {t('checklistMatrix.status', 'Status')}
                    </th>
                    {selectedTemplate.items.map((item) => (
                      <th 
                        key={item.id} 
                        className="px-2 py-2 text-center font-medium min-w-[120px] max-w-[150px]"
                        title={item.label}
                      >
                        <div className="truncate text-xs">
                          {item.label.length > 20 ? `${item.label.slice(0, 20)}...` : item.label}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pastSurgeries.map((surgery, surgeryIndex) => {
                    const stats = getPastCompletionStats(surgery.id, selectedTemplate.items);
                    const isComplete = stats.checked === stats.total;
                    const surgeryContext = getSurgeryContext(surgery);
                    
                    // Debug: Log first surgery's state lookup
                    if (surgeryIndex === 0 && selectedTemplate.items.length > 0) {
                      const firstItem = selectedTemplate.items[0];
                      const testKey = `${surgery.id}-${firstItem.id}`;
                      const stateKeys = Object.keys(pastCellStatesFromData);
                      console.log('[PastMatrix Render] First surgery ID:', surgery.id);
                      console.log('[PastMatrix Render] First item ID:', firstItem.id);
                      console.log('[PastMatrix Render] Lookup key:', testKey);
                      console.log('[PastMatrix Render] State has this key:', !!pastCellStatesFromData[testKey]);
                      console.log('[PastMatrix Render] Total state keys:', stateKeys.length);
                      if (stateKeys.length > 0) {
                        console.log('[PastMatrix Render] Sample state key:', stateKeys[0]);
                      }
                    }
                    
                    return (
                      <tr key={surgery.id} className="border-b hover:bg-muted/30 group">
                        <td className="sticky left-0 z-20 pl-4 pr-3 py-2 font-medium bg-background border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-muted/30">
                          {surgery.patient ? (
                            <Link 
                              href={`/surgery/patients/${surgery.patient.id}`}
                              className="flex flex-col hover:text-primary transition-colors cursor-pointer"
                              data-testid={`link-past-patient-${surgery.patient.id}`}
                            >
                              <span className="truncate max-w-[180px] underline-offset-2 hover:underline">
                                {`${surgery.patient.surname}, ${surgery.patient.firstName}`}
                              </span>
                              {surgery.patient.birthday && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(surgery.patient.birthday), 'dd.MM.yyyy')}
                                </span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">
                              {t('checklistMatrix.unknownPatient', 'Unknown Patient')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {surgery.plannedDate ? (
                            <div className="flex flex-col">
                              <span>{format(new Date(surgery.plannedDate), 'dd.MM.yyyy', { locale: i18n.language === 'de' ? de : undefined })}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(surgery.plannedDate), 'HH:mm')}
                              </span>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="truncate block max-w-[140px] text-left"
                            title={surgery.plannedSurgery || ''}
                          >
                            {surgery.plannedSurgery || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {(() => {
                            const statusColor = getStatusColor(stats.checked, stats.total);
                            const StatusIcon = statusColor.icon;
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
                                      <StatusIcon className="h-3 w-3" />
                                      {stats.checked}/{stats.total}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {stats.checked === stats.total 
                                      ? t('checklistMatrix.complete', 'All items complete')
                                      : stats.checked === 0
                                        ? t('checklistMatrix.noneComplete', 'No items checked')
                                        : t('checklistMatrix.incomplete', '{{remaining}} items remaining', { remaining: stats.total - stats.checked })
                                    }
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </td>
                        {selectedTemplate.items.map((item) => {
                          const cellKey = `${surgery.id}-${item.id}`;
                          const cellState = getPastCellState(surgery.id, item.id);
                          const resolvedLabel = resolvePlaceholders(item.label, surgeryContext);
                          const hasNote = cellState.note && cellState.note.length > 0;
                          const isEditing = editingCell === cellKey;
                          
                          return (
                            <td key={item.id} className="px-2 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Checkbox
                                  checked={cellState.checked}
                                  onCheckedChange={() => handlePastCellCheck(surgery.id, item.id)}
                                  data-testid={`checkbox-past-${surgery.id}-${item.id}`}
                                />
                                <TooltipProvider>
                                  <Tooltip>
                                    <Popover 
                                      open={isEditing} 
                                      onOpenChange={(open) => {
                                        if (!open) {
                                          setEditingCell(null);
                                          setEditingNote("");
                                        }
                                      }}
                                    >
                                      <TooltipTrigger asChild>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => openPastNoteEditor(surgery.id, item.id)}
                                            data-testid={`button-past-note-${surgery.id}-${item.id}`}
                                          >
                                            <MessageSquare 
                                              className={`h-3 w-3 ${hasNote ? 'text-primary fill-primary/20' : 'text-muted-foreground'}`} 
                                            />
                                          </Button>
                                        </PopoverTrigger>
                                      </TooltipTrigger>
                                      <PopoverContent className="w-80" align="center">
                                        <div className="space-y-2">
                                          <h4 className="font-medium text-sm">{resolvedLabel}</h4>
                                          <Textarea
                                            value={editingNote}
                                            onChange={(e) => setEditingNote(e.target.value)}
                                            placeholder={t('checklistMatrix.addNote', 'Add a note... Use # for placeholders')}
                                            rows={3}
                                            className="text-sm"
                                            data-testid={`textarea-past-note-${surgery.id}-${item.id}`}
                                          />
                                          <div className="flex justify-end gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                setEditingCell(null);
                                                setEditingNote("");
                                              }}
                                            >
                                              {t('common.cancel', 'Cancel')}
                                            </Button>
                                            <Button
                                              size="sm"
                                              onClick={() => handlePastNoteSubmit(surgery.id, item.id)}
                                              disabled={savePastCellMutation.isPending}
                                            >
                                              {savePastCellMutation.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                              ) : (
                                                <Save className="h-4 w-4 mr-1" />
                                              )}
                                              {t('common.save', 'Save')}
                                            </Button>
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                    {hasNote && (
                                      <TooltipContent className="max-w-[300px]" side="top">
                                        <p className="whitespace-pre-wrap">{resolvePlaceholders(cellState.note, surgeryContext)}</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Matrix Tab Content */}
      {activeTab === "matrix" && (
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !selectedTemplate || !selectedTemplate.items.length ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">{t('checklistMatrix.noTemplate', 'Select a template to view the matrix')}</p>
              <Button
                variant="outline"
                onClick={() => setTemplateEditorOpen(true)}
                data-testid="button-create-template-empty"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('checklistMatrix.createTemplate', 'Create Template')}
              </Button>
            </div>
          </div>
        ) : futureSurgeries.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('checklistMatrix.noSurgeries', 'No future surgeries found')}</p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-x-auto overflow-y-auto pr-4 py-4">
            <table className="w-full border-collapse text-sm" style={{ borderSpacing: 0 }}>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="sticky left-0 z-20 pl-4 pr-3 py-2 text-left font-medium min-w-[200px] bg-muted border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {t('checklistMatrix.patient', 'Patient')}
                      </th>
                      <th className="px-3 py-2 text-left font-medium min-w-[100px]">
                        {t('checklistMatrix.date', 'Date')}
                      </th>
                      <th className="px-3 py-2 text-left font-medium min-w-[150px]">
                        {t('checklistMatrix.surgery', 'Surgery')}
                      </th>
                      <th className="px-3 py-2 text-center font-medium min-w-[80px]">
                        {t('checklistMatrix.status', 'Status')}
                      </th>
                      {selectedTemplate.items.map((item, index) => (
                        <th 
                          key={item.id} 
                          className="px-2 py-2 text-center font-medium min-w-[120px] max-w-[150px]"
                          title={item.label}
                        >
                          <div className="truncate text-xs">
                            {item.label.length > 20 ? `${item.label.slice(0, 20)}...` : item.label}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {futureSurgeries.map((surgery) => {
                      const stats = getCompletionStats(surgery.id, selectedTemplate.items);
                      const isComplete = stats.checked === stats.total;
                      const surgeryContext = getSurgeryContext(surgery);
                      
                      return (
                        <tr key={surgery.id} className="border-b hover:bg-muted/30 group">
                          <td className="sticky left-0 z-20 pl-4 pr-3 py-2 font-medium bg-background border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-muted/30">
                            {surgery.patient ? (
                              <Link 
                                href={`/surgery/patients/${surgery.patient.id}`}
                                className="flex flex-col hover:text-primary transition-colors cursor-pointer"
                                data-testid={`link-patient-${surgery.patient.id}`}
                              >
                                <span className="truncate max-w-[180px] underline-offset-2 hover:underline">
                                  {`${surgery.patient.surname}, ${surgery.patient.firstName}`}
                                </span>
                                {surgery.patient.birthday && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(surgery.patient.birthday), 'dd.MM.yyyy')}
                                  </span>
                                )}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">
                                {t('checklistMatrix.unknownPatient', 'Unknown Patient')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {surgery.plannedDate ? (
                              <div className="flex flex-col">
                                <span>{format(new Date(surgery.plannedDate), 'dd.MM.yyyy', { locale: i18n.language === 'de' ? de : undefined })}</span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(surgery.plannedDate), 'HH:mm')}
                                </span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => setEditingSurgeryId(surgery.id)}
                              className="truncate block max-w-[140px] text-left hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer"
                              title={surgery.plannedSurgery || t('checklistMatrix.clickToEdit', 'Click to edit')}
                              data-testid={`button-edit-surgery-${surgery.id}`}
                            >
                              {surgery.plannedSurgery || '-'}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const statusColor = getStatusColor(stats.checked, stats.total);
                              const StatusIcon = statusColor.icon;
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
                                        <StatusIcon className="h-3 w-3" />
                                        {stats.checked}/{stats.total}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {stats.checked === stats.total 
                                        ? t('checklistMatrix.complete', 'All items complete')
                                        : stats.checked === 0
                                          ? t('checklistMatrix.noneComplete', 'No items checked')
                                          : t('checklistMatrix.incomplete', '{{remaining}} items remaining', { remaining: stats.total - stats.checked })
                                      }
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </td>
                          {selectedTemplate.items.map((item) => {
                            const cellKey = `${surgery.id}-${item.id}`;
                            const cellState = getCellState(surgery.id, item.id);
                            const resolvedLabel = resolvePlaceholders(item.label, surgeryContext);
                            const hasNote = cellState.note && cellState.note.length > 0;
                            const isEditing = editingCell === cellKey;
                            
                            return (
                              <td key={item.id} className="px-2 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Checkbox
                                    checked={cellState.checked}
                                    onCheckedChange={() => handleCellCheck(surgery.id, item.id)}
                                    data-testid={`checkbox-${surgery.id}-${item.id}`}
                                  />
                                  <TooltipProvider>
                                    <Tooltip>
                                      <Popover 
                                        open={isEditing} 
                                        onOpenChange={(open) => {
                                          if (!open) {
                                            setEditingCell(null);
                                            setEditingNote("");
                                          }
                                        }}
                                      >
                                        <TooltipTrigger asChild>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={() => openNoteEditor(surgery.id, item.id)}
                                              data-testid={`button-note-${surgery.id}-${item.id}`}
                                            >
                                              <MessageSquare 
                                                className={`h-3 w-3 ${hasNote ? 'text-primary fill-primary/20' : 'text-muted-foreground'}`} 
                                              />
                                            </Button>
                                          </PopoverTrigger>
                                        </TooltipTrigger>
                                        <PopoverContent className="w-80" align="center">
                                          <div className="space-y-2">
                                            <h4 className="font-medium text-sm">{resolvedLabel}</h4>
                                            <Textarea
                                              value={editingNote}
                                              onChange={(e) => setEditingNote(e.target.value)}
                                              placeholder={t('checklistMatrix.addNote', 'Add a note... Use # for placeholders')}
                                              rows={3}
                                              className="text-sm"
                                              data-testid={`textarea-note-${surgery.id}-${item.id}`}
                                            />
                                            <div className="flex justify-end gap-2">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  setEditingCell(null);
                                                  setEditingNote("");
                                                }}
                                              >
                                                {t('common.cancel', 'Cancel')}
                                              </Button>
                                              <Button
                                                size="sm"
                                                onClick={() => handleNoteSubmit(surgery.id, item.id)}
                                                disabled={saveCellMutation.isPending}
                                              >
                                                {saveCellMutation.isPending ? (
                                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                                ) : (
                                                  <Save className="h-4 w-4 mr-1" />
                                                )}
                                                {t('common.save', 'Save')}
                                              </Button>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                      {hasNote && (
                                        <TooltipContent className="max-w-[300px]" side="top">
                                          <p className="whitespace-pre-wrap">{resolvePlaceholders(cellState.note, surgeryContext)}</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Template Editor Dialog */}
      {hospitalId && (
        <SurgeonChecklistTemplateEditor
          open={templateEditorOpen}
          onClose={() => setTemplateEditorOpen(false)}
          hospitalId={hospitalId}
          templateId={selectedTemplateId}
        />
      )}

      {/* Edit Surgery Dialog */}
      {editingSurgeryId && (
        <EditSurgeryDialog
          surgeryId={editingSurgeryId}
          onClose={() => {
            setEditingSurgeryId(null);
            queryClient.invalidateQueries({ queryKey: ['/api/surgeries/future', hospitalId] });
          }}
        />
      )}
    </div>
  );
}
