import { useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatDateTime, formatTime } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import SignaturePad from "@/components/SignaturePad";
import BarcodeScanner from "@/components/BarcodeScanner";
import { CameraCapture } from "@/components/CameraCapture";
import type { Activity, User, Item, ControlledCheck, Patient } from "@shared/schema";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ItemWithStock extends Item {
  stockLevel?: { qtyOnHand: number };
}

interface PatientInfo {
  id: string;
  firstName: string;
  surname: string;
  birthday: string;
  patientNumber: string;
}

interface ControlledActivity extends Activity {
  user: User;
  item?: Item;
  patient?: PatientInfo;
}

interface ControlledCheckWithUser extends ControlledCheck {
  user: User;
  checkItems: Array<{
    itemId: string;
    name: string;
    expectedQty: number;
    actualQty: number;
    match: boolean;
  }>;
}

interface DrugSelection {
  itemId: string;
  name: string;
  onHand: number;
  qty: number;
  selected: boolean;
  isControlledPack?: boolean;
}

interface RoutineCheckItem {
  itemId: string;
  name: string;
  expectedQty: number;
  actualQty: number;
  match: boolean;
}

type PatientMethod = "text" | "barcode" | "photo";

export default function ControlledLog() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdministrationModal, setShowAdministrationModal] = useState(false);
  const [showRoutineCheckModal, setShowRoutineCheckModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showVerifySignaturePad, setShowVerifySignaturePad] = useState(false);
  const [patientMethod, setPatientMethod] = useState<PatientMethod>("text");
  const [showPatientScanner, setShowPatientScanner] = useState(false);
  const [showPatientCamera, setShowPatientCamera] = useState(false);
  
  const [selectedDrugs, setSelectedDrugs] = useState<DrugSelection[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientPhoto, setPatientPhoto] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchText, setPatientSearchText] = useState("");
  
  const [routineCheckItems, setRoutineCheckItems] = useState<RoutineCheckItem[]>([]);
  const [checkNotes, setCheckNotes] = useState("");
  const [checkSignature, setCheckSignature] = useState("");
  
  const [activityToVerify, setActivityToVerify] = useState<string | null>(null);
  const [verifySignature, setVerifySignature] = useState("");
  
  const [selectedActivity, setSelectedActivity] = useState<ControlledActivity | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<ControlledCheckWithUser | null>(null);
  
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth().toString());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());

  const [showManualAdjustmentModal, setShowManualAdjustmentModal] = useState(false);
  const [adjustmentItemId, setAdjustmentItemId] = useState("");
  const [adjustmentNewUnits, setAdjustmentNewUnits] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [adjustmentSignature, setAdjustmentSignature] = useState("");
  const [adjustmentAttachmentPhoto, setAdjustmentAttachmentPhoto] = useState("");
  const [showAdjustmentSignaturePad, setShowAdjustmentSignaturePad] = useState(false);

  const { data: controlledItems = [] } = useQuery<ItemWithStock[]>({
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}&controlled=true`, activeHospital?.unitId, { controlled: true }],
    queryFn: async () => {
      const response = await fetch(`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}&controlled=true`);
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    },
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
  });

  const { data: activities = [], isLoading: isLoadingActivities } = useQuery<ControlledActivity[]>({
    queryKey: [`/api/controlled/log/${activeHospital?.id}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id,
  });

  const { data: checks = [], isLoading: isLoadingChecks } = useQuery<ControlledCheckWithUser[]>({
    queryKey: [`/api/controlled/checks/${activeHospital?.id}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id,
  });

  // Fetch patients for patient search
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['/api/patients'],
    enabled: !!activeHospital?.id,
  });

  // Filter patients based on search text
  const filteredPatients = useMemo(() => {
    if (!patientSearchText.trim()) return patients.slice(0, 10);
    const search = patientSearchText.toLowerCase();
    return patients.filter(p => 
      (p.firstName?.toLowerCase().includes(search)) ||
      (p.surname?.toLowerCase().includes(search)) ||
      (p.patientNumber?.toLowerCase().includes(search))
    ).slice(0, 10);
  }, [patients, patientSearchText]);

  const dispenseMutation = useMutation({
    mutationFn: async (data: {
      items: Array<{ itemId: string; qty: number }>;
      patientId: string;
      patientPhoto?: string;
      notes: string;
      signatures: string[];
    }) => {
      const response = await apiRequest("POST", "/api/controlled/dispense", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/controlled/log/${activeHospital?.id}`, activeHospital?.unitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}&controlled=true`, activeHospital?.unitId, { controlled: true }] });
      toast({
        title: "Administration Recorded",
        description: "Controlled substance administration has been logged.",
      });
      setShowAdministrationModal(false);
      resetAdministrationForm();
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

  const routineCheckMutation = useMutation({
    mutationFn: async (data: {
      hospitalId: string;
      unitId: string;
      signature: string;
      checkItems: Array<{ itemId: string; name: string; expectedQty: number; actualQty: number; match: boolean }>;
      allMatch?: boolean;
      notes?: string;
    }) => {
      const response = await apiRequest("POST", "/api/controlled/checks", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/controlled/checks/${activeHospital?.id}`, activeHospital?.unitId] });
      toast({
        title: "Routine Check Recorded",
        description: "Controlled substance routine check has been logged.",
      });
      setShowRoutineCheckModal(false);
      resetRoutineCheckForm();
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
        title: "Check Failed",
        description: "Failed to record routine check.",
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (data: { activityId: string; signature: string }) => {
      const response = await apiRequest("POST", `/api/controlled/verify/${data.activityId}`, {
        signature: data.signature,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/controlled/log/${activeHospital?.id}`, activeHospital?.unitId] });
      toast({
        title: "Verification Complete",
        description: "Controlled substance administration has been verified.",
      });
      setActivityToVerify(null);
      setVerifySignature("");
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
        title: "Verification Failed",
        description: "Failed to verify controlled substance administration.",
        variant: "destructive",
      });
    },
  });

  const adjustmentMutation = useMutation({
    mutationFn: async (data: {
      itemId: string;
      newCurrentUnits: number;
      notes: string;
      signature: string;
      attachmentPhoto?: string;
    }) => {
      const response = await apiRequest("POST", "/api/controlled/adjust", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/controlled/log/${activeHospital?.id}`, activeHospital?.unitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}&controlled=true`, activeHospital?.unitId, { controlled: true }] });
      toast({
        title: "Adjustment Recorded",
        description: "Controlled substance adjustment has been logged.",
      });
      setShowManualAdjustmentModal(false);
      resetAdjustmentForm();
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
        title: "Adjustment Failed",
        description: "Failed to record adjustment.",
        variant: "destructive",
      });
    },
  });

  const resetAdministrationForm = () => {
    setSelectedDrugs(controlledItems.map(item => {
      const normalizedUnit = item.unit.toLowerCase();
      const isControlledPack = !!(item.controlled && normalizedUnit === 'pack');
      const onHandQty = isControlledPack 
        ? (item.currentUnits || 0) 
        : (item.stockLevel?.qtyOnHand || 0);
      
      return {
        itemId: item.id,
        name: item.name,
        onHand: onHandQty,
        qty: 0,
        selected: false,
        isControlledPack,
      };
    }));
    setPatientId("");
    setPatientPhoto("");
    setNotes("");
    setSignature("");
    setPatientMethod("text");
  };

  const resetRoutineCheckForm = () => {
    setRoutineCheckItems(controlledItems.map(item => {
      const normalizedUnit = item.unit.toLowerCase();
      const isControlledPack = item.controlled && normalizedUnit === 'pack';
      const expectedQty = isControlledPack 
        ? (item.currentUnits || 0) 
        : (item.stockLevel?.qtyOnHand || 0);
      
      return {
        itemId: item.id,
        name: item.name,
        expectedQty,
        actualQty: 0,
        match: false,
      };
    }));
    setCheckNotes("");
    setCheckSignature("");
  };

  const resetAdjustmentForm = () => {
    setAdjustmentItemId("");
    setAdjustmentNewUnits("");
    setAdjustmentNotes("");
    setAdjustmentSignature("");
    setAdjustmentAttachmentPhoto("");
  };

  const handleOpenAdministrationModal = () => {
    setSelectedDrugs(controlledItems.map(item => {
      const normalizedUnit = item.unit.toLowerCase();
      const isControlledPack = !!(item.controlled && normalizedUnit === 'pack');
      const onHandQty = isControlledPack 
        ? (item.currentUnits || 0) 
        : (item.stockLevel?.qtyOnHand || 0);
      
      return {
        itemId: item.id,
        name: item.name,
        onHand: onHandQty,
        qty: 0,
        selected: false,
        isControlledPack,
      };
    }));
    setShowAdministrationModal(true);
  };

  const handleOpenRoutineCheckModal = () => {
    setRoutineCheckItems(controlledItems.map(item => {
      const normalizedUnit = item.unit.toLowerCase();
      const isControlledPack = item.controlled && normalizedUnit === 'pack';
      const expectedQty = isControlledPack 
        ? (item.currentUnits || 0) 
        : (item.stockLevel?.qtyOnHand || 0);
      
      return {
        itemId: item.id,
        name: item.name,
        expectedQty,
        actualQty: 0,
        match: false,
      };
    }));
    setShowRoutineCheckModal(true);
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

  const handlePatientBarcodeScan = (barcode: string) => {
    setPatientId(barcode);
    setShowPatientScanner(false);
    toast({
      title: "Barcode Scanned",
      description: "Patient barcode captured successfully",
    });
  };

  const handleActualQtyChange = (itemId: string, actualQty: number) => {
    setRoutineCheckItems(prev =>
      prev.map(item => {
        if (item.itemId === itemId) {
          const match = actualQty === item.expectedQty;
          return { ...item, actualQty, match };
        }
        return item;
      })
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

    if (!patientId.trim() && !patientPhoto) {
      toast({
        title: "Patient Required",
        description: "Please provide patient identification (text ID or photo).",
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
    }));

    dispenseMutation.mutate({
      items,
      patientId,
      patientPhoto: patientPhoto || undefined,
      notes,
      signatures: [signature],
    });
  };

  const handleSubmitRoutineCheck = () => {
    if (!activeHospital) return;
    
    if (!checkSignature) {
      toast({
        title: "Signature Required",
        description: "Please provide your electronic signature.",
        variant: "destructive",
      });
      return;
    }

    if (routineCheckItems.length === 0) {
      toast({
        title: "No Items",
        description: "No controlled items to check.",
        variant: "destructive",
      });
      return;
    }

    const allMatch = routineCheckItems.every(item => item.match);

    routineCheckMutation.mutate({
      hospitalId: activeHospital.id,
      unitId: activeHospital.unitId,
      signature: checkSignature,
      checkItems: routineCheckItems,
      allMatch,
      notes: checkNotes || undefined,
    });
  };

  const handleSubmitAdjustment = () => {
    if (!adjustmentItemId) {
      toast({
        title: "Item Required",
        description: "Please select a controlled item.",
        variant: "destructive",
      });
      return;
    }

    if (!adjustmentNewUnits || adjustmentNewUnits.trim() === "") {
      toast({
        title: "Units Required",
        description: "Please enter the new units value.",
        variant: "destructive",
      });
      return;
    }

    if (!adjustmentNotes || adjustmentNotes.trim() === "") {
      toast({
        title: "Notes Required",
        description: "Please provide a reason for the adjustment.",
        variant: "destructive",
      });
      return;
    }

    if (!adjustmentSignature) {
      toast({
        title: "Signature Required",
        description: "Please provide your electronic signature.",
        variant: "destructive",
      });
      return;
    }

    const newUnitsValue = parseFloat(adjustmentNewUnits);
    if (isNaN(newUnitsValue) || newUnitsValue < 0) {
      toast({
        title: "Invalid Units",
        description: "Please enter a valid positive number for units.",
        variant: "destructive",
      });
      return;
    }

    adjustmentMutation.mutate({
      itemId: adjustmentItemId,
      newCurrentUnits: newUnitsValue,
      notes: adjustmentNotes,
      signature: adjustmentSignature,
      attachmentPhoto: adjustmentAttachmentPhoto || undefined,
    });
  };

  const getStatusChip = (activity: ControlledActivity) => {
    if (activity.controlledVerified) {
      return <span className="status-chip chip-success text-xs">Verified</span>;
    }
    return <span className="status-chip chip-warning text-xs">Pending</span>;
  };

  const getCheckStatusChip = (check: ControlledCheckWithUser) => {
    if (check.allMatch) {
      return <span className="status-chip chip-success text-xs">{t('controlled.allMatch')}</span>;
    }
    return <span className="status-chip chip-destructive text-xs">{t('controlled.discrepancies')}</span>;
  };

  const formatTimeAgo = (timestamp: string | Date) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Just now";
    if (diffInHours === 1) return "1 hour ago";
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return formatDate(time);
  };

  const downloadMonthlyReport = () => {
    const month = parseInt(selectedMonth);
    const year = parseInt(selectedYear);
    
    // Filter activities for selected month/year - only include administrations and adjustments
    const monthlyActivities = activities.filter(activity => {
      if (!activity.timestamp) return false;
      const activityDate = new Date(activity.timestamp);
      const isCorrectMonth = activityDate.getMonth() === month && activityDate.getFullYear() === year;
      // Only include actual administrations ('use') and manual adjustments ('adjust')
      // Exclude system activities like item edits, order receiving, etc.
      const isReportableAction = activity.action === 'use' || activity.action === 'adjust';
      return isCorrectMonth && isReportableAction;
    });

    if (monthlyActivities.length === 0) {
      toast({
        title: "No Data",
        description: "No administrations found for the selected month.",
        variant: "destructive",
      });
      return;
    }

    // Group by drug (itemId)
    const groupedByDrug: Record<string, ControlledActivity[]> = {};
    monthlyActivities.forEach(activity => {
      const drugKey = activity.item?.name || "Unknown Drug";
      if (!groupedByDrug[drugKey]) {
        groupedByDrug[drugKey] = [];
      }
      groupedByDrug[drugKey].push(activity);
    });

    const doc = new jsPDF();
    const monthNames = ["January", "February", "March", "April", "May", "June", 
                        "July", "August", "September", "October", "November", "December"];
    
    // Header
    doc.setFontSize(18);
    doc.text("CONTROLLED SUBSTANCES MONTHLY REPORT", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(`${monthNames[month]} ${year}`, 105, 28, { align: "center" });
    doc.text(`Hospital: ${activeHospital?.name || "N/A"}`, 105, 35, { align: "center" });
    
    let yPosition = 45;

    // Iterate through each drug
    Object.entries(groupedByDrug).forEach(([drugName, drugActivities], index) => {
      // Check if we need a new page
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      // Find current amount for this drug
      const currentItem = controlledItems.find(item => item.name === drugName);
      const normalizedUnit = currentItem?.unit ? currentItem.unit.toLowerCase() : undefined;
      const isControlledPack = currentItem?.controlled && normalizedUnit === 'pack';
      const currentAmount = isControlledPack 
        ? (currentItem?.currentUnits || 0) 
        : (currentItem?.stockLevel?.qtyOnHand || 0);

      // Drug header with current amount
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${drugName} (${currentAmount})`, 20, yPosition);
      yPosition += 8;

      // Create table for all administrations and adjustments for this drug
      const tableData = drugActivities.map(activity => {
        // Show quantity with sign: positive for IN, negative for OUT
        const delta = activity.delta || 0;
        const qty = activity.movementType === 'IN' ? `+${Math.abs(delta)}` : `-${Math.abs(delta)}`;
        
        // Try to get beforeQty and afterQty from metadata
        // Handle both object and string metadata (if serialized)
        let metadata: any = activity.metadata;
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch (e) {
            metadata = null;
          }
        }
        const beforeQty = metadata?.beforeQty !== null && metadata?.beforeQty !== undefined ? metadata.beforeQty : "-";
        const afterQty = metadata?.afterQty !== null && metadata?.afterQty !== undefined ? metadata.afterQty : "-";
        
        // Format patient display for PDF
        let patientDisplay = "N/A";
        if (activity.action === 'adjust') {
          patientDisplay = "MANUAL ADJ";
        } else if (activity.patient) {
          patientDisplay = `${activity.patient.surname}, ${activity.patient.firstName} (${activity.patient.birthday})`;
        } else if (activity.patientId) {
          patientDisplay = activity.patientId;
        }
        
        return [
          activity.timestamp ? formatDate(activity.timestamp) : "N/A",
          activity.timestamp ? formatTime(activity.timestamp) : "N/A",
          beforeQty,
          qty,
          afterQty,
          patientDisplay,
          `${activity.user.firstName} ${activity.user.lastName}`,
          activity.controlledVerified ? "Yes" : "No",
          activity.notes || "-",
          "", // Placeholder for signatures
          "", // Placeholder for patient photo
        ];
      });

      autoTable(doc, {
        startY: yPosition,
        head: [["Date", "Time", "Before", "Qty", "After", "Patient", "User", "Ver", "Notes", "Signatures", "Photo"]],
        body: tableData,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 1, minCellHeight: 20 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 14 },
          2: { cellWidth: 12, halign: "center" },
          3: { cellWidth: 10, halign: "center" },
          4: { cellWidth: 12, halign: "center" },
          5: { cellWidth: 20 },
          6: { cellWidth: 22 },
          7: { cellWidth: 10, halign: "center" },
          8: { cellWidth: 28 },
          9: { cellWidth: 26 },
          10: { cellWidth: 17 },
        },
        margin: { left: 15 },
        didDrawCell: (data: any) => {
          // Draw signatures in the signatures column (index 9)
          if (data.column.index === 9 && data.section === 'body') {
            const activity = drugActivities[data.row.index];
            if (!activity) return; // Safety check for undefined activity
            const signatures = activity.signatures as string[] | null;
            
            if (signatures && Array.isArray(signatures) && signatures.length > 0) {
              const cellX = data.cell.x + 1;
              const cellY = data.cell.y + 2;
              
              // Add admin signature (smaller)
              if (signatures[0]) {
                try {
                  doc.addImage(signatures[0], "PNG", cellX, cellY, 13, 6);
                } catch (e) {
                  console.error("Failed to add admin signature", e);
                }
              }
              
              // Add verifier signature if exists
              if (signatures[1]) {
                try {
                  doc.addImage(signatures[1], "PNG", cellX, cellY + 8, 13, 6);
                } catch (e) {
                  console.error("Failed to add verifier signature", e);
                }
              }
            }
          }
          
          // Draw patient photo in the photo column (index 10)
          if (data.column.index === 10 && data.section === 'body') {
            const activity = drugActivities[data.row.index];
            if (!activity) return; // Safety check for undefined activity
            
            if (activity.patientPhoto) {
              const cellX = data.cell.x + 1;
              const cellY = data.cell.y + 1;
              
              try {
                doc.addImage(activity.patientPhoto, "JPEG", cellX, cellY, 18, 18);
              } catch (e) {
                console.error("Failed to add patient photo", e);
              }
            }
          }
        },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10; // Space between drugs
    });

    // Summary footer - use the maximum of yPosition and lastAutoTable.finalY
    const tableEndY = (doc as any).lastAutoTable?.finalY ?? 0;
    const footerY = Math.max(yPosition, tableEndY);
    
    // Check if footer will fit on current page, if not add new page
    if (footerY + 30 > 280) {
      doc.addPage();
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`${t('controlled.totalAdministrations')} ${monthlyActivities.length}`, 20, 20);
      doc.text(`Total Drugs: ${Object.keys(groupedByDrug).length}`, 20, 26);
      doc.text(`Generated: ${formatDateTime(new Date())}`, 20, 32);
    } else {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`${t('controlled.totalAdministrations')} ${monthlyActivities.length}`, 20, footerY + 10);
      doc.text(`Total Drugs: ${Object.keys(groupedByDrug).length}`, 20, footerY + 16);
      doc.text(`Generated: ${formatDateTime(new Date())}`, 20, footerY + 22);
    }

    // Download
    doc.save(`Controlled_Report_${monthNames[month]}_${year}.pdf`);
    
    toast({
      title: "Report Downloaded",
      description: `Monthly report for ${monthNames[month]} ${year} has been downloaded.`,
    });
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
        <h1 className="text-2xl font-bold text-foreground">{t('controlled.pageTitle')}</h1>
      </div>

      <Tabs defaultValue="administrations" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="administrations" data-testid="tab-administrations">
            {t('controlled.administrations')}
          </TabsTrigger>
          <TabsTrigger value="checks" data-testid="tab-checks">
            {t('controlled.routineChecks')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="administrations" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-foreground">{t('controlled.administrationLog')}</h2>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-accent hover:bg-accent/90 text-accent-foreground flex-1 sm:flex-none"
                  onClick={handleOpenAdministrationModal}
                  data-testid="record-administration-button"
                >
                  <i className="fas fa-plus mr-2"></i>
                  {t('controlled.recordAdministration')}
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white flex-1 sm:flex-none"
                  onClick={() => setShowManualAdjustmentModal(true)}
                  data-testid="manual-adjustment-button"
                >
                  <i className="fas fa-edit mr-2"></i>
                  Manual Adjustment
                </Button>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 items-center">
                <Label className="text-sm font-medium">{t('controlled.monthlyReport')}</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-32" data-testid="month-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">January</SelectItem>
                    <SelectItem value="1">February</SelectItem>
                    <SelectItem value="2">March</SelectItem>
                    <SelectItem value="3">April</SelectItem>
                    <SelectItem value="4">May</SelectItem>
                    <SelectItem value="5">June</SelectItem>
                    <SelectItem value="6">July</SelectItem>
                    <SelectItem value="7">August</SelectItem>
                    <SelectItem value="8">September</SelectItem>
                    <SelectItem value="9">October</SelectItem>
                    <SelectItem value="10">November</SelectItem>
                    <SelectItem value="11">December</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-24" data-testid="year-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(5)].map((_, i) => {
                      const year = new Date().getFullYear() - i;
                      return (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={downloadMonthlyReport}
                data-testid="download-monthly-report"
              >
                <i className="fas fa-file-pdf mr-2"></i>
                {t('controlled.downloadPdfReport')}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">{t('controlled.todaysRecords')}</p>
              <p className="text-3xl font-bold text-foreground" data-testid="todays-records">
                {activities.filter(a => {
                  const today = new Date().toDateString();
                  return a.timestamp ? new Date(a.timestamp).toDateString() === today : false;
                }).length}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">{t('controlled.pendingReview')}</p>
              <p className="text-3xl font-bold text-accent" data-testid="pending-records">
                {activities.filter(a => !a.controlledVerified).length}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {isLoadingActivities ? (
              <div className="text-center py-8">
                <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
                <p className="text-muted-foreground">Loading administration log...</p>
              </div>
            ) : activities.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <i className="fas fa-shield-halved text-4xl text-muted-foreground mb-4"></i>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Records Found</h3>
                <p className="text-muted-foreground">No controlled substance administrations recorded yet.</p>
              </div>
            ) : (
              activities.map((activity) => {
                const isAdjustment = activity.action === 'adjust';
                
                return <div
                  key={activity.id}
                  className={`bg-card border rounded-lg p-4 ${
                    !activity.controlledVerified ? "border-2 border-warning" : "border-border"
                  }`}
                  data-testid={`activity-${activity.id}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-12 h-12 rounded-lg ${isAdjustment ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-accent/10'} flex items-center justify-center flex-shrink-0`}>
                      <i className={`fas ${isAdjustment ? 'fa-sliders text-orange-600 dark:text-orange-400' : 'fa-syringe text-accent'} text-lg`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground">
                        {activity.item?.name || "Unknown Item"}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {isAdjustment 
                          ? `Manual Adjustment: ${activity.movementType === 'IN' ? '+' : ''}${activity.delta || 0} units`
                          : `${Math.abs(activity.delta || 0)} units dispensed`
                        }
                      </p>
                    </div>
                    {getStatusChip(activity)}
                  </div>

                  <div className="space-y-2 mb-3">
                    {!isAdjustment && (
                      <>
                        <div className="flex items-center gap-2">
                          <i className="fas fa-user-injured text-muted-foreground text-sm"></i>
                          <span className="text-sm text-foreground">
                            {t('controlled.patient')}{' '}
                            {activity.patient ? (
                              <>
                                <span className="font-medium">{activity.patient.surname}, {activity.patient.firstName}</span>
                                {' '}({formatDate(activity.patient.birthday)})
                              </>
                            ) : (
                              activity.patientId || "Unknown"
                            )}
                          </span>
                        </div>
                        {activity.patientPhoto && (
                          <div className="ml-6">
                            <img 
                              src={activity.patientPhoto} 
                              alt="Patient label" 
                              className="max-w-xs rounded border border-border cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => activity.patientPhoto && window.open(activity.patientPhoto, '_blank')}
                              data-testid={`patient-photo-${activity.id}`}
                            />
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      <i className="fas fa-user-md text-muted-foreground text-sm"></i>
                      <span className="text-sm text-foreground">
                        {isAdjustment ? 'Adjusted by' : t('controlled.administeredBy')} {activity.user.firstName} {activity.user.lastName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="fas fa-clock text-muted-foreground text-sm"></i>
                      <span className="text-sm text-muted-foreground">
                        {activity.timestamp ? formatTimeAgo(activity.timestamp) : 'Unknown'}
                      </span>
                    </div>
                    {isAdjustment && activity.notes && (
                      <div className="flex items-start gap-2 mt-2 p-2 bg-muted rounded">
                        <i className="fas fa-note-sticky text-muted-foreground text-sm mt-0.5"></i>
                        <span className="text-sm text-foreground">{activity.notes}</span>
                      </div>
                    )}
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
                        {canWrite && (
                          <Button 
                            size="sm" 
                            className="flex-1" 
                            onClick={() => {
                              setActivityToVerify(activity.id);
                              setShowVerifySignaturePad(true);
                            }}
                            data-testid={`sign-verify-${activity.id}`}
                          >
                            Sign & Verify
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setSelectedActivity(activity)}
                          data-testid={`view-activity-${activity.id}`}
                        >
                          <i className="fas fa-eye"></i>
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1" 
                        onClick={() => setSelectedActivity(activity)}
                        data-testid={`view-details-${activity.id}`}
                      >
                        {t('controlled.viewDetails')}
                      </Button>
                    )}
                  </div>
                </div>;
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="checks" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t('controlled.routineVerification')}</h2>
            {canWrite && (
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleOpenRoutineCheckModal}
                data-testid="perform-routine-check-button"
              >
                <i className="fas fa-clipboard-check mr-2"></i>
                {t('controlled.performRoutineCheck')}
              </Button>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-blue-600 dark:text-blue-400 mt-0.5"></i>
              <div>
                <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">{t('controlled.routineVerification')}</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Perform regular checks to verify controlled substance counts match system records.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {isLoadingChecks ? (
              <div className="text-center py-8">
                <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
                <p className="text-muted-foreground">Loading routine checks...</p>
              </div>
            ) : checks.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <i className="fas fa-clipboard-check text-4xl text-muted-foreground mb-4"></i>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Checks Recorded</h3>
                <p className="text-muted-foreground">No routine verification checks performed yet.</p>
              </div>
            ) : (
              checks.map((check) => (
                <div
                  key={check.id}
                  className={`bg-card border rounded-lg p-4 ${
                    !check.allMatch ? "border-2 border-destructive" : "border-border"
                  }`}
                  data-testid={`check-${check.id}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <i className="fas fa-clipboard-check text-primary text-lg"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground">
                        {t('controlled.routineVerificationCheck')}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {check.checkItems.length} {t('controlled.itemsVerified')}
                      </p>
                    </div>
                    {getCheckStatusChip(check)}
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-user text-muted-foreground text-sm"></i>
                      <span className="text-sm text-foreground">
                        {t('controlled.performedBy')} {check.user.firstName} {check.user.lastName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="fas fa-clock text-muted-foreground text-sm"></i>
                      <span className="text-sm text-muted-foreground">
                        {check.timestamp ? formatTimeAgo(check.timestamp) : 'Unknown'}
                      </span>
                    </div>
                    {check.notes && (
                      <div className="flex items-start gap-2">
                        <i className="fas fa-note-sticky text-muted-foreground text-sm mt-0.5"></i>
                        <span className="text-sm text-foreground">{check.notes}</span>
                      </div>
                    )}
                  </div>

                  {!check.allMatch && (
                    <div className="bg-destructive/10 rounded-lg p-2 mt-2">
                      <p className="text-sm text-destructive font-medium">
                        {t('controlled.discrepanciesDetected')}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1" 
                      onClick={() => setSelectedCheck(check)}
                      data-testid={`view-check-${check.id}`}
                    >
                      {t('controlled.viewDetails')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Administration Modal */}
      {showAdministrationModal && (
        <div className="modal-overlay" onClick={() => setShowAdministrationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">{t('controlled.recordAdministration')}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdministrationModal(false)}
                data-testid="close-administration-modal"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="block text-sm font-medium mb-2">{t('controlled.selectDrugs')}</Label>
                <div className="space-y-2">
                  {selectedDrugs.filter(drug => drug.onHand > 0).map((drug) => (
                    <div key={drug.itemId} className="bg-muted rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={drug.selected}
                          onCheckedChange={(checked) => handleDrugSelection(drug.itemId, !!checked)}
                          data-testid={`drug-checkbox-${drug.itemId}`}
                        />
                        <div>
                          <p className="font-medium text-foreground">{drug.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {drug.isControlledPack 
                              ? `${t('controlled.controlledUnits')}: ${drug.onHand} ${t('controlled.ampules')}` 
                              : `${t('items.onHand')}: ${drug.onHand} units`}
                          </p>
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

              <div>
                <Label className="block text-sm font-medium mb-2">{t('controlled.patientAssignment')}</Label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Button
                    variant={patientMethod === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPatientMethod("text")}
                    data-testid="patient-method-text"
                  >
                    <i className="fas fa-keyboard mr-1"></i>
                    {t('controlled.text')}
                  </Button>
                  <Button
                    variant={patientMethod === "barcode" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPatientMethod("barcode")}
                    data-testid="patient-method-barcode"
                  >
                    <i className="fas fa-barcode mr-1"></i>
                    {t('controlled.barcode')}
                  </Button>
                  <Button
                    variant={patientMethod === "photo" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPatientMethod("photo")}
                    data-testid="patient-method-photo"
                  >
                    <i className="fas fa-camera mr-1"></i>
                    {t('controlled.photo')}
                  </Button>
                </div>

                {patientMethod === "text" && (
                  <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
                    <PopoverTrigger asChild>
                      <div className="relative">
                        <Input
                          placeholder={t('controlled.enterPatientId')}
                          value={patientId}
                          onChange={(e) => {
                            setPatientId(e.target.value);
                            setPatientSearchText(e.target.value);
                            if (e.target.value.length > 0) {
                              setPatientSearchOpen(true);
                            }
                          }}
                          onFocus={() => {
                            if (patientId.length > 0 || patients.length > 0) {
                              setPatientSearchOpen(true);
                            }
                          }}
                          data-testid="patient-id-input"
                        />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-full min-w-[300px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder={t('controlled.searchPatient', 'Search patient...')}
                          value={patientSearchText}
                          onValueChange={setPatientSearchText}
                          data-testid="patient-search-input"
                        />
                        <CommandList>
                          <CommandEmpty>
                            {t('controlled.noPatientFound', 'No patient found. You can enter any text.')}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredPatients.map((patient) => (
                              <CommandItem
                                key={patient.id}
                                value={patient.id}
                                onSelect={() => {
                                  const displayName = `${patient.surname || ''}, ${patient.firstName || ''}`.trim().replace(/^,\s*|,\s*$/g, '');
                                  const patientInfo = patient.patientNumber 
                                    ? `${displayName} (${patient.patientNumber})`
                                    : displayName;
                                  setPatientId(patientInfo);
                                  setPatientSearchOpen(false);
                                  setPatientSearchText('');
                                }}
                                data-testid={`patient-option-${patient.id}`}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {patient.surname}{patient.surname && patient.firstName ? ', ' : ''}{patient.firstName}
                                  </span>
                                  {patient.patientNumber && (
                                    <span className="text-xs text-muted-foreground">
                                      {patient.patientNumber}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}

                {patientMethod === "barcode" && (
                  <div className="bg-muted rounded-lg p-4 text-center">
                    {patientId ? (
                      <>
                        <i className="fas fa-check-circle text-4xl text-success mb-2"></i>
                        <p className="text-sm text-success font-medium">Barcode: {patientId}</p>
                        <Button className="mt-3" variant="outline" onClick={() => setPatientId("")}>
                          <i className="fas fa-redo mr-2"></i>
                          Rescan
                        </Button>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-barcode text-4xl text-muted-foreground mb-2"></i>
                        <p className="text-sm text-muted-foreground">Scan patient wristband</p>
                        <Button className="mt-3" onClick={() => setShowPatientScanner(true)} data-testid="open-patient-scanner">
                          <i className="fas fa-camera mr-2"></i>
                          Open Scanner
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {patientMethod === "photo" && (
                  <div className="bg-muted rounded-lg p-4">
                    <Label className="block text-sm font-medium mb-2">
                      {t('controlled.patientLabelPhoto')}
                    </Label>
                    {patientPhoto ? (
                      <div className="space-y-2">
                        <div className="w-full bg-black rounded border border-border overflow-hidden">
                          <img 
                            src={patientPhoto} 
                            alt="Patient label" 
                            className="w-full h-auto object-contain"
                          />
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="w-full"
                          onClick={() => setShowPatientCamera(true)}
                        >
                          <i className="fas fa-redo mr-2"></i>
                          {t('controlled.retakePhoto')}
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowPatientCamera(true)}
                        data-testid="take-patient-photo"
                      >
                        <i className="fas fa-camera mr-2"></i>
                        {t('controlled.takePhoto')}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="notes" className="block text-sm font-medium mb-2">
                  {t('controlled.notesOptional')}
                </Label>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder={t('controlled.addNotes')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="administration-notes"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">{t('controlled.yourSignature')}</Label>
                <div
                  className="signature-pad cursor-pointer"
                  onClick={() => setShowSignaturePad(true)}
                  data-testid="signature-trigger"
                >
                  {signature ? (
                    <div className="text-center">
                      <i className="fas fa-check-circle text-2xl text-success mb-2"></i>
                      <p className="text-sm text-success">{t('controlled.signatureCaptured')}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <i className="fas fa-signature text-2xl mb-2"></i>
                      <p className="text-sm">{t('controlled.tapToSign')}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAdministrationModal(false)}
                  data-testid="cancel-administration"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  className="flex-1 bg-accent hover:bg-accent/90"
                  onClick={handleSubmitAdministration}
                  disabled={dispenseMutation.isPending || !signature || (!patientId.trim() && !patientPhoto) || selectedDrugs.filter(d => d.selected && d.qty > 0).length === 0}
                  data-testid="submit-administration"
                >
                  <i className="fas fa-shield-halved mr-2"></i>
                  {t('controlled.submitRecord')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Routine Check Modal */}
      {showRoutineCheckModal && (
        <div className="modal-overlay" onClick={() => setShowRoutineCheckModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">{t('controlled.routineVerificationCheck')}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRoutineCheckModal(false)}
                data-testid="close-routine-check-modal"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                Count each controlled substance and enter the actual quantity below.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="block text-sm font-medium mb-2">{t('controlled.controlledSubstances')}</Label>
                <div className="space-y-2">
                  {routineCheckItems.map((item) => (
                    <div
                      key={item.itemId}
                      className={`bg-muted rounded-lg p-3 ${
                        item.actualQty > 0 && !item.match ? "border-2 border-destructive" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">Expected: {item.expectedQty} units</p>
                        </div>
                        {item.actualQty > 0 && (
                          item.match ? (
                            <i className="fas fa-check-circle text-success text-lg"></i>
                          ) : (
                            <i className="fas fa-exclamation-triangle text-destructive text-lg"></i>
                          )
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`actual-${item.itemId}`} className="text-sm whitespace-nowrap">
                          Actual Count:
                        </Label>
                        <Input
                          id={`actual-${item.itemId}`}
                          type="number"
                          placeholder="0"
                          value={item.actualQty || ""}
                          onChange={(e) => handleActualQtyChange(item.itemId, parseInt(e.target.value) || 0)}
                          className="flex-1"
                          min="0"
                          data-testid={`actual-qty-${item.itemId}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="check-notes" className="block text-sm font-medium mb-2">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="check-notes"
                  rows={3}
                  placeholder="Add any notes or discrepancies found..."
                  value={checkNotes}
                  onChange={(e) => setCheckNotes(e.target.value)}
                  data-testid="check-notes"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">Your E-Signature</Label>
                <div
                  className="signature-pad cursor-pointer"
                  onClick={() => setShowSignaturePad(true)}
                  data-testid="check-signature-trigger"
                >
                  {checkSignature ? (
                    <div className="text-center">
                      <i className="fas fa-check-circle text-2xl text-success mb-2"></i>
                      <p className="text-sm text-success">{t('controlled.signatureCaptured')}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <i className="fas fa-signature text-2xl mb-2"></i>
                      <p className="text-sm">{t('controlled.tapToSign')}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowRoutineCheckModal(false)}
                  data-testid="cancel-routine-check"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleSubmitRoutineCheck}
                  disabled={routineCheckMutation.isPending}
                  data-testid="submit-routine-check"
                >
                  <i className="fas fa-clipboard-check mr-2"></i>
                  Submit Check
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Adjustment Modal */}
      {showManualAdjustmentModal && (
        <div className="modal-overlay" onClick={() => setShowManualAdjustmentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Manual Adjustment</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowManualAdjustmentModal(false)}
                data-testid="close-adjustment-modal"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>

            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-900 dark:text-orange-100">
                Use this to manually adjust controlled substance units when needed (e.g., expiration, damage, discrepancy resolution).
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="block text-sm font-medium mb-2">Controlled Item</Label>
                <Select value={adjustmentItemId} onValueChange={setAdjustmentItemId}>
                  <SelectTrigger data-testid="adjustment-item-select">
                    <SelectValue placeholder="Select item..." />
                  </SelectTrigger>
                  <SelectContent className="z-[150]">
                    {controlledItems.map((item) => {
                      const normalizedUnit = item.unit.toLowerCase();
                      const isControlledPack = item.controlled && normalizedUnit === 'pack';
                      const currentQty = isControlledPack 
                        ? (item.currentUnits || 0) 
                        : (item.stockLevel?.qtyOnHand || 0);
                      
                      return (
                        <SelectItem key={item.id} value={item.id} data-testid={`adjustment-item-${item.id}`}>
                          {item.name} (Current: {currentQty} {isControlledPack ? 'ampules' : 'units'})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="adjustment-new-units" className="block text-sm font-medium mb-2">
                  New Units Value
                </Label>
                <Input
                  id="adjustment-new-units"
                  type="number"
                  placeholder="Enter new units..."
                  value={adjustmentNewUnits}
                  onChange={(e) => setAdjustmentNewUnits(e.target.value)}
                  min="0"
                  step="0.01"
                  data-testid="adjustment-new-units-input"
                />
              </div>

              <div>
                <Label htmlFor="adjustment-notes" className="block text-sm font-medium mb-2">
                  Reason for Adjustment
                </Label>
                <Textarea
                  id="adjustment-notes"
                  rows={4}
                  placeholder="Explain the reason for this adjustment..."
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  data-testid="adjustment-notes-textarea"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">Attachment (Receipt/Photo)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Optional: Attach a photo of the receipt or documentation
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.capture = 'environment';
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            setAdjustmentAttachmentPhoto(e.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                    data-testid="adjustment-camera-button"
                  >
                    <i className="fas fa-camera mr-2"></i>
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            setAdjustmentAttachmentPhoto(e.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                    data-testid="adjustment-gallery-button"
                  >
                    <i className="fas fa-image mr-2"></i>
                    From Gallery
                  </Button>
                </div>
                {adjustmentAttachmentPhoto && (
                  <div className="mt-2 relative">
                    <img 
                      src={adjustmentAttachmentPhoto} 
                      alt="Attachment" 
                      className="w-full h-40 object-cover rounded border border-border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setAdjustmentAttachmentPhoto("")}
                    >
                      <i className="fas fa-times"></i>
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">Your E-Signature</Label>
                <div
                  className="signature-pad cursor-pointer"
                  onClick={() => setShowAdjustmentSignaturePad(true)}
                  data-testid="adjustment-signature-trigger"
                >
                  {adjustmentSignature ? (
                    <div className="text-center">
                      <i className="fas fa-check-circle text-2xl text-success mb-2"></i>
                      <p className="text-sm text-success">Signature Captured</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <i className="fas fa-signature text-2xl mb-2"></i>
                      <p className="text-sm">Tap to Sign</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowManualAdjustmentModal(false)}
                  data-testid="cancel-adjustment"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleSubmitAdjustment}
                  disabled={adjustmentMutation.isPending}
                  data-testid="submit-adjustment"
                >
                  <i className="fas fa-save mr-2"></i>
                  Save Adjustment
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
        onSave={(sig) => {
          if (showRoutineCheckModal) {
            setCheckSignature(sig);
          } else {
            setSignature(sig);
          }
        }}
        title="Your E-Signature"
      />

      {/* Adjustment Signature Pad */}
      <SignaturePad
        isOpen={showAdjustmentSignaturePad}
        onClose={() => setShowAdjustmentSignaturePad(false)}
        onSave={(sig) => {
          setAdjustmentSignature(sig);
          setShowAdjustmentSignaturePad(false);
        }}
        title="Your E-Signature"
      />

      {/* Verification Signature Pad */}
      <SignaturePad
        isOpen={showVerifySignaturePad}
        onClose={() => {
          setShowVerifySignaturePad(false);
          setActivityToVerify(null);
        }}
        onSave={(sig) => {
          if (activityToVerify) {
            verifyMutation.mutate({
              activityId: activityToVerify,
              signature: sig,
            });
          }
          setShowVerifySignaturePad(false);
        }}
        title="Verify with Second Signature"
      />

      {/* Activity Detail Modal */}
      {selectedActivity && (() => {
        const isAdjustment = selectedActivity.action === 'adjust';
        return <div className="modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">
                {isAdjustment ? 'Manual Adjustment Details' : 'Administration Details'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedActivity(null)}
                data-testid="close-activity-detail"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>

            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-lg ${isAdjustment ? 'bg-orange-100 dark:bg-orange-950/30' : 'bg-accent/10'} flex items-center justify-center`}>
                    <i className={`fas ${isAdjustment ? 'fa-sliders text-orange-600 dark:text-orange-400' : 'fa-syringe text-accent'} text-xl`}></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-lg">
                      {selectedActivity.item?.name || "Unknown Item"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isAdjustment 
                        ? `${Math.abs(selectedActivity.delta || 0)} units ${selectedActivity.movementType || 'OUT'}`
                        : `${Math.abs(selectedActivity.delta || 0)} units dispensed`
                      }
                    </p>
                  </div>
                </div>
                {getStatusChip(selectedActivity)}
              </div>

              <div className="space-y-3">
                {!isAdjustment && (
                  <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    <i className="fas fa-user-injured text-primary mt-1"></i>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">{t('controlled.patient')}</p>
                      {selectedActivity.patient ? (
                        <div>
                          <p className="font-medium text-foreground">
                            {selectedActivity.patient.surname}, {selectedActivity.patient.firstName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t('common.birthday')}: {formatDate(selectedActivity.patient.birthday)}
                          </p>
                          {selectedActivity.patient.patientNumber && (
                            <p className="text-xs text-muted-foreground mt-1">
                              ID: {selectedActivity.patient.patientNumber}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="font-medium text-foreground">{selectedActivity.patientId || "Not provided"}</p>
                      )}
                      {selectedActivity.patientPhoto && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground mb-2">Patient Label Photo</p>
                          <img 
                            src={selectedActivity.patientPhoto} 
                            alt="Patient label" 
                            className="max-w-full rounded border border-border cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => selectedActivity.patientPhoto && window.open(selectedActivity.patientPhoto, '_blank')}
                            data-testid="patient-photo-detail"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                  <i className="fas fa-user-md text-primary mt-1"></i>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                      {isAdjustment ? 'Adjusted By' : 'Administered By'}
                    </p>
                    <p className="font-medium text-foreground">
                      {selectedActivity.user.firstName} {selectedActivity.user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedActivity.user.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                  <i className="fas fa-clock text-primary mt-1"></i>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
                    <p className="font-medium text-foreground">
                      {selectedActivity.timestamp ? formatDateTime(selectedActivity.timestamp) : 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedActivity.timestamp ? formatTimeAgo(selectedActivity.timestamp) : 'Unknown'}</p>
                  </div>
                </div>

                {selectedActivity.notes && (
                  <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    <i className="fas fa-note-sticky text-primary mt-1"></i>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-foreground">{selectedActivity.notes}</p>
                    </div>
                  </div>
                )}

                {isAdjustment && selectedActivity.attachmentPhoto && (
                  <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    <i className="fas fa-paperclip text-primary mt-1"></i>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-2">Attachment (Receipt/Photo)</p>
                      <img 
                        src={selectedActivity.attachmentPhoto} 
                        alt="Attachment" 
                        className="w-full rounded border border-border cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => selectedActivity.attachmentPhoto && window.open(selectedActivity.attachmentPhoto, '_blank')}
                      />
                    </div>
                  </div>
                )}

                {selectedActivity.signatures && Array.isArray(selectedActivity.signatures) && selectedActivity.signatures.length > 0 ? (
                  <div className="p-3 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <i className="fas fa-signature text-primary"></i>
                      <p className="text-xs text-muted-foreground">Electronic Signatures ({selectedActivity.signatures.length})</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(selectedActivity.signatures as string[]).map((sig: string, idx: number) => (
                        <div key={idx} className="border border-border rounded p-2">
                          <img src={sig} alt={`Signature ${idx + 1}`} className="w-full h-16 object-contain" />
                          <p className="text-xs text-center text-muted-foreground mt-1">
                            {idx === 0 ? "Administrator" : "Verifier"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSelectedActivity(null)}
                data-testid="close-activity-detail-button"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      })()}

      {/* Routine Check Detail Modal */}
      {selectedCheck && (
        <div className="modal-overlay" onClick={() => setSelectedCheck(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Routine Check Details</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCheck(null)}
                data-testid="close-check-detail"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>

            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <i className="fas fa-clipboard-check text-primary text-xl"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-lg">
                      {t('controlled.routineVerificationCheck')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedCheck.checkItems.length} {t('controlled.itemsVerified')}
                    </p>
                  </div>
                </div>
                {getCheckStatusChip(selectedCheck)}
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                  <i className="fas fa-user text-primary mt-1"></i>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Performed By</p>
                    <p className="font-medium text-foreground">
                      {selectedCheck.user.firstName} {selectedCheck.user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedCheck.user.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                  <i className="fas fa-clock text-primary mt-1"></i>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
                    <p className="font-medium text-foreground">
                      {selectedCheck.timestamp ? formatDateTime(selectedCheck.timestamp) : 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedCheck.timestamp ? formatTimeAgo(selectedCheck.timestamp) : 'Unknown'}</p>
                  </div>
                </div>

                {selectedCheck.notes && (
                  <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                    <i className="fas fa-note-sticky text-primary mt-1"></i>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-foreground">{selectedCheck.notes}</p>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-card border border-border rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <i className="fas fa-list text-primary"></i>
                    <p className="text-sm font-medium text-foreground">Items Checked</p>
                  </div>
                  <div className="space-y-2">
                    {selectedCheck.checkItems?.map((item: any, idx: number) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg border ${
                          item.match 
                            ? 'bg-success/5 border-success/20' 
                            : 'bg-destructive/5 border-destructive/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-foreground text-sm">{item.name}</p>
                          {item.match ? (
                            <i className="fas fa-check-circle text-success"></i>
                          ) : (
                            <i className="fas fa-exclamation-triangle text-destructive"></i>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Expected</p>
                            <p className="font-medium text-foreground">{item.expectedQty} units</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Actual</p>
                            <p className="font-medium text-foreground">{item.actualQty} units</p>
                          </div>
                        </div>
                        {!item.match && (
                          <p className="text-xs text-destructive mt-2">
                            Discrepancy: {Math.abs(item.expectedQty - item.actualQty)} units
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedCheck.signature && (
                  <div className="p-3 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <i className="fas fa-signature text-primary"></i>
                      <p className="text-xs text-muted-foreground">Electronic Signature</p>
                    </div>
                    <div className="border border-border rounded p-2">
                      <img src={selectedCheck.signature} alt="Signature" className="w-full h-16 object-contain" />
                    </div>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSelectedCheck(null)}
                data-testid="close-check-detail-button"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Barcode Scanner */}
      <BarcodeScanner
        isOpen={showPatientScanner}
        onClose={() => setShowPatientScanner(false)}
        onScan={handlePatientBarcodeScan}
        onManualEntry={() => {
          setShowPatientScanner(false);
          setPatientMethod("text");
        }}
      />

      {/* Patient Photo Camera */}
      <CameraCapture
        isOpen={showPatientCamera}
        onClose={() => setShowPatientCamera(false)}
        onCapture={(photo) => {
          setPatientPhoto(photo);
          toast({
            title: t('controlled.photoCaptured'),
            description: t('controlled.photoSavedSecurely'),
          });
        }}
      />
    </div>
  );
}
