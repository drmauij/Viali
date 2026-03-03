import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Search, FileText, Trash2, Eye, Check, ChevronDown, Download, Loader2, AlertCircle, ArrowLeft, Send, BanknoteIcon, XCircle, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import InvoiceForm from "./InvoiceForm";
import TardocInvoiceForm from "./TardocInvoiceForm";
import TardocTemplateManager from "./TardocTemplateManager";
import { InvoiceDetailDialog } from "@/components/clinic/InvoiceDetailDialog";

interface Invoice {
  id: string;
  hospitalId: string;
  invoiceNumber: number;
  date: string;
  patientId: string | null;
  customerName: string;
  customerAddress: string | null;
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  comments: string | null;
  status: "draft" | "sent" | "paid" | "cancelled";
  createdBy: string;
  createdAt: string;
  patientFirstName?: string;
  patientSurname?: string;
}

interface TardocInvoice {
  id: string;
  hospitalId: string;
  invoiceNumber: number;
  patientId: string | null;
  billingModel: string;
  lawType: string;
  patientSurname: string | null;
  patientFirstName: string | null;
  insurerName: string | null;
  totalChf: string | null;
  status: string;
  createdAt: string;
}

// Unified type for display
interface UnifiedInvoice {
  id: string;
  type: "self-pay" | "insurance";
  invoiceNumber: number;
  customerName: string;
  total: string;
  status: string;
  date: string;
  billingModel?: string;
  lawType?: string;
  insurerName?: string;
}

