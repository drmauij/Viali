import { useMemo, useRef, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Heart, CircleDot, Blend, Plus, X, ChevronDown, ChevronRight, Undo2, Clock, Monitor, ChevronsDownUp, MessageSquareText, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StickyTimelineHeader } from "./StickyTimelineHeader";
import { useToast } from "@/hooks/use-toast";
import type { MonitorAnalysisResult } from "@shared/monitorParameters";
import { VITAL_ICON_PATHS } from "@/lib/vitalIconPaths";

/**
 * UnifiedTimeline - Refactored for robustness and flexibility
 * 
 * Features:
 * - Dynamic swimlanes - easy to add/remove at runtime
 * - Consistent vertical grid lines across all swimlanes
 * - Simplified configuration with centralized swimlane definitions
 * - Dark/light theme support
 */

export type VitalPoint = [number, number]; // [timestamp(ms), value]

export type TimelineVitals = {
  hr?: VitalPoint[];
  sysBP?: VitalPoint[];
  diaBP?: VitalPoint[];
  spo2?: VitalPoint[];
};

export type TimelineEvent = {
  time: number; // ms
  swimlane: string; // Now flexible - any swimlane id
  label: string;
  icon?: string;
  color?: string;
  duration?: number; // ms - for range items like infusions
  row?: number; // for multiple medication rows
};

export type EventComment = {
  id: string;
  time: number; // ms
  text: string;
};

export type UnifiedTimelineData = {
  startTime: number;
  endTime: number;
  vitals: TimelineVitals;
  events: TimelineEvent[];
};

// Anesthesia time markers configuration
export type AnesthesiaTimeMarker = {
  id: string;
  code: string; // A1, X1, F, etc.
  label: string;
  color: string;
  bgColor: string;
  time: number | null; // null if not yet placed
};

// Predefined anesthesia time markers in sequence
export const ANESTHESIA_TIME_MARKERS: Omit<AnesthesiaTimeMarker, 'time'>[] = [
  { id: 'A1', code: 'A1', label: 'Anesthesia Presence Start', color: '#FFFFFF', bgColor: '#EF4444' }, // Red
  { id: 'X1', code: 'X1', label: 'Anesthesia Start', color: '#FFFFFF', bgColor: '#F97316' }, // Orange
  { id: 'F', code: 'F', label: 'OR Release', color: '#FFFFFF', bgColor: '#10B981' }, // Green
  { id: 'B1', code: 'B1', label: 'Surgical Measures Start', color: '#000000', bgColor: '#06B6D4' }, // Cyan
  { id: 'O1', code: 'O1', label: 'Surgical Incision', color: '#FFFFFF', bgColor: '#8B5CF6' }, // Purple
  { id: 'O2', code: 'O2', label: 'Surgical Suture', color: '#FFFFFF', bgColor: '#8B5CF6' }, // Purple
  { id: 'B2', code: 'B2', label: 'Surgical Measures End', color: '#000000', bgColor: '#06B6D4' }, // Cyan
  { id: 'X2', code: 'X2', label: 'Anesthesia End', color: '#FFFFFF', bgColor: '#F97316' }, // Orange
];

// Helper: Create custom series for Lucide icon symbols (supports stroke rendering)
function createLucideIconSeries(
  name: string,
  data: VitalPoint[],
  iconPath: string,
  color: string,
  yAxisIndex: number,
  size: number = 16,
  zLevel: number = 20,
  isCircleDot: boolean = false
) {
  return {
    type: 'custom',
    name,
    xAxisIndex: 0,
    yAxisIndex,
    data,
    z: zLevel,
    renderItem: (params: any, api: any) => {
      const point = api.coord([api.value(0), api.value(1)]);
      const scale = size / 24; // Scale from 24x24 viewBox to desired size
      
      // Special handling for CircleDot (two circles)
      if (isCircleDot) {
        return {
          type: 'group',
          children: [
            // Outer circle (r=10)
            {
              type: 'circle',
              x: point[0],
              y: point[1],
              shape: {
                r: 10 * scale,
              },
              style: {
                fill: 'none',
                stroke: color,
                lineWidth: 2,
              },
            },
            // Inner dot (r=1)
            {
              type: 'circle',
              x: point[0],
              y: point[1],
              shape: {
                r: 1 * scale,
              },
              style: {
                fill: 'none',
                stroke: color,
                lineWidth: 2,
              },
            },
          ],
        };
      }
      
      // Regular path-based icons (heart, chevrons)
      return {
        type: 'path',
        x: point[0] - size / 2,
        y: point[1] - size / 2,
        shape: {
          pathData: iconPath,
          width: 24, // Lucide viewBox width
          height: 24, // Lucide viewBox height
        },
        style: {
          fill: 'none', // No fill - stroke only for Lucide appearance
          stroke: color,
          lineWidth: 2,
        },
        // Scale to desired size
        scaleX: scale,
        scaleY: scale,
      };
    },
  };
}

// Centralized swimlane configuration - easy to add/remove swimlanes
type SwimlaneConfig = {
  id: string;
  label: string;
  height: number;
  colorLight: string;
  colorDark: string;
};

