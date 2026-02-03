import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import SignaturePad from "@/components/SignaturePad";
import { Loader2, CheckCircle, AlertCircle, Clock, Building2, FileText, PenLine, Download, Plus, History, Trash2, Globe, Sun, Moon, FileSignature, User, FileBarChart, ChevronRight, ChevronLeft, Check, Camera, Upload, CreditCard, Baby, Car, Image } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import jsPDF from "jspdf";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { CameraCapture } from "@/components/CameraCapture";

interface WorklogEntry {
  id: string;
  firstName: string;
  lastName: string;
  workDate: string;
  timeStart: string;
  timeEnd: string;
  pauseMinutes: number;
  activityType: "anesthesia_nurse" | "op_nurse" | "springer_nurse" | "anesthesia_doctor" | "other";
  workerSignature: string;
  status: "pending" | "countersigned" | "rejected";
  countersignature?: string;
  countersignedAt?: string;
  countersignerName?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

interface WorkerContract {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  workerSignedAt?: string;
  managerSignedAt?: string;
  archivedAt?: string;
}

interface WorklogLinkInfo {
  email: string;
  unitName: string;
  hospitalName: string;
  linkId: string;
  unitId: string;
  hospitalId: string;
  entries: WorklogEntry[];
}

interface PersonalData {
  firstName: string;
  lastName: string;
  profession: string;
  address: string;
  city: string;
  zip: string;
  dateOfBirth: string;
  maritalStatus: string;
  nationality: string;
  religion: string;
  mobile: string;
  ahvNumber: string;
  hasChildBenefits: boolean;
  numberOfChildren: number;
  childBenefitsRecipient: string;
  childBenefitsRegistration: string;
  hasResidencePermit: boolean;
  residencePermitType: string;
  residencePermitValidUntil: string;
  residencePermitFrontImage: string;
  residencePermitBackImage: string;
  bankName: string;
  bankAddress: string;
  bankAccount: string;
  hasOwnVehicle: boolean;
}

function calculateWorkHours(timeStart: string, timeEnd: string, pauseMinutes: number): string {
  if (!timeStart || !timeEnd) return "0:00";
  
  const [startH, startM] = timeStart.split(":").map(Number);
  const [endH, endM] = timeEnd.split(":").map(Number);
  
  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - pauseMinutes;
  if (totalMinutes < 0) totalMinutes = 0;
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

const roleLabels: Record<string, { en: string; de: string; rate: string }> = {
  awr_nurse: { en: "Day Clinic Nurse (AWR)", de: "Tagesklinik Pflege (AWR-Nurse)", rate: "CHF 75.00/h" },
  anesthesia_nurse: { en: "Anesthesia Nurse", de: "Pflege-Anästhesist", rate: "CHF 80.00/h" },
  op_nurse: { en: "OR Nurse/OTA", de: "OP Pflege/OTA", rate: "CHF 80.00/h" },
  anesthesia_doctor: { en: "Anesthesiologist", de: "Arzt Anästhesie", rate: "CHF 150.00/h" },
};

export default function ExternalWorklog() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [linkInfo, setLinkInfo] = useState<WorklogLinkInfo | null>(null);
  const [contracts, setContracts] = useState<WorkerContract[]>([]);
  const [personalData, setPersonalData] = useState<PersonalData>({ 
    firstName: "", lastName: "", profession: "", address: "", city: "", zip: "",
    dateOfBirth: "", maritalStatus: "", nationality: "", religion: "", mobile: "", ahvNumber: "",
    hasChildBenefits: false, numberOfChildren: 0, childBenefitsRecipient: "", childBenefitsRegistration: "",
    hasResidencePermit: false, residencePermitType: "", residencePermitValidUntil: "", 
    residencePermitFrontImage: "", residencePermitBackImage: "",
    bankName: "", bankAddress: "", bankAccount: "", hasOwnVehicle: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState("worklogs");
  const [reportWizardStep, setReportWizardStep] = useState(0);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showCameraCapture, setShowCameraCapture] = useState<'front' | 'back' | null>(null);
  const [uploadingPermitImage, setUploadingPermitImage] = useState<'front' | 'back' | null>(null);
  const [permitImageUrls, setPermitImageUrls] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const permitFrontInputRef = useRef<HTMLInputElement>(null);
  const permitBackInputRef = useRef<HTMLInputElement>(null);

  const currentLang = i18n.language;
  const dateLocale = currentLang === "de" ? de : enUS;

  const worklogFormSchema = useMemo(() => z.object({
    firstName: z.string().min(1, t("externalWorklog.firstName") + " " + t("common.error")),
    lastName: z.string().min(1, t("externalWorklog.lastName") + " " + t("common.error")),
    workDate: z.string().min(1, t("externalWorklog.workDate") + " " + t("common.error")),
    timeStart: z.string().min(1, t("externalWorklog.from") + " " + t("common.error")),
    timeEnd: z.string().min(1, t("externalWorklog.to") + " " + t("common.error")),
    pauseMinutes: z.coerce.number().min(0).default(0),
    activityType: z.enum(["anesthesia_nurse", "op_nurse", "springer_nurse", "anesthesia_doctor", "other"], {
      required_error: t("externalWorklog.activityTypeRequired"),
    }),
    notes: z.string().optional(),
    workerSignature: z.string().min(1, t("externalWorklog.signature") + " " + t("common.error")),
  }), [t]);

  type WorklogFormData = z.infer<typeof worklogFormSchema>;

  const form = useForm<WorklogFormData>({
    resolver: zodResolver(worklogFormSchema),
    defaultValues: {
      firstName: personalData.firstName || "",
      lastName: personalData.lastName || "",
      workDate: format(new Date(), "yyyy-MM-dd"),
      timeStart: "07:00",
      timeEnd: "15:00",
      pauseMinutes: 30,
      activityType: undefined as unknown as "anesthesia_nurse" | "op_nurse" | "springer_nurse" | "anesthesia_doctor" | "other",
      notes: "",
      workerSignature: "",
    },
  });

  useEffect(() => {
    if (personalData.firstName || personalData.lastName) {
      form.setValue("firstName", personalData.firstName);
      form.setValue("lastName", personalData.lastName);
    }
  }, [personalData, form]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("worklog-theme");
    const hasDarkClass = document.documentElement.classList.contains("dark");
    
    if (savedTheme === "dark" || (!savedTheme && hasDarkClass)) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else if (savedTheme === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("worklog-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("worklog-theme", "light");
    }
  };

  const toggleLanguage = () => {
    const newLang = currentLang === "de" ? "en" : "de";
    i18n.changeLanguage(newLang);
    localStorage.setItem("language", newLang);
  };

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/worklog/${token}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError(t("externalWorklog.invalidLink"));
        } else if (res.status === 410) {
          setError(t("externalWorklog.linkDisabled"));
        } else {
          setError(t("externalWorklog.loadingError"));
        }
        return;
      }
      const data = await res.json();
      setLinkInfo(data);
      
      // Load saved personal data from API response
      if (data.personalData) {
        setPersonalData({
          firstName: data.personalData.firstName || "",
          lastName: data.personalData.lastName || "",
          profession: data.personalData.profession || "",
          address: data.personalData.address || "",
          city: data.personalData.city || "",
          zip: data.personalData.zip || "",
          dateOfBirth: data.personalData.dateOfBirth || "",
          maritalStatus: data.personalData.maritalStatus || "",
          nationality: data.personalData.nationality || "",
          religion: data.personalData.religion || "",
          mobile: data.personalData.mobile || "",
          ahvNumber: data.personalData.ahvNumber || "",
          hasChildBenefits: data.personalData.hasChildBenefits || false,
          numberOfChildren: data.personalData.numberOfChildren || 0,
          childBenefitsRecipient: data.personalData.childBenefitsRecipient || "",
          childBenefitsRegistration: data.personalData.childBenefitsRegistration || "",
          hasResidencePermit: data.personalData.hasResidencePermit || false,
          residencePermitType: data.personalData.residencePermitType || "",
          residencePermitValidUntil: data.personalData.residencePermitValidUntil || "",
          residencePermitFrontImage: data.personalData.residencePermitFrontImage || "",
          residencePermitBackImage: data.personalData.residencePermitBackImage || "",
          bankName: data.personalData.bankName || "",
          bankAddress: data.personalData.bankAddress || "",
          bankAccount: data.personalData.bankAccount || "",
          hasOwnVehicle: data.personalData.hasOwnVehicle || false,
        });
      }
      
      if (data.email) {
        fetchContracts(data.email, data.hospitalId, data.personalData);
      }
    } catch (err) {
      setError(t("externalWorklog.connectionError"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContracts = async (email: string, hospitalId: string, savedPersonalData?: PersonalData) => {
    try {
      const res = await fetch(`/api/worklog/${token}/contracts`);
      if (res.ok) {
        const data = await res.json();
        setContracts(data);
        
        // Only prefill from contract if no saved personal data exists
        if (data.length > 0 && !savedPersonalData?.firstName && !savedPersonalData?.lastName) {
          const activeContract = data.find((c: WorkerContract) => c.status === "active") || data[0];
          setPersonalData(prev => ({
            ...prev,
            firstName: activeContract.firstName || prev.firstName || "",
            lastName: activeContract.lastName || prev.lastName || "",
          }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch contracts:", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  const sortedEntries = useMemo(() => {
    if (!linkInfo?.entries) return [];
    return [...linkInfo.entries].sort((a, b) => 
      new Date(b.workDate).getTime() - new Date(a.workDate).getTime()
    );
  }, [linkInfo?.entries]);

  const onSubmit = async (data: WorklogFormData) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/worklog/${token}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || t("externalWorklog.errorSubmit"));
      }
      
      setIsSubmitted(true);
      setShowForm(false);
      form.reset({
        firstName: personalData.firstName,
        lastName: personalData.lastName,
        workDate: format(new Date(), "yyyy-MM-dd"),
        timeStart: "08:00",
        timeEnd: "17:00",
        pauseMinutes: 30,
        activityType: undefined as unknown as "anesthesia_nurse" | "op_nurse" | "springer_nurse" | "anesthesia_doctor" | "other",
        notes: "",
        workerSignature: "",
      });
      
      await fetchData();
      
      toast({
        title: t("externalWorklog.successTitle"),
        description: t("externalWorklog.successMessage"),
      });
    } catch (err: any) {
      toast({
        title: t("externalWorklog.errorTitle"),
        description: err.message || t("externalWorklog.errorSubmit"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      const res = await fetch(`/api/worklog/${token}/entries/${entryId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        throw new Error(t("externalWorklog.deleteError"));
      }
      
      await fetchData();
      
      toast({
        title: t("common.deleted"),
        description: t("externalWorklog.deleteSuccess"),
      });
    } catch (err: any) {
      toast({
        title: t("externalWorklog.errorTitle"),
        description: err.message || t("externalWorklog.deleteError"),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSignature = (signature: string) => {
    form.setValue("workerSignature", signature);
    setShowSignaturePad(false);
  };

  const handleSavePersonalData = async () => {
    setIsSavingPersonal(true);
    try {
      const res = await fetch(`/api/worklog/${token}/personal-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personalData),
      });
      
      if (!res.ok) {
        throw new Error("Failed to save");
      }
      
      toast({
        title: t("common.saved"),
        description: t("externalWorklog.personalData.saveSuccess"),
      });
    } catch (err) {
      toast({
        title: t("externalWorklog.errorTitle"),
        description: t("externalWorklog.personalData.saveError"),
        variant: "destructive",
      });
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const uploadPermitImage = async (side: 'front' | 'back', file: File | Blob) => {
    setUploadingPermitImage(side);
    try {
      const getUrlRes = await fetch(`/api/worklog/${token}/permit-image-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, filename: `permit-${side}.jpg` }),
      });
      
      if (!getUrlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, storageKey } = await getUrlRes.json();
      
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      
      if (!uploadRes.ok) throw new Error("Failed to upload image");
      
      const newData = {
        ...personalData,
        [side === 'front' ? 'residencePermitFrontImage' : 'residencePermitBackImage']: storageKey,
      };
      setPersonalData(newData);
      
      await fetch(`/api/worklog/${token}/personal-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newData),
      });
      
      toast({
        title: t("common.saved"),
        description: t("externalWorklog.personalData.permitImageSaved"),
      });
      
      loadPermitImageUrl(side, storageKey);
    } catch (err) {
      toast({
        title: t("externalWorklog.errorTitle"),
        description: t("externalWorklog.personalData.permitImageError"),
        variant: "destructive",
      });
    } finally {
      setUploadingPermitImage(null);
    }
  };

  const handleCameraCapture = async (photo: string) => {
    if (!showCameraCapture) return;
    const side = showCameraCapture;
    setShowCameraCapture(null);
    
    const response = await fetch(photo);
    const blob = await response.blob();
    await uploadPermitImage(side, blob);
  };

  const handleFileUpload = async (side: 'front' | 'back', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadPermitImage(side, file);
  };

  const loadPermitImageUrl = async (side: 'front' | 'back', storageKey: string) => {
    try {
      const res = await fetch(`/api/worklog/${token}/permit-image/${side}`);
      if (res.ok) {
        const { downloadURL } = await res.json();
        setPermitImageUrls(prev => ({ ...prev, [side]: downloadURL }));
      }
    } catch (err) {
      console.error("Error loading permit image:", err);
    }
  };

  useEffect(() => {
    if (personalData.residencePermitFrontImage) {
      loadPermitImageUrl('front', personalData.residencePermitFrontImage);
    }
    if (personalData.residencePermitBackImage) {
      loadPermitImageUrl('back', personalData.residencePermitBackImage);
    }
  }, [personalData.residencePermitFrontImage, personalData.residencePermitBackImage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700">{t("externalWorklog.pending")}</Badge>;
      case "countersigned":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">{t("externalWorklog.countersigned")}</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">{t("externalWorklog.rejected")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const generateWorklogPDF = (entry: WorklogEntry, hospitalName: string, unitName: string) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const isGerman = currentLang === "de";
    
    doc.setFontSize(18);
    doc.text(isGerman ? "Arbeitszeitnachweis" : "Time Record", pageWidth / 2, 25, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(hospitalName, pageWidth / 2, 35, { align: "center" });
    doc.text(unitName, pageWidth / 2, 42, { align: "center" });
    
    doc.setFontSize(11);
    let y = 60;
    const leftCol = 20;
    const rightCol = 80;
    
    doc.text(isGerman ? "Mitarbeiter:" : "Employee:", leftCol, y);
    doc.text(`${entry.firstName} ${entry.lastName}`, rightCol, y);
    
    y += 10;
    doc.text(isGerman ? "Arbeitsdatum:" : "Work Date:", leftCol, y);
    doc.text(format(new Date(entry.workDate), "dd.MM.yyyy", { locale: dateLocale }), rightCol, y);
    
    y += 10;
    doc.text(isGerman ? "Arbeitszeit:" : "Work Time:", leftCol, y);
    doc.text(`${entry.timeStart} - ${entry.timeEnd}`, rightCol, y);
    
    y += 10;
    doc.text(isGerman ? "Pause:" : "Break:", leftCol, y);
    doc.text(`${entry.pauseMinutes} ${isGerman ? "Minuten" : "minutes"}`, rightCol, y);
    
    y += 10;
    doc.text(isGerman ? "Tätigkeit:" : "Activity:", leftCol, y);
    const activityLabels: Record<string, { de: string; en: string }> = {
      anesthesia_nurse: { de: "Anästhesie-Pflege", en: "Anesthesia Nurse" },
      op_nurse: { de: "OP-Pflege", en: "OR Nurse" },
      springer_nurse: { de: "Springer-Pflege", en: "Springer Nurse" },
      anesthesia_doctor: { de: "Anästhesie-Arzt", en: "Anesthesia Doctor" },
      other: { de: "Andere", en: "Other" },
    };
    const activityLabel = entry.activityType ? (isGerman ? activityLabels[entry.activityType]?.de : activityLabels[entry.activityType]?.en) || entry.activityType : "-";
    doc.text(activityLabel, rightCol, y);
    
    y += 10;
    doc.text(isGerman ? "Arbeitszeit netto:" : "Net Work Time:", leftCol, y);
    doc.text(calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes), rightCol, y);
    
    if (entry.notes) {
      y += 15;
      doc.text(isGerman ? "Bemerkungen:" : "Notes:", leftCol, y);
      y += 7;
      const splitNotes = doc.splitTextToSize(entry.notes, pageWidth - 40);
      doc.text(splitNotes, leftCol, y);
      y += splitNotes.length * 6;
    }
    
    y += 20;
    doc.setLineWidth(0.5);
    doc.line(leftCol, y, pageWidth - 20, y);
    
    y += 15;
    doc.text(isGerman ? "Unterschrift Mitarbeiter:" : "Worker Signature:", leftCol, y);
    
    if (entry.workerSignature) {
      try {
        doc.addImage(entry.workerSignature, "PNG", leftCol, y + 5, 60, 25);
      } catch (e) {
        doc.text(isGerman ? "[Unterschrift]" : "[Signature]", leftCol, y + 15);
      }
    }
    
    y += 40;
    doc.text(isGerman ? "Gegenzeichnung:" : "Countersignature:", leftCol, y);
    
    if (entry.status === "countersigned" && entry.countersignature) {
      try {
        doc.addImage(entry.countersignature, "PNG", leftCol, y + 5, 60, 25);
      } catch (e) {
        doc.text(isGerman ? "[Gegenzeichnung]" : "[Countersignature]", leftCol, y + 15);
      }
      y += 35;
      doc.setFontSize(9);
      doc.text(`${isGerman ? "Gegengezeichnet von:" : "Countersigned by:"} ${entry.countersignerName || (isGerman ? "Unbekannt" : "Unknown")}`, leftCol, y);
      if (entry.countersignedAt) {
        doc.text(`${isGerman ? "am" : "on"} ${format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}`, leftCol, y + 5);
      }
    } else if (entry.status === "rejected") {
      y += 15;
      doc.setFontSize(10);
      doc.text(`Status: ${isGerman ? "ABGELEHNT" : "REJECTED"}`, leftCol, y);
      if (entry.rejectionReason) {
        y += 7;
        doc.text(`${isGerman ? "Grund:" : "Reason:"} ${entry.rejectionReason}`, leftCol, y);
      }
    } else {
      y += 15;
      doc.text(isGerman ? "(Ausstehend)" : "(Pending)", leftCol, y);
    }
    
    const fileName = `${isGerman ? "Arbeitszeitnachweis" : "TimeRecord"}_${entry.lastName}_${format(new Date(entry.workDate), "yyyy-MM-dd")}.pdf`;
    doc.save(fileName);
  };

  const formValues = form.watch();
  const workHours = calculateWorkHours(formValues.timeStart, formValues.timeEnd, formValues.pauseMinutes || 0);

  const countersignedEntries = useMemo(() => 
    sortedEntries.filter(e => e.status === "countersigned"),
    [sortedEntries]
  );

  const calculateTotalHours = (entryIds: string[]): string => {
    let totalMinutes = 0;
    entryIds.forEach(id => {
      const entry = sortedEntries.find(e => e.id === id);
      if (entry) {
        const [startH, startM] = entry.timeStart.split(":").map(Number);
        const [endH, endM] = entry.timeEnd.split(":").map(Number);
        let mins = (endH * 60 + endM) - (startH * 60 + startM) - entry.pauseMinutes;
        if (mins > 0) totalMinutes += mins;
      }
    });
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const handleGenerateReport = () => {
    if (!linkInfo) return;
    setIsGeneratingReport(true);
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const isGerman = currentLang === "de";
      const leftMargin = 20;
      const rightMargin = pageWidth - 20;
      
      let y = 25;
      
      doc.setFontSize(20);
      doc.text(isGerman ? "Arbeitszeitbericht" : "Work Time Report", pageWidth / 2, y, { align: "center" });
      
      y += 12;
      doc.setFontSize(12);
      doc.text(linkInfo.hospitalName, pageWidth / 2, y, { align: "center" });
      y += 7;
      doc.text(linkInfo.unitName, pageWidth / 2, y, { align: "center" });
      
      y += 15;
      doc.setLineWidth(0.5);
      doc.line(leftMargin, y, rightMargin, y);
      
      y += 12;
      doc.setFontSize(14);
      doc.text(isGerman ? "Persönliche Daten" : "Personal Information", leftMargin, y);
      y += 8;
      doc.setFontSize(10);
      doc.text(`${isGerman ? "Name" : "Name"}: ${personalData.firstName} ${personalData.lastName}`, leftMargin, y);
      if (personalData.dateOfBirth) {
        y += 6;
        doc.text(`${isGerman ? "Geburtsdatum" : "Date of Birth"}: ${personalData.dateOfBirth}`, leftMargin, y);
      }
      if (personalData.address) {
        y += 6;
        doc.text(`${isGerman ? "Adresse" : "Address"}: ${personalData.address}`, leftMargin, y);
      }
      if (personalData.zip || personalData.city) {
        y += 6;
        doc.text(`${personalData.zip} ${personalData.city}`, leftMargin, y);
      }
      if (personalData.mobile) {
        y += 6;
        doc.text(`${isGerman ? "Mobile" : "Mobile"}: ${personalData.mobile}`, leftMargin, y);
      }
      if (personalData.maritalStatus) {
        y += 6;
        const maritalStatusLabels: Record<string, { de: string; en: string }> = {
          single: { de: "Ledig", en: "Single" },
          married: { de: "Verheiratet", en: "Married" },
          widowed: { de: "Verwitwet", en: "Widowed" },
          divorced: { de: "Geschieden", en: "Divorced" },
          separated: { de: "Getrennt", en: "Separated" },
          registered_partnership: { de: "Eingetragene Partnerschaft", en: "Registered Partnership" },
        };
        const statusLabel = maritalStatusLabels[personalData.maritalStatus] 
          ? (isGerman ? maritalStatusLabels[personalData.maritalStatus].de : maritalStatusLabels[personalData.maritalStatus].en)
          : personalData.maritalStatus;
        doc.text(`${isGerman ? "Zivilstand" : "Marital Status"}: ${statusLabel}`, leftMargin, y);
      }
      if (personalData.nationality) {
        y += 6;
        doc.text(`${isGerman ? "Nationalität" : "Nationality"}: ${personalData.nationality}`, leftMargin, y);
      }
      if (personalData.religion) {
        y += 6;
        const religionLabels: Record<string, { de: string; en: string }> = {
          none: { de: "Konfessionslos", en: "None" },
          roman_catholic: { de: "Römisch-katholisch", en: "Roman Catholic" },
          protestant: { de: "Evangelisch-reformiert", en: "Protestant" },
          christian_catholic: { de: "Christkatholisch", en: "Christian Catholic" },
          jewish: { de: "Jüdisch", en: "Jewish" },
          other: { de: "Andere", en: "Other" },
        };
        const religionLabel = religionLabels[personalData.religion]
          ? (isGerman ? religionLabels[personalData.religion].de : religionLabels[personalData.religion].en)
          : personalData.religion;
        doc.text(`${isGerman ? "Konfession" : "Religion"}: ${religionLabel}`, leftMargin, y);
      }
      if (personalData.ahvNumber) {
        y += 6;
        doc.text(`${isGerman ? "AHV-Nummer" : "AHV Number"}: ${personalData.ahvNumber}`, leftMargin, y);
      }
      
      if (personalData.hasChildBenefits) {
        y += 8;
        doc.setFontSize(11);
        doc.text(isGerman ? "Kinderzulagen" : "Child Benefits", leftMargin, y);
        doc.setFontSize(10);
        y += 6;
        doc.text(`${isGerman ? "Anzahl Kinder" : "Number of Children"}: ${personalData.numberOfChildren || 0}`, leftMargin, y);
        if (personalData.childBenefitsRecipient) {
          y += 6;
          doc.text(`${isGerman ? "Bezüger" : "Recipient"}: ${personalData.childBenefitsRecipient}`, leftMargin, y);
        }
        if (personalData.childBenefitsRegistration) {
          y += 6;
          doc.text(`${isGerman ? "Anmeldung bei" : "Registered at"}: ${personalData.childBenefitsRegistration}`, leftMargin, y);
        }
      }
      
      if (personalData.hasResidencePermit) {
        y += 8;
        doc.setFontSize(11);
        doc.text(isGerman ? "Aufenthaltsbewilligung" : "Residence Permit", leftMargin, y);
        doc.setFontSize(10);
        if (personalData.residencePermitType) {
          y += 6;
          const permitLabels: Record<string, { de: string; en: string }> = {
            B: { de: "B - Aufenthaltsbewilligung", en: "B - Residence Permit" },
            C: { de: "C - Niederlassungsbewilligung", en: "C - Settlement Permit" },
            G: { de: "G - Grenzgängerbewilligung", en: "G - Cross-Border Permit" },
            L: { de: "L - Kurzaufenthaltsbewilligung", en: "L - Short-Stay Permit" },
            F: { de: "F - Vorläufig Aufgenommene", en: "F - Provisionally Admitted" },
            N: { de: "N - Asylsuchende", en: "N - Asylum Seeker" },
            S: { de: "S - Schutzbedürftige", en: "S - Protection Seeker" },
          };
          const permitLabel = permitLabels[personalData.residencePermitType]
            ? (isGerman ? permitLabels[personalData.residencePermitType].de : permitLabels[personalData.residencePermitType].en)
            : personalData.residencePermitType;
          doc.text(`${isGerman ? "Typ" : "Type"}: ${permitLabel}`, leftMargin, y);
        }
        if (personalData.residencePermitValidUntil) {
          y += 6;
          doc.text(`${isGerman ? "Gültig bis" : "Valid Until"}: ${personalData.residencePermitValidUntil}`, leftMargin, y);
        }
      }
      
      if (personalData.bankName || personalData.bankAccount) {
        y += 8;
        doc.setFontSize(11);
        doc.text(isGerman ? "Bankverbindung" : "Bank Details", leftMargin, y);
        doc.setFontSize(10);
        if (personalData.bankName) {
          y += 6;
          doc.text(`${isGerman ? "Bank" : "Bank"}: ${personalData.bankName}`, leftMargin, y);
        }
        if (personalData.bankAddress) {
          y += 6;
          doc.text(`${isGerman ? "Bankadresse" : "Bank Address"}: ${personalData.bankAddress}`, leftMargin, y);
        }
        if (personalData.bankAccount) {
          y += 6;
          doc.text(`IBAN: ${personalData.bankAccount}`, leftMargin, y);
        }
      }
      
      if (personalData.hasOwnVehicle) {
        y += 6;
        doc.text(`${isGerman ? "Eigenes Fahrzeug" : "Own Vehicle"}: ${isGerman ? "Ja" : "Yes"}`, leftMargin, y);
      }
      
      const selectedContract = contracts.find(c => c.id === selectedContractId);
      if (selectedContract) {
        y += 12;
        doc.setFontSize(14);
        doc.text(isGerman ? "Vertrag" : "Contract", leftMargin, y);
        y += 8;
        doc.setFontSize(10);
        doc.text(`${isGerman ? "Rolle" : "Role"}: ${isGerman ? roleLabels[selectedContract.role]?.de : roleLabels[selectedContract.role]?.en}`, leftMargin, y);
        y += 6;
        doc.text(`${isGerman ? "Vergütung" : "Rate"}: ${roleLabels[selectedContract.role]?.rate}`, leftMargin, y);
      }
      
      y += 15;
      doc.setLineWidth(0.5);
      doc.line(leftMargin, y, rightMargin, y);
      
      y += 12;
      doc.setFontSize(14);
      doc.text(isGerman ? "Arbeitszeiten" : "Work Entries", leftMargin, y);
      y += 10;
      
      const selectedEntriesList = sortedEntries.filter(e => selectedEntryIds.includes(e.id));
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(isGerman ? "Datum" : "Date", leftMargin, y);
      doc.text(isGerman ? "Zeit" : "Time", leftMargin + 28, y);
      doc.text(isGerman ? "Pause" : "Break", leftMargin + 58, y);
      doc.text(isGerman ? "Netto" : "Net", leftMargin + 78, y);
      doc.text(isGerman ? "Tätigkeit" : "Activity", leftMargin + 98, y);
      doc.text(isGerman ? "Status" : "Status", leftMargin + 138, y);
      doc.setFont("helvetica", "normal");
      
      y += 5;
      doc.line(leftMargin, y, rightMargin, y);
      y += 5;
      
      const activityLabelsConsolidated: Record<string, { de: string; en: string }> = {
        anesthesia_nurse: { de: "Anäst.-Pfl.", en: "Anesth. Nurse" },
        op_nurse: { de: "OP-Pfl.", en: "OR Nurse" },
        springer_nurse: { de: "Springer", en: "Springer" },
        anesthesia_doctor: { de: "Anäst.-Arzt", en: "Anesth. Dr." },
        other: { de: "Andere", en: "Other" },
      };
      
      selectedEntriesList.forEach((entry) => {
        if (y > pageHeight - 60) {
          doc.addPage();
          y = 25;
        }
        doc.text(format(new Date(entry.workDate), "dd.MM.yy"), leftMargin, y);
        doc.text(`${entry.timeStart}-${entry.timeEnd}`, leftMargin + 28, y);
        doc.text(`${entry.pauseMinutes}m`, leftMargin + 58, y);
        doc.text(calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes), leftMargin + 78, y);
        const actLabel = entry.activityType ? (isGerman ? activityLabelsConsolidated[entry.activityType]?.de : activityLabelsConsolidated[entry.activityType]?.en) || "-" : "-";
        doc.text(actLabel, leftMargin + 98, y);
        doc.text(isGerman ? "OK" : "OK", leftMargin + 138, y);
        y += 6;
      });
      
      y += 5;
      doc.line(leftMargin, y, rightMargin, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.text(isGerman ? "Gesamtstunden:" : "Total Hours:", leftMargin + 70, y);
      doc.text(calculateTotalHours(selectedEntryIds), leftMargin + 95, y);
      doc.setFont("helvetica", "normal");
      
      y += 20;
      if (y > pageHeight - 80) {
        doc.addPage();
        y = 25;
      }
      
      doc.setFontSize(14);
      doc.text(isGerman ? "Unterschriften" : "Signatures", leftMargin, y);
      y += 15;
      
      if (selectedEntriesList.length > 0 && selectedEntriesList[0].workerSignature) {
        doc.setFontSize(9);
        doc.text(isGerman ? "Unterschrift Mitarbeiter:" : "Worker Signature:", leftMargin, y);
        try {
          doc.addImage(selectedEntriesList[0].workerSignature, "PNG", leftMargin, y + 3, 50, 20);
        } catch (e) {
          doc.text("[" + (isGerman ? "Unterschrift" : "Signature") + "]", leftMargin, y + 10);
        }
      }
      
      if (selectedEntriesList.length > 0 && selectedEntriesList[0].countersignature) {
        doc.text(isGerman ? "Gegenzeichnung:" : "Countersignature:", leftMargin + 80, y);
        try {
          doc.addImage(selectedEntriesList[0].countersignature, "PNG", leftMargin + 80, y + 3, 50, 20);
        } catch (e) {
          doc.text("[" + (isGerman ? "Gegenzeichnung" : "Countersignature") + "]", leftMargin + 80, y + 10);
        }
        y += 25;
        doc.setFontSize(8);
        if (selectedEntriesList[0].countersignerName) {
          doc.text(`${isGerman ? "Gegengezeichnet von" : "Countersigned by"}: ${selectedEntriesList[0].countersignerName}`, leftMargin + 80, y);
        }
      }
      
      y += 30;
      doc.setFontSize(8);
      doc.text(`${isGerman ? "Erstellt am" : "Generated on"}: ${format(new Date(), "dd.MM.yyyy HH:mm")}`, leftMargin, y);
      
      const fileName = `${isGerman ? "Arbeitszeitbericht" : "WorkReport"}_${personalData.lastName || "Report"}_${format(new Date(), "yyyy-MM")}.pdf`;
      doc.save(fileName);
      
      toast({
        title: isGerman ? "Bericht erstellt" : "Report Generated",
        description: isGerman ? "Der Bericht wurde erfolgreich heruntergeladen." : "The report has been downloaded successfully.",
      });
      
      setReportWizardStep(0);
    } catch (err) {
      console.error("Error generating report:", err);
      toast({
        title: t("externalWorklog.errorTitle"),
        description: currentLang === "de" ? "Fehler beim Erstellen des Berichts" : "Error generating report",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-gray-500 dark:text-gray-400">{t("externalWorklog.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-md w-full dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t("externalWorklog.errorTitle")}</h2>
            <p className="text-gray-600 dark:text-gray-400">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 transition-colors">
      <div className="max-w-2xl lg:max-w-4xl mx-auto">
        <div className="flex justify-end gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
            data-testid="button-toggle-language"
          >
            <Globe className="w-4 h-4 mr-1" />
            {currentLang === "de" ? "EN" : "DE"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
            data-testid="button-toggle-theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>

        <Card className="mb-6 dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="text-center">
            <CardTitle className="text-xl flex items-center justify-center gap-2 dark:text-gray-100">
              <Clock className="w-5 h-5" />
              {t("externalWorklog.title")}
            </CardTitle>
            <CardDescription className="mt-2">
              <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
                <Building2 className="w-4 h-4" />
                <span>{linkInfo?.hospitalName} - {linkInfo?.unitName}</span>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                {t("externalWorklog.registeredFor")}: {linkInfo?.email}
              </div>
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 dark:bg-gray-800 p-1">
            <TabsTrigger value="worklogs" className="dark:data-[state=active]:bg-gray-700 py-2 text-xs sm:text-sm" data-testid="tab-worklogs">
              <History className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("externalWorklog.tabs.worklogs")}</span>
              <span className="sm:hidden">Logs</span>
            </TabsTrigger>
            <TabsTrigger value="contracts" className="dark:data-[state=active]:bg-gray-700 py-2 text-xs sm:text-sm" data-testid="tab-contracts">
              <FileSignature className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("externalWorklog.tabs.contracts")}</span>
              <span className="sm:hidden">Contracts</span>
            </TabsTrigger>
            <TabsTrigger value="personal" className="dark:data-[state=active]:bg-gray-700 py-2 text-xs sm:text-sm" data-testid="tab-personal">
              <User className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("externalWorklog.tabs.personalData")}</span>
              <span className="sm:hidden">Personal</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="dark:data-[state=active]:bg-gray-700 py-2 text-xs sm:text-sm" data-testid="tab-reports">
              <FileBarChart className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("externalWorklog.tabs.reports")}</span>
              <span className="sm:hidden">Reports</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="worklogs" className="mt-4">
            {!showForm ? (
              <div className="space-y-6">
                <Button 
                  className="w-full py-6 text-base" 
                  size="lg"
                  onClick={() => setShowForm(true)}
                  data-testid="button-new-entry"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  {t("externalWorklog.newEntry")}
                </Button>

                {sortedEntries.length > 0 && (
                  <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2 dark:text-gray-100">
                        <History className="w-5 h-5" />
                        {t("externalWorklog.myEntries")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {sortedEntries.map((entry) => (
                        <div 
                          key={entry.id} 
                          className="border dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-750 dark:bg-gray-800/50"
                          data-testid={`entry-row-${entry.id}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-medium dark:text-gray-100">
                                {format(new Date(entry.workDate), "EEEE, dd.MM.yyyy", { locale: dateLocale })}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {entry.timeStart} - {entry.timeEnd} ({calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes)} {t("externalWorklog.netHours")})
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(entry.status)}
                              {entry.status === "pending" && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                      disabled={deletingId === entry.id}
                                      data-testid={`button-delete-${entry.id}`}
                                    >
                                      {deletingId === entry.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="dark:text-gray-100">{t("externalWorklog.confirmDeleteTitle")}</AlertDialogTitle>
                                      <AlertDialogDescription className="dark:text-gray-400">
                                        {t("externalWorklog.confirmDeleteMessage")}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">{t("common.cancel")}</AlertDialogCancel>
                                      <AlertDialogAction 
                                        onClick={() => handleDelete(entry.id)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        {t("common.delete")}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          </div>
                          
                          {entry.notes && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{entry.notes}</p>
                          )}
                          
                          {entry.status === "rejected" && entry.rejectionReason && (
                            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-400">
                              {t("externalWorklog.reason")}: {entry.rejectionReason}
                            </div>
                          )}
                          
                          {entry.status === "countersigned" && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                              {t("externalWorklog.countersignedBy", { name: entry.countersignerName })}
                              {entry.countersignedAt && (
                                <> {t("externalWorklog.countersignedOn", { date: format(new Date(entry.countersignedAt), "dd.MM.yyyy HH:mm", { locale: dateLocale }) })}</>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {sortedEntries.length === 0 && !isSubmitted && (
                  <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <CardContent className="py-8 text-center text-gray-500 dark:text-gray-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p>{t("externalWorklog.noEntries")}</p>
                      <p className="text-sm mt-1">{t("externalWorklog.noEntriesHint")}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="text-lg dark:text-gray-100">{t("externalWorklog.recordTime")}</CardTitle>
                  <CardDescription className="dark:text-gray-400">
                    {t("externalWorklog.fillAllFields")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="dark:text-gray-200">{t("externalWorklog.firstName")}</FormLabel>
                              <FormControl>
                                <Input {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" data-testid="input-firstname" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="dark:text-gray-200">{t("externalWorklog.lastName")}</FormLabel>
                              <FormControl>
                                <Input {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" data-testid="input-lastname" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="workDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="dark:text-gray-200">{t("externalWorklog.workDate")}</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" data-testid="input-workdate" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="timeStart"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="dark:text-gray-200">{t("externalWorklog.from")}</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" data-testid="input-timestart" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="timeEnd"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="dark:text-gray-200">{t("externalWorklog.to")}</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" data-testid="input-timeend" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="pauseMinutes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="dark:text-gray-200">{t("externalWorklog.breakMinutes")}</FormLabel>
                              <FormControl>
                                <Input type="number" min={0} {...field} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" data-testid="input-pause" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="activityType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="dark:text-gray-200">{t("externalWorklog.activityType")} *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" data-testid="select-activity-type">
                                  <SelectValue placeholder={t("externalWorklog.activityTypeRequired")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="anesthesia_nurse">{t("externalWorklog.activityTypes.anesthesia_nurse")}</SelectItem>
                                <SelectItem value="op_nurse">{t("externalWorklog.activityTypes.op_nurse")}</SelectItem>
                                <SelectItem value="springer_nurse">{t("externalWorklog.activityTypes.springer_nurse")}</SelectItem>
                                <SelectItem value="anesthesia_doctor">{t("externalWorklog.activityTypes.anesthesia_doctor")}</SelectItem>
                                <SelectItem value="other">{t("externalWorklog.activityTypes.other")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{t("externalWorklog.netWorkTime")}: </span>
                        <span className="font-semibold text-blue-700 dark:text-blue-400">{workHours}</span>
                      </div>

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="dark:text-gray-200">{t("externalWorklog.notesOptional")}</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder={t("externalWorklog.notesPlaceholder")}
                                {...field} 
                                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                                data-testid="input-notes"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Separator className="dark:bg-gray-700" />

                      <FormField
                        control={form.control}
                        name="workerSignature"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="dark:text-gray-200">{t("externalWorklog.signature")}</FormLabel>
                            <FormControl>
                              <div>
                                {field.value ? (
                                  <div className="border dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-700">
                                    <img 
                                      src={field.value} 
                                      alt={t("externalWorklog.signature")} 
                                      className="h-20 mx-auto"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="w-full mt-2 dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200"
                                      onClick={() => setShowSignaturePad(true)}
                                      data-testid="button-change-signature"
                                    >
                                      {t("externalWorklog.changeSignature")}
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                                    onClick={() => setShowSignaturePad(true)}
                                    data-testid="button-add-signature"
                                  >
                                    <PenLine className="w-4 h-4 mr-2" />
                                    {t("externalWorklog.addSignature")}
                                  </Button>
                                )}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                          onClick={() => setShowForm(false)}
                          disabled={isSubmitting}
                          data-testid="button-cancel"
                        >
                          {t("externalWorklog.cancel")}
                        </Button>
                        <Button
                          type="submit"
                          className="flex-1"
                          disabled={isSubmitting}
                          data-testid="button-submit"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t("externalWorklog.submitting")}
                            </>
                          ) : (
                            t("externalWorklog.submit")
                          )}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="contracts">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 dark:text-gray-100">
                  <FileSignature className="w-5 h-5" />
                  {t("externalWorklog.contracts.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contracts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <FileSignature className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p>{t("externalWorklog.contracts.noContracts")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contracts.map((contract) => (
                      <div 
                        key={contract.id}
                        className="border dark:border-gray-700 rounded-lg p-4 dark:bg-gray-800/50"
                        data-testid={`contract-row-${contract.id}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium dark:text-gray-100">
                              {contract.firstName} {contract.lastName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {t("externalWorklog.contracts.role")}: {roleLabels[contract.role]?.[currentLang as "en" | "de"] || contract.role}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-500">
                              {t("externalWorklog.contracts.rate")}: {roleLabels[contract.role]?.rate || "-"}
                            </div>
                            {contract.workerSignedAt && (
                              <div className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                                {t("externalWorklog.contracts.signedAt")}: {format(new Date(contract.workerSignedAt), "dd.MM.yyyy", { locale: dateLocale })}
                              </div>
                            )}
                          </div>
                          <Badge 
                            variant="outline" 
                            className={
                              contract.status === "active" 
                                ? "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                                : contract.archivedAt
                                  ? "bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600"
                                  : "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700"
                            }
                          >
                            {contract.status === "active" 
                              ? t("externalWorklog.contracts.active")
                              : contract.archivedAt 
                                ? t("externalWorklog.contracts.archived")
                                : t("externalWorklog.contracts.pending")
                            }
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="personal">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 dark:text-gray-100">
                  <User className="w-5 h-5" />
                  {t("externalWorklog.personalData.title")}
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  {t("externalWorklog.personalData.description")}
                  {contracts.length > 0 && (
                    <span className="block mt-1 text-blue-600 dark:text-blue-400">
                      {t("externalWorklog.personalData.prefilled")}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Section: Personalien */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600">
                    {t("externalWorklog.personalData.sections.personal")}
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.firstName")}</label>
                      <Input
                        value={personalData.firstName}
                        onChange={(e) => setPersonalData({ ...personalData, firstName: e.target.value })}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        data-testid="input-personal-firstname"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.lastName")}</label>
                      <Input
                        value={personalData.lastName}
                        onChange={(e) => setPersonalData({ ...personalData, lastName: e.target.value })}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        data-testid="input-personal-lastname"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.profession")}</label>
                    <Input
                      value={personalData.profession}
                      onChange={(e) => setPersonalData({ ...personalData, profession: e.target.value })}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      placeholder={t("externalWorklog.personalData.professionPlaceholder")}
                      data-testid="input-personal-profession"
                    />
                  </div>
                  
                  {/* Address Autocomplete */}
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.address")}</label>
                    <AddressAutocomplete
                      values={{
                        street: personalData.address,
                        postalCode: personalData.zip,
                        city: personalData.city,
                      }}
                      onChange={(values) => setPersonalData({
                        ...personalData,
                        address: values.street,
                        zip: values.postalCode,
                        city: values.city,
                      })}
                      className="mt-1"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.dateOfBirth")}</label>
                      <Input
                        type="date"
                        value={personalData.dateOfBirth}
                        onChange={(e) => setPersonalData({ ...personalData, dateOfBirth: e.target.value })}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        data-testid="input-personal-dob"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.maritalStatus")}</label>
                      <Select
                        value={personalData.maritalStatus}
                        onValueChange={(value) => setPersonalData({ ...personalData, maritalStatus: value })}
                      >
                        <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-marital-status">
                          <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">{t("externalWorklog.personalData.maritalOptions.single")}</SelectItem>
                          <SelectItem value="married">{t("externalWorklog.personalData.maritalOptions.married")}</SelectItem>
                          <SelectItem value="divorced">{t("externalWorklog.personalData.maritalOptions.divorced")}</SelectItem>
                          <SelectItem value="widowed">{t("externalWorklog.personalData.maritalOptions.widowed")}</SelectItem>
                          <SelectItem value="separated">{t("externalWorklog.personalData.maritalOptions.separated")}</SelectItem>
                          <SelectItem value="registered_partnership">{t("externalWorklog.personalData.maritalOptions.registeredPartnership")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.nationality")}</label>
                      <Select
                        value={personalData.nationality}
                        onValueChange={(value) => setPersonalData({ ...personalData, nationality: value })}
                      >
                        <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-nationality">
                          <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CH">{t("externalWorklog.personalData.nationalities.CH")}</SelectItem>
                          <SelectItem value="DE">{t("externalWorklog.personalData.nationalities.DE")}</SelectItem>
                          <SelectItem value="AT">{t("externalWorklog.personalData.nationalities.AT")}</SelectItem>
                          <SelectItem value="FR">{t("externalWorklog.personalData.nationalities.FR")}</SelectItem>
                          <SelectItem value="IT">{t("externalWorklog.personalData.nationalities.IT")}</SelectItem>
                          <SelectItem value="OTHER">{t("externalWorklog.personalData.nationalities.OTHER")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.religion")}</label>
                      <Select
                        value={personalData.religion}
                        onValueChange={(value) => setPersonalData({ ...personalData, religion: value })}
                      >
                        <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-religion">
                          <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("externalWorklog.personalData.religions.none")}</SelectItem>
                          <SelectItem value="roman_catholic">{t("externalWorklog.personalData.religions.romanCatholic")}</SelectItem>
                          <SelectItem value="protestant">{t("externalWorklog.personalData.religions.protestant")}</SelectItem>
                          <SelectItem value="other">{t("externalWorklog.personalData.religions.other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.mobile")}</label>
                      <Input
                        type="tel"
                        value={personalData.mobile}
                        onChange={(e) => setPersonalData({ ...personalData, mobile: e.target.value })}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        placeholder="+41 79 123 45 67"
                        data-testid="input-personal-mobile"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.ahvNumber")}</label>
                      <Input
                        value={personalData.ahvNumber}
                        onChange={(e) => setPersonalData({ ...personalData, ahvNumber: e.target.value })}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        placeholder="756.1234.5678.90"
                        data-testid="input-personal-ahv"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Kinderzulagen */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
                    <Baby className="w-4 h-4" />
                    {t("externalWorklog.personalData.sections.childBenefits")}
                  </h3>
                  
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.hasChildBenefits")}</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={personalData.hasChildBenefits === true}
                          onChange={() => setPersonalData({ ...personalData, hasChildBenefits: true })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm dark:text-gray-300">{t("common.yes")}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={personalData.hasChildBenefits === false}
                          onChange={() => setPersonalData({ ...personalData, hasChildBenefits: false })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm dark:text-gray-300">{t("common.no")}</span>
                      </label>
                    </div>
                  </div>
                  
                  {personalData.hasChildBenefits && (
                    <div className="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.numberOfChildren")}</label>
                          <Input
                            type="number"
                            min="0"
                            value={personalData.numberOfChildren || ""}
                            onChange={(e) => setPersonalData({ ...personalData, numberOfChildren: parseInt(e.target.value) || 0 })}
                            className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            data-testid="input-personal-children"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.childBenefitsRecipient")}</label>
                          <Input
                            value={personalData.childBenefitsRecipient}
                            onChange={(e) => setPersonalData({ ...personalData, childBenefitsRecipient: e.target.value })}
                            className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            data-testid="input-personal-benefits-recipient"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.childBenefitsRegistration")}</label>
                        <Input
                          value={personalData.childBenefitsRegistration}
                          onChange={(e) => setPersonalData({ ...personalData, childBenefitsRegistration: e.target.value })}
                          className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                          data-testid="input-personal-benefits-registration"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Aufenthaltsbewilligung */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {t("externalWorklog.personalData.sections.residencePermit")}
                  </h3>
                  
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.hasResidencePermit")}</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={personalData.hasResidencePermit === true}
                          onChange={() => setPersonalData({ ...personalData, hasResidencePermit: true })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm dark:text-gray-300">{t("common.yes")}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={personalData.hasResidencePermit === false}
                          onChange={() => setPersonalData({ ...personalData, hasResidencePermit: false })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm dark:text-gray-300">{t("common.no")}</span>
                      </label>
                    </div>
                  </div>
                  
                  {personalData.hasResidencePermit && (
                    <div className="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.residencePermitType")}</label>
                          <Select
                            value={personalData.residencePermitType}
                            onValueChange={(value) => setPersonalData({ ...personalData, residencePermitType: value })}
                          >
                            <SelectTrigger className="mt-1 dark:bg-gray-700 dark:border-gray-600" data-testid="select-permit-type">
                              <SelectValue placeholder={t("externalWorklog.personalData.selectOption")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="L">{t("externalWorklog.personalData.permitTypes.L")}</SelectItem>
                              <SelectItem value="B">{t("externalWorklog.personalData.permitTypes.B")}</SelectItem>
                              <SelectItem value="C">{t("externalWorklog.personalData.permitTypes.C")}</SelectItem>
                              <SelectItem value="G">{t("externalWorklog.personalData.permitTypes.G")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.residencePermitValidUntil")}</label>
                          <Input
                            type="date"
                            value={personalData.residencePermitValidUntil}
                            onChange={(e) => setPersonalData({ ...personalData, residencePermitValidUntil: e.target.value })}
                            className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            data-testid="input-permit-valid-until"
                          />
                        </div>
                      </div>
                      
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-700 dark:text-yellow-400">
                        {t("externalWorklog.personalData.permitCopyRequired")}
                      </div>
                      
                      {/* Permit Front Image */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.permitFront")}</label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCameraCapture('front')}
                            disabled={uploadingPermitImage === 'front'}
                            data-testid="button-camera-front"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {t("externalWorklog.personalData.takePhoto")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => permitFrontInputRef.current?.click()}
                            disabled={uploadingPermitImage === 'front'}
                            data-testid="button-upload-front"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {t("externalWorklog.personalData.uploadFile")}
                          </Button>
                          <input
                            ref={permitFrontInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFileUpload('front', e)}
                          />
                          {uploadingPermitImage === 'front' && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                        {permitImageUrls.front && (
                          <div className="mt-2">
                            <img src={permitImageUrls.front} alt="Permit Front" className="max-w-xs rounded border" />
                          </div>
                        )}
                        {personalData.residencePermitFrontImage && !permitImageUrls.front && (
                          <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            {t("externalWorklog.personalData.imageUploaded")}
                          </div>
                        )}
                      </div>
                      
                      {/* Permit Back Image */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.permitBack")}</label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCameraCapture('back')}
                            disabled={uploadingPermitImage === 'back'}
                            data-testid="button-camera-back"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {t("externalWorklog.personalData.takePhoto")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => permitBackInputRef.current?.click()}
                            disabled={uploadingPermitImage === 'back'}
                            data-testid="button-upload-back"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {t("externalWorklog.personalData.uploadFile")}
                          </Button>
                          <input
                            ref={permitBackInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFileUpload('back', e)}
                          />
                          {uploadingPermitImage === 'back' && <Loader2 className="w-4 h-4 animate-spin" />}
                        </div>
                        {permitImageUrls.back && (
                          <div className="mt-2">
                            <img src={permitImageUrls.back} alt="Permit Back" className="max-w-xs rounded border" />
                          </div>
                        )}
                        {personalData.residencePermitBackImage && !permitImageUrls.back && (
                          <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            {t("externalWorklog.personalData.imageUploaded")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Bankangaben */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    {t("externalWorklog.personalData.sections.bankDetails")}
                  </h3>
                  
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.bankName")}</label>
                    <Input
                      value={personalData.bankName}
                      onChange={(e) => setPersonalData({ ...personalData, bankName: e.target.value })}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      placeholder={t("externalWorklog.personalData.bankNamePlaceholder")}
                      data-testid="input-personal-bank-name"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.bankAddress")}</label>
                    <Input
                      value={personalData.bankAddress}
                      onChange={(e) => setPersonalData({ ...personalData, bankAddress: e.target.value })}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      placeholder={t("externalWorklog.personalData.bankAddressPlaceholder")}
                      data-testid="input-personal-bank-address"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.bankAccount")}</label>
                    <Input
                      value={personalData.bankAccount}
                      onChange={(e) => setPersonalData({ ...personalData, bankAccount: e.target.value })}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      placeholder={t("externalWorklog.personalData.bankAccountPlaceholder")}
                      data-testid="input-personal-bank"
                    />
                  </div>
                </div>

                {/* Section: Mobilität */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base dark:text-gray-100 border-b pb-2 dark:border-gray-600 flex items-center gap-2">
                    <Car className="w-4 h-4" />
                    {t("externalWorklog.personalData.sections.mobility")}
                  </h3>
                  
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium dark:text-gray-200">{t("externalWorklog.personalData.hasOwnVehicle")}</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={personalData.hasOwnVehicle === true}
                          onChange={() => setPersonalData({ ...personalData, hasOwnVehicle: true })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm dark:text-gray-300">{t("common.yes")}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={personalData.hasOwnVehicle === false}
                          onChange={() => setPersonalData({ ...personalData, hasOwnVehicle: false })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm dark:text-gray-300">{t("common.no")}</span>
                      </label>
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={handleSavePersonalData}
                  disabled={isSavingPersonal}
                  className="w-full"
                  data-testid="button-save-personal"
                >
                  {isSavingPersonal ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("externalWorklog.personalData.saving")}
                    </>
                  ) : (
                    t("externalWorklog.personalData.save")
                  )}
                </Button>
              </CardContent>
            </Card>
            
            {/* Camera Capture Modal */}
            <CameraCapture
              isOpen={showCameraCapture !== null}
              onClose={() => setShowCameraCapture(null)}
              onCapture={handleCameraCapture}
              fullFrame={true}
              hint={showCameraCapture === 'front' 
                ? t("externalWorklog.personalData.permitFrontHint")
                : t("externalWorklog.personalData.permitBackHint")}
            />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 dark:text-gray-100">
                  <FileBarChart className="w-5 h-5" />
                  {t("externalWorklog.reports.title")}
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  {t("externalWorklog.reports.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportWizardStep === 0 ? (
                  <Button
                    className="w-full py-6 text-base"
                    size="lg"
                    onClick={() => {
                      setSelectedEntryIds([]);
                      setSelectedContractId(contracts.length > 0 ? contracts[0].id : null);
                      setReportWizardStep(1);
                    }}
                    disabled={countersignedEntries.length === 0}
                    data-testid="button-create-report"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    {t("externalWorklog.reports.createReport")}
                  </Button>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        {[1, 2, 3].map((step) => (
                          <div
                            key={step}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                              reportWizardStep === step
                                ? "bg-primary text-primary-foreground"
                                : reportWizardStep > step
                                  ? "bg-green-500 text-white"
                                  : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {reportWizardStep > step ? <Check className="w-4 h-4" /> : step}
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReportWizardStep(0)}
                        className="text-gray-500"
                        data-testid="button-cancel-wizard"
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>

                    {reportWizardStep === 1 && (
                      <div className="space-y-4">
                        <h3 className="font-medium dark:text-gray-100">{t("externalWorklog.reports.selectEntries")}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t("externalWorklog.reports.selectEntriesDesc")}</p>
                        
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {countersignedEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedEntryIds.includes(entry.id)
                                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                              }`}
                              onClick={() => {
                                setSelectedEntryIds((prev) =>
                                  prev.includes(entry.id)
                                    ? prev.filter((id) => id !== entry.id)
                                    : [...prev, entry.id]
                                );
                              }}
                              data-testid={`select-entry-${entry.id}`}
                            >
                              <Checkbox
                                checked={selectedEntryIds.includes(entry.id)}
                                className="pointer-events-none"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-sm dark:text-gray-100">
                                  {format(new Date(entry.workDate), "dd.MM.yyyy", { locale: dateLocale })}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {entry.timeStart} - {entry.timeEnd} ({calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes)} {t("externalWorklog.netHours")})
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setReportWizardStep(0)}
                            className="flex-1 dark:bg-gray-700 dark:border-gray-600"
                            data-testid="button-wizard-back"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            {t("common.back")}
                          </Button>
                          <Button
                            onClick={() => setReportWizardStep(2)}
                            disabled={selectedEntryIds.length === 0}
                            className="flex-1"
                            data-testid="button-wizard-next"
                          >
                            {t("common.next")}
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {reportWizardStep === 2 && (
                      <div className="space-y-4">
                        <h3 className="font-medium dark:text-gray-100">{t("externalWorklog.reports.selectContract")}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t("externalWorklog.reports.selectContractDesc")}</p>
                        
                        {contracts.length === 0 ? (
                          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                            {t("externalWorklog.reports.noContracts")}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {contracts.map((contract) => (
                              <div
                                key={contract.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  selectedContractId === contract.id
                                    ? "border-primary bg-primary/5 dark:bg-primary/10"
                                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                                }`}
                                onClick={() => setSelectedContractId(contract.id)}
                                data-testid={`select-contract-${contract.id}`}
                              >
                                <Checkbox
                                  checked={selectedContractId === contract.id}
                                  className="pointer-events-none"
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-sm dark:text-gray-100">
                                    {currentLang === "de" ? roleLabels[contract.role]?.de : roleLabels[contract.role]?.en}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {roleLabels[contract.role]?.rate}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setReportWizardStep(1)}
                            className="flex-1 dark:bg-gray-700 dark:border-gray-600"
                            data-testid="button-wizard-back-2"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            {t("common.back")}
                          </Button>
                          <Button
                            onClick={() => setReportWizardStep(3)}
                            className="flex-1"
                            data-testid="button-wizard-next-2"
                          >
                            {t("common.next")}
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {reportWizardStep === 3 && (
                      <div className="space-y-4">
                        <h3 className="font-medium dark:text-gray-100">{t("externalWorklog.reports.reviewGenerate")}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t("externalWorklog.reports.reviewGenerateDesc")}</p>
                        
                        <div className="space-y-3 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{t("externalWorklog.reports.selectedEntries")}:</span>
                            <span className="font-medium dark:text-gray-100">{selectedEntryIds.length}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{t("externalWorklog.reports.totalHours")}:</span>
                            <span className="font-medium dark:text-gray-100">{calculateTotalHours(selectedEntryIds)}</span>
                          </div>
                          {selectedContractId && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500 dark:text-gray-400">{t("externalWorklog.reports.contract")}:</span>
                              <span className="font-medium dark:text-gray-100">
                                {(() => {
                                  const contract = contracts.find(c => c.id === selectedContractId);
                                  return contract ? (currentLang === "de" ? roleLabels[contract.role]?.de : roleLabels[contract.role]?.en) : "-";
                                })()}
                              </span>
                            </div>
                          )}
                          <Separator className="my-2" />
                          <div className="text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{t("externalWorklog.reports.personalInfo")}:</span>
                            <div className="mt-1 font-medium dark:text-gray-100">
                              {personalData.firstName} {personalData.lastName}
                            </div>
                            {personalData.address && (
                              <div className="text-gray-600 dark:text-gray-400">{personalData.address}</div>
                            )}
                            {(personalData.zip || personalData.city) && (
                              <div className="text-gray-600 dark:text-gray-400">{personalData.zip} {personalData.city}</div>
                            )}
                            {personalData.bankAccount && (
                              <div className="mt-1 text-gray-600 dark:text-gray-400">IBAN: {personalData.bankAccount}</div>
                            )}
                          </div>
                          {(!personalData.firstName || !personalData.bankAccount) && (
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-700 dark:text-yellow-400">
                              {t("externalWorklog.reports.incompletePersonalData")}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setReportWizardStep(2)}
                            className="flex-1 dark:bg-gray-700 dark:border-gray-600"
                            data-testid="button-wizard-back-3"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            {t("common.back")}
                          </Button>
                          <Button
                            onClick={handleGenerateReport}
                            disabled={isGeneratingReport || selectedEntryIds.length === 0}
                            className="flex-1"
                            data-testid="button-generate-report"
                          >
                            {isGeneratingReport ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t("externalWorklog.reports.generating")}
                              </>
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-2" />
                                {t("externalWorklog.reports.downloadReport")}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {countersignedEntries.length === 0 && reportWizardStep === 0 && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("externalWorklog.reports.noCountersignedEntries")}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onSave={handleSignature}
        title={t("externalWorklog.signature")}
      />
    </div>
  );
}
