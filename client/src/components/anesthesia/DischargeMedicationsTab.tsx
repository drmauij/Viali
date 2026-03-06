import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Plus, Pill, Trash2, Loader2, Check, ChevronsUpDown, AlertTriangle, Package, User, Calendar, X, Search, Printer, FileText, Pencil, Save, Download, Stethoscope, Sparkles } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { ControlledItemsCommitDialog } from "@/components/anesthesia/ControlledItemsCommitDialog";
import { formatDate, formatCurrency } from "@/lib/dateUtils";
import jsPDF from "jspdf";

interface DischargeMedicationsTabProps {
  patientId: string;
  hospitalId: string;
  unitId: string;
  patientName?: string;
  patientBirthday?: string;
  canWrite?: boolean;
  surgeries?: Array<{
    id: string;
    plannedSurgery: string | null;
    plannedDate: Date | string;
    status: string;
    surgeonId?: string | null;
  }>;
  onGeneratePrescription?: (slotId: string, surgeryId?: string) => void;
}

interface MedicationItemEntry {
  itemId: string | null;
  customName?: string;
  itemName: string;
  quantity: number;
  unitType: "pills" | "packs";
  administrationRoute: string;
  frequency: string;
  notes: string;
  endPrice: string;
  isControlled: boolean;
}

const ADMINISTRATION_ROUTES = [
  { value: "p.o.", label: "p.o. (oral)" },
  { value: "s.c.", label: "s.c. (subcutaneous)" },
  { value: "i.v.", label: "i.v. (intravenous)" },
  { value: "i.m.", label: "i.m. (intramuscular)" },
  { value: "rectal", label: "rectal" },
  { value: "topical", label: "topical" },
  { value: "inhalation", label: "inhalation" },
  { value: "sublingual", label: "sublingual" },
  { value: "nasal", label: "nasal" },
];

const FREQUENCY_PRESETS = [
  { value: "1-0-0-0", label: "1-0-0-0 (morning)" },
  { value: "1-0-1-0", label: "1-0-1-0 (morning + evening)" },
  { value: "1-1-1-0", label: "1-1-1-0 (3x daily)" },
  { value: "1-1-1-1", label: "1-1-1-1 (4x daily)" },
  { value: "0-0-0-1", label: "0-0-0-1 (night)" },
  { value: "0-0-1-0", label: "0-0-1-0 (evening)" },
  { value: "1-0-0-1", label: "1-0-0-1 (morning + night)" },
  { value: "0-1-0-0", label: "0-1-0-0 (midday)" },
  { value: "prn", label: "PRN (as needed)" },
];

