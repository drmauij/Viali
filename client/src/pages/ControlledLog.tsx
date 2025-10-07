import { useState, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SignaturePad from "@/components/SignaturePad";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { Activity, User, Item, ControlledCheck } from "@shared/schema";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ItemWithStock extends Item {
  stockLevel?: { qtyOnHand: number };
}

interface ControlledActivity extends Activity {
  user: User;
  item?: Item;
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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeHospital] = useState(() => (user as any)?.hospitals?.[0]);
  const [showAdministrationModal, setShowAdministrationModal] = useState(false);
  const [showRoutineCheckModal, setShowRoutineCheckModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showVerifySignaturePad, setShowVerifySignaturePad] = useState(false);
  const [patientMethod, setPatientMethod] = useState<PatientMethod>("text");
  const [showPatientScanner, setShowPatientScanner] = useState(false);
  const [showPatientCamera, setShowPatientCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoStreamRef = useRef<MediaStream | null>(null);
  const videoReadyCallbackRef = useRef<(() => void) | null>(null);
  const videoReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [selectedDrugs, setSelectedDrugs] = useState<DrugSelection[]>([]);
  const [patientId, setPatientId] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  
  const [routineCheckItems, setRoutineCheckItems] = useState<RoutineCheckItem[]>([]);
  const [checkNotes, setCheckNotes] = useState("");
  const [checkSignature, setCheckSignature] = useState("");
  
  const [activityToVerify, setActivityToVerify] = useState<string | null>(null);
  const [verifySignature, setVerifySignature] = useState("");
  
  const [selectedActivity, setSelectedActivity] = useState<ControlledActivity | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<ControlledCheckWithUser | null>(null);
  
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth().toString());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());

  const { data: controlledItems = [] } = useQuery<ItemWithStock[]>({
    queryKey: ["/api/items", activeHospital?.id, { controlled: true }],
    queryFn: async () => {
      const response = await fetch(`/api/items/${activeHospital?.id}?controlled=true`);
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    },
    enabled: !!activeHospital?.id,
  });

  const { data: activities = [], isLoading: isLoadingActivities } = useQuery<ControlledActivity[]>({
    queryKey: ["/api/controlled/log", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const { data: checks = [], isLoading: isLoadingChecks } = useQuery<ControlledCheckWithUser[]>({
    queryKey: ["/api/controlled/checks", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/controlled/log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
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
      locationId: string;
      signature: string;
      checkItems: Array<{ itemId: string; name: string; expectedQty: number; actualQty: number; match: boolean }>;
      allMatch?: boolean;
      notes?: string;
    }) => {
      const response = await apiRequest("POST", "/api/controlled/checks", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controlled/checks"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/controlled/log"] });
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

  const resetAdministrationForm = () => {
    setSelectedDrugs(controlledItems.map(item => {
      const normalizedUnit = item.unit.toLowerCase();
      const isControlledPack = !!(item.controlled && normalizedUnit === 'pack');
      const onHandQty = isControlledPack 
        ? (item.controlledUnits || 0) 
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
    setNotes("");
    setSignature("");
    setPatientMethod("text");
  };

  const resetRoutineCheckForm = () => {
    setRoutineCheckItems(controlledItems.map(item => {
      const normalizedUnit = item.unit.toLowerCase();
      const isControlledPack = item.controlled && normalizedUnit === 'pack';
      const expectedQty = isControlledPack 
        ? (item.controlledUnits || 0) 
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

  const handleOpenAdministrationModal = () => {
    setSelectedDrugs(controlledItems.map(item => {
      const normalizedUnit = item.unit.toLowerCase();
      const isControlledPack = !!(item.controlled && normalizedUnit === 'pack');
      const onHandQty = isControlledPack 
        ? (item.controlledUnits || 0) 
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
        ? (item.controlledUnits || 0) 
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

  const startPatientCamera = async () => {
    try {
      setIsVideoReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        photoStreamRef.current = stream;
        
        const checkVideoReady = () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            if (videoRef.current && videoReadyCallbackRef.current) {
              videoRef.current.removeEventListener('loadedmetadata', videoReadyCallbackRef.current);
              videoRef.current.removeEventListener('loadeddata', videoReadyCallbackRef.current);
              videoRef.current.removeEventListener('canplay', videoReadyCallbackRef.current);
            }
            if (videoReadyTimeoutRef.current) {
              clearTimeout(videoReadyTimeoutRef.current);
              videoReadyTimeoutRef.current = null;
            }
            setIsVideoReady(true);
          }
        };
        
        videoReadyCallbackRef.current = checkVideoReady;
        
        videoRef.current.addEventListener('loadedmetadata', checkVideoReady);
        videoRef.current.addEventListener('loadeddata', checkVideoReady);
        videoRef.current.addEventListener('canplay', checkVideoReady);
        
        await videoRef.current.play();
        
        videoReadyTimeoutRef.current = setTimeout(checkVideoReady, 500);
      }
      setShowPatientCamera(true);
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check camera permissions.",
        variant: "destructive",
      });
    }
  };

  const stopPatientCamera = () => {
    if (photoStreamRef.current) {
      photoStreamRef.current.getTracks().forEach(track => track.stop());
      photoStreamRef.current = null;
    }
    if (videoRef.current && videoReadyCallbackRef.current) {
      videoRef.current.removeEventListener('loadedmetadata', videoReadyCallbackRef.current);
      videoRef.current.removeEventListener('loadeddata', videoReadyCallbackRef.current);
      videoRef.current.removeEventListener('canplay', videoReadyCallbackRef.current);
    }
    if (videoReadyTimeoutRef.current) {
      clearTimeout(videoReadyTimeoutRef.current);
      videoReadyTimeoutRef.current = null;
    }
    videoReadyCallbackRef.current = null;
    setShowPatientCamera(false);
    setIsVideoReady(false);
  };

  const capturePatientPhoto = async () => {
    if (!videoRef.current) {
      toast({
        title: "Camera Error",
        description: "Video stream not available",
        variant: "destructive",
      });
      return;
    }

    const video = videoRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      toast({
        title: "Camera Error",
        description: "Video stream not ready. Please wait a moment and try again.",
        variant: "destructive",
      });
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      toast({
        title: "Camera Error",
        description: "Failed to create image canvas",
        variant: "destructive",
      });
      return;
    }
    
    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    
    if (!imageData || imageData === 'data:,') {
      toast({
        title: "Camera Error",
        description: "Failed to capture image data",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/controlled/extract-patient-info", { image: imageData });
      const result = await response.json();
      
      if (result.patientId) {
        setPatientId(result.patientId);
        stopPatientCamera();
        toast({
          title: "Photo Captured",
          description: "Patient information extracted successfully",
        });
      } else {
        toast({
          title: "Extraction Failed",
          description: "Could not extract patient information from photo. Please enter manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error processing photo:", error);
      toast({
        title: "Processing Error",
        description: "Failed to process patient photo",
        variant: "destructive",
      });
    }
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
    }));

    dispenseMutation.mutate({
      items,
      patientId,
      notes,
      signatures: [signature],
    });
  };

  const handleSubmitRoutineCheck = () => {
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
      locationId: activeHospital.locationId,
      signature: checkSignature,
      checkItems: routineCheckItems,
      allMatch,
      notes: checkNotes || undefined,
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
      return <span className="status-chip chip-success text-xs">All Match</span>;
    }
    return <span className="status-chip chip-destructive text-xs">Discrepancies</span>;
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
    return time.toLocaleDateString();
  };

  const downloadMonthlyReport = () => {
    const month = parseInt(selectedMonth);
    const year = parseInt(selectedYear);
    
    // Filter activities for selected month/year
    const monthlyActivities = activities.filter(activity => {
      if (!activity.timestamp) return false;
      const activityDate = new Date(activity.timestamp);
      return activityDate.getMonth() === month && activityDate.getFullYear() === year;
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

      // Drug header
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${drugName}`, 20, yPosition);
      yPosition += 8;

      // Group by day within this drug
      const groupedByDay: Record<string, ControlledActivity[]> = {};
      drugActivities.forEach(activity => {
        if (!activity.timestamp) return;
        const dayKey = new Date(activity.timestamp).toLocaleDateString("en-US", { 
          year: "numeric", 
          month: "short", 
          day: "numeric" 
        });
        if (!groupedByDay[dayKey]) {
          groupedByDay[dayKey] = [];
        }
        groupedByDay[dayKey].push(activity);
      });

      // Iterate through each day for this drug
      Object.entries(groupedByDay).forEach(([day, dayActivities]) => {
        // Day subheader
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`  ${day}`, 20, yPosition);
        yPosition += 5;

        // Create table for this day's administrations
        const tableData = dayActivities.map(activity => [
          activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "N/A",
          Math.abs(activity.delta || 0).toString(),
          activity.patientId || "N/A",
          `${activity.user.firstName} ${activity.user.lastName}`,
          activity.controlledVerified ? "Yes" : "No",
          activity.notes || "-"
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [["Time", "Qty", "Patient ID", "Administrator", "Verified", "Notes"]],
          body: tableData,
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [59, 130, 246], textColor: 255 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 15, halign: "center" },
            2: { cellWidth: 30 },
            3: { cellWidth: 40 },
            4: { cellWidth: 20, halign: "center" },
            5: { cellWidth: 50 },
          },
          margin: { left: 25 },
        });

        yPosition = (doc as any).lastAutoTable.finalY + 5;

        // Add signatures for each administration
        dayActivities.forEach((activity, actIndex) => {
          const signatures = activity.signatures as string[] | null;
          if (signatures && signatures.length > 0) {
            // Check if we need a new page
            if (yPosition > 240) {
              doc.addPage();
              yPosition = 20;
            }

            // Activity reference
            doc.setFontSize(8);
            doc.setFont("helvetica", "italic");
            const timeStr = activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "N/A";
            doc.text(`    ${timeStr} - Patient ${activity.patientId || "N/A"} - Signatures:`, 25, yPosition);
            yPosition += 3;

            let xPosition = 30;

            // Administrator signature (first signature)
            if (signatures[0]) {
              doc.setFontSize(7);
              doc.setFont("helvetica", "normal");
              doc.text("Administrator:", xPosition, yPosition);
              try {
                doc.addImage(signatures[0], "PNG", xPosition, yPosition + 1, 35, 15);
              } catch (e) {
                console.error("Failed to add admin signature image", e);
              }
              xPosition += 40;
            }

            // Verifier signature (second signature, if verified)
            if (signatures[1]) {
              doc.setFontSize(7);
              doc.setFont("helvetica", "normal");
              doc.text("Verifier:", xPosition, yPosition);
              try {
                doc.addImage(signatures[1], "PNG", xPosition, yPosition + 1, 35, 15);
              } catch (e) {
                console.error("Failed to add verifier signature image", e);
              }
            }

            yPosition += 18;
          }
        });

        yPosition += 3;
      });

      yPosition += 5; // Space between drugs
    });

    // Summary footer - use the maximum of yPosition and lastAutoTable.finalY
    const tableEndY = (doc as any).lastAutoTable?.finalY ?? 0;
    const footerY = Math.max(yPosition, tableEndY);
    
    // Check if footer will fit on current page, if not add new page
    if (footerY + 30 > 280) {
      doc.addPage();
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Total Administrations: ${monthlyActivities.length}`, 20, 20);
      doc.text(`Total Drugs: ${Object.keys(groupedByDrug).length}`, 20, 26);
      doc.text(`Generated: ${new Date().toLocaleString("en-US")}`, 20, 32);
    } else {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Total Administrations: ${monthlyActivities.length}`, 20, footerY + 10);
      doc.text(`Total Drugs: ${Object.keys(groupedByDrug).length}`, 20, footerY + 16);
      doc.text(`Generated: ${new Date().toLocaleString("en-US")}`, 20, footerY + 22);
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
        <h1 className="text-2xl font-bold text-foreground">Controlled Substances</h1>
      </div>

      <Tabs defaultValue="administrations" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="administrations" data-testid="tab-administrations">
            Administrations
          </TabsTrigger>
          <TabsTrigger value="checks" data-testid="tab-checks">
            Routine Checks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="administrations" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Administration Log</h2>
            <Button
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={handleOpenAdministrationModal}
              data-testid="record-administration-button"
            >
              <i className="fas fa-plus mr-2"></i>
              Record Administration
            </Button>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 items-center">
                <Label className="text-sm font-medium">Monthly Report:</Label>
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
                Download PDF Report
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Today's Records</p>
              <p className="text-3xl font-bold text-foreground" data-testid="todays-records">
                {activities.filter(a => {
                  const today = new Date().toDateString();
                  return a.timestamp ? new Date(a.timestamp).toDateString() === today : false;
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
                        {activity.timestamp ? formatTimeAgo(activity.timestamp) : 'Unknown'}
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
                        View Details
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="checks" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Routine Verification</h2>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleOpenRoutineCheckModal}
              data-testid="perform-routine-check-button"
            >
              <i className="fas fa-clipboard-check mr-2"></i>
              Perform Routine Check
            </Button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-blue-600 dark:text-blue-400 mt-0.5"></i>
              <div>
                <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">Routine Verification</p>
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
                        Routine Verification Check
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {check.checkItems.length} items verified
                      </p>
                    </div>
                    {getCheckStatusChip(check)}
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-user text-muted-foreground text-sm"></i>
                      <span className="text-sm text-foreground">
                        Performed by: {check.user.firstName} {check.user.lastName}
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
                        ⚠️ Discrepancies detected - counts do not match
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
                      View Details
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
              <h2 className="text-xl font-bold text-foreground">Record Administration</h2>
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
                          <p className="text-xs text-muted-foreground">
                            {drug.isControlledPack 
                              ? `Controlled units: ${drug.onHand} Ampules` 
                              : `On hand: ${drug.onHand} units`}
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
                    {showPatientCamera ? (
                      <div className="relative">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-64 object-cover rounded-lg bg-black"
                        />
                        {!isVideoReady && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                            <div className="text-center text-white">
                              <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                              <p className="text-sm">Loading camera...</p>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Button 
                            className="flex-1" 
                            onClick={capturePatientPhoto} 
                            disabled={!isVideoReady}
                            data-testid="capture-patient-photo"
                          >
                            <i className="fas fa-camera mr-2"></i>
                            {isVideoReady ? "Capture" : "Loading..."}
                          </Button>
                          <Button variant="outline" onClick={stopPatientCamera}>
                            <i className="fas fa-times"></i>
                          </Button>
                        </div>
                      </div>
                    ) : patientId ? (
                      <div className="text-center">
                        <i className="fas fa-check-circle text-4xl text-success mb-2"></i>
                        <p className="text-sm text-success font-medium">Patient ID: {patientId}</p>
                        <Button className="mt-3" variant="outline" onClick={startPatientCamera}>
                          <i className="fas fa-redo mr-2"></i>
                          Retake
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <i className="fas fa-camera text-4xl text-muted-foreground mb-2"></i>
                        <p className="text-sm text-muted-foreground">Photo patient label/wristband</p>
                        <Button className="mt-3" onClick={startPatientCamera} data-testid="start-patient-camera">
                          <i className="fas fa-camera mr-2"></i>
                          Open Camera
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                  disabled={dispenseMutation.isPending || !signature || !patientId.trim() || selectedDrugs.filter(d => d.selected && d.qty > 0).length === 0}
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

      {/* Routine Check Modal */}
      {showRoutineCheckModal && (
        <div className="modal-overlay" onClick={() => setShowRoutineCheckModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Routine Verification Check</h2>
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
                <Label className="block text-sm font-medium mb-2">Controlled Substances</Label>
                <div className="space-y-2 max-h-96 overflow-y-auto">
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
      {selectedActivity && (
        <div className="modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Administration Details</h2>
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
                  <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                    <i className="fas fa-syringe text-accent text-xl"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-lg">
                      {selectedActivity.item?.name || "Unknown Item"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {Math.abs(selectedActivity.delta || 0)} units dispensed
                    </p>
                  </div>
                </div>
                {getStatusChip(selectedActivity)}
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                  <i className="fas fa-user-injured text-primary mt-1"></i>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Patient ID</p>
                    <p className="font-medium text-foreground">{selectedActivity.patientId || "Not provided"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                  <i className="fas fa-user-md text-primary mt-1"></i>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Administered By</p>
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
                      {selectedActivity.timestamp ? new Date(selectedActivity.timestamp).toLocaleString() : 'Unknown'}
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
      )}

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
                      Routine Verification Check
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedCheck.checkItems.length} items verified
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
                      {selectedCheck.timestamp ? new Date(selectedCheck.timestamp).toLocaleString() : 'Unknown'}
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
    </div>
  );
}