export function UnifiedTimeline({
  data,
  height,
  swimlanes, // Optional: allow custom swimlane configuration
  now, // Current time for determining editable zones and initial zoom
  patientWeight, // Patient weight in kg for default ventilation calculations
}: {
  data: UnifiedTimelineData;
  height?: number;
  swimlanes?: SwimlaneConfig[];
  now?: number;
  patientWeight?: number;
}) {
  const chartRef = useRef<any>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  const { toast } = useToast();
  
  // State for collapsible parent swimlanes
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(new Set());
  
  // State for dynamic medications
  const [medications, setMedications] = useState<string[]>([]);
  const [showAddMedDialog, setShowAddMedDialog] = useState(false);
  
  // State for medication dose data points (similar to ventilation)
  // Map medication swimlane ID to array of [timestamp, dose_string] points
  const [medicationDoseData, setMedicationDoseData] = useState<{
    [swimlaneId: string]: Array<[number, string]>; // [timestamp, "5mg"] format
  }>({});
  const [newMedName, setNewMedName] = useState("");

  // State for current time indicator - updates every minute
  const [currentTime, setCurrentTime] = useState<number>(now || Date.now());
  
  // State for tracking current zoom/pan range - will be initialized from dataZoom
  const [currentZoomStart, setCurrentZoomStart] = useState<number | undefined>(undefined);
  const [currentZoomEnd, setCurrentZoomEnd] = useState<number | undefined>(undefined);
  
  // State for tracking current snap interval (in milliseconds) - always 1 minute for drugs and ventilation
  const [currentSnapInterval, setCurrentSnapInterval] = useState<number>(1 * 60 * 1000); // Always 1 minute

  // State for interactive vital entry
  const [activeToolMode, setActiveToolMode] = useState<'hr' | 'bp' | 'spo2' | null>(null);
  const [hrDataPoints, setHrDataPoints] = useState<VitalPoint[]>(data.vitals.hr || []);
  const [bpDataPoints, setBpDataPoints] = useState<{ sys: VitalPoint[], dia: VitalPoint[] }>({
    sys: data.vitals.sysBP || [],
    dia: data.vitals.diaBP || []
  });
  const [spo2DataPoints, setSpo2DataPoints] = useState<VitalPoint[]>(data.vitals.spo2 || []);
  
  // State for ventilation parameters
  const [ventilationData, setVentilationData] = useState<{
    etCO2: VitalPoint[];
    pip: VitalPoint[];
    peep: VitalPoint[];
    tidalVolume: VitalPoint[];
    respiratoryRate: VitalPoint[];
    minuteVolume: VitalPoint[];
    fiO2: VitalPoint[];
  }>({
    etCO2: [],
    pip: [],
    peep: [],
    tidalVolume: [],
    respiratoryRate: [],
    minuteVolume: [],
    fiO2: [],
  });

  // State for event comments
  const [eventComments, setEventComments] = useState<EventComment[]>([]);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<{ time: number } | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventComment | null>(null);
  const [eventTextInput, setEventTextInput] = useState("");
  const [eventHoverInfo, setEventHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);

  // State for medication dose edit dialog
  const [showMedicationEditDialog, setShowMedicationEditDialog] = useState(false);
  const [editingMedicationDose, setEditingMedicationDose] = useState<{ swimlaneId: string; time: number; dose: string; index: number } | null>(null);
  const [medicationEditInput, setMedicationEditInput] = useState("");

  // State for ventilation bulk entry dialog
  const [showVentilationBulkDialog, setShowVentilationBulkDialog] = useState(false);
  const [pendingVentilationBulk, setPendingVentilationBulk] = useState<{ time: number } | null>(null);
  const [ventilationMode, setVentilationMode] = useState("PCV - druckkontrolliert");
  const [bulkVentilationParams, setBulkVentilationParams] = useState({
    peep: "5",
    fiO2: "40",
    tidalVolume: "",
    respiratoryRate: "12",
    etCO2: "",
    pip: "",
    minuteVolume: "",
  });
  const [ventilationBulkHoverInfo, setVentilationBulkHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  
  // State for BP dual entry (systolic then diastolic)
  const [bpEntryMode, setBpEntryMode] = useState<'sys' | 'dia'>('sys');
  const [pendingSysValue, setPendingSysValue] = useState<{ time: number; value: number } | null>(null);
  const [isProcessingClick, setIsProcessingClick] = useState(false);
  
  // State for hover tooltip
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; value: number; time: number } | null>(null);
  
  // State for Zeiten hover tooltip
  const [zeitenHoverInfo, setZeitenHoverInfo] = useState<{ x: number; y: number; time: number; nextMarker: string | null } | null>(null);

  // State for medication dose entry
  const [medicationHoverInfo, setMedicationHoverInfo] = useState<{ x: number; y: number; time: number; swimlaneId: string; label: string } | null>(null);
  const [showMedicationDoseDialog, setShowMedicationDoseDialog] = useState(false);
  const [pendingMedicationDose, setPendingMedicationDose] = useState<{ swimlaneId: string; time: number; label: string } | null>(null);
  const [medicationDoseInput, setMedicationDoseInput] = useState("");

  // State for ventilation parameter entry
  const [ventilationHoverInfo, setVentilationHoverInfo] = useState<{ x: number; y: number; time: number; paramKey: keyof typeof ventilationData; label: string } | null>(null);
  const [showVentilationDialog, setShowVentilationDialog] = useState(false);
  const [pendingVentilationValue, setPendingVentilationValue] = useState<{ paramKey: keyof typeof ventilationData; time: number; label: string } | null>(null);
  const [ventilationValueInput, setVentilationValueInput] = useState("");

  // Touch device detection
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  // Track last action for undo
  const [lastAction, setLastAction] = useState<{
    type: 'hr' | 'bp' | 'spo2';
    data?: VitalPoint;
    bpData?: { sys: VitalPoint; dia: VitalPoint };
  } | null>(null);

  // State for edit dialog
  const [editingValue, setEditingValue] = useState<{
    type: 'hr' | 'sys' | 'dia' | 'spo2';
    time: number;
    value: number;
    index: number;
  } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // State for anesthesia time markers
  const [timeMarkers, setTimeMarkers] = useState<AnesthesiaTimeMarker[]>(
    ANESTHESIA_TIME_MARKERS.map(marker => ({ ...marker, time: null }))
  );
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);

  // State for AI-extracted data confirmation
  const [extractedData, setExtractedData] = useState<any>(null);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Detect touch device on mount
  useEffect(() => {
    const checkTouch = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsTouchDevice(hasTouch);
    };
    checkTouch();
  }, []);

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(Date.now());
    };

    // Update immediately if now prop changes
    if (now) {
      setCurrentTime(now);
    }

    // Set up interval to update every minute
    const interval = setInterval(updateTime, 60000); // 60000ms = 1 minute

    return () => clearInterval(interval);
  }, [now]);

  // Toggle collapsed state for parent swimlanes
  const toggleSwimlane = (id: string) => {
    setCollapsedSwimlanes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Update default tidal volume when patient weight changes
  useEffect(() => {
    if (patientWeight) {
      const calculatedVT = (6 * patientWeight).toString();
      setBulkVentilationParams(prev => ({
        ...prev,
        tidalVolume: calculatedVT,
      }));
    }
  }, [patientWeight]);

  // Predefined medications list
  const medicationsList = [
    "Ringer Acetate (ml, i.v./free-flow)",
    "Rapidocain (mg, i.v.)",
    "Sufentanil (Sufenta) (μg, i.v.)",
    "Rocuronium (Esmeron) (mg, i.v.)",
    "Propofol 1% (mg/kg/h, i.v.)",
    "Arterenol 20mcg/ml (μg/kg/min, i.v.)",
    "Adrenalin 20mcg/ml (μg/kg/min, i.v.)",
    "Ephedrine /5.0ml, 50.0mg (mg, i.v.)",
    "Zentiva (Dexamethasone) /1.0ml, 5.0mg (mg, i.v.)",
    "Droperidol (Novalgin) (g, i.v.)",
    "Droperidol /2.0ml, 1.0mg (mg, i.v.)",
    "Toradol /1.0ml, 30.0mg (mg, i.v.)",
    "NaCl 0.9% (ml, infusion/free-flow)",
    "Glucose 5% 100 ml (ml, i.v./free-flow)",
  ];

  // Extract drug name from full medication string (e.g., "Rocuronium (Esmeron) (mg, i.v.)" -> "Rocuronium")
  const extractDrugName = (fullName: string): string => {
    // Extract first word/compound before parentheses or special chars
    const match = fullName.match(/^([A-Za-z]+)/);
    return match ? match[1].toLowerCase() : fullName.toLowerCase();
  };

  // Calculate string similarity (0-1 score, 1 = exact match)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.85;
    
    // Simple Levenshtein-like distance calculation
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }
    
    return matches / longer.length;
  };

  // Find best matching medication from predefined list or dynamic medications
  const findMatchingMedication = (voiceDrugName: string): { 
    swimlaneId: string; 
    fullName: string; 
    isNew: boolean;
    score: number;
  } | null => {
    const threshold = 0.6; // 60% similarity threshold
    let bestMatch: { swimlaneId: string; fullName: string; isNew: boolean; score: number } | null = null;
    let bestScore = 0;

    // Check predefined medications
    medicationsList.forEach((medFullName, index) => {
      const medDrugName = extractDrugName(medFullName);
      const score = calculateSimilarity(voiceDrugName, medDrugName);
      
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = {
          swimlaneId: `medication-predefined-${index}`,
          fullName: medFullName,
          isNew: false,
          score
        };
      }
    });

    // Check dynamic medications
    medications.forEach((medFullName, index) => {
      const medDrugName = extractDrugName(medFullName);
      const score = calculateSimilarity(voiceDrugName, medDrugName);
      
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = {
          swimlaneId: `medication-dynamic-${index}`,
          fullName: medFullName,
          isNew: false,
          score
        };
      }
    });

    return bestMatch;
  };

  // Predefined ventilation parameters list
  const ventilationParams = [
    "etCO2 (mmHg)",
    "P insp (mbar)",
    "PEEP (mbar)",
    "Tidal Volume (ml)",
    "Respiratory Rate (/min)",
    "Minute Volume (l/min)",
    "FiO2 (%)",
  ];

  // Default swimlane configuration - can be overridden via props
  const baseSwimlanes: SwimlaneConfig[] = [
    { id: "zeiten", label: "Times", height: 50, colorLight: "rgba(243, 232, 255, 0.8)", colorDark: "hsl(270, 55%, 20%)" },
    { id: "ereignisse", label: "Events", height: 40, colorLight: "rgba(219, 234, 254, 0.8)", colorDark: "hsl(210, 60%, 18%)" },
    { id: "herzrhythmus", label: "Heart Rhythm", height: 40, colorLight: "rgba(252, 231, 243, 0.8)", colorDark: "hsl(330, 50%, 20%)" },
    { id: "medikamente", label: "Medications", height: 40, colorLight: "rgba(220, 252, 231, 0.8)", colorDark: "hsl(150, 45%, 18%)" },
    { id: "infusionen", label: "Infusions", height: 40, colorLight: "rgba(207, 250, 254, 0.8)", colorDark: "hsl(190, 60%, 18%)" },
    { id: "ventilation", label: "Ventilation", height: 40, colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" },
    { id: "staff", label: "Staff", height: 40, colorLight: "rgba(241, 245, 249, 0.8)", colorDark: "hsl(220, 25%, 25%)" },
  ];

  // Build active swimlanes with collapsible children
  const buildActiveSwimlanes = (): SwimlaneConfig[] => {
    if (swimlanes) return swimlanes; // Use custom if provided
    
    const lanes: SwimlaneConfig[] = [];
    const medColor = { colorLight: "rgba(220, 252, 231, 0.8)", colorDark: "hsl(150, 45%, 18%)" };
    const ventColor = { colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" };
    
    for (const lane of baseSwimlanes) {
      lanes.push(lane);
      
      // Insert medication children after Medications parent (if not collapsed)
      if (lane.id === "medikamente" && !collapsedSwimlanes.has("medikamente")) {
        // Add predefined medications
        medicationsList.forEach((medName, index) => {
          lanes.push({
            id: `medication-predefined-${index}`,
            label: `  ${medName}`,
            height: 30,
            ...medColor,
          });
        });
        
        // Add user-added dynamic medications
        medications.forEach((medName, index) => {
          lanes.push({
            id: `medication-dynamic-${index}`,
            label: `  ${medName}`,
            height: 30,
            ...medColor,
          });
        });
      }

      // Insert ventilation children after Ventilation parent (if not collapsed)
      if (lane.id === "ventilation" && !collapsedSwimlanes.has("ventilation")) {
        ventilationParams.forEach((paramName, index) => {
          lanes.push({
            id: `ventilation-${index}`,
            label: `  ${paramName}`,
            height: 30,
            ...ventColor,
          });
        });
      }
    }
    
    return lanes;
  };

  const activeSwimlanes = useMemo(() => buildActiveSwimlanes(), [collapsedSwimlanes, medications, swimlanes]);

  // Add medication handler
  const handleAddMedication = () => {
    if (newMedName.trim()) {
      setMedications([...medications, newMedName.trim()]);
      setNewMedName("");
      setShowAddMedDialog(false);
    }
  };

  // Remove medication handler
  const handleRemoveMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  // Handle editing vital values
  const handleSaveEdit = (newValue: number, newTime: number) => {
    if (!editingValue) return;

    const { type, index } = editingValue;

    if (type === 'hr') {
      const updated = [...hrDataPoints];
      updated[index] = [newTime, newValue];
      setHrDataPoints(updated);
    } else if (type === 'sys') {
      const updated = [...bpDataPoints.sys];
      updated[index] = [newTime, newValue];
      setBpDataPoints({ ...bpDataPoints, sys: updated });
    } else if (type === 'dia') {
      const updated = [...bpDataPoints.dia];
      updated[index] = [newTime, newValue];
      setBpDataPoints({ ...bpDataPoints, dia: updated });
    } else if (type === 'spo2') {
      const updated = [...spo2DataPoints];
      updated[index] = [newTime, newValue];
      setSpo2DataPoints(updated);
    }

    // Toast notification disabled (can be re-enabled later)
    // toast({
    //   title: "Value updated",
    //   description: "Vital sign value has been saved",
    //   duration: 2000,
    // });

    setEditDialogOpen(false);
    setEditingValue(null);
  };

  const handleDeleteValue = () => {
    if (!editingValue) return;

    const { type, index } = editingValue;

    if (type === 'hr') {
      setHrDataPoints(hrDataPoints.filter((_, i) => i !== index));
    } else if (type === 'sys') {
      setBpDataPoints({
        ...bpDataPoints,
        sys: bpDataPoints.sys.filter((_, i) => i !== index),
      });
    } else if (type === 'dia') {
      setBpDataPoints({
        ...bpDataPoints,
        dia: bpDataPoints.dia.filter((_, i) => i !== index),
      });
    } else if (type === 'spo2') {
      setSpo2DataPoints(spo2DataPoints.filter((_, i) => i !== index));
    }

    // Toast notification disabled (can be re-enabled later)
    // toast({
    //   title: "Value deleted",
    //   description: "Vital sign value has been removed",
    //   duration: 2000,
    // });

    setEditDialogOpen(false);
    setEditingValue(null);
  };

  // Handle clicking on Zeiten swimlane to place next time marker
  const handleZeitenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Find next unplaced marker
    const nextMarkerIndex = timeMarkers.findIndex(m => m.time === null);
    if (nextMarkerIndex === -1) {
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "All markers placed",
      //   description: "All anesthesia time markers have been placed. Use the clock icon to edit times.",
      //   duration: 3000,
      // });
      return;
    }
    
    // Use tracked zoom state (updated by dataZoom event listener)
    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;
    
    // Convert x-position to time
    const xPercent = x / rect.width;
    let time = visibleStart + (xPercent * visibleRange);
    
    // Always snap to 1-minute intervals for time markers
    const oneMinute = 60 * 1000;
    time = Math.round(time / oneMinute) * oneMinute;
    
    // Update the marker with the time
    const updated = [...timeMarkers];
    updated[nextMarkerIndex] = { ...updated[nextMarkerIndex], time };
    setTimeMarkers(updated);
    
    // Toast notification disabled (can be re-enabled later)
    // toast({
    //   title: `${updated[nextMarkerIndex].code} placed`,
    //   description: `${updated[nextMarkerIndex].label} at ${new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
    //   duration: 2000,
    // });
  };

  // Undo last vital entry
  const handleUndo = () => {
    if (!lastAction) return;

    if (lastAction.type === 'hr' && lastAction.data) {
      setHrDataPoints(prev => prev.filter(p => p[0] !== lastAction.data![0] || p[1] !== lastAction.data![1]));
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Value removed",
      //   description: "HR value has been removed",
      //   duration: 2000,
      // });
    } else if (lastAction.type === 'bp' && lastAction.bpData) {
      const { sys, dia } = lastAction.bpData;
      setBpDataPoints(prev => ({
        sys: prev.sys.filter(p => p[0] !== sys[0] || p[1] !== sys[1]),
        dia: prev.dia.filter(p => p[0] !== dia[0] || p[1] !== dia[1])
      }));
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Value removed",
      //   description: "BP values have been removed",
      //   duration: 2000,
      // });
    } else if (lastAction.type === 'spo2' && lastAction.data) {
      setSpo2DataPoints(prev => prev.filter(p => p[0] !== lastAction.data![0] || p[1] !== lastAction.data![1]));
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Value removed",
      //   description: "SpO2 value has been removed",
      //   duration: 2000,
      // });
    }

    setLastAction(null);
  };

  // Track zoom percentages for useMemo
  const [zoomPercent, setZoomPercent] = useState<{ start: number; end: number } | null>(null);

  // Listen for dataZoom changes to sync with sticky header
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleDataZoom = (params: any) => {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      
      if (dataZoom) {
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const visibleStart = data.startTime + (start / 100) * fullRange;
        const visibleEnd = data.startTime + (end / 100) * fullRange;
        
        setCurrentZoomStart(visibleStart);
        setCurrentZoomEnd(visibleEnd);
        
        // Track zoom percentages
        setZoomPercent({ start, end });
      }
    };

    chart.on('datazoom', handleDataZoom);
    return () => {
      chart.off('datazoom', handleDataZoom);
    };
  }, []);

  // Track initial zoom state
  const hasSetInitialZoomRef = useRef(false);

  // Handle chart ready - set initial 60-minute zoom (1 hour)
  const handleChartReady = (chart: any) => {
    if (hasSetInitialZoomRef.current) return;

    const currentTime = now || data.endTime;
    const thirtyMinutes = 30 * 60 * 1000;
    const initialStartTime = currentTime - thirtyMinutes;
    const initialEndTime = currentTime + thirtyMinutes;
    
    const startPercent = ((initialStartTime - data.startTime) / (data.endTime - data.startTime)) * 100;
    const endPercent = ((initialEndTime - data.startTime) / (data.endTime - data.startTime)) * 100;
    
    // Set zoom state first so useMemo picks it up
    setZoomPercent({ start: startPercent, end: endPercent });
    
    // Then set in chart
    chart.setOption({
      dataZoom: [{
        start: startPercent,
        end: endPercent,
      }]
    });
    
    hasSetInitialZoomRef.current = true;
  };

  // Update dataZoom xAxisIndex when swimlane structure changes
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    // Update dataZoom to include all current x-axes without resetting zoom state
    const numGrids = activeSwimlanes.length + 1; // +1 for vitals grid
    const currentOption = chart.getOption() as any;
    const currentDataZoom = currentOption.dataZoom?.[0];
    
    chart.setOption({
      dataZoom: [{
        xAxisIndex: Array.from({ length: numGrids }, (_, i) => i),
        // Preserve current zoom state
        start: currentDataZoom?.start,
        end: currentDataZoom?.end,
      }]
    });
  }, [activeSwimlanes]);

  // Update editable zone widths after chart is rendered
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const updateZones = () => {
      // Calculate heights outside try block for error logging
      const VITALS_TOP = 32;
      const VITALS_HEIGHT = 340;
      const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
      const chartHeight = VITALS_HEIGHT + swimlanesHeight;
      
      try {
        const tenMinutes = 10 * 60 * 1000;
        const oneHour = 60 * 60 * 1000;
        
        // Zone boundaries:
        // Zone 1 (past/non-editable): from data.startTime to (NOW - 10 min)
        // Zone 2 (editable): from (NOW - 10 min) to (NOW + 1 hour)
        // Zone 3 (future/non-editable): from (NOW + 1 hour) to data.endTime
        const editableStartBoundary = currentTime - tenMinutes;
        const editableEndBoundary = currentTime + oneHour;
        
        // Use convertToPixel to get accurate pixel positions based on current zoom
        const startPx = chart.convertToPixel({ xAxisIndex: 0 }, data.startTime);
        const editableStartPx = chart.convertToPixel({ xAxisIndex: 0 }, editableStartBoundary);
        const editableEndPx = chart.convertToPixel({ xAxisIndex: 0 }, editableEndBoundary);
        const endPx = chart.convertToPixel({ xAxisIndex: 0 }, data.endTime);
        
        // Calculate pixel widths for three zones
        const pastNonEditableWidth = Math.max(0, editableStartPx - startPx);
        const editableWidth = Math.max(0, editableEndPx - editableStartPx);
        const futureNonEditableWidth = Math.max(0, endPx - editableEndPx);
        
        // Calculate position for current time indicator (NOW line)
        const nowPx = chart.convertToPixel({ xAxisIndex: 0 }, currentTime);
        
        // Get current graphic elements to preserve vertical lines and labels
        const currentOption = chart.getOption() as any;
        const currentGraphic = currentOption.graphic?.[0]?.elements || [];
        
        // Find and update only the zone/indicator elements, preserve everything else
        const updatedGraphic = currentGraphic.map((el: any) => {
          if (el.id === 'past-non-editable-zone') {
            return {
              ...el,
              left: startPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: pastNonEditableWidth,
                height: chartHeight,
              },
              style: {
                fill: isDark ? 'rgba(100, 100, 100, 0.15)' : 'rgba(200, 200, 200, 0.25)',
              },
            };
          }
          if (el.id === 'editable-zone') {
            return {
              ...el,
              left: editableStartPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: editableWidth,
                height: chartHeight,
              },
              style: {
                fill: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.5)',
              },
            };
          }
          if (el.id === 'future-non-editable-zone') {
            return {
              ...el,
              left: editableEndPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: futureNonEditableWidth,
                height: chartHeight,
              },
              style: {
                fill: isDark ? 'rgba(100, 100, 100, 0.15)' : 'rgba(200, 200, 200, 0.25)',
              },
            };
          }
          if (el.id === 'now-indicator') {
            return {
              ...el,
              left: nowPx,
              top: VITALS_TOP,
              shape: {
                x1: 0,
                y1: 0,
                x2: 0,
                y2: chartHeight,
              },
              style: {
                stroke: isDark ? '#ef4444' : '#dc2626',
                lineWidth: 2,
              },
              z: 999, // Very high z-index to always stay on top
            };
          }
          return el; // Preserve all other elements (vertical lines, labels)
        });
        
        // Update with all elements preserved
        chart.setOption({
          graphic: {
            elements: updatedGraphic,
          },
        }, { replaceMerge: ['graphic'] });
      } catch (e) {
        console.error('Error updating zones:', e);
        console.error('Error details:', {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
          activeSwimlanes: activeSwimlanes.length,
          chartHeight,
        });
      }
    };

    // Update zones after chart is ready
    setTimeout(updateZones, 100);
    
    // Update on resize
    const handleResize = () => updateZones();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartRef, data, isDark, activeSwimlanes, now, currentZoomStart, currentZoomEnd, currentTime, hrDataPoints, bpDataPoints, spo2DataPoints, ventilationData]);

  // Add click handler for editing data points
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleChartClick = (params: any) => {
      // Only handle clicks on scatter/custom data points, not when actively placing new values
      if (params.componentType === 'series' && (params.seriesType === 'scatter' || params.seriesType === 'custom') && !activeToolMode) {
        const [timestamp, value] = params.data;
        const seriesName = params.seriesName;
        
        let type: 'hr' | 'sys' | 'dia' | 'spo2';
        let dataArray: VitalPoint[];
        
        if (seriesName.includes('Heart Rate')) {
          type = 'hr';
          dataArray = hrDataPoints;
        } else if (seriesName.includes('Systolic')) {
          type = 'sys';
          dataArray = bpDataPoints.sys;
        } else if (seriesName.includes('Diastolic')) {
          type = 'dia';
          dataArray = bpDataPoints.dia;
        } else if (seriesName.includes('SpO2')) {
          type = 'spo2';
          dataArray = spo2DataPoints;
        } else {
          return;
        }
        
        // Find the index of this data point
        const index = dataArray.findIndex(p => p[0] === timestamp && p[1] === value);
        if (index !== -1) {
          setEditingValue({ type, time: timestamp, value, index });
          setEditDialogOpen(true);
        }
      }
    };

    chart.on('click', handleChartClick);
    return () => {
      chart.off('click', handleChartClick);
    };
  }, [chartRef, activeToolMode, hrDataPoints, bpDataPoints, spo2DataPoints]);

  // Update zoom state when zoom changes
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const updateZoomState = () => {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (!dataZoom) return;
      
      const start = dataZoom.start ?? 0;
      const end = dataZoom.end ?? 100;
      const fullRange = data.endTime - data.startTime;
      
      const visibleStart = data.startTime + (start / 100) * fullRange;
      const visibleEnd = data.startTime + (end / 100) * fullRange;
      
      // Update zoom state for interactive layer
      setCurrentZoomStart(visibleStart);
      setCurrentZoomEnd(visibleEnd);
      
      // Always use 1-minute snap interval for drugs and ventilation parameters
      const snapInterval = 1 * 60 * 1000; // 1-minute snap
      
      setCurrentSnapInterval(snapInterval);
    };

    // Update immediately
    setTimeout(updateZoomState, 50);

    // Listen for zoom events
    chart.on('datazoom', updateZoomState);

    return () => {
      chart.off('datazoom', updateZoomState);
    };
  }, [chartRef, data.startTime, data.endTime]);

  // Update graphic elements for ventilation parameters
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const modernMonoFont = '"SF Mono", "JetBrains Mono", "Roboto Mono", "Fira Code", Monaco, Consolas, monospace';
    const textColor = isDark ? '#ffffff' : '#000000';
    
    // Helper to convert timestamp to pixel position
    const timestampToPixel = (timestamp: number, gridIndex: number): number | null => {
      try {
        const pixelX = chart.convertToPixel({ xAxisIndex: gridIndex }, timestamp);
        return Array.isArray(pixelX) ? pixelX[0] : pixelX;
      } catch {
        return null;
      }
    };
    
    // Find ventilation swimlane index
    const ventilationParentIndex = activeSwimlanes.findIndex(lane => lane.id === 'ventilation');
    if (ventilationParentIndex === -1 || collapsedSwimlanes.has('ventilation')) {
      chart.setOption({ graphic: [] });
      return;
    }
    
    console.log('[Ventilation Graphics] Active swimlanes:', activeSwimlanes.map((l, i) => `${i}: ${l.id} (${l.height}px)`));
    console.log('[Ventilation Graphics] Ventilation parent index:', ventilationParentIndex);
    
    // Calculate y-positions - need to match the actual grid configuration
    const VITALS_HEIGHT = 340;
    const VITALS_TOP = 32;
    
    // Get the actual grid configuration for ventilation child rows
    // Grid 0 is vitals, then we have all the swimlanes in order
    // We need to find where ventilation child grids start
    
    // ventilationParentIndex tells us which swimlane is ventilation parent
    // Grid index for first ventilation child = 1 (vitals) + ventilationParentIndex + 1
    const firstVentChildGridIndex = 1 + ventilationParentIndex + 1;
    
    // Now calculate the actual y-position for the first ventilation child grid
    let currentY = VITALS_TOP + VITALS_HEIGHT;
    
    // Add heights of all swimlanes up to and including ventilation parent
    for (let i = 0; i <= ventilationParentIndex; i++) {
      currentY += activeSwimlanes[i].height;
    }
    
    console.log('[Ventilation Graphics] First vent child starts at y:', currentY);
    
    const paramData = [
      { data: ventilationData.etCO2, paramIndex: 0, name: 'etCO2' },
      { data: ventilationData.pip, paramIndex: 1, name: 'PIP' },
      { data: ventilationData.peep, paramIndex: 2, name: 'PEEP' },
      { data: ventilationData.tidalVolume, paramIndex: 3, name: 'TidalVol' },
      { data: ventilationData.respiratoryRate, paramIndex: 4, name: 'RR' },
      { data: ventilationData.minuteVolume, paramIndex: 5, name: 'MinVol' },
      { data: ventilationData.fiO2, paramIndex: 6, name: 'FiO2' },
    ];
    
    const graphics: any[] = [];
    
    paramData.forEach(({ data, paramIndex, name }) => {
      const rowY = currentY + (paramIndex - 1) * 35 + 17.5; // Center of row
      const gridIdx = ventilationParentIndex + paramIndex + 1;
      
      data.forEach(([timestamp, value], index) => {
        const pixelX = timestampToPixel(timestamp, gridIdx);
        if (pixelX !== null) {
          graphics.push({
            type: 'text',
            id: `vent-${name}-${timestamp}-${value}-${index}`,
            left: pixelX,
            top: rowY,
            style: {
              text: value.toString(),
              font: `bold 13px ${modernMonoFont}`,
              fill: textColor,
              textAlign: 'center',
              textVerticalAlign: 'middle',
            },
            z: 100,
          });
        }
      });
    });
    
    console.log(`[Ventilation Graphics] Generated ${graphics.length} text elements`);
    chart.setOption({ graphic: graphics }, { replaceMerge: ['graphic'] });
    
  }, [chartRef, ventilationData, activeSwimlanes, collapsedSwimlanes, isDark]);

  // Medication dose graphics rendering (text labels)
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    
    const medicationParentIndex = activeSwimlanes.findIndex(s => s.id === "medikamente");
    
    if (medicationParentIndex === -1 || collapsedSwimlanes.has("medikamente")) {
      // Clear medication graphics if collapsed
      chart.setOption({ graphic: [] }, { replaceMerge: ['graphic'] });
      return;
    }
    
    const textColor = isDark ? '#ffffff' : '#000000';
    const modernMonoFont = '"SF Mono", "JetBrains Mono", "Roboto Mono", "Fira Code", Monaco, Consolas, monospace';
    const VITALS_TOP = 32;
    const VITALS_HEIGHT = 340;
    
    // Helper to convert timestamp to pixel position
    const timestampToPixel = (timestamp: number, gridIndex: number): number | null => {
      try {
        const pixelX = chart.convertToPixel({ xAxisIndex: gridIndex }, timestamp);
        return Array.isArray(pixelX) ? pixelX[0] : pixelX;
      } catch {
        return null;
      }
    };
    
    // Calculate Y position for first medication child
    let currentY = VITALS_TOP + VITALS_HEIGHT;
    for (let i = 0; i <= medicationParentIndex; i++) {
      currentY += activeSwimlanes[i].height;
    }
    
    const graphics: any[] = [];
    
    // Iterate through all medication swimlanes
    activeSwimlanes.forEach((lane, index) => {
      const isMedicationChild = lane.id.startsWith('medication-predefined-') || lane.id.startsWith('medication-dynamic-');
      
      if (isMedicationChild && medicationDoseData[lane.id]?.length > 0) {
        const dosePoints = medicationDoseData[lane.id];
        const laneIndex = index - medicationParentIndex - 1;
        const rowY = currentY + laneIndex * 30 + 15;
        const gridIdx = index + 1;
        
        dosePoints.forEach(([timestamp, dose], idx) => {
          const pixelX = timestampToPixel(timestamp, gridIdx);
          if (pixelX !== null) {
            graphics.push({
              type: 'text',
              id: `med-${lane.id}-${timestamp}-${dose}-${idx}`,
              left: pixelX,
              top: rowY,
              style: {
                text: dose.toString(),
                font: `bold 13px ${modernMonoFont}`,
                fill: textColor,
                textAlign: 'center',
                textVerticalAlign: 'middle',
              },
              z: 100,
              cursor: 'pointer',
              onclick: () => {
                setEditingMedicationDose({
                  swimlaneId: lane.id,
                  time: timestamp,
                  dose: dose.toString(),
                  index: idx,
                });
                setMedicationEditInput(dose.toString());
                setShowMedicationEditDialog(true);
              },
            });
          }
        });
      }
    });
    
    chart.setOption({ graphic: graphics }, { replaceMerge: ['graphic'] });
    
  }, [chartRef, medicationDoseData, activeSwimlanes, collapsedSwimlanes, isDark, setEditingMedicationDose, setMedicationEditInput, setShowMedicationEditDialog]);

  const option = useMemo(() => {
    // Layout constants
    const VITALS_TOP = 32; // Space for sticky header (32px)
    const VITALS_HEIGHT = 340;
    const SWIMLANE_START = VITALS_TOP + VITALS_HEIGHT; // 396px
    const GRID_LEFT = 200; // Increased width to accommodate longer header text
    const GRID_RIGHT = 10;

    // Calculate initial zoom and editable zones based on "now"
    const currentTime = now || data.endTime; // Use provided "now" or fall back to endTime
    const fiveMinutes = 5 * 60 * 1000;
    const tenMinutes = 10 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;
    
    // Initial view: 60-minute window (1 hour) from -30min to +30min around NOW
    const initialStartTime = currentTime - thirtyMinutes;
    const initialEndTime = currentTime + thirtyMinutes;

    // Calculate swimlane positions dynamically
    let currentTop = SWIMLANE_START;
    const swimlaneGrids = activeSwimlanes.map((lane) => {
      const grid = {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: currentTop,
        height: lane.height,
        backgroundColor: isDark ? lane.colorDark : lane.colorLight,
      };
      currentTop += lane.height;
      return grid;
    });

    // Combine all grids: vitals + swimlanes
    const grids = [
      // Grid 0: Vitals chart
      { 
        left: GRID_LEFT, 
        right: GRID_RIGHT, 
        top: VITALS_TOP, 
        height: VITALS_HEIGHT, 
        backgroundColor: "transparent" 
      },
      ...swimlaneGrids,
    ];

    // Create x-axis for each grid with consistent configuration
    const createXAxis = (gridIndex: number) => ({
      type: "time" as const,
      gridIndex,
      min: data.startTime,
      max: data.endTime,
      boundaryGap: false,
      axisLabel: {
        show: false, // Hide labels - they're shown in the sticky header
        formatter: "{HH}:{mm}",
        fontSize: 11,
        fontFamily: "Poppins, sans-serif",
        color: isDark ? "#ffffff" : "#000000",
        fontWeight: 500,
      },
      axisLine: { 
        show: false, // Hide axis line
        lineStyle: { color: isDark ? "#444444" : "#d1d5db" }
      },
      axisTick: { 
        show: false, // Hide ticks
        lineStyle: { color: isDark ? "#444444" : "#d1d5db" }
      },
      splitLine: { 
        show: true, // Show vertical grid lines - ECharts auto-calculates optimal intervals
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        },
      },
      minorTick: {
        show: true,
      },
      minorSplitLine: {
        show: true, // Show minor grid lines - ECharts auto-calculates subdivisions
        lineStyle: {
          color: isDark ? "#333333" : "#e5e7eb",
          width: 0.5,
          type: "dashed" as const,
        },
      },
      position: "top",
    });

    const xAxes = grids.map((_, index) => createXAxis(index));

    // Y-axes: vitals (dual) + swimlanes (categorical)
    const yAxes = [
      // Vitals grid - First y-axis (BP/HR: -20 to 240 range for top and bottom padding, showing 0-220 labels)
      {
        type: "value" as const,
        gridIndex: 0,
        min: -20,
        max: 240,
        interval: 20,
        axisLabel: { show: false }, // Hide labels (we render manually)
        axisLine: { show: false }, // Hide axis line
        axisTick: { show: false }, // Hide ticks
        splitLine: { 
          show: true, // Show horizontal grid lines!
          lineStyle: {
            color: isDark ? "#444444" : "#d1d5db",
            width: 1,
            type: "solid" as const,
          }
        },
      },
      // Vitals grid - Second y-axis (SpO2: 45-105 range for top and bottom padding, showing 50-100 labels)
      {
        type: "value" as const,
        gridIndex: 0,
        min: 45,
        max: 105,
        interval: 10,
        axisLabel: { show: false }, // Hide labels (we render manually)
        axisLine: { show: false }, // Hide axis line
        axisTick: { show: false }, // Hide ticks
        splitLine: { show: false }, // Don't show grid lines for this axis
      },
      // Swimlane y-axes
      ...activeSwimlanes.map((_, index) => ({
        type: "category" as const,
        gridIndex: index + 1,
        data: [""],
        show: false,
      })),
    ];

    // Series - HR data points with heart symbols
    const series: any[] = [];
    
    // Sort vitals data chronologically to prevent zigzag lines when backfilling
    const sortedHrData = [...hrDataPoints].sort((a, b) => a[0] - b[0]);
    const sortedSysData = [...bpDataPoints.sys].sort((a, b) => a[0] - b[0]);
    const sortedDiaData = [...bpDataPoints.dia].sort((a, b) => a[0] - b[0]);
    const sortedSpo2Data = [...spo2DataPoints].sort((a, b) => a[0] - b[0]);
    
    // Add HR series if there are data points
    if (sortedHrData.length > 0) {
      // Add line connecting HR points (chronologically sorted) - HIGH z-index to stay in front of BP
      series.push({
        type: 'line',
        name: 'Heart Rate Line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedHrData,
        lineStyle: {
          color: '#ef4444',
          width: 2,
        },
        symbol: 'none',
        z: 15,
      });
      
      // Add heart symbols with Lucide Heart icon (stroke rendering)
      series.push(
        createLucideIconSeries(
          'Heart Rate',
          sortedHrData,
          VITAL_ICON_PATHS.heart.path,
          '#ef4444', // Red
          0, // yAxisIndex
          16, // size
          30 // z-level - high value to ensure icons are always clickable above lines
        )
      );
    }
    
    // Pending systolic BP bookmark removed - both BP values now placed immediately on click
    
    // Add BP line connections with filled area BETWEEN systolic and diastolic
    if (sortedSysData.length > 0 && sortedDiaData.length > 0) {
      // Create area between systolic and diastolic using stacked approach
      // First, add the diastolic as base (stack: 'bp')
      series.push({
        type: 'line',
        name: 'Diastolic BP Base',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedDiaData,
        symbol: 'none',
        lineStyle: {
          color: '#000000',
          width: 1,
          opacity: 0.3,
        },
        stack: 'bp',
        z: 7,
      });
      
      // Then add the DIFFERENCE (systolic - diastolic) on top with area fill
      const diffData = sortedSysData.map((sysPoint, idx) => {
        const diaPoint = sortedDiaData[idx];
        if (diaPoint && sysPoint[0] === diaPoint[0]) {
          // Same timestamp - calculate difference
          return [sysPoint[0], sysPoint[1] - diaPoint[1]];
        }
        return null;
      }).filter(p => p !== null);
      
      series.push({
        type: 'line',
        name: 'BP Range Area',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: diffData,
        symbol: 'none',
        lineStyle: {
          color: '#000000',
          width: 1,
          opacity: 0.3,
        },
        stack: 'bp', // Stack on top of diastolic
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 0, 0, 0.15)' },
              { offset: 1, color: 'rgba(0, 0, 0, 0.08)' }
            ]
          }
        },
        z: 8,
      });
    }
    
    // Add BP scatter points with Lucide icons (stroke rendering)
    if (sortedSysData.length > 0) {
      series.push(
        createLucideIconSeries(
          'Systolic BP',
          sortedSysData,
          VITAL_ICON_PATHS.chevronDown.path,
          '#000000', // Black
          0, // yAxisIndex
          16, // size
          30 // z-level - high value to ensure icons are always clickable above lines
        )
      );
    }
    
    // Add diastolic BP scatter points with Lucide ChevronUp (stroke rendering)
    if (sortedDiaData.length > 0) {
      series.push(
        createLucideIconSeries(
          'Diastolic BP',
          sortedDiaData,
          VITAL_ICON_PATHS.chevronUp.path,
          '#000000', // Black
          0, // yAxisIndex
          16, // size
          30 // z-level - high value to ensure icons are always clickable above lines
        )
      );
    }
    
    // Add SpO2 series with Lucide CircleDot icon (stroke rendering)
    if (sortedSpo2Data.length > 0) {
      // SpO2 line connection
      series.push({
        type: 'line',
        name: 'SpO2 Line',
        xAxisIndex: 0,
        yAxisIndex: 1, // Use second y-axis (45-105 range)
        data: sortedSpo2Data,
        symbol: 'none',
        lineStyle: {
          color: '#8b5cf6', // Purple line
          width: 1.5,
        },
        z: 9,
      });
      
      // SpO2 symbols with Lucide CircleDot (outer circle + inner dot)
      series.push(
        createLucideIconSeries(
          'SpO2',
          sortedSpo2Data,
          '', // Not used for CircleDot
          '#8b5cf6', // Purple
          1, // yAxisIndex (second y-axis for 45-105 range)
          16, // size
          30, // z-level - high value to ensure icons are always clickable above lines
          true // isCircleDot flag
        )
      );
    }

    // Add ventilation parameter text labels
    // Note: ventilationParams order: ["etCO2 (mmHg)", "P insp (mbar)", "PEEP (mbar)", "Tidal Volume (ml)", "Respiratory Rate (/min)", "Minute Volume (l/min)", "FiO2 (%)"]
    // Find the ventilation parent swimlane index to calculate correct xAxisIndex and yAxisIndex
    const ventilationParentIndex = activeSwimlanes.findIndex(lane => lane.id === 'ventilation');
    
    if (ventilationParentIndex !== -1 && !collapsedSwimlanes.has('ventilation')) {
      const textColor = isDark ? '#ffffff' : '#000000';
      const modernMonoFont = '"SF Mono", "JetBrains Mono", "Roboto Mono", "Fira Code", Monaco, Consolas, monospace';
      
      console.log('[Ventilation Chart] Building series. Data:', ventilationData);
      
      // Add etCO2 text labels (index 0)
      if (ventilationData.etCO2.length > 0) {
        console.log(`[Ventilation Chart] Adding etCO2 series with ${ventilationData.etCO2.length} points`);
        const paramIndex = ventilationParentIndex + 1; // First child after parent
        const gridIdx = paramIndex + 1; // +1 because vitals is grid 0
        // Map to store original values for the formatter
        const valuesMap = new Map(ventilationData.etCO2.map(([time, val]) => [time, val]));
        // Convert data format: [timestamp, value] -> [timestamp, ""] where "" is the y-category
        const seriesData = ventilationData.etCO2.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'etCO2',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1, // yAxis indices start at 2 (after 2 vitals axes)
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add PIP text labels (index 1)
      if (ventilationData.pip.length > 0) {
        const paramIndex = ventilationParentIndex + 2;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.pip.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.pip.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'PIP',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add PEEP text labels (index 2)
      if (ventilationData.peep.length > 0) {
        const paramIndex = ventilationParentIndex + 3;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.peep.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.peep.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'PEEP',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add Tidal Volume text labels (index 3)
      if (ventilationData.tidalVolume.length > 0) {
        const paramIndex = ventilationParentIndex + 4;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.tidalVolume.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.tidalVolume.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'Tidal Volume',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add Respiratory Rate text labels (index 4)
      if (ventilationData.respiratoryRate.length > 0) {
        const paramIndex = ventilationParentIndex + 5;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.respiratoryRate.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.respiratoryRate.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'Respiratory Rate',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add Minute Volume text labels (index 5)
      if (ventilationData.minuteVolume.length > 0) {
        const paramIndex = ventilationParentIndex + 6;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.minuteVolume.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.minuteVolume.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'Minute Volume',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add FiO2 text labels (index 6)
      if (ventilationData.fiO2.length > 0) {
        const paramIndex = ventilationParentIndex + 7;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.fiO2.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.fiO2.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'FiO2',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
    }

    // Calculate total height for vertical lines - dynamically based on current swimlanes
    const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
    const chartHeight = VITALS_HEIGHT + swimlanesHeight;
    const timeRange = data.endTime - data.startTime;
    const oneHour = 60 * 60 * 1000;
    
    // Generate manual y-axis labels in the white space
    const yAxisLabels: any[] = [];
    
    // First y-axis (0-220, interval 20) - positioned at x=140px, grid extends -20 to 240 for top and bottom padding
    for (let val = 0; val <= 220; val += 20) {
      const yPercent = ((240 - val) / 260) * 100; // Invert because top is 0, using 260 range (-20 to 240)
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 140,
        top: yPos - 6, // Center text vertically
        style: {
          text: val.toString(),
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          fill: isDark ? "#ffffff" : "#000000",
        },
        silent: true,
        z: 100,
      });
    }
    
    // Second y-axis (50-100, interval 10) - positioned at x=172px, grid extends 45 to 105 for padding
    for (let val = 50; val <= 100; val += 10) {
      const yPercent = ((105 - val) / 60) * 100; // Range is 45-105, so 60 units total
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 172,
        top: yPos - 6,
        style: {
          text: val.toString(),
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          fill: "#8b5cf6",
        },
        silent: true,
        z: 100,
      });
    }
    
    // ECharts automatically generates vertical grid lines via splitLine/minorSplitLine in x-axis config
    // No need for custom graphics anymore

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
      graphic: [
        // Y-axis labels
        ...yAxisLabels.map((label, i) => ({ ...label, id: `y-label-${i}` })),
        // Zone placeholders (will be replaced by useEffect)
        {
          id: 'past-non-editable-zone',
          type: "rect",
          left: 0,
          top: VITALS_TOP,
          shape: { x: 0, y: 0, width: 0, height: 0 },
          style: { fill: 'transparent' },
          silent: true,
          z: 0,
        },
        {
          id: 'editable-zone',
          type: "rect",
          left: 0,
          top: VITALS_TOP,
          shape: { x: 0, y: 0, width: 0, height: 0 },
          style: { fill: 'transparent' },
          silent: true,
          z: 0,
        },
        {
          id: 'future-non-editable-zone',
          type: "rect",
          left: 0,
          top: VITALS_TOP,
          shape: { x: 0, y: 0, width: 0, height: 0 },
          style: { fill: 'transparent' },
          silent: true,
          z: 0,
        },
        {
          id: 'now-indicator',
          type: "line",
          left: 0,
          top: VITALS_TOP,
          shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
          style: { stroke: 'transparent', lineWidth: 0 },
          silent: true,
          z: 999, // Very high z-index to always stay on top
        },
      ],
      dataZoom: [{
        type: "inside",
        xAxisIndex: grids.map((_, i) => i),
        // Preserve current zoom state if available
        ...(zoomPercent ? { start: zoomPercent.start, end: zoomPercent.end } : {}),
        throttle: 50,
        zoomLock: true,
        orient: 'horizontal',
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
        moveOnMouseMove: false,
        disabled: true, // Disable all touch/mouse interactions - use external controls only
        filterMode: "none",
      }],
      tooltip: {
        trigger: "item", // Changed from "axis" to "item" to show on hover over data points
        textStyle: { fontFamily: "Poppins, sans-serif" },
        formatter: (params: any) => {
          if (Array.isArray(params)) params = params[0];
          if (!params || !params.data) return '';
          
          const [timestamp, value] = params.data;
          const time = new Date(timestamp).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
          });
          
          let label = '';
          let unit = '';
          
          if (params.seriesName.includes('Heart Rate')) {
            label = 'HR';
            unit = ' bpm';
          } else if (params.seriesName.includes('Systolic')) {
            label = 'Systolic BP';
            unit = ' mmHg';
          } else if (params.seriesName.includes('Diastolic')) {
            label = 'Diastolic BP';
            unit = ' mmHg';
          } else if (params.seriesName.includes('SpO2')) {
            label = 'SpO₂';
            unit = '%';
          }
          
          return `<div style="padding: 4px 8px;">
            <div style="font-weight: 600; margin-bottom: 2px;">${label}: ${value}${unit}</div>
            <div style="font-size: 11px; opacity: 0.8;">${time}</div>
          </div>`;
        },
      },
    } as echarts.EChartsOption;
  }, [data, isDark, activeSwimlanes, now, hrDataPoints, bpDataPoints, spo2DataPoints, ventilationData, medicationDoseData, medications, zoomPercent, pendingSysValue, bpEntryMode, currentTime, collapsedSwimlanes]);

  // Calculate component height
  const VITALS_HEIGHT = 340;
  const VITALS_TOP_POS = 32; // Position accounting for sticky header (32px)
  const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
  const componentHeight = height ?? (VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight);

  // Zoom levels: time spans for different viewing granularities
  const zoomLevels = [
    5 * 60 * 1000,        // 5 min
    10 * 60 * 1000,       // 10 min
    30 * 60 * 1000,       // 30 min
    50 * 60 * 1000,       // 50 min - DEFAULT
    80 * 60 * 1000,       // 80 min
    120 * 60 * 1000,      // 120 min (2 hours)
    240 * 60 * 1000,      // 240 min (4 hours)
    480 * 60 * 1000,      // 480 min (8 hours)
    1200 * 60 * 1000,     // 1200 min (20 hours)
  ];

  // Find closest zoom level to current span
  const findClosestZoomLevel = (currentSpan: number): number => {
    let closest = zoomLevels[0];
    let minDiff = Math.abs(currentSpan - closest);
    
    for (const level of zoomLevels) {
      const diff = Math.abs(currentSpan - level);
      if (diff < minDiff) {
        minDiff = diff;
        closest = level;
      }
    }
    return zoomLevels.indexOf(closest);
  };

  // Zoom and pan handlers
  const handleZoomIn = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const currentSpan = currentMax - currentMin;
        
        // Find current level and go one step smaller
        const currentLevelIndex = findClosestZoomLevel(currentSpan);
        const newLevelIndex = Math.max(0, currentLevelIndex - 1);
        const newSpan = zoomLevels[newLevelIndex];
        
        const center = (currentMin + currentMax) / 2;
        
        // Constrain to data bounds
        let newStart = center - newSpan / 2;
        let newEnd = center + newSpan / 2;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = newStart + newSpan;
        }
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = newEnd - newSpan;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handleZoomOut = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const currentSpan = currentMax - currentMin;
        
        // Find current level and go one step larger
        const currentLevelIndex = findClosestZoomLevel(currentSpan);
        const newLevelIndex = Math.min(zoomLevels.length - 1, currentLevelIndex + 1);
        const newSpan = zoomLevels[newLevelIndex];
        
        const center = (currentMin + currentMax) / 2;
        
        // Constrain to data bounds
        let newStart = center - newSpan / 2;
        let newEnd = center + newSpan / 2;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = Math.min(newStart + newSpan, data.endTime);
        }
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = Math.max(newEnd - newSpan, data.startTime);
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handlePanLeft = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
        
        // Constrain to data bounds
        let newStart = currentMin - panStep;
        let newEnd = currentMax - panStep;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = newStart + span;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handlePanRight = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
        
        // Constrain to data bounds
        let newStart = currentMin + panStep;
        let newEnd = currentMax + panStep;
        
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = newEnd - span;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handleResetZoom = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const currentTime = now || data.endTime;
      const thirtyMinutes = 30 * 60 * 1000;
      const initialStartTime = currentTime - thirtyMinutes;
      const initialEndTime = currentTime + thirtyMinutes;
      
      // Convert to percentages for dataZoom
      const fullRange = data.endTime - data.startTime;
      const startPercent = ((initialStartTime - data.startTime) / fullRange) * 100;
      const endPercent = ((initialEndTime - data.startTime) / fullRange) * 100;
      
      chart.dispatchAction({
        type: 'dataZoom',
        start: startPercent,
        end: endPercent,
      });
    }
  };

  // Handle camera capture with hybrid detection
  const handleCameraCapture = async (imageBase64: string, timestamp: number) => {
    setIsProcessingImage(true);
    
    try {
      // Step 1: Preprocess image (resize and compress only - skip grayscale for performance)
      const { preprocessImage } = await import('@/lib/imagePreprocessing');
      const preprocessed = await preprocessImage(imageBase64, {
        maxWidth: 512, // Reduced from 768 for faster mobile processing
        quality: 0.6,  // Reduced from 0.75 for faster compression
        grayscale: false, // Skip pixel-by-pixel grayscale conversion - not needed for modern OCR/AI
      });
      
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Image Preprocessed",
      //   description: `Optimized: ${preprocessed.sizeReduction}% smaller`,
      // });
      
      // Step 2: Try fast seven-segment detection first
      const { detectVitalsFromImage, validateVitalRange, clampToRange } = await import('@/lib/sevenSegmentOCR');
      const localDetection = await detectVitalsFromImage(preprocessed.base64);
      
      // Step 3: Determine if we need AI fallback
      const highConfidenceThreshold = 0.9;
      const needsAI = 
        !localDetection.hr || localDetection.hr.confidence < highConfidenceThreshold ||
        !localDetection.spo2 || localDetection.spo2.confidence < highConfidenceThreshold ||
        !localDetection.sysBP || localDetection.sysBP.confidence < highConfidenceThreshold ||
        !localDetection.diaBP || localDetection.diaBP.confidence < highConfidenceThreshold;
      
      let finalData: any = {};
      
      if (needsAI) {
        // Step 4: Fall back to OpenAI Vision for low confidence or missing values
        // Toast notification disabled (can be re-enabled later)
        // toast({
        //   title: "Analyzing with AI...",
        //   description: "Using advanced detection for complex readings",
        // });
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        let aiData: MonitorAnalysisResult | any = {};
        try {
          const response = await fetch('/api/analyze-monitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: preprocessed.base64 }),
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error('Failed to analyze image with AI');
          }
          
          aiData = await response.json();
        
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('AI analysis timed out after 30 seconds. Please try again.');
          }
          throw fetchError;
        }
        
        // Check if new API format (with parameters array) or old format
        const isNewFormat = aiData.parameters && Array.isArray(aiData.parameters);
        
        let hr, sysBP, diaBP, spo2;
        let transformedVitals: any = {};
        let transformedVentilation: any = {};
        
        if (isNewFormat) {
          // NEW FORMAT: Extract vitals from parameters array
          const vitalParams = aiData.parameters.filter((p: any) => p.category === 'vitals');
          const ventParams = aiData.parameters.filter((p: any) => p.category === 'ventilation');
          
          // Map vitals to old format
          vitalParams.forEach((param: any) => {
            if (param.standardName === 'HR') {
              hr = param.value;
            } else if (param.standardName === 'SysBP') {
              sysBP = param.value;
            } else if (param.standardName === 'DiaBP') {
              diaBP = param.value;
            } else if (param.standardName === 'SpO2') {
              spo2 = param.value;
            }
          });
          
          // Map ventilation to old format
          ventParams.forEach((param: any) => {
            const key = param.standardName.charAt(0).toLowerCase() + param.standardName.slice(1);
            transformedVentilation[key] = param.value;
          });
        } else {
          // OLD FORMAT: Use directly
          hr = aiData.vitals?.hr;
          sysBP = aiData.vitals?.sysBP;
          diaBP = aiData.vitals?.diaBP;
          spo2 = aiData.vitals?.spo2;
          transformedVentilation = aiData.ventilation || {};
        }
        
        // Merge with local detection, preferring high-confidence local values
        hr = (localDetection.hr && localDetection.hr.confidence >= highConfidenceThreshold) 
          ? localDetection.hr.value 
          : hr;
        sysBP = (localDetection.sysBP && localDetection.sysBP.confidence >= highConfidenceThreshold)
          ? localDetection.sysBP.value
          : sysBP;
        diaBP = (localDetection.diaBP && localDetection.diaBP.confidence >= highConfidenceThreshold)
          ? localDetection.diaBP.value
          : diaBP;
        spo2 = (localDetection.spo2 && localDetection.spo2.confidence >= highConfidenceThreshold)
          ? localDetection.spo2.value
          : spo2;
        
        // Apply range validation and clamping
        if (hr !== null && hr !== undefined && !validateVitalRange('hr', hr)) {
          hr = clampToRange('hr', hr);
        }
        if (sysBP !== null && sysBP !== undefined && !validateVitalRange('sysBP', sysBP)) {
          sysBP = clampToRange('sysBP', sysBP);
        }
        if (diaBP !== null && diaBP !== undefined && !validateVitalRange('diaBP', diaBP)) {
          diaBP = clampToRange('diaBP', diaBP);
        }
        if (spo2 !== null && spo2 !== undefined && !validateVitalRange('spo2', spo2)) {
          spo2 = clampToRange('spo2', spo2);
        }
        
        finalData = {
          vitals: { hr, sysBP, diaBP, spo2 },
          ventilation: transformedVentilation,
          tof: aiData.tof,
          pumps: aiData.pumps,
          detectionMethod: isNewFormat ? aiData.detectionMethod : 'hybrid-ai',
          // Store new format data for enhanced confirmation dialog
          ...(isNewFormat && {
            monitorType: aiData.monitorType,
            confidence: aiData.confidence,
            parameters: aiData.parameters,
          }),
        };
      } else {
        // Use local detection only with range validation
        let hr = localDetection.hr?.value;
        let sysBP = localDetection.sysBP?.value;
        let diaBP = localDetection.diaBP?.value;
        let spo2 = localDetection.spo2?.value;
        
        // Apply range validation and clamping
        if (hr !== null && hr !== undefined && !validateVitalRange('hr', hr)) {
          hr = clampToRange('hr', hr);
        }
        if (sysBP !== null && sysBP !== undefined && !validateVitalRange('sysBP', sysBP)) {
          sysBP = clampToRange('sysBP', sysBP);
        }
        if (diaBP !== null && diaBP !== undefined && !validateVitalRange('diaBP', diaBP)) {
          diaBP = clampToRange('diaBP', diaBP);
        }
        if (spo2 !== null && spo2 !== undefined && !validateVitalRange('spo2', spo2)) {
          spo2 = clampToRange('spo2', spo2);
        }
        
        finalData = {
          vitals: { hr, sysBP, diaBP, spo2 },
          ventilation: null,
          tof: null,
          pumps: null,
          detectionMethod: 'local-ocr',
        };
      }
      
      setExtractedData({ ...finalData, timestamp });
      setConfirmationDialogOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze image",
        variant: "destructive",
      });
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Confirm and add extracted data to timeline with validation
  const handleConfirmExtractedData = async () => {
    if (!extractedData) return;

    const { vitals, ventilation, tof, pumps, timestamp, parameters } = extractedData;
    
    // Import validation utilities
    const { validateVitalRange, clampToRange } = await import('@/lib/sevenSegmentOCR');
    const { findStandardParameter } = await import('@shared/monitorParameters');
    
    let addedItems: string[] = [];
    let warningItems: string[] = [];

    // Handle NEW FORMAT with parameters array
    if (parameters && Array.isArray(parameters)) {
      // Process vitals from parameters
      const vitalParams = parameters.filter((p: any) => p.category === 'vitals');
      vitalParams.forEach((param: any) => {
        const paramDef = findStandardParameter(param.standardName);
        let value = param.value;
        
        // Validate and clamp if needed
        if (paramDef?.min !== undefined && paramDef?.max !== undefined) {
          if (value < paramDef.min || value > paramDef.max) {
            const clamped = Math.max(paramDef.min, Math.min(paramDef.max, value));
            warningItems.push(`${param.standardName} ${value}→${clamped}`);
            value = clamped;
          }
        }
        
        // Route to appropriate state
        if (param.standardName === 'HR') {
          setHrDataPoints(prev => [...prev, [timestamp, value]]);
          addedItems.push('HR');
        } else if (param.standardName === 'SpO2') {
          setSpo2DataPoints(prev => [...prev, [timestamp, value]]);
          addedItems.push('SpO2');
        }
      });
      
      // Handle BP separately since it needs both sys and dia
      const sysBP = vitalParams.find((p: any) => p.standardName === 'SysBP');
      const diaBP = vitalParams.find((p: any) => p.standardName === 'DiaBP');
      if (sysBP && diaBP) {
        let sysValue = sysBP.value;
        let diaValue = diaBP.value;
        
        const sysDef = findStandardParameter('SysBP');
        const diaDef = findStandardParameter('DiaBP');
        
        if (sysDef?.min !== undefined && sysDef?.max !== undefined) {
          if (sysValue < sysDef.min || sysValue > sysDef.max) {
            const clamped = Math.max(sysDef.min, Math.min(sysDef.max, sysValue));
            warningItems.push(`SysBP ${sysValue}→${clamped}`);
            sysValue = clamped;
          }
        }
        if (diaDef?.min !== undefined && diaDef?.max !== undefined) {
          if (diaValue < diaDef.min || diaValue > diaDef.max) {
            const clamped = Math.max(diaDef.min, Math.min(diaDef.max, diaValue));
            warningItems.push(`DiaBP ${diaValue}→${clamped}`);
            diaValue = clamped;
          }
        }
        
        setBpDataPoints(prev => ({
          sys: [...prev.sys, [timestamp, sysValue]],
          dia: [...prev.dia, [timestamp, diaValue]],
        }));
        addedItems.push('BP');
      }
      
      // Process ventilation parameters - add to swimlane events
      const ventParams = parameters.filter((p: any) => p.category === 'ventilation');
      if (ventParams.length > 0) {
        ventParams.forEach((param: any) => {
          // Find matching ventilation swimlane ID
          const paramIndex = ventilationParams.findIndex(vp => 
            vp.includes(param.standardName) || 
            (param.standardName === 'RR' && vp.includes('Respiratory Rate')) ||
            (param.standardName === 'TidalVolume' && vp.includes('Tidal Volume')) ||
            (param.standardName === 'EtCO2' && vp.includes('etCO2')) ||
            (param.standardName === 'FiO2' && vp.includes('FiO2')) ||
            (param.standardName === 'PEEP' && vp.includes('PEEP')) ||
            (param.standardName === 'PIP' && vp.includes('P insp'))
          );
          
          if (paramIndex !== -1) {
            const swimlaneId = `ventilation-${paramIndex}`;
            
            // Map standardName to state key
            const paramKey = param.standardName === 'EtCO2' ? 'etCO2' :
                             param.standardName === 'PIP' ? 'pip' :
                             param.standardName === 'PEEP' ? 'peep' :
                             param.standardName === 'TidalVolume' ? 'tidalVolume' :
                             param.standardName === 'RR' ? 'respiratoryRate' :
                             param.standardName === 'MinuteVolume' ? 'minuteVolume' :
                             param.standardName === 'FiO2' ? 'fiO2' : null;
            
            if (paramKey && typeof param.value === 'number') {
              console.log(`[Ventilation] Storing ${param.standardName} (${paramKey}): ${param.value} at ${new Date(timestamp).toLocaleTimeString()}`);
              setVentilationData(prev => ({
                ...prev,
                [paramKey]: [...prev[paramKey as keyof typeof prev], [timestamp, param.value as number]]
              }));
              addedItems.push(param.standardName);
            } else {
              console.warn(`[Ventilation] Skipped ${param.standardName}: paramKey=${paramKey}, value type=${typeof param.value}`);
            }
          }
        });
      }
      
      // Process TOF parameters
      const tofParams = parameters.filter((p: any) => p.category === 'tof');
      if (tofParams.length > 0) {
        console.log('TOF data captured at', new Date(timestamp).toLocaleTimeString(), tofParams);
        addedItems.push('TOF (logged)');
      }
    } else {
      // OLD FORMAT: Handle vitals as before
      if (vitals?.hr !== null && vitals?.hr !== undefined) {
        let hr = vitals.hr;
        if (!validateVitalRange('hr', hr)) {
          const clamped = clampToRange('hr', hr);
          warningItems.push(`HR ${hr}→${clamped} (out of range)`);
          hr = clamped;
        }
        setHrDataPoints(prev => [...prev, [timestamp, hr]]);
        addedItems.push('HR');
      }
      if ((vitals?.sysBP !== null && vitals?.sysBP !== undefined) && (vitals?.diaBP !== null && vitals?.diaBP !== undefined)) {
        let sysBP = vitals.sysBP;
        let diaBP = vitals.diaBP;
        if (!validateVitalRange('sysBP', sysBP)) {
          const clamped = clampToRange('sysBP', sysBP);
          warningItems.push(`SysBP ${sysBP}→${clamped}`);
          sysBP = clamped;
        }
        if (!validateVitalRange('diaBP', diaBP)) {
          const clamped = clampToRange('diaBP', diaBP);
          warningItems.push(`DiaBP ${diaBP}→${clamped}`);
          diaBP = clamped;
        }
        setBpDataPoints(prev => ({
          sys: [...prev.sys, [timestamp, sysBP]],
          dia: [...prev.dia, [timestamp, diaBP]],
        }));
        addedItems.push('BP');
      }
      if (vitals?.spo2 !== null && vitals?.spo2 !== undefined) {
        let spo2 = vitals.spo2;
        if (!validateVitalRange('spo2', spo2)) {
          const clamped = clampToRange('spo2', spo2);
          warningItems.push(`SpO2 ${spo2}→${clamped}`);
          spo2 = clamped;
        }
        setSpo2DataPoints(prev => [...prev, [timestamp, spo2]]);
        addedItems.push('SpO2');
      }

      // Log ventilation parameters (old format)
      if (ventilation && Object.values(ventilation).some((v: any) => v !== null && v !== undefined)) {
        console.log('Ventilation data captured at', new Date(timestamp).toLocaleTimeString(), ventilation);
        addedItems.push('Ventilation (logged)');
      }

      // Log TOF monitoring data
      if (tof && ((tof.ratio !== null && tof.ratio !== undefined) || (tof.count !== null && tof.count !== undefined))) {
        console.log('TOF data captured at', new Date(timestamp).toLocaleTimeString(), tof);
        addedItems.push('TOF (logged)');
      }

      // Log pump/perfusion data
      if (pumps && pumps.length > 0) {
        console.log('Pump data captured at', new Date(timestamp).toLocaleTimeString(), pumps);
        addedItems.push('Pumps (logged)');
      }
    }

    let description = addedItems.length > 0 
      ? `Added: ${addedItems.join(', ')}` 
      : 'No data extracted from image';
    
    // Add warning items if any values were clamped
    if (warningItems.length > 0) {
      description += ` | Adjusted: ${warningItems.join(', ')}`;
    }

    toast({
      title: "Data Processed",
      description,
      duration: 4000,
      variant: warningItems.length > 0 ? "default" : "default",
    });

    setConfirmationDialogOpen(false);
    setExtractedData(null);
  };

  // Handle voice command for drug administration
  const handleVoiceCommand = async (audioBlob: Blob, timestamp: number) => {
    try {
      // Convert blob to base64 (browser-compatible)
      const reader = new FileReader();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      
      // Step 1: Transcribe audio using Whisper
      const transcribeResponse = await fetch('/api/transcribe-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioData: audioBase64 }),
      });
      
      if (!transcribeResponse.ok) {
        throw new Error('Failed to transcribe voice');
      }
      
      const { transcription } = await transcribeResponse.json();
      console.log('[Voice] Transcription:', transcription);
      
      // Step 2: Parse drug command(s) - may contain multiple drugs
      const parseResponse = await fetch('/api/parse-drug-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription }),
      });
      
      if (!parseResponse.ok) {
        throw new Error('Failed to parse drug command');
      }
      
      const response = await parseResponse.json();
      console.log('[Voice] Parsed command:', response);
      
      if (!response.drugs || response.drugs.length === 0) {
        toast({
          title: "Could not understand command",
          description: `Heard: "${transcription}"`,
          variant: "destructive",
        });
        return;
      }
      
      // Step 3 & 4: Process each drug in the command
      const addedDrugs: string[] = [];
      let newMedications = [...medications];
      const doseUpdates: Record<string, [number, string][]> = {};
      
      for (const drugCommand of response.drugs) {
        if (!drugCommand.drug || !drugCommand.dose) continue;
        
        // Find matching medication swimlane or create new one
        const match = findMatchingMedication(drugCommand.drug);
        
        let targetSwimlaneId: string;
        let matchInfo = "";
        
        if (match) {
          // Found a matching medication
          targetSwimlaneId = match.swimlaneId;
          matchInfo = ` (${Math.round(match.score * 100)}%)`;
          console.log(`[Voice] Matched "${drugCommand.drug}" to "${match.fullName}" (score: ${match.score})`);
        } else {
          // No match found - create new medication swimlane
          const newMedName = `${drugCommand.drug} (voice)`;
          const newIndex = newMedications.length;
          targetSwimlaneId = `medication-dynamic-${newIndex}`;
          newMedications.push(newMedName);
          matchInfo = " (new)";
          console.log(`[Voice] No match found, creating new medication: ${newMedName}`);
        }
        
        // Prepare dose data point
        if (!doseUpdates[targetSwimlaneId]) {
          doseUpdates[targetSwimlaneId] = [];
        }
        doseUpdates[targetSwimlaneId].push([timestamp, drugCommand.dose] as [number, string]);
        
        addedDrugs.push(`${drugCommand.drug} ${drugCommand.dose}${matchInfo}`);
      }
      
      // Update medications state if new ones were created
      if (newMedications.length > medications.length) {
        setMedications(newMedications);
      }
      
      // Update all dose data
      setMedicationDoseData(prev => {
        const updated = { ...prev };
        for (const [swimlaneId, doses] of Object.entries(doseUpdates)) {
          const existingData = updated[swimlaneId] || [];
          updated[swimlaneId] = [...existingData, ...doses];
        }
        return updated;
      });
      
      // TODO: Store in backend anesthesia case data for persistence
      
      const title = addedDrugs.length === 1 ? "Drug Recorded" : `${addedDrugs.length} Drugs Recorded`;
      toast({
        title,
        description: addedDrugs.join(", "),
      });
      
    } catch (error: any) {
      console.error('[Voice] Error:', error);
      toast({
        title: "Voice command failed",
        description: error.message || "Failed to process voice command",
        variant: "destructive",
      });
    }
  };

  // Handle medication dose entry
  const handleMedicationDoseEntry = () => {
    if (!pendingMedicationDose || !medicationDoseInput.trim()) return;
    
    const { swimlaneId, time, label } = pendingMedicationDose;
    
    setMedicationDoseData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [time, medicationDoseInput.trim()] as [number, string]]
      };
    });
    
    // Toast notification disabled (can be re-enabled later)
    // toast({
    //   title: "Dose Added",
    //   description: `${label}: ${medicationDoseInput.trim()} at ${new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
    // });
    
    // Reset dialog state
    setShowMedicationDoseDialog(false);
    setPendingMedicationDose(null);
    setMedicationDoseInput("");
  };

  // Handle ventilation parameter entry
  const handleVentilationParameterEntry = () => {
    if (!pendingVentilationValue || !ventilationValueInput.trim()) return;
    
    const { paramKey, time, label } = pendingVentilationValue;
    const value = parseFloat(ventilationValueInput.trim());
    
    if (isNaN(value)) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    
    setVentilationData(prev => {
      const existingData = prev[paramKey] || [];
      return {
        ...prev,
        [paramKey]: [...existingData, [time, value] as VitalPoint]
      };
    });
    
    // Toast notification disabled (can be re-enabled later)
    // toast({
    //   title: "Value Added",
    //   description: `${label}: ${value} at ${new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
    // });
    
    // Reset dialog state
    setShowVentilationDialog(false);
    setPendingVentilationValue(null);
    setVentilationValueInput("");
  };

  // Handle event comment save
  const handleEventSave = () => {
    if (!eventTextInput.trim()) return;
    
    if (editingEvent) {
      // Edit existing event
      setEventComments(prev => 
        prev.map(ev => ev.id === editingEvent.id ? { ...ev, text: eventTextInput.trim() } : ev)
      );
    } else if (pendingEvent) {
      // Add new event
      const newEvent: EventComment = {
        id: `event-${Date.now()}`,
        time: pendingEvent.time,
        text: eventTextInput.trim(),
      };
      setEventComments(prev => [...prev, newEvent]);
    }
    
    // Reset dialog state
    setShowEventDialog(false);
    setPendingEvent(null);
    setEditingEvent(null);
    setEventTextInput("");
  };

  // Handle event delete
  const handleEventDelete = () => {
    if (editingEvent) {
      setEventComments(prev => prev.filter(ev => ev.id !== editingEvent.id));
    }
    
    setShowEventDialog(false);
    setEditingEvent(null);
    setEventTextInput("");
  };

  // Handle medication dose edit save
  const handleMedicationDoseEditSave = () => {
    if (!editingMedicationDose || !medicationEditInput.trim()) return;
    
    const { swimlaneId, index } = editingMedicationDose;
    
    setMedicationDoseData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = [...existingData];
      updated[index] = [updated[index][0], medicationEditInput.trim()];
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    // Reset dialog state
    setShowMedicationEditDialog(false);
    setEditingMedicationDose(null);
    setMedicationEditInput("");
  };

  // Handle medication dose delete
  const handleMedicationDoseDelete = () => {
    if (!editingMedicationDose) return;
    
    const { swimlaneId, index } = editingMedicationDose;
    
    setMedicationDoseData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = existingData.filter((_, i) => i !== index);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    setShowMedicationEditDialog(false);
    setEditingMedicationDose(null);
    setMedicationEditInput("");
  };

  // Handle ventilation bulk entry save
  const handleVentilationBulkSave = () => {
    if (!pendingVentilationBulk) return;
    
    const { time } = pendingVentilationBulk;
    
    // Add all filled parameters at the same time
    setVentilationData(prev => {
      const updated = { ...prev };
      
      if (bulkVentilationParams.peep) {
        const value = parseFloat(bulkVentilationParams.peep);
        if (!isNaN(value)) {
          updated.peep = [...updated.peep, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.fiO2) {
        const value = parseFloat(bulkVentilationParams.fiO2);
        if (!isNaN(value)) {
          updated.fiO2 = [...updated.fiO2, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.tidalVolume) {
        const value = parseFloat(bulkVentilationParams.tidalVolume);
        if (!isNaN(value)) {
          updated.tidalVolume = [...updated.tidalVolume, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.respiratoryRate) {
        const value = parseFloat(bulkVentilationParams.respiratoryRate);
        if (!isNaN(value)) {
          updated.respiratoryRate = [...updated.respiratoryRate, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.etCO2) {
        const value = parseFloat(bulkVentilationParams.etCO2);
        if (!isNaN(value)) {
          updated.etCO2 = [...updated.etCO2, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.pip) {
        const value = parseFloat(bulkVentilationParams.pip);
        if (!isNaN(value)) {
          updated.pip = [...updated.pip, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.minuteVolume) {
        const value = parseFloat(bulkVentilationParams.minuteVolume);
        if (!isNaN(value)) {
          updated.minuteVolume = [...updated.minuteVolume, [time, value] as VitalPoint];
        }
      }
      
      return updated;
    });
    
    // Reset dialog state
    setShowVentilationBulkDialog(false);
    setPendingVentilationBulk(null);
  };

  // Calculate swimlane positions for sidebar
  const SWIMLANE_START = VITALS_TOP_POS + VITALS_HEIGHT;
  let currentTop = SWIMLANE_START;
  const swimlanePositions = activeSwimlanes.map((lane) => {
    const pos = { ...lane, top: currentTop };
    currentTop += lane.height;
    return pos;
  });
  
  // Calculate exact height needed for vertical lines (they start at VITALS_TOP and extend chartHeight down)
  // chartHeight = VITALS_HEIGHT + swimlanesHeight (from the option calculation)
  const backgroundsHeight = VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight;
  
  return (
    <div className="w-full relative" style={{ height: componentHeight }}>
      {/* Sticky Timeline Header */}
      <StickyTimelineHeader
        startTime={data.startTime}
        endTime={data.endTime}
        currentStart={currentZoomStart}
        currentEnd={currentZoomEnd}
        isDark={isDark}
        onPanLeft={handlePanLeft}
        onPanRight={handlePanRight}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onCameraCapture={handleCameraCapture}
        onVoiceCommand={handleVoiceCommand}
      />
      
      {/* Swimlane backgrounds - explicit height matching vertical lines extent */}
      <div className="absolute left-0 top-0 right-0 pointer-events-none z-0" style={{ height: `${backgroundsHeight}px` }}>
        {swimlanePositions.map((lane, index) => (
          <div 
            key={lane.id}
            className="absolute w-full border-b" 
            style={{ 
              top: `${lane.top}px`, 
              height: `${lane.height}px`, 
              backgroundColor: isDark ? lane.colorDark : lane.colorLight,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }} 
          />
        ))}
      </div>

      {/* Left sidebar */}
      <div className="absolute left-0 top-0 w-[200px] h-full border-r border-border z-30 bg-background">
        {/* Y-axis scales - manually rendered on right side of white area */}
        <div className="absolute top-[32px] h-[340px] w-full pointer-events-none z-50">
          {/* First scale: 0-220 with 20-unit steps (11 values) - close to grid, grid extends -20 to 240 for top and bottom padding */}
          {[0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((val) => {
            const yPercent = ((240 - val) / 260) * 100;
            return (
              <div 
                key={`scale1-${val}`}
                className="absolute text-xs font-medium text-foreground"
                style={{ 
                  right: '60px',
                  top: `${yPercent}%`,
                  transform: 'translateY(-50%)'
                }}
              >
                {val}
              </div>
            );
          })}
          
          {/* Second scale: 50-100 with 10-unit steps (6 values) - purple, closest to grid, extends 45 to 105 for padding */}
          {[50, 60, 70, 80, 90, 100].map((val) => {
            const yPercent = ((105 - val) / 60) * 100;
            return (
              <div 
                key={`scale2-${val}`}
                className="absolute text-xs font-bold"
                style={{ 
                  right: '28px',
                  top: `${yPercent}%`,
                  transform: 'translateY(-50%)',
                  color: '#8b5cf6'
                }}
              >
                {val}
              </div>
            );
          })}
        </div>
        
        {/* Vitals icon buttons */}
        <div className="absolute top-[32px] h-[340px] w-full flex flex-col items-start justify-center gap-2 pl-4">
          <button
            onClick={() => {
              if (activeToolMode === 'bp') {
                setActiveToolMode(null);
                setBpEntryMode('sys');
                setPendingSysValue(null);
              } else {
                setActiveToolMode('bp');
                setBpEntryMode('sys');
                setPendingSysValue(null);
              }
            }}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'bp' 
                ? 'border-black bg-black/20' 
                : 'border-border bg-background hover:border-black hover:bg-black/10'
            }`}
            data-testid="button-vitals-bp"
            title="Blood Pressure (NIBP)"
          >
            <ChevronsDownUp className={`w-5 h-5 transition-colors ${activeToolMode === 'bp' ? 'text-black dark:text-white' : 'hover:text-black dark:hover:text-white'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'hr' ? null : 'hr')}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'hr' 
                ? 'border-red-500 bg-red-500/20' 
                : 'border-border bg-background hover:border-red-500 hover:bg-red-500/10'
            }`}
            data-testid="button-vitals-heart"
            title="Heart Rate"
          >
            <Heart className={`w-5 h-5 transition-colors ${activeToolMode === 'hr' ? 'text-red-500' : 'hover:text-red-500'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'spo2' ? null : 'spo2')}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'spo2' 
                ? 'border-blue-500 bg-blue-500/20' 
                : 'border-border bg-background hover:border-blue-500 hover:bg-blue-500/10'
            }`}
            data-testid="button-vitals-oxygen"
            title="Oxygenation (SpO2)"
          >
            <CircleDot className={`w-5 h-5 transition-colors ${activeToolMode === 'spo2' ? 'text-blue-500' : 'hover:text-blue-500'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(null)}
            className="p-2 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors flex items-center justify-center shadow-sm"
            data-testid="button-vitals-combo"
            title="Combined View"
          >
            <Blend className="w-5 h-5" />
          </button>
        </div>

        {/* Swimlane labels */}
        {swimlanePositions.map((lane, index) => {
          const isZeitenLane = lane.id === "zeiten";
          const isMedParent = lane.id === "medikamente";
          const isVentParent = lane.id === "ventilation";
          const isMedChild = lane.id.startsWith("medication-");
          const isVentChild = lane.id.startsWith("ventilation-");
          const isDynamicMed = lane.id.startsWith("medication-dynamic-");
          const isChild = isMedChild || isVentChild;
          const isParent = isMedParent || isVentParent;
          const medIndex = isDynamicMed ? parseInt(lane.id.split("-")[2]) : -1;
          
          return (
            <div 
              key={lane.id}
              className="absolute w-full flex items-center justify-between px-2 border-b" 
              style={{ 
                top: `${lane.top}px`,
                height: `${lane.height}px`,
                backgroundColor: isDark ? lane.colorDark : lane.colorLight,
                borderColor: isDark ? "#444444" : "#d1d5db"
              }}
            >
              <div className="flex items-center gap-1 flex-1">
                {isParent && (
                  <button
                    onClick={() => toggleSwimlane(lane.id)}
                    className="p-0.5 rounded hover:bg-background/50 transition-colors"
                    data-testid={`button-toggle-${lane.id}`}
                    title={collapsedSwimlanes.has(lane.id) ? "Expand" : "Collapse"}
                  >
                    {collapsedSwimlanes.has(lane.id) ? (
                      <ChevronRight className="w-4 h-4 text-black dark:text-white" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-black dark:text-white" />
                    )}
                  </button>
                )}
                <span className={`${isChild ? 'text-xs' : 'text-sm font-semibold'} text-black dark:text-white`}>
                  {lane.label}
                </span>
              </div>
              
              {isZeitenLane && (
                <button
                  onClick={() => setBulkEditDialogOpen(true)}
                  className="p-1 rounded hover:bg-background/50 transition-colors"
                  data-testid="button-edit-anesthesia-times"
                  title="Edit Anesthesia Times"
                >
                  <Clock className="w-4 h-4 text-black dark:text-white" />
                </button>
              )}
              
              {isMedParent && (
                <button
                  onClick={() => setShowAddMedDialog(true)}
                  className="p-1 rounded hover:bg-background/50 transition-colors"
                  data-testid="button-add-medication"
                  title="Add Medication"
                >
                  <Plus className="w-4 h-4 text-black dark:text-white" />
                </button>
              )}
              
              {isDynamicMed && (
                <button
                  onClick={() => handleRemoveMedication(medIndex)}
                  className="p-1 rounded hover:bg-background/50 transition-colors"
                  data-testid={`button-remove-medication-${medIndex}`}
                  title="Remove Medication"
                >
                  <X className="w-3 h-3 text-black dark:text-white" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ECharts timeline */}
      <div className={`absolute inset-0 z-20 ${activeToolMode ? 'pointer-events-none' : ''}`}>
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          onChartReady={handleChartReady}
          lazyUpdate
        />
      </div>

      {/* Interactive layer for vitals entry - only active when tool mode is selected */}
      {activeToolMode && (
        <div
          className="absolute z-30 cursor-crosshair"
          style={{
            left: '200px',
            right: '10px',
            top: '32px',
            height: '340px',
          }}
          onMouseMove={(e) => {
            // Skip hover preview on touch devices
            if (isTouchDevice) return;
            
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Use tracked zoom state (updated by dataZoom event listener)
            const visibleStart = currentZoomStart ?? data.startTime;
            const visibleEnd = currentZoomEnd ?? data.endTime;
            const visibleRange = visibleEnd - visibleStart;
            
            // Convert x-position to time
            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);
            
            // Snap to nearest vertical grid line - use the current snap interval (already calculated)
            console.log('Current snap interval (ms):', currentSnapInterval, 'minutes:', currentSnapInterval / 60000);
            time = Math.round(time / currentSnapInterval) * currentSnapInterval;
            
            // Convert y-position to value based on active tool
            let value: number;
            const yPercent = y / rect.height;
            
            if (activeToolMode === 'hr' || activeToolMode === 'bp') {
              // BP/HR scale: -20 to 240
              const minVal = -20;
              const maxVal = 240;
              value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
            } else if (activeToolMode === 'spo2') {
              // SpO2 scale: 45 to 105
              const minVal = 45;
              const maxVal = 105;
              value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
            } else {
              return; // No active tool mode
            }
            
            // Allow adding data points anywhere in the timeline (no restrictions)
            setHoverInfo({ x: e.clientX, y: e.clientY, value, time });
          }}
          onMouseLeave={() => setHoverInfo(null)}
          onClick={(e) => {
            if (isProcessingClick) return;
            
            setIsProcessingClick(true);
            
            // On touch devices, calculate value directly from click position
            let clickInfo = hoverInfo;
            if (isTouchDevice) {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              time = Math.round(time / currentSnapInterval) * currentSnapInterval;
              
              const yPercent = y / rect.height;
              let value: number;
              
              if (activeToolMode === 'hr' || activeToolMode === 'bp') {
                const minVal = -20;
                const maxVal = 240;
                value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
              } else if (activeToolMode === 'spo2') {
                const minVal = 45;
                const maxVal = 105;
                value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
              } else {
                setIsProcessingClick(false);
                return;
              }
              
              clickInfo = { x: e.clientX, y: e.clientY, value, time };
            }
            
            if (!clickInfo) {
              setIsProcessingClick(false);
              return;
            }
            
            // Add data point based on active tool mode
            if (activeToolMode === 'hr') {
              const newPoint: VitalPoint = [clickInfo.time, clickInfo.value];
              setHrDataPoints(prev => [...prev, newPoint]);
              setLastAction({ type: 'hr', data: newPoint });
              setHoverInfo(null);
              
              // Toast notification disabled (can be re-enabled later)
              // toast({
              //   title: `❤️ HR ${clickInfo.value} added`,
              //   description: new Date(clickInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
              //   duration: 3000,
              //   action: (
              //     <Button
              //       variant="outline"
              //       size="sm"
              //       onClick={handleUndo}
              //       data-testid="button-undo-hr"
              //     >
              //       <Undo2 className="w-4 h-4 mr-1" />
              //       Undo
              //     </Button>
              //   ),
              // });
              
              setTimeout(() => setIsProcessingClick(false), 100);
            } else if (activeToolMode === 'bp') {
              // Simplified BP entry: each click adds its value immediately (no pending gray bookmark)
              if (bpEntryMode === 'sys') {
                // Add systolic value immediately to the chart
                const sysPoint: VitalPoint = [clickInfo.time, clickInfo.value];
                setBpDataPoints(prev => ({
                  ...prev,
                  sys: [...prev.sys, sysPoint]
                }));
                
                // Store for reference and switch to diastolic mode
                setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
                setBpEntryMode('dia');
                setHoverInfo(null);
                setTimeout(() => setIsProcessingClick(false), 100);
              } else {
                // Add diastolic value immediately to the chart
                const diaPoint: VitalPoint = [clickInfo.time, clickInfo.value];
                setBpDataPoints(prev => ({
                  ...prev,
                  dia: [...prev.dia, diaPoint]
                }));
                
                // Reset to systolic mode
                setPendingSysValue(null);
                setBpEntryMode('sys');
                setHoverInfo(null);
                setTimeout(() => setIsProcessingClick(false), 100);
              }
            } else if (activeToolMode === 'spo2') {
              const newPoint: VitalPoint = [clickInfo.time, clickInfo.value];
              setSpo2DataPoints(prev => [...prev, newPoint]);
              setLastAction({ type: 'spo2', data: newPoint });
              setHoverInfo(null);
              
              // Toast notification disabled (can be re-enabled later)
              // toast({
              //   title: `💜 SpO2 ${clickInfo.value}% added`,
              //   description: new Date(clickInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
              //   duration: 3000,
              //   action: (
              //     <Button
              //       variant="outline"
              //       size="sm"
              //       onClick={handleUndo}
              //       data-testid="button-undo-spo2"
              //     >
              //       <Undo2 className="w-4 h-4 mr-1" />
              //       Undo
              //     </Button>
              //   ),
              // });
              
              setTimeout(() => setIsProcessingClick(false), 100);
            }
          }}
        />
      )}

      {/* Tooltip for vitals entry - only show on non-touch devices */}
      {hoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: hoverInfo.x + 10,
            top: hoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold">
            {activeToolMode === 'hr' && `HR: ${hoverInfo.value}`}
            {activeToolMode === 'bp' && `${bpEntryMode === 'sys' ? 'Systolic' : 'Diastolic'}: ${hoverInfo.value}`}
            {activeToolMode === 'spo2' && `SpO2: ${hoverInfo.value}%`}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(hoverInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
        </div>
      )}

      {/* Tooltip for Zeiten swimlane - only show on non-touch devices */}
      {zeitenHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: zeitenHoverInfo.x + 10,
            top: zeitenHoverInfo.y - 40,
          }}
        >
          {zeitenHoverInfo.nextMarker ? (
            <>
              <div className="text-sm font-semibold text-primary">
                {zeitenHoverInfo.nextMarker}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(zeitenHoverInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              All markers placed
            </div>
          )}
        </div>
      )}

      {/* Interactive layer for Zeiten swimlane - to place time markers */}
      {!activeToolMode && (() => {
        const zeitenLane = swimlanePositions.find(lane => lane.id === 'zeiten');
        if (!zeitenLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${zeitenLane.top}px`,
              height: `${zeitenLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              // Skip hover preview on touch devices
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              // Use tracked zoom state
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              // Convert x-position to time
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Always snap to 1-minute intervals for time markers
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              // Find next unplaced marker
              const nextMarkerIndex = timeMarkers.findIndex(m => m.time === null);
              const nextMarker = nextMarkerIndex !== -1 ? timeMarkers[nextMarkerIndex] : null;
              
              setZeitenHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time,
                nextMarker: nextMarker ? `${nextMarker.code} - ${nextMarker.label}` : null
              });
            }}
            onMouseLeave={() => setZeitenHoverInfo(null)}
            onClick={handleZeitenClick}
            data-testid="interactive-zeiten-lane"
          />
        );
      })()}

      {/* Interactive layer for Events swimlane - to add event comments */}
      {!activeToolMode && (() => {
        const eventsLane = swimlanePositions.find(lane => lane.id === 'ereignisse');
        if (!eventsLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${eventsLane.top}px`,
              height: `${eventsLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              setEventHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time
              });
            }}
            onMouseLeave={() => setEventHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              setPendingEvent({ time });
              setEventTextInput("");
              setShowEventDialog(true);
            }}
            data-testid="interactive-events-lane"
          />
        );
      })()}

      {/* Tooltip for events entry */}
      {eventHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: eventHoverInfo.x + 10,
            top: eventHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add event
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(eventHoverInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
        </div>
      )}

      {/* Interactive layers for medication swimlanes - to place dose labels */}
      {!activeToolMode && (() => {
        const medicationParentIndex = activeSwimlanes.findIndex(s => s.id === "medikamente");
        if (medicationParentIndex === -1 || collapsedSwimlanes.has("medikamente")) return null;
        
        return activeSwimlanes.map((lane, index) => {
          const isMedicationChild = lane.id.startsWith('medication-predefined-') || lane.id.startsWith('medication-dynamic-');
          if (!isMedicationChild) return null;
          
          const lanePosition = swimlanePositions.find(l => l.id === lane.id);
          if (!lanePosition) return null;
          
          return (
            <div
              key={lane.id}
              className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
              style={{
                left: '200px',
                right: '10px',
                top: `${lanePosition.top}px`,
                height: `${lanePosition.height}px`,
                zIndex: 35,
              }}
              onMouseMove={(e) => {
                if (isTouchDevice) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to current interval
                time = Math.round(time / currentSnapInterval) * currentSnapInterval;
                
                setMedicationHoverInfo({ 
                  x: e.clientX, 
                  y: e.clientY, 
                  time,
                  swimlaneId: lane.id,
                  label: lane.label.trim()
                });
              }}
              onMouseLeave={() => setMedicationHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to current interval
                time = Math.round(time / currentSnapInterval) * currentSnapInterval;
                
                // Check if we're clicking on an existing dose label
                const existingDoses = medicationDoseData[lane.id] || [];
                const clickTolerance = currentSnapInterval; // Allow clicking within one interval of the dose
                const existingDoseAtTime = existingDoses.find(([doseTime]) => 
                  Math.abs(doseTime - time) <= clickTolerance
                );
                
                if (existingDoseAtTime) {
                  // Open edit dialog for existing dose
                  const [doseTime, dose] = existingDoseAtTime;
                  const doseIndex = existingDoses.findIndex(([t, d]) => t === doseTime && d === dose);
                  setEditingMedicationDose({
                    swimlaneId: lane.id,
                    time: doseTime,
                    dose: dose.toString(),
                    index: doseIndex,
                  });
                  setMedicationEditInput(dose.toString());
                  setShowMedicationEditDialog(true);
                } else {
                  // Open add new dose dialog
                  setPendingMedicationDose({ 
                    swimlaneId: lane.id, 
                    time, 
                    label: lane.label.trim() 
                  });
                  setShowMedicationDoseDialog(true);
                }
              }}
              data-testid={`interactive-medication-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Tooltip for medication dose entry */}
      {medicationHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: medicationHoverInfo.x + 10,
            top: medicationHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add dose
          </div>
          <div className="text-xs text-muted-foreground">
            {medicationHoverInfo.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(medicationHoverInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
        </div>
      )}

      {/* Interactive layer for Ventilation parent swimlane - for bulk entry */}
      {!activeToolMode && (() => {
        const ventilationParentLane = swimlanePositions.find(lane => lane.id === 'ventilation');
        if (!ventilationParentLane || !collapsedSwimlanes.has("ventilation")) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${ventilationParentLane.top}px`,
              height: `${ventilationParentLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              time = Math.round(time / currentSnapInterval) * currentSnapInterval;
              
              setVentilationBulkHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time
              });
            }}
            onMouseLeave={() => setVentilationBulkHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              time = Math.round(time / currentSnapInterval) * currentSnapInterval;
              
              setPendingVentilationBulk({ time });
              setShowVentilationBulkDialog(true);
            }}
            data-testid="interactive-ventilation-bulk-lane"
          />
        );
      })()}

      {/* Tooltip for ventilation bulk entry */}
      {ventilationBulkHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: ventilationBulkHoverInfo.x + 10,
            top: ventilationBulkHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click for bulk entry
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(ventilationBulkHoverInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
        </div>
      )}

      {/* Interactive layers for ventilation parameter swimlanes - to place values */}
      {!activeToolMode && (() => {
        const ventilationParentIndex = activeSwimlanes.findIndex(s => s.id === "ventilation");
        if (ventilationParentIndex === -1 || collapsedSwimlanes.has("ventilation")) return null;
        
        // Map ventilation swimlane index to parameter key
        const ventilationParamMap: { [index: number]: { key: keyof typeof ventilationData; label: string } } = {
          0: { key: 'etCO2', label: 'etCO2' },
          1: { key: 'pip', label: 'P insp' },
          2: { key: 'peep', label: 'PEEP' },
          3: { key: 'tidalVolume', label: 'Tidal Volume' },
          4: { key: 'respiratoryRate', label: 'Respiratory Rate' },
          5: { key: 'minuteVolume', label: 'Minute Volume' },
          6: { key: 'fiO2', label: 'FiO2' },
        };
        
        return activeSwimlanes.map((lane, index) => {
          const isVentilationChild = lane.id.startsWith('ventilation-');
          if (!isVentilationChild) return null;
          
          const ventilationIndex = parseInt(lane.id.split('-')[1]);
          const paramInfo = ventilationParamMap[ventilationIndex];
          if (!paramInfo) return null;
          
          const lanePosition = swimlanePositions.find(l => l.id === lane.id);
          if (!lanePosition) return null;
          
          return (
            <div
              key={lane.id}
              className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
              style={{
                left: '200px',
                right: '10px',
                top: `${lanePosition.top}px`,
                height: `${lanePosition.height}px`,
                zIndex: 35,
              }}
              onMouseMove={(e) => {
                if (isTouchDevice) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to current interval (1 minute)
                time = Math.round(time / currentSnapInterval) * currentSnapInterval;
                
                setVentilationHoverInfo({ 
                  x: e.clientX, 
                  y: e.clientY, 
                  time,
                  paramKey: paramInfo.key,
                  label: paramInfo.label
                });
              }}
              onMouseLeave={() => setVentilationHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to current interval (1 minute)
                time = Math.round(time / currentSnapInterval) * currentSnapInterval;
                
                setPendingVentilationValue({ 
                  paramKey: paramInfo.key, 
                  time, 
                  label: paramInfo.label
                });
                setShowVentilationDialog(true);
              }}
              data-testid={`interactive-ventilation-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Tooltip for ventilation parameter entry */}
      {ventilationHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: ventilationHoverInfo.x + 10,
            top: ventilationHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add value
          </div>
          <div className="text-xs text-muted-foreground">
            {ventilationHoverInfo.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(ventilationHoverInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
        </div>
      )}

      {/* Time marker badges on the timeline */}
      {timeMarkers.filter(m => m.time !== null).map((marker) => {
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        // Calculate x position from time (as decimal 0-1)
        const xFraction = (marker.time! - visibleStart) / visibleRange;
        
        // Only render if in visible range
        if (xFraction < 0 || xFraction > 1) return null;
        
        const zeitenLane = swimlanePositions.find(lane => lane.id === 'zeiten');
        if (!zeitenLane) return null;
        
        // Calculate exact pixel position: sidebar width (200px) + fraction of chart area - half badge width (16px)
        // Chart area width is: calc(100% - 200px - 10px) = calc(100% - 210px)
        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 16px)`;
        
        return (
          <div
            key={marker.id}
            className="absolute z-40 pointer-events-none flex items-center justify-center"
            style={{
              left: leftPosition,
              top: `${zeitenLane.top + 4}px`,
              width: '32px',
              height: '32px',
            }}
          >
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold shadow-md"
              style={{
                backgroundColor: marker.bgColor,
                color: marker.color,
              }}
              data-testid={`time-marker-${marker.code}`}
            >
              {marker.code}
            </div>
          </div>
        );
      })}

      {/* Event comment icons on the timeline */}
      {eventComments.map((event) => {
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        const xFraction = (event.time - visibleStart) / visibleRange;
        
        if (xFraction < 0 || xFraction > 1) return null;
        
        const eventsLane = swimlanePositions.find(lane => lane.id === 'ereignisse');
        if (!eventsLane) return null;
        
        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 12px)`;
        
        return (
          <div
            key={event.id}
            className="absolute z-40 cursor-pointer flex items-center justify-center group"
            style={{
              left: leftPosition,
              top: `${eventsLane.top + 8}px`,
              width: '24px',
              height: '24px',
            }}
            onClick={() => {
              setEditingEvent(event);
              setEventTextInput(event.text);
              setShowEventDialog(true);
            }}
            title={event.text}
            data-testid={`event-icon-${event.id}`}
          >
            <MessageSquareText className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
          </div>
        );
      })}

      {/* Add Medication Dialog */}
      <Dialog open={showAddMedDialog} onOpenChange={setShowAddMedDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-add-medication">
          <DialogHeader>
            <DialogTitle>Add Medication</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="medication-name">Medication Name</Label>
              <Input
                id="medication-name"
                data-testid="input-medication-name"
                value={newMedName}
                onChange={(e) => setNewMedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddMedication();
                  }
                }}
                placeholder="e.g., Propofol 1%"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddMedDialog(false);
                setNewMedName("");
              }}
              data-testid="button-cancel-medication"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMedication}
              data-testid="button-confirm-add-medication"
              disabled={!newMedName.trim()}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Medication Dose Entry Dialog */}
      <Dialog open={showMedicationDoseDialog} onOpenChange={setShowMedicationDoseDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-medication-dose">
          <DialogHeader>
            <DialogTitle>Add Dose</DialogTitle>
            {pendingMedicationDose && (
              <p className="text-sm text-muted-foreground">
                {pendingMedicationDose.label} at {new Date(pendingMedicationDose.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </p>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="dose-value">Dose</Label>
              <Input
                id="dose-value"
                data-testid="input-dose-value"
                value={medicationDoseInput}
                onChange={(e) => setMedicationDoseInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMedicationDoseEntry();
                  }
                }}
                placeholder="e.g., 5mg, 100mg, 2ml"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMedicationDoseDialog(false);
                setPendingMedicationDose(null);
                setMedicationDoseInput("");
              }}
              data-testid="button-cancel-dose"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMedicationDoseEntry}
              data-testid="button-confirm-dose"
              disabled={!medicationDoseInput.trim()}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ventilation Parameter Entry Dialog */}
      <Dialog open={showVentilationDialog} onOpenChange={setShowVentilationDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-ventilation-value">
          <DialogHeader>
            <DialogTitle>Add Value</DialogTitle>
            {pendingVentilationValue && (
              <p className="text-sm text-muted-foreground">
                {pendingVentilationValue.label} at {new Date(pendingVentilationValue.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </p>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ventilation-value">Value</Label>
              <Input
                id="ventilation-value"
                data-testid="input-ventilation-value"
                type="number"
                step="0.1"
                value={ventilationValueInput}
                onChange={(e) => setVentilationValueInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVentilationParameterEntry();
                  }
                }}
                placeholder="e.g., 35, 12.5, 98"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowVentilationDialog(false);
                setPendingVentilationValue(null);
                setVentilationValueInput("");
              }}
              data-testid="button-cancel-ventilation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleVentilationParameterEntry}
              data-testid="button-confirm-ventilation"
              disabled={!ventilationValueInput.trim()}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Value Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-value">
          <DialogHeader>
            <DialogTitle>Edit Vital Sign Value</DialogTitle>
          </DialogHeader>
          {editingValue && (
            <EditValueForm
              type={editingValue.type}
              initialValue={editingValue.value}
              initialTime={editingValue.time}
              onSave={handleSaveEdit}
              onDelete={handleDeleteValue}
              onCancel={() => {
                setEditDialogOpen(false);
                setEditingValue(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Anesthesia Times Dialog */}
      <Dialog open={bulkEditDialogOpen} onOpenChange={setBulkEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-bulk-edit-times">
          <DialogHeader>
            <DialogTitle>Edit Anesthesia Times</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {timeMarkers.map((marker, index) => (
              <div key={marker.id} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center text-xs font-bold shadow-md"
                  style={{
                    backgroundColor: marker.bgColor,
                    color: marker.color,
                  }}
                >
                  {marker.code}
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`time-${marker.id}`} className="text-sm font-medium">
                    {marker.label}
                  </Label>
                  <Input
                    id={`time-${marker.id}`}
                    type="time"
                    value={marker.time ? new Date(marker.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [hours, minutes] = e.target.value.split(':').map(Number);
                      const date = new Date(marker.time || Date.now());
                      date.setHours(hours, minutes, 0, 0);
                      const updated = [...timeMarkers];
                      updated[index] = { ...updated[index], time: date.getTime() };
                      setTimeMarkers(updated);
                    }}
                    data-testid={`input-time-${marker.code}`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const updated = [...timeMarkers];
                    updated[index] = { ...updated[index], time: null };
                    setTimeMarkers(updated);
                  }}
                  data-testid={`button-clear-${marker.code}`}
                  disabled={marker.time === null}
                >
                  Clear
                </Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkEditDialogOpen(false)}
              data-testid="button-close-bulk-edit"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                setBulkEditDialogOpen(false);
                // Toast notification disabled (can be re-enabled later)
                // toast({
                //   title: "Times saved",
                //   description: "Anesthesia times have been updated",
                //   duration: 2000,
                // });
              }}
              data-testid="button-save-bulk-edit"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Extracted Data Confirmation Dialog */}
      <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto" data-testid="dialog-ai-confirmation">
          <DialogHeader>
            <DialogTitle>Confirm Extracted Monitor Data</DialogTitle>
          </DialogHeader>
          {extractedData && (
            <div className="grid gap-4 py-4">
              {/* Monitor Type Badge and Confidence - shown for new format */}
              {extractedData.monitorType && (
                <div className="flex items-center justify-between gap-3 pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-primary" />
                    <Badge variant="outline" className="text-sm font-semibold">
                      {extractedData.monitorType === 'vitals' && '🫀 Vitals Monitor'}
                      {extractedData.monitorType === 'ventilation' && '🫁 Ventilation Monitor'}
                      {extractedData.monitorType === 'tof' && '💉 TOF Monitor'}
                      {extractedData.monitorType === 'perfusor' && '💊 Perfusor'}
                      {extractedData.monitorType === 'mixed' && '📊 Mixed Monitor'}
                      {extractedData.monitorType === 'unknown' && '❓ Unknown Monitor'}
                    </Badge>
                  </div>
                  {extractedData.confidence && (
                    <Badge 
                      variant={extractedData.confidence === 'high' ? 'default' : extractedData.confidence === 'medium' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {extractedData.confidence === 'high' && '✓ High Confidence'}
                      {extractedData.confidence === 'medium' && '~ Medium Confidence'}
                      {extractedData.confidence === 'low' && '! Low Confidence'}
                    </Badge>
                  )}
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                Review the extracted data before adding to timeline:
              </div>

              {/* NEW FORMAT: Show parameters grouped by category with mappings */}
              {extractedData.parameters && extractedData.parameters.length > 0 ? (
                <div className="space-y-4">
                  {/* Group parameters by category */}
                  {['vitals', 'ventilation', 'tof', 'perfusor'].map(category => {
                    const categoryParams = extractedData.parameters.filter((p: any) => p.category === category);
                    if (categoryParams.length === 0) return null;

                    const categoryIcon = {
                      vitals: '🫀',
                      ventilation: '🫁',
                      tof: '💉',
                      perfusor: '💊'
                    }[category];

                    const targetSwimlane = {
                      vitals: 'Vitals Chart',
                      ventilation: 'Ventilation Swimlanes',
                      tof: 'TOF Log',
                      perfusor: 'Infusion Swimlanes'
                    }[category];

                    return (
                      <div key={category} className="space-y-2 border rounded-md p-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <span>{categoryIcon}</span>
                            <span className="capitalize">{category}</span>
                          </h4>
                          <Badge variant="outline" className="text-xs">
                            → {targetSwimlane}
                          </Badge>
                        </div>
                        <div className="space-y-1.5">
                          {categoryParams.map((param: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-background rounded px-2 py-1">
                              <div className="flex items-center gap-2">
                                {param.detectedName !== param.standardName && (
                                  <span className="text-muted-foreground">
                                    {param.detectedName} →
                                  </span>
                                )}
                                <span className="font-medium">{param.standardName}</span>
                              </div>
                              <span className="font-semibold text-primary">
                                {param.value} {param.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* OLD FORMAT: Show vitals, ventilation, etc. as before */}
                  {extractedData.vitals && Object.values(extractedData.vitals).some((v: any) => v !== null) && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Vitals:</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {extractedData.vitals.hr && <div>HR: {extractedData.vitals.hr} bpm</div>}
                        {extractedData.vitals.sysBP && extractedData.vitals.diaBP && (
                          <div>BP: {extractedData.vitals.sysBP}/{extractedData.vitals.diaBP} mmHg</div>
                        )}
                        {extractedData.vitals.spo2 && <div>SpO2: {extractedData.vitals.spo2}%</div>}
                        {extractedData.vitals.temp && <div>Temp: {extractedData.vitals.temp}°C</div>}
                        {extractedData.vitals.cvp && <div>CVP: {extractedData.vitals.cvp}</div>}
                        {extractedData.vitals.ibp_sys && extractedData.vitals.ibp_dia && (
                          <div>IBP: {extractedData.vitals.ibp_sys}/{extractedData.vitals.ibp_dia}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {extractedData.ventilation && Object.values(extractedData.ventilation).some((v: any) => v !== null) && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Ventilation:</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {extractedData.ventilation.tidalVolume && <div>VT: {extractedData.ventilation.tidalVolume} mL</div>}
                        {extractedData.ventilation.respiratoryRate && <div>RR: {extractedData.ventilation.respiratoryRate} /min</div>}
                        {extractedData.ventilation.peep && <div>PEEP: {extractedData.ventilation.peep} cmH2O</div>}
                        {extractedData.ventilation.fio2 && <div>FiO2: {extractedData.ventilation.fio2}%</div>}
                        {extractedData.ventilation.peakPressure && <div>Peak: {extractedData.ventilation.peakPressure} cmH2O</div>}
                      </div>
                    </div>
                  )}

                  {extractedData.tof && (extractedData.tof.ratio || extractedData.tof.count) && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">TOF:</h4>
                      <div className="text-sm">
                        {extractedData.tof.ratio && <div>Ratio: {extractedData.tof.ratio}</div>}
                        {extractedData.tof.count && <div>Count: {extractedData.tof.count}</div>}
                      </div>
                    </div>
                  )}

                  {extractedData.pumps && extractedData.pumps.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Pumps/Infusions:</h4>
                      <div className="space-y-1 text-sm">
                        {extractedData.pumps.map((pump: any, idx: number) => (
                          <div key={idx}>{pump.drug}: {pump.rate} {pump.unit}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t">
                <div>
                  Time: {new Date(extractedData.timestamp).toLocaleString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false 
                  })}
                </div>
                <div className="flex items-center gap-1">
                  {extractedData.detectionMethod === 'local-ocr' && (
                    <span className="text-green-600 dark:text-green-400 font-medium">⚡ Fast OCR</span>
                  )}
                  {(extractedData.detectionMethod === 'hybrid-ai' || extractedData.detectionMethod === 'ai_vision') && (
                    <span className="text-blue-600 dark:text-blue-400 font-medium">🤖 AI Enhanced</span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmationDialogOpen(false);
                setExtractedData(null);
              }}
              data-testid="button-cancel-ai-data"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmExtractedData}
              data-testid="button-confirm-ai-data"
            >
              Add to Timeline
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Comment Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-event-comment">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Add Event'}</DialogTitle>
            <DialogDescription>
              {editingEvent 
                ? `Edit or delete the event at ${new Date(editingEvent.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                : pendingEvent 
                  ? `Add an event at ${new Date(pendingEvent.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                  : 'Add an event to the timeline'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="event-text">Event Comment</Label>
              <Textarea
                id="event-text"
                data-testid="input-event-text"
                value={eventTextInput}
                onChange={(e) => setEventTextInput(e.target.value)}
                placeholder="Enter event description..."
                rows={4}
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            {editingEvent && (
              <Button
                variant="destructive"
                onClick={handleEventDelete}
                data-testid="button-delete-event"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEventDialog(false);
                  setPendingEvent(null);
                  setEditingEvent(null);
                  setEventTextInput("");
                }}
                data-testid="button-cancel-event"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEventSave}
                data-testid="button-save-event"
                disabled={!eventTextInput.trim()}
              >
                {editingEvent ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Medication Dose Edit Dialog */}
      <Dialog open={showMedicationEditDialog} onOpenChange={setShowMedicationEditDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-medication-edit">
          <DialogHeader>
            <DialogTitle>Edit Dose</DialogTitle>
            <DialogDescription>
              {editingMedicationDose 
                ? `Edit or delete the dose at ${new Date(editingMedicationDose.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                : 'Edit medication dose'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="dose-edit-value">Dose</Label>
              <Input
                id="dose-edit-value"
                data-testid="input-dose-edit-value"
                value={medicationEditInput}
                onChange={(e) => setMedicationEditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMedicationDoseEditSave();
                  }
                }}
                placeholder="e.g., 5mg, 100mg, 2ml"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="destructive"
              onClick={handleMedicationDoseDelete}
              data-testid="button-delete-medication-dose"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowMedicationEditDialog(false);
                  setEditingMedicationDose(null);
                  setMedicationEditInput("");
                }}
                data-testid="button-cancel-medication-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={handleMedicationDoseEditSave}
                data-testid="button-save-medication-edit"
                disabled={!medicationEditInput.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ventilation Bulk Entry Dialog */}
      <Dialog open={showVentilationBulkDialog} onOpenChange={setShowVentilationBulkDialog}>
        <DialogContent className="sm:max-w-[550px]" data-testid="dialog-ventilation-bulk">
          <DialogHeader>
            <DialogTitle>Ventilation Bulk Entry</DialogTitle>
            <DialogDescription>
              {pendingVentilationBulk 
                ? `Add ventilation parameters at ${new Date(pendingVentilationBulk.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                : 'Add ventilation parameters to the timeline'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label htmlFor="vent-mode">Ventilation Mode</Label>
              <Select value={ventilationMode} onValueChange={setVentilationMode}>
                <SelectTrigger id="vent-mode" data-testid="select-vent-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Präoxygenierung">Preoxygenation</SelectItem>
                  <SelectItem value="Assistierte Spontanatmung">Assisted Spontaneous Breathing</SelectItem>
                  <SelectItem value="Spontanatmung am Gerät">Spontaneous Breathing on Device</SelectItem>
                  <SelectItem value="PCV - druckkontrolliert">PCV - Pressure Controlled</SelectItem>
                  <SelectItem value="VCV - volumenkontrolliert">VCV - Volume Controlled</SelectItem>
                  <SelectItem value="CPAP - PSV">CPAP - PSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="bulk-peep">PEEP (cmH₂O)</Label>
                <Input
                  id="bulk-peep"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.peep}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, peep: e.target.value }))}
                  data-testid="input-bulk-peep"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-fio2">FiO₂ (%)</Label>
                <Input
                  id="bulk-fio2"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.fiO2}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, fiO2: e.target.value }))}
                  data-testid="input-bulk-fio2"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-vt">Tidal Volume (ml)</Label>
                <Input
                  id="bulk-vt"
                  type="number"
                  step="10"
                  value={bulkVentilationParams.tidalVolume}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, tidalVolume: e.target.value }))}
                  data-testid="input-bulk-vt"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-rr">Resp. Rate (/min)</Label>
                <Input
                  id="bulk-rr"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.respiratoryRate}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                  data-testid="input-bulk-rr"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-etco2">EtCO₂ (mmHg)</Label>
                <Input
                  id="bulk-etco2"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.etCO2}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, etCO2: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-etco2"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-pip">P insp (cmH₂O)</Label>
                <Input
                  id="bulk-pip"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.pip}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, pip: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-pip"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowVentilationBulkDialog(false);
                setPendingVentilationBulk(null);
              }}
              data-testid="button-cancel-vent-bulk"
            >
              Cancel
            </Button>
            <Button
              onClick={handleVentilationBulkSave}
              data-testid="button-save-vent-bulk"
            >
              Add All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Loading overlay for image processing */}
      {isProcessingImage && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center">
          <div className="bg-background rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-sm font-medium">Analyzing monitor image...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Edit Value Form Component
function EditValueForm({
  type,
  initialValue,
  initialTime,
  onSave,
  onDelete,
  onCancel,
}: {
  type: 'hr' | 'sys' | 'dia' | 'spo2';
  initialValue: number;
  initialTime: number;
  onSave: (value: number, time: number) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue.toString());
  const [timeStr, setTimeStr] = useState(() => {
    const date = new Date(initialTime);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  });

  const getLabel = () => {
    if (type === 'hr') return 'Heart Rate (bpm)';
    if (type === 'sys') return 'Systolic BP (mmHg)';
    if (type === 'dia') return 'Diastolic BP (mmHg)';
    return 'SpO₂ (%)';
  };

  const handleSave = () => {
    const numValue = parseInt(value);
    if (isNaN(numValue)) return;

    // Parse time string (HH:MM) and combine with original date
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(initialTime);
    date.setHours(hours, minutes, 0, 0);

    onSave(numValue, date.getTime());
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-value">{getLabel()}</Label>
        <Input
          id="edit-value"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="input-edit-value"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="edit-time">Time (HH:MM)</Label>
        <Input
          id="edit-time"
          type="time"
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          data-testid="input-edit-time"
        />
      </div>
      <div className="flex justify-between gap-2">
        <Button
          variant="destructive"
          onClick={onDelete}
          data-testid="button-delete-value"
        >
          Delete
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="button-cancel-edit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            data-testid="button-save-edit"
            disabled={!value || isNaN(parseInt(value))}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
