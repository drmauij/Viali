import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, FileText, Trash2, Eye, Check } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import InvoiceForm from "./InvoiceForm";
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

export default function ClinicInvoices() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

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

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
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

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest('DELETE', `/api/clinic/${hospitalId}/invoices/${invoiceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] });
      toast({
        title: t('clinic.invoices.deleted'),
        description: t('clinic.invoices.deletedDescription'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('clinic.invoices.deleteError'),
        variant: "destructive",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest('PATCH', `/api/clinic/${hospitalId}/invoices/${invoiceId}/status`, { status: 'paid' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] });
      toast({
        title: t('clinic.invoices.markedPaid', 'Marked as Paid'),
        description: t('clinic.invoices.markedPaidDescription', 'Invoice has been marked as paid'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('clinic.invoices.markPaidError', 'Failed to mark invoice as paid'),
        variant: "destructive",
      });
    },
  });

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch =
        inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.invoiceNumber.toString().includes(searchTerm) ||
        (inv.patientFirstName && inv.patientFirstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (inv.patientSurname && inv.patientSurname.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      draft: "secondary",
      paid: "default",
    };
    const labels: Record<string, string> = {
      draft: t('clinic.invoices.status.draft'),
      paid: t('clinic.invoices.status.paid'),
    };
    return <Badge variant={variants[status] || "default"}>{labels[status] || status}</Badge>;
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    if (confirm(t('clinic.invoices.confirmDelete'))) {
      deleteMutation.mutate(invoiceId);
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
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-invoice">
              <Plus className="h-4 w-4 mr-2" />
              {t('clinic.invoices.create')}
            </Button>
          </DialogTrigger>
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
      </div>

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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('clinic.invoices.filter.all')}</SelectItem>
            <SelectItem value="draft">{t('clinic.invoices.status.draft')}</SelectItem>
            <SelectItem value="paid">{t('clinic.invoices.status.paid')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
            <Card key={invoice.id} data-testid={`card-invoice-${invoice.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold" data-testid={`text-invoice-number-${invoice.id}`}>
                        #{invoice.invoiceNumber}
                      </span>
                      {getStatusBadge(invoice.status)}
                    </div>
                    <p className="text-sm font-medium" data-testid={`text-customer-${invoice.id}`}>
                      {invoice.customerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(invoice.date), 'PP', { locale: dateLocale })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg" data-testid={`text-total-${invoice.id}`}>
                      {formatCurrency(invoice.total)}
                    </p>
                    <div className="flex gap-1 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedInvoiceId(invoice.id)}
                        data-testid={`button-view-${invoice.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {invoice.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markPaidMutation.mutate(invoice.id)}
                          disabled={markPaidMutation.isPending}
                          data-testid={`button-mark-paid-${invoice.id}`}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteInvoice(invoice.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${invoice.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InvoiceDetailDialog
        hospitalId={hospitalId!}
        invoiceId={selectedInvoiceId}
        open={!!selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onStatusChange={() => queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'invoices'] })}
      />
    </div>
  );
}