export function DischargeMedicationsTab({
  patientId,
  hospitalId,
  unitId,
  patientName,
  patientBirthday,
  canWrite = true,
  surgeries = [],
  onGeneratePrescription,
}: DischargeMedicationsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [slotNotes, setSlotNotes] = useState("");
  const [medicationItems, setMedicationItems] = useState<MedicationItemEntry[]>([]);
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [doctorSearchOpen, setDoctorSearchOpen] = useState(false);

  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState(false);

  const [routeCustomInput, setRouteCustomInput] = useState<Record<number, boolean>>({});
  const [frequencyCustomInput, setFrequencyCustomInput] = useState<Record<number, boolean>>({});

  const [commitSlotId, setCommitSlotId] = useState<string | null>(null);
  const [printDialogSlot, setPrintDialogSlot] = useState<any>(null);
  const [printColumns, setPrintColumns] = useState<string>("2");
  const [printStartRow, setPrintStartRow] = useState<number>(1);

  const { data: dischargeMedications = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/patients', patientId, 'discharge-medications', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/discharge-medications?hospitalId=${hospitalId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch discharge medications");
      return res.json();
    },
    enabled: !!patientId && !!hospitalId,
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`],
    enabled: !!hospitalId && !!unitId,
  });

  const { data: doctors = [] } = useQuery<any[]>({
    queryKey: ['/api/hospitals', hospitalId, 'doctors'],
    queryFn: async () => {
      const res = await fetch(`/api/hospitals/${hospitalId}/doctors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch doctors");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: medicationTemplates = [] } = useQuery<any[]>({
    queryKey: ['/api/hospitals', hospitalId, 'discharge-medication-templates'],
    queryFn: async () => {
      const res = await fetch(`/api/hospitals/${hospitalId}/discharge-medication-templates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: companyData } = useQuery<any>({
    queryKey: ['/api/clinic', hospitalId, 'company-data'],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/company-data`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch company data");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const clinicDefaultNotes = useMemo(() => {
    if (!companyData) return "";
    return [companyData.companyName, companyData.companyPhone].filter(Boolean).join(" - ");
  }, [companyData]);

  const filteredItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return inventoryItems.slice(0, 50);
    const query = itemSearchQuery.toLowerCase();
    return inventoryItems
      .filter((item: any) => 
        item.name?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [inventoryItems, itemSearchQuery]);

  const selectedDoctor = doctors.find((d: any) => d.id === selectedDoctorId);

  const createMutation = useMutation({
    mutationFn: async (data: { signature: string | null }) => {
      return apiRequest("POST", `/api/patients/${patientId}/discharge-medications`, {
        hospitalId,
        surgeryId: selectedSurgeryId || null,
        doctorId: selectedDoctorId || null,
        notes: slotNotes || null,
        signature: data.signature,
        createdBy: (user as any)?.id || null,
        items: medicationItems.map(item => ({
          itemId: item.itemId || null,
          customName: item.customName || null,
          quantity: item.quantity,
          unitType: item.unitType,
          administrationRoute: item.administrationRoute || null,
          frequency: item.frequency || null,
          notes: item.notes || null,
          endPrice: item.endPrice ? item.endPrice : null,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'discharge-medications'] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`] });
      toast({ title: t('dischargeMedications.saved', 'Discharge medications saved successfully') });
      resetForm();
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/discharge-medications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'discharge-medications'] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`] });
      toast({ title: t('dischargeMedications.deleted', 'Discharge medication entry deleted and inventory restored') });
      setDeleteSlotId(null);
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { signature: string | null }) => {
      return apiRequest("PUT", `/api/discharge-medications/${editingSlotId}`, {
        doctorId: selectedDoctorId || null,
        surgeryId: selectedSurgeryId || null,
        notes: slotNotes || null,
        signature: data.signature,
        items: medicationItems.map(item => ({
          itemId: item.itemId || null,
          customName: item.customName || null,
          quantity: item.quantity,
          unitType: item.unitType,
          administrationRoute: item.administrationRoute || null,
          frequency: item.frequency || null,
          notes: item.notes || null,
          endPrice: item.endPrice ? item.endPrice : null,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'discharge-medications'] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`] });
      toast({ title: t('dischargeMedications.updated', 'Discharge medications updated successfully') });
      resetForm();
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedSurgeryId(null);
    setSelectedDoctorId("");
    setSlotNotes(clinicDefaultNotes);
    setMedicationItems([]);
    setSignature(null);
    setPendingSave(false);
    setEditingSlotId(null);
    setRouteCustomInput({});
    setFrequencyCustomInput({});
    setTemplateNameInput("");
    setShowSaveTemplateDialog(false);
  };

  const startEditing = (slot: any) => {
    setEditingSlotId(slot.id);
    setSelectedSurgeryId(slot.surgeryId || null);
    setSelectedDoctorId(slot.doctorId || "");
    setSlotNotes(slot.notes || "");
    setSignature(slot.signature || null);
    setMedicationItems(
      (slot.items || []).map((medItem: any) => ({
        itemId: medItem.itemId || null,
        customName: medItem.customName || undefined,
        itemName: medItem.item?.name || medItem.customName || medItem.itemId || '',
        quantity: medItem.quantity || 1,
        unitType: medItem.unitType || "packs",
        administrationRoute: medItem.administrationRoute || "p.o.",
        frequency: medItem.frequency || "1-0-1-0",
        notes: medItem.notes || "",
        endPrice: medItem.endPrice || "",
        isControlled: medItem.item?.controlled || false,
      }))
    );
    const customRoutes: Record<number, boolean> = {};
    const customFreqs: Record<number, boolean> = {};
    (slot.items || []).forEach((medItem: any, i: number) => {
      if (medItem.administrationRoute && !ADMINISTRATION_ROUTES.some(r => r.value === medItem.administrationRoute)) {
        customRoutes[i] = true;
      }
      if (medItem.frequency && !FREQUENCY_PRESETS.some(f => f.value === medItem.frequency)) {
        customFreqs[i] = true;
      }
    });
    setRouteCustomInput(customRoutes);
    setFrequencyCustomInput(customFreqs);
    setIsCreateDialogOpen(true);
  };

  const addMedicationItem = (item: any) => {
    if (medicationItems.some(m => m.itemId === item.id)) {
      toast({ title: t('dischargeMedications.alreadyAdded', 'This item is already added'), variant: "destructive" });
      return;
    }
    setMedicationItems(prev => [...prev, {
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
      unitType: "packs",
      administrationRoute: "p.o.",
      frequency: "1-0-1-0",
      notes: "",
      endPrice: item.patientPrice || "",
      isControlled: item.controlled || false,
    }]);
    setItemSearchOpen(false);
    setItemSearchQuery("");
  };

  const addCustomMedicationItem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (medicationItems.some(m => !m.itemId && m.customName === trimmed)) {
      toast({ title: t('dischargeMedications.alreadyAdded', 'This item is already added'), variant: "destructive" });
      return;
    }
    setMedicationItems(prev => [...prev, {
      itemId: null,
      customName: trimmed,
      itemName: trimmed,
      quantity: 1,
      unitType: "packs",
      administrationRoute: "p.o.",
      frequency: "1-0-1-0",
      notes: "",
      endPrice: "",
      isControlled: false,
    }]);
    setItemSearchOpen(false);
    setItemSearchQuery("");
  };

  const updateMedicationItem = (index: number, updates: Partial<MedicationItemEntry>) => {
    setMedicationItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const removeMedicationItem = (index: number) => {
    setMedicationItems(prev => prev.filter((_, i) => i !== index));
  };

  const hasControlledItems = medicationItems.some(item => item.isControlled);

  const commitMutation = useMutation({
    mutationFn: async ({ slotId, signature: sig }: { slotId: string; signature: string | null }) => {
      return apiRequest("POST", `/api/discharge-medications/${slotId}/commit`, { signature: sig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'discharge-medications'] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`] });
      toast({ title: t('dischargeMedications.inventoryCommitted', 'Inventory committed') });
      setCommitSlotId(null);
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (slot: any) => {
      const patientRes = await fetch(`/api/patients/${patientId}`, { credentials: "include" });
      if (!patientRes.ok) throw new Error("Could not load patient data");
      const patient = await patientRes.json();
      const customerName = `${patient.firstName || ''} ${patient.surname || ''}`.trim();
      if (!customerName) throw new Error("Patient name is required for invoice");
      const addressParts = [patient.street, [patient.postalCode, patient.city].filter(Boolean).join(' ')].filter(Boolean);
      const customerAddress = addressParts.join(', ') || null;

      const invoiceItems = (slot.items || []).map((medItem: any) => ({
        lineType: "item" as const,
        itemId: medItem.itemId,
        description: medItem.item?.name || medItem.customName || medItem.itemId,
        quantity: medItem.quantity || 1,
        unitPrice: medItem.endPrice ? parseFloat(medItem.endPrice) : 0,
        taxRate: 2.6,
      }));

      if (invoiceItems.length === 0) throw new Error("No medication items to invoice");

      return apiRequest("POST", `/api/clinic/${hospitalId}/invoices`, {
        hospitalId,
        patientId,
        customerName,
        customerAddress,
        date: new Date().toISOString(),
        vatRate: 2.6,
        comments: slot.notes || null,
        status: "draft",
        items: invoiceItems,
      });
    },
    onSuccess: () => {
      toast({ title: t('dischargeMedications.invoiceCreated', 'Draft invoice created successfully. You can find it in the Invoices section.') });
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] });
    },
    onError: (error: any) => {
      const msg = error.message?.includes('403') || error.message?.includes('Access denied')
        ? t('dischargeMedications.invoiceAccessDenied', 'Invoice creation requires clinic module access. Please check with your administrator.')
        : error.message;
      toast({ title: t('common.error', 'Error'), description: msg, variant: "destructive" });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", `/api/hospitals/${hospitalId}/discharge-medication-templates`, {
        name,
        createdBy: (user as any)?.id || null,
        items: medicationItems.map(item => ({
          itemId: item.itemId || null,
          customName: item.customName || null,
          quantity: item.quantity,
          unitType: item.unitType,
          administrationRoute: item.administrationRoute || null,
          frequency: item.frequency || null,
          notes: item.notes || null,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId, 'discharge-medication-templates'] });
      toast({ title: t('dischargeMedications.templateSaved', 'Template saved') });
      setShowSaveTemplateDialog(false);
      setTemplateNameInput("");
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/discharge-medication-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId, 'discharge-medication-templates'] });
      toast({ title: t('dischargeMedications.templateDeleted', 'Template deleted') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const loadTemplate = (template: any) => {
    const newItems: MedicationItemEntry[] = (template.items || []).map((ti: any) => ({
      itemId: ti.itemId || null,
      customName: ti.customName || undefined,
      itemName: ti.item?.name || ti.customName || ti.itemId || '',
      quantity: ti.quantity || 1,
      unitType: ti.unitType || "packs",
      administrationRoute: ti.administrationRoute || "p.o.",
      frequency: ti.frequency || "1-0-1-0",
      notes: ti.notes || "",
      endPrice: ti.item?.patientPrice || "",
      isControlled: ti.item?.controlled || false,
    }));
    setMedicationItems(newItems);
    toast({ title: t('dischargeMedications.templateLoaded', 'Template loaded — you can edit items before saving') });
  };

  const handleSurgeryChange = (val: string) => {
    const surgId = val === "__none__" ? null : val;
    setSelectedSurgeryId(surgId);
    // Prefill doctor from surgery's surgeon if doctor is not yet set
    if (surgId && !selectedDoctorId) {
      const surgery = surgeries.find(s => s.id === surgId);
      if (surgery?.surgeonId) {
        setSelectedDoctorId(surgery.surgeonId);
      }
    }
  };

  const sortedSurgeries = useMemo(() => {
    return [...surgeries].sort((a, b) => new Date(b.plannedDate).getTime() - new Date(a.plannedDate).getTime());
  }, [surgeries]);

  const printLabels = (slot: any, columns: number | "label62", startRow: number = 0) => {
    const items = slot.items || [];
    if (items.length === 0) {
      toast({ title: t('dischargeMedications.noItemsToPrint', 'No medications to print labels for'), variant: "destructive" });
      return;
    }

    const doctorName = slot.doctor ? `Dr. ${slot.doctor.firstName} ${slot.doctor.lastName}` : '';
    const dateStr = formatDate(slot.createdAt);
    const fullPatientName = patientName || t('dischargeMedications.unknownPatient', 'Patient');

    // 62mm label printer path — one medication per page
    // Page matches Brother QL-720NW PPD "62X1" size: 175.68 × 282.46 pts ≈ 62mm × 99.6mm
    if (columns === "label62") {
      const labelW = 62;
      const labelH = 99.6;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [labelW, labelH] });
      const margin = 3;
      const maxTextW = labelW - 2 * margin;

      items.forEach((medItem: any, idx: number) => {
        if (idx > 0) doc.addPage([labelW, labelH], "portrait");

        let py = margin + 4;

        // Patient name
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(fullPatientName, margin, py, { maxWidth: maxTextW });
        py += 4.5;

        // DOB
        if (patientBirthday) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(`geb. ${patientBirthday}`, margin, py, { maxWidth: maxTextW });
          py += 4;
        }

        // Separator
        doc.setDrawColor(180);
        doc.line(margin, py, labelW - margin, py);
        py += 3.5;

        // Medication name (bold, up to 2 lines)
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const medName = medItem.item?.name || medItem.customName || medItem.itemId || '';
        const nameLines = doc.splitTextToSize(medName, maxTextW);
        doc.text(nameLines.slice(0, 2), margin, py);
        py += nameLines.slice(0, 2).length * 4.5;

        // Details: quantity, route, frequency
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const detailParts: string[] = [];
        if (medItem.quantity) detailParts.push(`${medItem.quantity} ${medItem.unitType === 'pills' ? 'Tbl.' : 'Pkg.'}`);
        if (medItem.administrationRoute) detailParts.push(medItem.administrationRoute);
        if (medItem.frequency) detailParts.push(medItem.frequency);
        if (detailParts.length > 0) {
          doc.text(detailParts.join('  |  '), margin, py, { maxWidth: maxTextW });
          py += 4;
        }

        // Medication notes
        if (medItem.notes) {
          doc.setFontSize(7.5);
          const noteLines = doc.splitTextToSize(medItem.notes, maxTextW);
          doc.text(noteLines.slice(0, 3), margin, py);
          py += noteLines.slice(0, 3).length * 3;
        }

        // Slot notes
        if (slot.notes) {
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "italic");
          const slotNoteLines = doc.splitTextToSize(slot.notes, maxTextW);
          doc.text(slotNoteLines.slice(0, 3), margin, py);
          py += slotNoteLines.slice(0, 3).length * 3;
          doc.setFont("helvetica", "normal");
        }

        // Footer: date (left) + doctor (right), after content with spacing
        py += 4;
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(dateStr, margin, py);
        if (doctorName) {
          doc.text(doctorName, labelW - margin, py, { align: "right" });
        }
        doc.setTextColor(0);
      });

      doc.save(`discharge-labels-62mm-${fullPatientName.replace(/\s+/g, '_')}-${dateStr}.pdf`);
      return;
    }

    // A4 sticker-sheet path (2-col / 3-col)
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    // 3-col: physical sticker sheet — 3×8 labels, 70×36mm each, no margins/gaps
    const marginX = columns === 3 ? 0 : 10;
    const marginY = columns === 3 ? 0 : 10;
    const gap = columns === 3 ? 0 : 4;
    const labelW = columns === 3 ? 70 : (pageW - 2 * marginX - gap) / 2;
    const labelH = columns === 3 ? 36 : 50;
    const rows = columns === 3 ? 8 : Math.floor((297 - 2 * marginY + gap) / (labelH + gap));

    let labelIdx = startRow * columns;

    for (const medItem of items) {
      const col = labelIdx % columns;
      const row = Math.floor(labelIdx / columns) % rows;
      const page = Math.floor(labelIdx / (columns * rows));

      if (page > 0 && col === 0 && row === 0) {
        doc.addPage();
      }

      const x = marginX + col * (labelW + gap);
      const y = marginY + row * (labelH + gap);

      if (columns !== 3) {
        doc.setDrawColor(180);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, labelW, labelH, 2, 2);
      }

      const px = x + 3;
      let py = y + 5;
      const maxTextW = labelW - 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(fullPatientName, px, py, { maxWidth: maxTextW });
      py += 4;
      if (patientBirthday) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(`geb. ${patientBirthday}`, px, py, { maxWidth: maxTextW });
        py += 3.5;
      }

      doc.setDrawColor(200);
      doc.line(px, py, x + labelW - 3, py);
      py += 3;

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      const medName = medItem.item?.name || medItem.customName || medItem.itemId || '';
      const nameLines = doc.splitTextToSize(medName, maxTextW);
      doc.text(nameLines.slice(0, 2), px, py);
      py += nameLines.slice(0, 2).length * 4;

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const detailParts: string[] = [];
      if (medItem.quantity) detailParts.push(`${medItem.quantity} ${medItem.unitType === 'pills' ? 'Tbl.' : 'Pkg.'}`);
      if (medItem.administrationRoute) detailParts.push(medItem.administrationRoute);
      if (medItem.frequency) detailParts.push(medItem.frequency);
      if (detailParts.length > 0) {
        doc.text(detailParts.join('  |  '), px, py, { maxWidth: maxTextW });
        py += 3.5;
      }
      if (medItem.notes) {
        doc.setFontSize(7);
        doc.text(medItem.notes, px, py, { maxWidth: maxTextW });
        py += 3;
      }
      if (slot.notes) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "italic");
        doc.text(slot.notes, px, py, { maxWidth: maxTextW });
        py += 3;
        doc.setFont("helvetica", "normal");
      }

      doc.setFontSize(6.5);
      doc.setTextColor(100);
      const footerY = y + labelH - 3;
      doc.text(dateStr, px, footerY);
      if (doctorName) {
        doc.text(doctorName, x + labelW - 3, footerY, { align: "right" });
      }
      doc.setTextColor(0);

      labelIdx++;
    }

    doc.save(`discharge-labels-${fullPatientName.replace(/\s+/g, '_')}-${dateStr}.pdf`);
  };

  const isEditing = !!editingSlotId;
  const activeMutation = isEditing ? updateMutation : createMutation;

  const handleSave = () => {
    if (medicationItems.length === 0) {
      toast({ title: t('dischargeMedications.noItems', 'Please add at least one medication'), variant: "destructive" });
      return;
    }

    if (hasControlledItems && !signature) {
      setPendingSave(true);
      setShowSignaturePad(true);
      return;
    }

    activeMutation.mutate({ signature });
  };

  const handleSignatureSave = (sig: string) => {
    setSignature(sig);
    setShowSignaturePad(false);
    if (pendingSave) {
      setPendingSave(false);
      activeMutation.mutate({ signature: sig });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-discharge-medications" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}
            data-testid="button-add-discharge-medication"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('dischargeMedications.addNew', 'Add Discharge Medications')}
          </Button>
        </div>
      )}

      {dischargeMedications.length > 0 ? (
        <div className="space-y-4">
          {dischargeMedications.map((slot: any) => (
            <Card key={slot.id} data-testid={`discharge-medication-slot-${slot.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Pill className="h-5 w-5" />
                    {t('dischargeMedications.slotTitle', 'Discharge Medications')}
                    <Badge variant="secondary">{slot.items?.length || 0}</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {slot.signature && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {t('dischargeMedications.signedControlled', 'Signed (controlled)')}
                      </Badge>
                    )}
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditing(slot)}
                          data-testid={`button-edit-slot-${slot.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteSlotId(slot.id)}
                          data-testid={`button-delete-slot-${slot.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-1">
                  {slot.doctor && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Dr. {slot.doctor.firstName} {slot.doctor.lastName}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(slot.createdAt)}
                  </span>
                </div>
                {slot.notes && (
                  <p className="text-sm text-muted-foreground mt-1 italic">{slot.notes}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {slot.items?.map((medItem: any) => (
                    <div
                      key={medItem.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-muted/50 rounded-lg border"
                      data-testid={`discharge-med-item-${medItem.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{medItem.item?.name || medItem.customName || medItem.itemId}</span>
                          {medItem.item?.controlled && (
                            <Badge variant="destructive" className="text-xs shrink-0">
                              {t('dischargeMedications.controlled', 'Controlled')}
                            </Badge>
                          )}
                        </div>
                        {medItem.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{medItem.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm shrink-0">
                        <Badge variant="outline">
                          {medItem.quantity} {medItem.unitType === 'pills' ? t('dischargeMedications.pills', 'pills') : t('dischargeMedications.packs', 'packs')}
                        </Badge>
                        {medItem.administrationRoute && (
                          <Badge variant="secondary">{medItem.administrationRoute}</Badge>
                        )}
                        {medItem.frequency && (
                          <Badge variant="secondary">{medItem.frequency}</Badge>
                        )}
                        {medItem.endPrice && (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            {formatCurrency(medItem.endPrice)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
                <div className="flex flex-wrap gap-2 items-center">
                  {!slot.inventoryCommittedAt && slot.items?.some((mi: any) => mi.itemId) && canWrite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCommitSlotId(slot.id)}
                      data-testid={`button-commit-inventory-${slot.id}`}
                    >
                      <Package className="h-4 w-4 mr-1" />
                      {t('dischargeMedications.commitInventory', 'Commit to Inventory')}
                    </Button>
                  )}
                  {slot.inventoryCommittedAt && (
                    <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/20">
                      <Package className="h-3 w-3 mr-1" />
                      {t('dischargeMedications.inventoryCommittedBadge', 'Inventory committed')} — {formatDate(slot.inventoryCommittedAt)}
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`button-print-labels-${slot.id}`}
                    onClick={() => {
                      setPrintDialogSlot(slot);
                      setPrintColumns("2");
                      setPrintStartRow(1);
                    }}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    {t('dischargeMedications.printLabels', 'Print Labels')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createInvoiceMutation.mutate(slot)}
                    disabled={createInvoiceMutation.isPending}
                    data-testid={`button-create-invoice-${slot.id}`}
                  >
                    {createInvoiceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-1" />
                    )}
                    {t('dischargeMedications.createInvoice', 'Create Invoice Draft')}
                  </Button>
                  {onGeneratePrescription && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onGeneratePrescription(slot.id, slot.surgeryId ?? undefined)}
                      data-testid={`button-generate-prescription-${slot.id}`}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      {t('dischargeMedications.generatePrescription', 'Generate Prescription')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Pill className="h-12 w-12 text-muted-foreground" data-testid="icon-no-discharge-medications" />
              <p className="text-foreground font-semibold" data-testid="text-no-discharge-medications">
                {t('dischargeMedications.noMedications', 'No discharge medications')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('dischargeMedications.noMedicationsDesc', 'Medications given to the patient at discharge will appear here.')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setIsCreateDialogOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle data-testid="dialog-title-discharge-medications">
              <Pill className="h-5 w-5 inline mr-2" />
              {isEditing
                ? t('dischargeMedications.editTitle', 'Edit Discharge Medications')
                : t('dischargeMedications.createTitle', 'Add Discharge Medications')
              }
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? t('dischargeMedications.editDesc', 'Update medications for this discharge slot.')
                : t('dischargeMedications.createDesc', 'Select medications to give the patient at discharge. Use "Commit to Inventory" to deduct stock.')
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 min-h-0">
            <div className="space-y-6">
              {/* Surgery link */}
              {surgeries.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    {t('dischargeMedications.linkedSurgery', 'Linked Surgery')}
                  </Label>
                  <Select
                    value={selectedSurgeryId ?? "__none__"}
                    onValueChange={handleSurgeryChange}
                  >
                    <SelectTrigger data-testid="select-surgery">
                      <SelectValue placeholder={t('dischargeMedications.selectSurgery', 'Select surgery...')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {t('dischargeMedications.noLinkedSurgery', 'No linked surgery')}
                      </SelectItem>
                      {sortedSurgeries.map((s) => {
                        const date = new Date(s.plannedDate);
                        const formatted = `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            {s.plannedSurgery || t('common.untitled', 'Untitled')} - {formatted} [{s.status}]
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('dischargeMedications.responsibleDoctor', 'Responsible Doctor')}</Label>
                  <Popover open={doctorSearchOpen} onOpenChange={setDoctorSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                        data-testid="select-doctor"
                      >
                        {selectedDoctor
                          ? `Dr. ${selectedDoctor.firstName} ${selectedDoctor.lastName}`
                          : t('dischargeMedications.selectDoctor', 'Select doctor...')
                        }
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t('dischargeMedications.searchDoctor', 'Search doctor...')} />
                        <CommandList>
                          <CommandEmpty>{t('dischargeMedications.noDoctor', 'No doctor found')}</CommandEmpty>
                          <CommandGroup>
                            {doctors.map((doc: any) => (
                              <CommandItem
                                key={doc.id}
                                value={`${doc.firstName} ${doc.lastName}`}
                                onSelect={() => {
                                  setSelectedDoctorId(doc.id);
                                  setDoctorSearchOpen(false);
                                }}
                                data-testid={`doctor-option-${doc.id}`}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedDoctorId === doc.id ? "opacity-100" : "opacity-0")} />
                                Dr. {doc.firstName} {doc.lastName}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>{t('dischargeMedications.slotNotes', 'Notes (e.g. practice name)')}</Label>
                  <div className="relative">
                    <Input
                      value={slotNotes}
                      onChange={(e) => setSlotNotes(e.target.value)}
                      placeholder={t('dischargeMedications.slotNotesPlaceholder', 'Practice name, additional info...')}
                      data-testid="input-slot-notes"
                      className="pr-8"
                    />
                    {slotNotes && (
                      <button
                        type="button"
                        onClick={() => setSlotNotes("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    {t('dischargeMedications.medications', 'Medications')}
                    {medicationItems.length > 0 && (
                      <Badge variant="secondary" className="ml-2">{medicationItems.length}</Badge>
                    )}
                  </Label>
                  <div className="flex items-center gap-2">
                    {/* Load from template */}
                    {medicationTemplates.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-1" />
                            {t('dischargeMedications.loadTemplate', 'Template')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-2" align="end">
                          <div className="flex flex-col gap-1">
                            {medicationTemplates.map((tmpl: any) => (
                              <div key={tmpl.id} className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="flex-1 justify-start text-left"
                                  onClick={() => loadTemplate(tmpl)}
                                >
                                  {tmpl.name}
                                  <Badge variant="secondary" className="ml-auto">{tmpl.items?.length || 0}</Badge>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-destructive"
                                  onClick={() => deleteTemplateMutation.mutate(tmpl.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    {/* Save as template */}
                    {medicationItems.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setShowSaveTemplateDialog(true)}>
                        <Save className="h-4 w-4 mr-1" />
                        {t('dischargeMedications.saveAsTemplate', 'Save Template')}
                      </Button>
                    )}
                  <Popover open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-add-medication-item">
                        <Plus className="h-4 w-4 mr-1" />
                        {t('dischargeMedications.addMedication', 'Add Medication')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="end">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t('dischargeMedications.searchMedication', 'Search medication...')}
                          value={itemSearchQuery}
                          onValueChange={setItemSearchQuery}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {itemSearchQuery.trim() ? (
                              <button
                                className="w-full px-2 py-3 text-sm text-left hover:bg-accent cursor-pointer"
                                onClick={() => addCustomMedicationItem(itemSearchQuery)}
                              >
                                <Plus className="h-4 w-4 mr-1 inline" />
                                {t('dischargeMedications.addFreeText', 'Add "{{name}}" as free text', { name: itemSearchQuery.trim() })}
                              </button>
                            ) : (
                              t('dischargeMedications.noMedicationFound', 'No medication found')
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredItems.map((item: any) => (
                              <CommandItem
                                key={item.id}
                                value={item.name}
                                onSelect={() => addMedicationItem(item)}
                                data-testid={`medication-option-${item.id}`}
                              >
                                <div className="flex items-center gap-2 w-full">
                                  <div className="flex-1 min-w-0">
                                    <span className="truncate block">{item.name}</span>
                                    {item.description && (
                                      <span className="text-xs text-muted-foreground truncate block">{item.description}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {item.controlled && (
                                      <Badge variant="destructive" className="text-xs">BTM</Badge>
                                    )}
                                    {item.patientPrice && (
                                      <span className="text-xs text-muted-foreground">{formatCurrency(item.patientPrice)}</span>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          {itemSearchQuery.trim() && filteredItems.length > 0 && (
                            <CommandGroup>
                              <CommandItem
                                value={`__custom__${itemSearchQuery}`}
                                onSelect={() => addCustomMedicationItem(itemSearchQuery)}
                                data-testid="medication-option-custom"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                {t('dischargeMedications.addFreeText', 'Add "{{name}}" as free text', { name: itemSearchQuery.trim() })}
                              </CommandItem>
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  </div>
                </div>

                {medicationItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('dischargeMedications.noItemsYet', 'No medications added yet. Use the button above to search and add.')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {medicationItems.map((medItem, index) => (
                      <Card key={medItem.itemId || `custom-${index}`} className={cn("relative", medItem.isControlled && "border-amber-300 dark:border-amber-700")} data-testid={`medication-entry-${index}`}>
                        <CardContent className="pt-4 pb-3 px-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {!medItem.itemId ? (
                                <Input
                                  value={medItem.customName || medItem.itemName}
                                  onChange={(e) => updateMedicationItem(index, { customName: e.target.value, itemName: e.target.value })}
                                  className="h-7 font-medium text-sm w-48"
                                  placeholder={t('dischargeMedications.medicationName', 'Medication name')}
                                />
                              ) : (
                                <span className="font-medium">{medItem.itemName}</span>
                              )}
                              {medItem.isControlled && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {t('dischargeMedications.controlled', 'Controlled')}
                                </Badge>
                              )}
                              {!medItem.itemId && (
                                <Badge variant="secondary" className="text-xs">
                                  {t('dischargeMedications.freeText', 'Free text')}
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeMedicationItem(index)}
                              data-testid={`button-remove-medication-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.quantity', 'Quantity')}</Label>
                              <Input
                                type="number"
                                min={1}
                                value={medItem.quantity}
                                onChange={(e) => updateMedicationItem(index, { quantity: parseInt(e.target.value) || 1 })}
                                data-testid={`input-quantity-${index}`}
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.unitType', 'Unit')}</Label>
                              <Select
                                value={medItem.unitType}
                                onValueChange={(value) => updateMedicationItem(index, { unitType: value as "pills" | "packs" })}
                              >
                                <SelectTrigger data-testid={`select-unit-type-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pills">{t('dischargeMedications.pills', 'Pills')}</SelectItem>
                                  <SelectItem value="packs">{t('dischargeMedications.packs', 'Packs')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.route', 'Route')}</Label>
                              {routeCustomInput[index] ? (
                                <div className="flex gap-1">
                                  <Input
                                    value={medItem.administrationRoute}
                                    onChange={(e) => updateMedicationItem(index, { administrationRoute: e.target.value })}
                                    placeholder="Custom..."
                                    data-testid={`input-route-custom-${index}`}
                                  />
                                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setRouteCustomInput(prev => ({ ...prev, [index]: false }))}>
                                    <ChevronsUpDown className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Select
                                  value={ADMINISTRATION_ROUTES.some(r => r.value === medItem.administrationRoute) ? medItem.administrationRoute : "__custom__"}
                                  onValueChange={(value) => {
                                    if (value === "__custom__") {
                                      setRouteCustomInput(prev => ({ ...prev, [index]: true }));
                                      updateMedicationItem(index, { administrationRoute: "" });
                                    } else {
                                      updateMedicationItem(index, { administrationRoute: value });
                                    }
                                  }}
                                >
                                  <SelectTrigger data-testid={`select-route-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ADMINISTRATION_ROUTES.map(route => (
                                      <SelectItem key={route.value} value={route.value}>{route.label}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">{t('dischargeMedications.customRoute', '✏️ Custom...')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.frequency', 'Frequency')}</Label>
                              {frequencyCustomInput[index] ? (
                                <div className="flex gap-1">
                                  <Input
                                    value={medItem.frequency}
                                    onChange={(e) => updateMedicationItem(index, { frequency: e.target.value })}
                                    placeholder="Custom..."
                                    data-testid={`input-frequency-custom-${index}`}
                                  />
                                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setFrequencyCustomInput(prev => ({ ...prev, [index]: false }))}>
                                    <ChevronsUpDown className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Select
                                  value={FREQUENCY_PRESETS.some(f => f.value === medItem.frequency) ? medItem.frequency : "__custom__"}
                                  onValueChange={(value) => {
                                    if (value === "__custom__") {
                                      setFrequencyCustomInput(prev => ({ ...prev, [index]: true }));
                                      updateMedicationItem(index, { frequency: "" });
                                    } else {
                                      updateMedicationItem(index, { frequency: value });
                                    }
                                  }}
                                >
                                  <SelectTrigger data-testid={`select-frequency-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FREQUENCY_PRESETS.map(freq => (
                                      <SelectItem key={freq.value} value={freq.value}>{freq.label}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">{t('dischargeMedications.customFrequency', '✏️ Custom...')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.endPrice', 'End Price (CHF)')}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={medItem.endPrice}
                                onChange={(e) => updateMedicationItem(index, { endPrice: e.target.value })}
                                placeholder="0.00"
                                data-testid={`input-price-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.itemNotes', 'Note')}</Label>
                              <Input
                                value={medItem.notes}
                                onChange={(e) => updateMedicationItem(index, { notes: e.target.value })}
                                placeholder={t('dischargeMedications.itemNotesPlaceholder', 'Additional notes...')}
                                data-testid={`input-item-notes-${index}`}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {hasControlledItems && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <Label className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {t('dischargeMedications.controlledWarning', 'Controlled substances require signature')}
                      </Label>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="space-y-1">
                        {medicationItems.filter(m => m.isControlled).map((m, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="font-medium">{m.itemName}</span>
                            <Badge variant="outline">{m.quantity} {m.unitType}</Badge>
                          </div>
                        ))}
                      </div>
                      {(patientName || patientBirthday) && (
                        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-muted-foreground">
                            {t('dischargeMedications.patient', 'Patient')}: <strong>{patientName}</strong>
                            {patientBirthday && ` (${patientBirthday})`}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm font-medium">
                        {t('dischargeMedications.signatureRequired', 'Signature required for controlled items')}
                      </span>
                      {signature ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            <Check className="h-3 w-3 mr-1" />
                            {t('dischargeMedications.signed', 'Signed')}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowSignaturePad(true)}
                            data-testid="button-change-signature"
                          >
                            {t('common.edit', 'Edit')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setShowSignaturePad(true)}
                          data-testid="button-sign-discharge"
                        >
                          {t('dischargeMedications.signHere', 'Sign here')}
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t shrink-0">
            <Button
              variant="outline"
              onClick={() => { resetForm(); setIsCreateDialogOpen(false); }}
              disabled={activeMutation.isPending}
              data-testid="button-cancel-discharge"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={activeMutation.isPending || medicationItems.length === 0 || (hasControlledItems && !signature)}
              data-testid="button-save-discharge"
            >
              {activeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.saving', 'Saving...')}</>
              ) : (
                <><Package className="h-4 w-4 mr-2" />{isEditing ? t('dischargeMedications.update', 'Update Medications') : t('dischargeMedications.save', 'Save Medications')}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSlotId} onOpenChange={(open) => !open && setDeleteSlotId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dischargeMedications.deleteTitle', 'Delete Discharge Medications?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dischargeMedications.deleteDesc', 'This will delete this medication entry. If inventory was committed, the deducted quantities will be restored. This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSlotId && deleteMutation.mutate(deleteSlotId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => { setShowSignaturePad(false); setPendingSave(false); }}
        onSave={handleSignatureSave}
        title={t('dischargeMedications.signatureRequired', 'Signature required for controlled items')}
      />

      {/* Save as template dialog */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('dischargeMedications.saveAsTemplateTitle', 'Save as Template')}</DialogTitle>
            <DialogDescription>
              {t('dischargeMedications.saveAsTemplateDesc', 'Save the current medications as a reusable template.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>{t('dischargeMedications.templateName', 'Template Name')}</Label>
            <Input
              value={templateNameInput}
              onChange={(e) => setTemplateNameInput(e.target.value)}
              placeholder={t('dischargeMedications.templateNamePlaceholder', 'e.g. Standard Post-OP')}
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => saveTemplateMutation.mutate(templateNameInput.trim())}
              disabled={!templateNameInput.trim() || saveTemplateMutation.isPending}
            >
              {saveTemplateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.saving', 'Saving...')}</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />{t('common.save', 'Save')}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print labels settings dialog */}
      <Dialog open={!!printDialogSlot} onOpenChange={(open) => { if (!open) setPrintDialogSlot(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <Printer className="h-5 w-5 inline mr-2" />
              {t('dischargeMedications.printSettings', 'Print Label Settings')}
            </DialogTitle>
            <DialogDescription>
              {t('dischargeMedications.printSettingsDesc', 'Choose layout and starting position for the label sheet.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('dischargeMedications.columnLayout', 'Column Layout')}</Label>
              <Select
                value={printColumns}
                onValueChange={(v) => {
                  setPrintColumns(v);
                  if (v !== "label62") {
                    const cols = Number(v);
                    const maxRow = cols === 3 ? 8 : 5;
                    if (printStartRow > maxRow) setPrintStartRow(maxRow);
                  }
                }}
              >
                <SelectTrigger data-testid="select-print-columns">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">{t('dischargeMedications.printLabels2col', '2 Columns (larger labels)')}</SelectItem>
                  <SelectItem value="3">{t('dischargeMedications.printLabels3col', '3 Columns (smaller labels)')}</SelectItem>
                  <SelectItem value="label62">{t('dischargeMedications.printLabelsLabel62', 'Label Printer (62mm roll)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {printColumns !== "label62" && (
            <div className="space-y-2">
              <Label>{t('dischargeMedications.startingRow', 'Starting Row')}</Label>
              <Input
                type="number"
                min={1}
                max={printColumns === "3" ? 8 : 5}
                value={printStartRow}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const maxRow = printColumns === "3" ? 8 : 5;
                  if (val >= 1 && val <= maxRow) setPrintStartRow(val);
                }}
                data-testid="input-print-start-row"
              />
              <p className="text-xs text-muted-foreground">
                {t('dischargeMedications.startingRowHint', 'Use row > 1 to skip already-used rows on a partially-used sheet.')}
              </p>
            </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setPrintDialogSlot(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                printLabels(printDialogSlot, printColumns === "label62" ? "label62" : Number(printColumns), printStartRow - 1);
                setPrintDialogSlot(null);
              }}
              data-testid="button-print-labels-confirm"
            >
              <Printer className="h-4 w-4 mr-2" />
              {t('dischargeMedications.printLabels', 'Print Labels')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Commit to inventory dialog */}
      {commitSlotId && (() => {
        const commitSlot = dischargeMedications?.find((s: any) => s.id === commitSlotId);
        const commitItems = (commitSlot?.items || [])
          .filter((mi: any) => mi.itemId)
          .map((mi: any) => ({
            itemId: mi.itemId,
            itemName: mi.item?.name || mi.customName || mi.itemId,
            quantity: mi.quantity || 1,
            isControlled: !!mi.item?.controlled,
          }));
        return (
          <ControlledItemsCommitDialog
            isOpen={true}
            onClose={() => setCommitSlotId(null)}
            onCommit={(sig) => commitMutation.mutate({ slotId: commitSlotId, signature: sig })}
            items={commitItems}
            isCommitting={commitMutation.isPending}
            patientName={patientName}
            patientBirthday={patientBirthday}
          />
        );
      })()}
    </div>
  );
}