export default function ClinicInvoices() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTardocDialogOpen, setCreateTardocDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedTardocInvoiceId, setSelectedTardocInvoiceId] = useState<string | null>(null);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;

    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) =>
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }

    return userHospitals[0];
  }, [user]);

  const hospitalId = activeHospital?.id;
  const dateLocale = i18n.language === 'de' ? de : enUS;

  // Fetch self-pay invoices
  const { data: invoices = [], isLoading: isLoadingSelfPay } = useQuery<Invoice[]>({
    queryKey: ['/api/clinic', hospitalId, 'invoices'],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/invoices`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // Fetch TARDOC insurance invoices
  const { data: tardocInvoices = [], isLoading: isLoadingTardoc } = useQuery<TardocInvoice[]>({
    queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices`],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-invoices`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const isLoading = isLoadingSelfPay || isLoadingTardoc;

  // Self-pay mutations
  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest('DELETE', `/api/clinic/${hospitalId}/invoices/${invoiceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] });
      toast({ title: t('clinic.invoices.deleted'), description: t('clinic.invoices.deletedDescription') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('clinic.invoices.deleteError'), variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest('PATCH', `/api/clinic/${hospitalId}/invoices/${invoiceId}/status`, { status: 'paid' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] });
      toast({ title: t('clinic.invoices.markedPaid', 'Marked as Paid') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('clinic.invoices.markPaidError', 'Failed to mark as paid'), variant: "destructive" });
    },
  });

  // TARDOC mutations
  const deleteTardocMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest('DELETE', `/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices`] });
      toast({ title: "Deleted", description: "Insurance invoice deleted" });
    },
    onError: () => {
      toast({ title: t('common.error'), description: "Failed to delete insurance invoice", variant: "destructive" });
    },
  });

  // Unified invoice list
  const unifiedInvoices = useMemo((): UnifiedInvoice[] => {
    const selfPay: UnifiedInvoice[] = invoices.map(inv => ({
      id: inv.id,
      type: "self-pay" as const,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      total: inv.total,
      status: inv.status,
      date: inv.date || inv.createdAt,
    }));

    const insurance: UnifiedInvoice[] = tardocInvoices.map(inv => ({
      id: inv.id,
      type: "insurance" as const,
      invoiceNumber: inv.invoiceNumber,
      customerName: `${inv.patientSurname || ''} ${inv.patientFirstName || ''}`.trim() || 'Unknown',
      total: inv.totalChf || "0.00",
      status: inv.status,
      date: inv.createdAt,
      billingModel: inv.billingModel,
      lawType: inv.lawType,
      insurerName: inv.insurerName || undefined,
    }));

    return [...selfPay, ...insurance].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [invoices, tardocInvoices]);

  const filteredInvoices = useMemo(() => {
    return unifiedInvoices.filter(inv => {
      const matchesSearch =
        inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.invoiceNumber.toString().includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      const matchesType = typeFilter === 'all' || inv.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [unifiedInvoices, searchTerm, statusFilter, typeFilter]);

  const getStatusBadge = (status: string) => {
    const colorMap: Record<string, string> = {
      draft: "",
      validated: "bg-blue-100 text-blue-800",
      exported: "bg-purple-100 text-purple-800",
      sent: "bg-orange-100 text-orange-800",
      paid: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      cancelled: "bg-gray-200 text-gray-600",
    };
    const className = colorMap[status];
    if (className) {
      return <Badge variant="secondary" className={className}>{status}</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const getTypeBadge = (type: "self-pay" | "insurance") => {
    if (type === "insurance") {
      return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Insurance</Badge>;
    }
    return <Badge variant="outline" className="text-xs">Self-Pay</Badge>;
  };

  const handleDeleteInvoice = (inv: UnifiedInvoice) => {
    if (confirm(t('clinic.invoices.confirmDelete'))) {
      if (inv.type === "insurance") {
        deleteTardocMutation.mutate(inv.id);
      } else {
        deleteMutation.mutate(inv.id);
      }
    }
  };

  const handleDownloadXml = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}/xml`, {
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices`] });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDownloadPdf = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}/pdf`, {
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices`] });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    }
  };

  if (!hospitalId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t('common.noHospitalSelected')}
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="page-title-clinic-invoices">
          {t('clinic.invoices.title')}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTemplateManagerOpen(true)}
            title="Manage Templates"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="button-create-invoice">
              <Plus className="h-4 w-4 mr-2" />
              {t('clinic.invoices.create')}
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Self-Pay Invoice
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreateTardocDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-2 text-blue-600" />
              Insurance Invoice (TARDOC)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('clinic.invoices.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-invoices"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="self-pay">Self-Pay</SelectItem>
            <SelectItem value="insurance">Insurance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('clinic.invoices.filter.all')}</SelectItem>
            <SelectItem value="draft">{t('clinic.invoices.status.draft')}</SelectItem>
            <SelectItem value="paid">{t('clinic.invoices.status.paid')}</SelectItem>
            <SelectItem value="validated">Validated</SelectItem>
            <SelectItem value="exported">Exported</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('clinic.invoices.noInvoices')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map(invoice => (
            <Card key={`${invoice.type}-${invoice.id}`} data-testid={`card-invoice-${invoice.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">
                        #{invoice.invoiceNumber}
                      </span>
                      {getTypeBadge(invoice.type)}
                      {getStatusBadge(invoice.status)}
                      {invoice.billingModel && (
                        <Badge variant="outline" className="text-xs">{invoice.billingModel}</Badge>
                      )}
                      {invoice.lawType && (
                        <Badge variant="outline" className="text-xs">{invoice.lawType}</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">
                      {invoice.customerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(invoice.date), 'PP', { locale: dateLocale })}
                      {invoice.insurerName && ` · ${invoice.insurerName}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">
                      {formatCurrency(invoice.total)}
                    </p>
                    <div className="flex gap-1 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (invoice.type === "insurance") {
                            setSelectedTardocInvoiceId(invoice.id);
                          } else {
                            setSelectedInvoiceId(invoice.id);
                          }
                        }}
                        data-testid={`button-view-${invoice.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {/* Export buttons for insurance invoices */}
                      {invoice.type === "insurance" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDownloadXml(invoice.id)}>
                              Download XML
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadPdf(invoice.id)}>
                              Download PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {invoice.status === 'draft' && invoice.type === "self-pay" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markPaidMutation.mutate(invoice.id)}
                          disabled={markPaidMutation.isPending}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {(invoice.status === 'draft') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteInvoice(invoice)}
                          disabled={deleteMutation.isPending || deleteTardocMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Self-pay invoice create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('clinic.invoices.createNew')}</DialogTitle>
          </DialogHeader>
          <InvoiceForm
            hospitalId={hospitalId}
            unitId={activeHospital?.unitId}
            onSuccess={() => {
              setCreateDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] });
            }}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* TARDOC insurance invoice create dialog */}
      <Dialog open={createTardocDialogOpen} onOpenChange={setCreateTardocDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Insurance Invoice (TARDOC)</DialogTitle>
          </DialogHeader>
          <TardocInvoiceForm
            hospitalId={hospitalId}
            onSuccess={() => {
              setCreateTardocDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices`] });
            }}
            onCancel={() => setCreateTardocDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Self-pay invoice detail dialog */}
      <InvoiceDetailDialog
        hospitalId={hospitalId!}
        invoiceId={selectedInvoiceId}
        open={!!selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onStatusChange={() => queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] })}
      />

      {/* TARDOC invoice detail dialog */}
      {selectedTardocInvoiceId && (
        <TardocInvoiceDetailDialog
          hospitalId={hospitalId!}
          invoiceId={selectedTardocInvoiceId}
          open={!!selectedTardocInvoiceId}
          onClose={() => setSelectedTardocInvoiceId(null)}
          onExportXml={() => handleDownloadXml(selectedTardocInvoiceId)}
          onExportPdf={() => handleDownloadPdf(selectedTardocInvoiceId)}
          onStatusChange={() => queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices`] })}
        />
      )}

      {/* Template manager dialog */}
      <TardocTemplateManager
        hospitalId={hospitalId}
        open={templateManagerOpen}
        onClose={() => setTemplateManagerOpen(false)}
      />
    </div>
  );
}

// ==================== TARDOC Invoice Detail Dialog ====================

function getDialogStatusBadge(status: string) {
  const colorMap: Record<string, string> = {
    draft: "",
    validated: "bg-blue-100 text-blue-800",
    exported: "bg-purple-100 text-purple-800",
    sent: "bg-orange-100 text-orange-800",
    paid: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    cancelled: "bg-gray-200 text-gray-600",
  };
  const className = colorMap[status];
  if (className) {
    return <Badge variant="secondary" className={className}>{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

interface TardocInvoiceDetailProps {
  hospitalId: string;
  invoiceId: string;
  open: boolean;
  onClose: () => void;
  onExportXml: () => void;
  onExportPdf: () => void;
  onStatusChange?: () => void;
}

function TardocInvoiceDetailDialog({ hospitalId, invoiceId, open, onClose, onExportXml, onExportPdf, onStatusChange }: TardocInvoiceDetailProps) {
  const { toast } = useToast();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { data: invoice, isLoading } = useQuery({
    queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}`],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch invoice');
      return res.json();
    },
    enabled: open && !!invoiceId,
  });

  // Mutation: change invoice status
  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest('PATCH', `/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}/status`, { status: newStatus });
    },
    onSuccess: (_data, newStatus) => {
      toast({ title: "Status updated", description: `Invoice moved to "${newStatus}"` });
      setValidationErrors([]);
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}`] });
      onStatusChange?.();
    },
    onError: (error: any) => {
      toast({ title: "Status change failed", description: error.message || "Something went wrong", variant: "destructive" });
    },
  });

  // Mutation: validate invoice (draft -> validated)
  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/clinic/${hospitalId}/tardoc-invoices/${invoiceId}/validate`);
      return res.json() as Promise<{ valid: boolean; errors: string[] }>;
    },
    onSuccess: (data) => {
      if (data.valid) {
        setValidationErrors([]);
        // Automatically transition to validated
        statusMutation.mutate('validated');
      } else {
        setValidationErrors(data.errors || ["Validation failed"]);
        toast({ title: "Validation failed", description: `${data.errors.length} error(s) found`, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Validation failed", description: error.message || "Something went wrong", variant: "destructive" });
    },
  });

  const isActionPending = statusMutation.isPending || validateMutation.isPending;

  // Render status-specific action buttons
  const renderStatusActions = () => {
    if (!invoice) return null;
    const status = invoice.status;

    switch (status) {
      case 'draft':
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => validateMutation.mutate()}
              disabled={isActionPending}
            >
              {validateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Validate
            </Button>
          </div>
        );

      case 'validated':
        return (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onExportXml}>
              <Download className="h-4 w-4 mr-1" /> XML
            </Button>
            <Button variant="outline" size="sm" onClick={onExportPdf}>
              <Download className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => statusMutation.mutate('draft')}
              disabled={isActionPending}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <ArrowLeft className="h-4 w-4 mr-1" />
              )}
              Revert to Draft
            </Button>
          </div>
        );

      case 'exported':
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => statusMutation.mutate('sent')}
              disabled={isActionPending}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Mark as Sent
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => statusMutation.mutate('validated')}
              disabled={isActionPending}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Revert to Validated
            </Button>
          </div>
        );

      case 'sent':
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => statusMutation.mutate('paid')}
              disabled={isActionPending}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <BanknoteIcon className="h-4 w-4 mr-1" />
              )}
              Mark as Paid
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => statusMutation.mutate('rejected')}
              disabled={isActionPending}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Mark as Rejected
            </Button>
          </div>
        );

      case 'rejected':
        return (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusMutation.mutate('draft')}
              disabled={isActionPending}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <ArrowLeft className="h-4 w-4 mr-1" />
              )}
              Revert to Draft
            </Button>
          </div>
        );

      case 'paid':
      case 'cancelled':
        return null; // Terminal states - no actions

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Insurance Invoice #{invoice?.invoiceNumber}
            {invoice && (
              <span className="ml-2">
                {getDialogStatusBadge(invoice.status)}
                <Badge variant="outline" className="ml-1">{invoice.billingModel}</Badge>
                <Badge variant="outline" className="ml-1">{invoice.lawType}</Badge>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : invoice ? (
          <div className="space-y-4">
            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Validation errors:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((err, i) => (
                      <li key={i} className="text-sm">{err}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Patient info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Patient:</span>{" "}
                <span className="font-medium">{invoice.patientSurname} {invoice.patientFirstName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Birthday:</span> {invoice.patientBirthday}
              </div>
              <div>
                <span className="text-muted-foreground">AHV:</span> {invoice.ahvNumber || "-"}
              </div>
              <div>
                <span className="text-muted-foreground">Insurance:</span> {invoice.insurerName || "-"}
              </div>
              <div>
                <span className="text-muted-foreground">Treatment:</span> {invoice.caseDate} – {invoice.caseDateEnd || invoice.caseDate}
              </div>
              <div>
                <span className="text-muted-foreground">Canton:</span> {invoice.treatmentCanton || "-"}
              </div>
            </div>

            {/* Service lines table */}
            <div className="border rounded">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">TP</th>
                    <th className="text-right p-2">SF</th>
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items || []).map((item: any) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 font-mono text-xs">{item.tardocCode}</td>
                      <td className="p-2">{item.description}</td>
                      <td className="p-2">{item.treatmentDate}</td>
                      <td className="p-2 text-right">{item.quantity}</td>
                      <td className="p-2 text-right">{item.taxPoints}</td>
                      <td className="p-2 text-right">{item.scalingFactor}</td>
                      <td className="p-2 text-right font-medium">CHF {item.amountChf}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td colSpan={6} className="p-2 text-right">Total:</td>
                    <td className="p-2 text-right">CHF {invoice.totalChf}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Status actions */}
            <div className="flex justify-end gap-2">
              {renderStatusActions()}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
